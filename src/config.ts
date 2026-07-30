/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */

/**
 * config.ts — single source of truth for environment resolution.
 *
 * Canonical env vars (shared with paid-media-agent, so one configuration
 * works across the suite):
 *
 *   PAID_MEDIA_GCP_PROJECT — GCP project ID (enables BigQuery mode)
 *   PAID_MEDIA_BQ_DATASET  — dataset name (default: "paid_media")
 *   PAID_MEDIA_AGENT_URL   — base URL of the deployed paid-media-agent service
 *   PAID_MEDIA_DATA_DIR    — JSON data directory (default: "./data")
 *
 * Legacy names BIGQUERY_PROJECT_ID / BIGQUERY_DATASET_ID are accepted as
 * fallbacks with a one-time deprecation warning. Every consumer (server.ts,
 * reporting-views.ts, the adapters) resolves through this module — never read
 * the project/dataset vars directly, or the three naming conventions drift
 * apart again.
 */

const warned = new Set<string>();

function resolveWithFallback(canonical: string, legacy: string): string | undefined {
  const canonicalValue = process.env[canonical];
  if (canonicalValue) return canonicalValue;
  const legacyValue = process.env[legacy];
  if (legacyValue && !warned.has(legacy)) {
    warned.add(legacy);
    console.error(
      `[paid-media-mcp] DEPRECATED: env var ${legacy} still works but has been ` +
      `renamed — set ${canonical} instead.`
    );
  }
  return legacyValue || undefined;
}

export interface BqEnv {
  projectId?: string;
  dataset: string;
}

/** Resolved BigQuery config. BigQuery mode is enabled when projectId is set. */
export function resolveBqEnv(): BqEnv {
  return {
    projectId: resolveWithFallback("PAID_MEDIA_GCP_PROJECT", "BIGQUERY_PROJECT_ID"),
    dataset: resolveWithFallback("PAID_MEDIA_BQ_DATASET", "BIGQUERY_DATASET_ID") ?? "paid_media",
  };
}

/** Base URL of the paid-media-agent service, without a trailing slash. */
export function agentBaseUrl(): string | undefined {
  const raw = process.env.PAID_MEDIA_AGENT_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

export function dataDir(): string {
  return process.env.PAID_MEDIA_DATA_DIR ?? "./data";
}

/**
 * Fail loudly on broken configurations at startup instead of silently
 * returning empty results at query time. Throws on hard errors; logs
 * warnings for suspicious-but-workable setups.
 */
export function validateEnv(): void {
  const bq = resolveBqEnv();

  // Credentials without a project: the operator clearly intended BigQuery
  // mode but the adapter would silently fall back to file mode.
  if (!bq.projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    throw new Error(
      "[paid-media-mcp] GOOGLE_APPLICATION_CREDENTIALS_JSON is set but no GCP project " +
      "is configured. Set PAID_MEDIA_GCP_PROJECT (BigQuery mode will not activate without it)."
    );
  }

  // Conflicting values across naming conventions: pick-your-own-project bugs.
  const legacyProject = process.env.BIGQUERY_PROJECT_ID;
  if (bq.projectId && legacyProject && legacyProject !== bq.projectId) {
    throw new Error(
      `[paid-media-mcp] Conflicting project config: PAID_MEDIA_GCP_PROJECT="${bq.projectId}" ` +
      `but BIGQUERY_PROJECT_ID="${legacyProject}". Remove the legacy var.`
    );
  }
  const legacyDataset = process.env.BIGQUERY_DATASET_ID;
  const canonicalDataset = process.env.PAID_MEDIA_BQ_DATASET;
  if (canonicalDataset && legacyDataset && legacyDataset !== canonicalDataset) {
    throw new Error(
      `[paid-media-mcp] Conflicting dataset config: PAID_MEDIA_BQ_DATASET="${canonicalDataset}" ` +
      `but BIGQUERY_DATASET_ID="${legacyDataset}". Remove the legacy var.`
    );
  }

  const agent = process.env.PAID_MEDIA_AGENT_URL;
  if (agent && !/^https?:\/\//.test(agent)) {
    throw new Error(
      `[paid-media-mcp] PAID_MEDIA_AGENT_URL must be an http(s) URL, got: "${agent}"`
    );
  }
}
