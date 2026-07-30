/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/** Adapter selection + FileAdapter fallback semantics. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAdapter } from "../src/server.js";
import { FileAdapter } from "../src/adapters/file-adapter.js";
import { BigQueryAdapter } from "../src/adapters/bigquery-adapter.js";

const ENV_KEYS = ["PAID_MEDIA_GCP_PROJECT", "BIGQUERY_PROJECT_ID", "PAID_MEDIA_DATA_DIR"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("buildAdapter", () => {
  it("falls back to FileAdapter when no GCP project is configured", () => {
    const adapter = buildAdapter();
    expect(adapter).toBeInstanceOf(FileAdapter);
    expect(adapter).not.toBeInstanceOf(BigQueryAdapter);
  });

  it("selects BigQueryAdapter when the canonical project var is set", () => {
    process.env.PAID_MEDIA_GCP_PROJECT = "proj";
    expect(buildAdapter()).toBeInstanceOf(BigQueryAdapter);
  });

  it("selects BigQueryAdapter via the legacy project var", () => {
    process.env.BIGQUERY_PROJECT_ID = "proj";
    expect(buildAdapter()).toBeInstanceOf(BigQueryAdapter);
  });
});

describe("FileAdapter graceful degradation", () => {
  it("returns safe empty defaults when the data dir does not exist", async () => {
    const adapter = new FileAdapter("/nonexistent/dir/for/test");
    expect(await adapter.getCampaigns({})).toEqual([]);
    expect(await adapter.getTeams()).toEqual([]);
    expect(await adapter.getWatchdogAlerts()).toEqual([]);
    expect(await adapter.getOperatorPendingApprovals()).toEqual([]);
  });

  it("reports the agent as unreachable rather than throwing when no URL is set", async () => {
    const adapter = new FileAdapter("/nonexistent/dir/for/test");
    const result = await adapter.triggerAgentRun("watchdog", "test") as { triggered: boolean };
    expect(result.triggered).toBe(false);
  });
});
