// Copyright 2026 @kenlim5656. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1)
// Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
// Central Suite Repository: https://github.com/kenlim5656/paid-media-suite

/**
 * reporting-views.ts — Task 31 Reporting MCP Tools Surface
 *
 * Exposes three parameterized analytics lookup tools backed by the Task 28
 * BigQuery reporting views. All queries enforce a hard 150-row ceiling to
 * protect agent context windows. Results are returned as Markdown tables so
 * the calling agent receives clean structured text rather than raw JSON.
 *
 * Tools:
 *   get_campaign_performance_metrics — daily spend/impressions/clicks from v_unified_daily_spend
 *   get_campaign_downstream_roi      — 3-tier CPA (Platform/Traffic/Revenue) from v_reporting_campaign_roi
 *   get_monthly_budget_pacing        — MTD pacing + recommended run-rate from v_reporting_monthly_pacing
 *
 * Required environment variables (read at call time, not module load time):
 *   PAID_MEDIA_GCP_PROJECT  — GCP project ID   (e.g. "acme-analytics-prod")
 *   PAID_MEDIA_BQ_DATASET   — BigQuery dataset  (e.g. "paid_media")
 * Resolved through src/config.ts, so the legacy BIGQUERY_PROJECT_ID /
 * BIGQUERY_DATASET_ID names also work — these tools and the adapter layer
 * can no longer end up pointed at different projects.
 *
 * BigQuery authentication follows Application Default Credentials (ADC):
 *   - Local dev:  gcloud auth application-default login
 *   - Cloud Run:  attached service account (roles/bigquery.dataViewer)
 *   - Explicit:   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 *
 * These tools have no dependency on the PaidMediaAdapter interface — they
 * execute SQL directly against the three Task 28 unified reporting views.
 */

import { z } from "zod";
import { resolveBqEnv } from "../config.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Hard ceiling on rows returned to the agent context window. */
const MAX_ROWS = 150;

// ── BQ config (resolved at call time) ────────────────────────────────────────

function bqConfig(): { projectId: string; dataset: string } {
  const { projectId, dataset } = resolveBqEnv();
  return { projectId: projectId ?? "", dataset };
}

// ── Lazy BigQuery client ──────────────────────────────────────────────────────

 
type BqClient = {
  query: (
    request: string | {
      query: string;
      params?: Record<string, unknown>;
      maximumBytesBilled?: string;
      jobTimeoutMs?: string;
    },
    opts?: Record<string, unknown>
  ) => Promise<[Record<string, unknown>[]]>;
};

let _bqClient: BqClient | null = null;

async function getBqClient(projectId: string): Promise<BqClient> {
  if (!_bqClient) {
    try {
      const mod = await import("@google-cloud/bigquery" as string as never) as {
        BigQuery: new (opts: { projectId: string }) => BqClient;
      };
      _bqClient = new mod.BigQuery({ projectId });
    } catch {
      throw new Error(
        "Reporting-view tools require @google-cloud/bigquery. " +
        "Run: npm install @google-cloud/bigquery"
      );
    }
  }
  return _bqClient;
}

// ── Markdown table formatter ──────────────────────────────────────────────────

/**
 * Converts an array of BQ row objects into a pipe-delimited Markdown table.
 *
 * - NULL / undefined values display as "—"
 * - Integers display without decimals
 * - Floats are rounded to 4 decimal places
 * - Column widths are padded to the widest cell in each column
 */
function formatMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "_No data returned._";

  const columns = Object.keys(rows[0]);

  const strRows: string[][] = rows.map((row) =>
    columns.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return "—";
      if (typeof v === "number") {
        return Number.isInteger(v) ? String(v) : v.toFixed(4);
      }
      if (typeof v === "boolean") return v ? "true" : "false";
      return String(v);
    })
  );

  const widths = columns.map((col, i) =>
    Math.max(col.length, ...strRows.map((r) => r[i].length))
  );

  const pad = (s: string, w: number) => s.padEnd(w, " ");

  const header  = "| " + columns.map((c, i) => pad(c, widths[i])).join(" | ") + " |";
  const divider = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  const body    = strRows.map(
    (row) => "| " + row.map((cell, i) => pad(cell, widths[i])).join(" | ") + " |"
  );

  return [header, divider, ...body].join("\n");
}

