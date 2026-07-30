/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/** Env resolution + startup validation (src/config.ts). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentBaseUrl, resolveBqEnv, validateEnv } from "../src/config.js";

const ENV_KEYS = [
  "PAID_MEDIA_GCP_PROJECT", "BIGQUERY_PROJECT_ID",
  "PAID_MEDIA_BQ_DATASET", "BIGQUERY_DATASET_ID",
  "PAID_MEDIA_AGENT_URL", "GOOGLE_APPLICATION_CREDENTIALS_JSON",
];
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

describe("resolveBqEnv", () => {
  it("returns no project and the default dataset when nothing is set", () => {
    expect(resolveBqEnv()).toEqual({ projectId: undefined, dataset: "paid_media" });
  });

  it("uses canonical names when set", () => {
    process.env.PAID_MEDIA_GCP_PROJECT = "proj-canonical";
    process.env.PAID_MEDIA_BQ_DATASET = "ds-canonical";
    expect(resolveBqEnv()).toEqual({ projectId: "proj-canonical", dataset: "ds-canonical" });
  });

  it("falls back to legacy names", () => {
    process.env.BIGQUERY_PROJECT_ID = "proj-legacy";
    process.env.BIGQUERY_DATASET_ID = "ds-legacy";
    expect(resolveBqEnv()).toEqual({ projectId: "proj-legacy", dataset: "ds-legacy" });
  });

  it("canonical wins over legacy", () => {
    process.env.PAID_MEDIA_GCP_PROJECT = "proj-canonical";
    process.env.BIGQUERY_PROJECT_ID = "proj-legacy";
    expect(resolveBqEnv().projectId).toBe("proj-canonical");
  });
});

describe("validateEnv", () => {
  it("passes on an empty environment (file mode)", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when credentials are set without a project", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{}";
    expect(() => validateEnv()).toThrow(/PAID_MEDIA_GCP_PROJECT/);
  });

  it("throws on conflicting project values across naming conventions", () => {
    process.env.PAID_MEDIA_GCP_PROJECT = "a";
    process.env.BIGQUERY_PROJECT_ID = "b";
    expect(() => validateEnv()).toThrow(/Conflicting project config/);
  });

  it("accepts matching old+new project values", () => {
    process.env.PAID_MEDIA_GCP_PROJECT = "same";
    process.env.BIGQUERY_PROJECT_ID = "same";
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws on a non-http agent URL", () => {
    process.env.PAID_MEDIA_AGENT_URL = "ftp://nope";
    expect(() => validateEnv()).toThrow(/http\(s\)/);
  });
});

describe("agentBaseUrl", () => {
  it("is undefined when unset", () => {
    expect(agentBaseUrl()).toBeUndefined();
  });

  it("strips trailing slashes", () => {
    process.env.PAID_MEDIA_AGENT_URL = "https://agent.example.com///";
    expect(agentBaseUrl()).toBe("https://agent.example.com");
  });
});
