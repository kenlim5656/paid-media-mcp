/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * BigQueryAdapter: parameterization (injection attempts stay out of SQL text),
 * row-cap truncation, cost controls, and transient-error retry.
 *
 * A fake BigQuery client is injected in place of the lazily-created real one —
 * no network, no credentials.
 */
import { describe, expect, it } from "vitest";
import { BigQueryAdapter } from "../src/adapters/bigquery-adapter.js";

interface CapturedRequest {
  query: string;
  params?: Record<string, unknown>;
  maximumBytesBilled?: string;
  jobTimeoutMs?: string;
}

function makeAdapter(rows: object[] = [], failFirst = false) {
  const captured: CapturedRequest[] = [];
  let calls = 0;
  const fake = {
    query: async (request: CapturedRequest) => {
      captured.push(request);
      calls++;
      if (failFirst && calls === 1) throw new Error("503 backendError: try again");
      return [rows];
    },
  };
  const adapter = new BigQueryAdapter({ projectId: "test-proj", dataset: "test_ds" });
  // Inject the fake client where the lazy initializer would cache the real one
  (adapter as unknown as { bq: unknown }).bq = fake;
  return { adapter, captured, callCount: () => calls };
}

describe("SQL parameterization", () => {
  it("binds filter values as named params, never into the SQL text", async () => {
    const inj = "x' OR '1'='1; DROP TABLE platform_campaigns; --";
    const { adapter, captured } = makeAdapter();
    await adapter.getCampaigns({ team_id: inj, platform: "meta" });

    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.query).toContain("team_id = @team_id");
    expect(req.query).not.toContain(inj);          // payload not in SQL text
    expect(req.params?.team_id).toBe(inj);          // payload safely bound
    expect(req.params?.platform).toBe("meta");
  });

  it("parameterizes the account-journey domain lookups", async () => {
    const inj = "evil.com' UNION SELECT * FROM secrets --";
    const { adapter, captured } = makeAdapter();
    await adapter.queryAccountJourney(inj, 30);

    for (const req of captured) {
      expect(req.query).not.toContain(inj);
      expect(req.params?.account_domain).toBe(inj);
      expect(req.params?.lookback_days).toBe(30);
    }
  });
});

describe("cost controls", () => {
  it("sets maximumBytesBilled and jobTimeoutMs on every query", async () => {
    const { adapter, captured } = makeAdapter();
    await adapter.getCampaigns({});
    await adapter.getOperatorPendingApprovals();

    for (const req of captured) {
      expect(req.maximumBytesBilled).toBe("2000000000");
      expect(req.jobTimeoutMs).toBe("60000");
    }
  });
});

describe("row cap", () => {
  it("truncates results above 500 rows", async () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      action_id: `a${i}`, platform: "meta", action_type: "t",
      platform_entity_id: "e", summary: "s", rationale: "r", proposed_at: "2026-01-01",
    }));
    const { adapter } = makeAdapter(many);
    const rows = await adapter.getOperatorPendingApprovals();
    expect(rows).toHaveLength(500);
  });
});

describe("transient retry", () => {
  it("retries once on a transient error and succeeds", async () => {
    const { adapter, callCount } = makeAdapter(
      [{ action_id: "a", platform: "p", action_type: "t", platform_entity_id: "e",
         summary: "s", rationale: "r", proposed_at: "2026-01-01" }],
      /* failFirst */ true,
    );
    const rows = await adapter.getOperatorPendingApprovals();
    expect(rows).toHaveLength(1);
    expect(callCount()).toBe(2);
  });
});