// ── Truncation notice ─────────────────────────────────────────────────────────

function truncationNote(total: number): string {
  return (
    `\n\n> ⚠️ **Result truncated** — showing first ${total} rows.` +
    ` Apply a tighter \`start_date\`/\`end_date\` window, add a \`platform\` filter,` +
    ` or specify a \`campaign_id\` to reduce the result set.`
  );
}

// ── Core query runner ─────────────────────────────────────────────────────────

/**
 * Executes sql against BigQuery, enforces the MAX_ROWS ceiling, and returns
 * a Markdown-formatted table string wrapped in an MCP content response.
 *
 * Catches all error classes and returns clean diagnostic strings rather than
 * throwing — the calling agent receives an explanatory message instead of a
 * stack trace.
 */
async function runAnalyticsQuery(
  label: string,
  sql: string,
  params: Record<string, unknown> = {},
): Promise<{ content: [{ type: "text"; text: string }] }> {
  const { projectId, dataset } = bqConfig();

  if (!projectId || !dataset) {
    return content(
      "**Configuration error** — reporting-view tools require two environment variables:\n\n" +
      "- `PAID_MEDIA_GCP_PROJECT` — GCP project ID (e.g. `acme-analytics-prod`)\n" +
      "- `PAID_MEDIA_BQ_DATASET`  — BigQuery dataset name (e.g. `paid_media`)"
    );
  }

  // Inject project + dataset into view references at query time
  const resolvedSql = sql
    .replaceAll("__PROJECT__", projectId)
    .replaceAll("__DATASET__", dataset);

  try {
    const bq = await getBqClient(projectId);
    const [rows] = await bq.query({
      query: resolvedSql,
      params,
      maximumBytesBilled: "2000000000", // 2 GB scan budget per query
      jobTimeoutMs: "60000",
    });

    if (rows.length === 0) {
      return content(
        `## ${label}\n\n_No data found. The view returned an empty result set._ ` +
        `Try broadening your date range or removing platform/campaign filters.`
      );
    }

    const truncated = rows.length > MAX_ROWS;
    const display   = truncated ? rows.slice(0, MAX_ROWS) : rows;
    const table     = formatMarkdownTable(display as Record<string, unknown>[]);
    const note      = truncated ? truncationNote(MAX_ROWS) : "";
    const rowLabel  = `${display.length} row${display.length !== 1 ? "s" : ""}`;

    return content(`## ${label} (${rowLabel})\n\n${table}${note}`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower   = message.toLowerCase();

    if (
      lower.includes("unauthenticated") ||
      lower.includes("credentials") ||
      lower.includes("permission denied") ||
      lower.includes("403")
    ) {
      return content(
        "**BigQuery authentication error** — ensure one of the following is in place:\n\n" +
        "- Local: run `gcloud auth application-default login`\n" +
        "- Cloud Run / GCE: attach a service account with `roles/bigquery.dataViewer`\n" +
        "- Explicit key: set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`\n\n" +
        `Details: \`${message}\``
      );
    }

    if (lower.includes("not found") || lower.includes("does not exist")) {
      return content(
        "**BigQuery view not found** — the reporting view may not have been deployed yet. " +
        "Run `bigquery/17_unified_reporting.sql` against your dataset to create it.\n\n" +
        `Details: \`${message}\``
      );
    }

    return content(
      `**BigQuery query error** for "${label}":\n\n\`\`\`\n${message}\n\`\`\``
    );
  }
}

/** Wrap a text string in the MCP tool response envelope. */
function content(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text }] };
}

// ── Input sanitizers ──────────────────────────────────────────────────────────
// Defense-in-depth on top of parameterized queries: every filter value is bound
// as a BigQuery named parameter (@name), and these sanitizers additionally
// normalize the values before binding.

/** Allow only digits and hyphens; truncate at 10 chars (YYYY-MM-DD). */
function sanitizeDate(s: string): string {
  return s.replace(/[^0-9-]/g, "").slice(0, 10);
}

/** Strip single-quotes, semicolons, and double-quotes from filter string values. */
function sanitizeStr(s: string): string {
  return s.replace(/['";]/g, "");
}

// ── SQL builders ──────────────────────────────────────────────────────────────

function buildDailySpendSql(args: {
  start_date?: string;
  end_date?: string;
  platform?: string;
  campaign_id?: string;
}): { sql: string; params: Record<string, unknown> } {
  const conds: string[] = [];
  const params: Record<string, unknown> = {};
  if (args.start_date)  { conds.push("date >= DATE(@start_date)");        params.start_date = sanitizeDate(args.start_date); }
  if (args.end_date)    { conds.push("date <= DATE(@end_date)");          params.end_date = sanitizeDate(args.end_date); }
  if (args.platform)    { conds.push("platform = @platform");       params.platform = sanitizeStr(args.platform); }
  if (args.campaign_id) { conds.push("campaign_id = @campaign_id"); params.campaign_id = sanitizeStr(args.campaign_id); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const sql = `
SELECT
  date,
  platform,
  account_id,
  campaign_id,
  campaign_name,
  CAST(spend_usd AS FLOAT64)            AS spend_usd,
  impressions,
  clicks,
  CAST(platform_conversions AS FLOAT64) AS platform_conversions
FROM \`__PROJECT__.__DATASET__.v_unified_daily_spend\`
${where}
ORDER BY date DESC, spend_usd DESC
LIMIT ${MAX_ROWS + 1}
`.trim();
  return { sql, params };
}

function buildRoiSql(args: {
  platform?: string;
  campaign_id?: string;
  period_start_after?: string;
  period_end_before?: string;
}): { sql: string; params: Record<string, unknown> } {
  const conds: string[] = [];
  const params: Record<string, unknown> = {};
  if (args.platform)    { conds.push("platform = @platform");       params.platform = sanitizeStr(args.platform); }
  if (args.campaign_id) { conds.push("campaign_id = @campaign_id"); params.campaign_id = sanitizeStr(args.campaign_id); }
  // period_start/period_end are MIN(date)/MAX(date) from the underlying spend CTE
  if (args.period_start_after) { conds.push("period_start >= DATE(@period_start_after)"); params.period_start_after = sanitizeDate(args.period_start_after); }
  if (args.period_end_before)  { conds.push("period_end <= DATE(@period_end_before)");    params.period_end_before = sanitizeDate(args.period_end_before); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const sql = `
SELECT
  campaign_id,
  campaign_name,
  platform,
  channel,
  funnel_stage,
  period_start,
  period_end,
  CAST(total_spend AS FLOAT64)               AS total_spend,
  total_impressions,
  total_clicks,
  CAST(platform_conversions AS FLOAT64)      AS platform_conversions,
  CAST(platform_cpa AS FLOAT64)              AS platform_cpa,
  paid_sessions,
  CAST(traffic_cpa_per_session AS FLOAT64)   AS traffic_cpa_per_session,
  crm_leads_generated,
  mql_count,
  closed_won_count,
  CAST(open_pipeline_value AS FLOAT64)       AS open_pipeline_value,
  CAST(closed_won_arr AS FLOAT64)            AS closed_won_arr,
  CAST(revenue_roas_closed_won AS FLOAT64)   AS revenue_roas,
  CAST(pipeline_roas AS FLOAT64)             AS pipeline_roas,
  CAST(lead_to_mql_rate_pct AS FLOAT64)      AS lead_to_mql_pct,
  CAST(mql_to_closed_won_rate_pct AS FLOAT64) AS mql_to_cw_pct,
  attributed_conversions,
  CAST(attributed_roas AS FLOAT64)           AS attributed_roas,
  CAST(platform_vs_mta_delta_pct AS FLOAT64) AS platform_vs_mta_delta_pct
FROM \`__PROJECT__.__DATASET__.v_reporting_campaign_roi\`
${where}
ORDER BY total_spend DESC
LIMIT ${MAX_ROWS + 1}
`.trim();
  return { sql, params };
}

function buildPacingSql(args: {
  platform?: string;
  campaign_id?: string;
}): { sql: string; params: Record<string, unknown> } {
  const conds: string[] = [];
  const params: Record<string, unknown> = {};
  if (args.platform)    { conds.push("platform = @platform");       params.platform = sanitizeStr(args.platform); }
  if (args.campaign_id) { conds.push("campaign_id = @campaign_id"); params.campaign_id = sanitizeStr(args.campaign_id); }

  // Pacing view is always current-month scoped — no date filter is relevant
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const sql = `
SELECT
  campaign_id,
  campaign_name,
  platform,
  campaign_status,
  budget_type,
  CAST(monthly_cap_usd AS FLOAT64)                AS monthly_cap_usd,
  CAST(mtd_spend_usd AS FLOAT64)                  AS mtd_spend_usd,
  days_elapsed,
  days_remaining,
  days_in_month,
  CAST(budget_consumed_pct AS FLOAT64)            AS budget_consumed_pct,
  CAST(pacing_velocity_pct AS FLOAT64)            AS pacing_velocity_pct,
  mtd_pacing_status,
  CAST(mtd_pacing_variance_usd AS FLOAT64)        AS mtd_pacing_variance_usd,
  CAST(recommended_daily_run_rate_usd AS FLOAT64) AS recommended_daily_rate,
  CAST(projected_month_end_spend_usd AS FLOAT64)  AS projected_month_end,
  projected_on_monthly_budget,
  CAST(prior_month_total_spend AS FLOAT64)        AS prior_month_spend,
  CAST(spend_mom_delta_pct AS FLOAT64)            AS spend_mom_delta_pct
FROM \`__PROJECT__.__DATASET__.v_reporting_monthly_pacing\`
${where}
ORDER BY mtd_pacing_status, mtd_spend_usd DESC
LIMIT ${MAX_ROWS + 1}
`.trim();
  return { sql, params };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

/**
 * Returns the three Task 31 analytics lookup tools.
 * Unlike adapter-based tool modules, this function takes no adapter argument —
 * all three tools execute SQL directly against the Task 28 BigQuery views.
 */
export const reportingViewTools = () => [

  // ── Tool 1: Daily spend metrics ─────────────────────────────────────────────
  {
    name: "get_campaign_performance_metrics",
    description:
      "Query daily campaign spend, impressions, clicks, and platform-reported conversions " +
      "across all active channels (Meta, Google Ads, TikTok, Reddit) from the unified " +
      "`v_unified_daily_spend` BigQuery view. Returns one row per (date × campaign) combination. " +
      "Filter by date range, platform, or campaign_id to narrow the result set. " +
      "Results are capped at 150 rows — apply tighter filters if you receive a truncation notice. " +
      "Requires PAID_MEDIA_GCP_PROJECT and PAID_MEDIA_BQ_DATASET environment variables.",
    inputSchema: z.object({
      start_date:  z.string().optional().describe("Start date inclusive (YYYY-MM-DD)"),
      end_date:    z.string().optional().describe("End date inclusive (YYYY-MM-DD)"),
      platform:    z.string().optional().describe(
        "Filter to one platform: meta | google_ads | tiktok | reddit"
      ),
      campaign_id: z.string().optional().describe("Filter to a single campaign UUID"),
    }),
    handler: async (args: {
      start_date?: string;
      end_date?: string;
      platform?: string;
      campaign_id?: string;
    }) => {
      const { sql, params } = buildDailySpendSql(args);
      const parts: string[] = ["Daily Performance Metrics"];
      if (args.platform)    parts.push(args.platform);
      if (args.campaign_id) parts.push(args.campaign_id);
      if (args.start_date || args.end_date) {
        parts.push(`${args.start_date ?? "…"} → ${args.end_date ?? "…"}`);
      }
      return runAnalyticsQuery(parts.join(" | "), sql, params);
    },
  },

  // ── Tool 2: 3-tier ROI / downstream metrics ─────────────────────────────────
  {
    name: "get_campaign_downstream_roi",
    description:
      "Compare campaign performance across three measurement layers using the " +
      "`v_reporting_campaign_roi` BigQuery view:\n" +
      "• **Platform layer** — ad-network pixel conversions and platform CPA\n" +
      "• **Traffic layer** — paid sessions, unique visitors, and web conversion events via GA4\n" +
      "• **Revenue layer** — CRM leads, MQLs, Closed-Won count, pipeline ARR, and revenue ROAS\n" +
      "Also includes MTA attribution comparison (attributed ROAS vs. platform delta).\n\n" +
      "This view aggregates all-time metrics per campaign (no date windowing inside the view). " +
      "Use `start_date`/`end_date` to filter on when campaign spend activity started/ended. " +
      "Results are capped at 150 rows. Requires PAID_MEDIA_GCP_PROJECT and PAID_MEDIA_BQ_DATASET.",
    inputSchema: z.object({
      platform:    z.string().optional().describe(
        "Filter to one platform: meta | google_ads | tiktok | reddit"
      ),
      campaign_id: z.string().optional().describe("Filter to a single campaign UUID"),
      start_date:  z.string().optional().describe(
        "Only include campaigns whose spend activity started on or after this date (YYYY-MM-DD)"
      ),
      end_date:    z.string().optional().describe(
        "Only include campaigns whose spend activity ended on or before this date (YYYY-MM-DD)"
      ),
    }),
    handler: async (args: {
      platform?: string;
      campaign_id?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      const { sql, params } = buildRoiSql({
        platform:           args.platform,
        campaign_id:        args.campaign_id,
        period_start_after: args.start_date,
        period_end_before:  args.end_date,
      });
      const parts: string[] = ["Campaign ROI — 3-Tier CPA"];
      if (args.platform)    parts.push(args.platform);
      if (args.campaign_id) parts.push(args.campaign_id);
      return runAnalyticsQuery(parts.join(" | "), sql, params);
    },
  },

  // ── Tool 3: Monthly budget pacing ────────────────────────────────────────────
  {
    name: "get_monthly_budget_pacing",
    description:
      "Retrieve current calendar-month pacing status for all active campaigns from the " +
      "`v_reporting_monthly_pacing` BigQuery view. Key fields:\n" +
      "• `mtd_spend_usd` — spend so far this month\n" +
      "• `monthly_cap_usd` — normalized monthly budget (daily × days / lifetime pro-rated)\n" +
      "• `pacing_velocity_pct` — actual MTD vs. expected at this point in the month (%)\n" +
      "• `mtd_pacing_status` — over_pacing | on_pace | under_pacing | no_budget_data\n" +
      "• `recommended_daily_rate` — USD/day needed to exhaust cap by month end\n" +
      "• `projected_month_end` — projected total if current run-rate holds\n\n" +
      "This view is always scoped to the current calendar month — no date filter is available. " +
      "Results are capped at 150 rows. Requires PAID_MEDIA_GCP_PROJECT and PAID_MEDIA_BQ_DATASET.",
    inputSchema: z.object({
      platform:    z.string().optional().describe(
        "Filter to one platform: meta | google_ads | tiktok | reddit"
      ),
      campaign_id: z.string().optional().describe("Filter to a single campaign UUID"),
    }),
    handler: async (args: {
      platform?: string;
      campaign_id?: string;
    }) => {
      const { sql, params } = buildPacingSql(args);
      const parts: string[] = ["Monthly Budget Pacing"];
      if (args.platform)    parts.push(args.platform);
      if (args.campaign_id) parts.push(args.campaign_id);
      return runAnalyticsQuery(parts.join(" | "), sql, params);
    },
  },
];
