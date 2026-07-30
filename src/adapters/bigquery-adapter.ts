/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
/**
 * BigQueryAdapter
 *
 * Extends FileAdapter so that:
 *   - Campaign metadata and daily performance come from BigQuery
 *   - Org knowledge (teams, attribution, audiences, measurement, etc.) still
 *     comes from local JSON files in data/
 *
 * This is the recommended starting point when your platform data is exported
 * to BigQuery (via Fivetran, Supermetrics, Stitch, dbt, etc.) but your
 * organizational metadata lives in files or isn't available via an API.
 *
 * INSTALLATION
 * ------------
 * npm install @google-cloud/bigquery
 *
 * AUTHENTICATION
 * --------------
 * Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of
 * a service account JSON key file, or run on GCP infrastructure with a
 * service account that has BigQuery Data Viewer access.
 *
 * EXPECTED TABLE SCHEMAS
 * ----------------------
 * campaigns:
 *   id STRING, name STRING, account_id STRING, team_id STRING,
 *   platform STRING, status STRING, objective STRING, funnel_stage STRING,
 *   budget_amount FLOAT64, budget_type STRING, budget_currency STRING,
 *   start_date DATE, end_date DATE, notes STRING, tags STRING (comma-separated)
 *
 * daily_performance:
 *   date DATE, campaign_id STRING,
 *   impressions INT64, clicks INT64, spend FLOAT64,
 *   conversions INT64, conversion_value FLOAT64
 *
 * benchmarks (optional):
 *   platform STRING, objective STRING,
 *   avg_ctr FLOAT64, avg_cpc FLOAT64, avg_cpm FLOAT64,
 *   avg_cpa FLOAT64, avg_roas FLOAT64
 *
 * Adapt the queries below to match your actual column names.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BigQueryClient = any;

export interface BigQueryAdapterConfig {
  /** GCP project ID */
  projectId: string;
  /** BigQuery dataset name — must match the dataset used by paid-media-schema DDL */
  dataset: string;
  /** Override individual table names if they differ from paid-media-schema defaults */
  tables?: {
    // Platform layer (paid-media-schema: 03_platform.sql)
    campaigns?: string;        // default: "platform_campaigns"
    performance?: string;      // default: "platform_daily_spend"
    benchmarks?: string;       // default: "benchmarks" (optional, not in schema DDL)
    // Attribution layer (paid-media-schema: 04_attribution.sql)
    attribution_results?: string;   // default: "attribution_channel_summary"
    attribution_runs?: string;      // default: "attribution_runs"
    // Agent output layer (paid-media-schema: 05_agent_outputs.sql)
    watchdog_alerts?: string;       // default: "watchdog_alerts"
    analyst_insights?: string;      // default: "analyst_insights"
    pending_approvals?: string;     // default: "operator_pending_approvals"
  };
  /** Path to local JSON data directory for org knowledge domains */
  dataDir?: string;
}

import { FileAdapter } from "./file-adapter.js";
import type { CampaignFilters, PerformanceFilters } from "./base.js";
import type {
  Campaign,
  CampaignObjective,
  CampaignStatus,
  PerformanceRecord,
  Platform,
  AttributionChannelSummary,
  AttributionRun,
  WatchdogAlert,
  AnalystInsight,
  OperatorPendingApproval,
} from "../types.js";

// Lazy-load @google-cloud/bigquery so the server starts even if the package
// isn't installed. Only throws when you actually try to use a BQ-backed method.
//
// Authentication priority:
//   1. GOOGLE_APPLICATION_CREDENTIALS_JSON env var — service account JSON,
//      raw or base64-encoded. Required on Vercel and other non-GCP hosts.
//   2. Application Default Credentials (ADC) — automatic on Cloud Run / GCE
//      when the env var is absent. Also works locally after `gcloud auth
//      application-default login`.
async function getBigQuery(projectId: string): Promise<BigQueryClient> {
  try {
    const { BigQuery } = await import("@google-cloud/bigquery" as string as never) as {
      BigQuery: new (opts: { projectId: string; credentials?: object }) => BigQueryClient
    };

    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credJson) {
      // Non-GCP hosts (Vercel, etc.): decode base64 or use raw JSON
      const raw = credJson.trimStart().startsWith("{")
        ? credJson
        : Buffer.from(credJson, "base64").toString("utf-8");
      const credentials = JSON.parse(raw) as object;
      return new BigQuery({ projectId, credentials });
    }

    // Cloud Run / local with gcloud ADC — no explicit credentials needed
    return new BigQuery({ projectId });
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is set but is not valid JSON. " +
        "Provide the raw service account JSON or its base64 encoding.",
        { cause: err }
      );
    }
    throw new Error(
      "BigQueryAdapter requires @google-cloud/bigquery. " +
      "Run: npm install @google-cloud/bigquery",
      { cause: err }
    );
  }
}

export class BigQueryAdapter extends FileAdapter {
  private readonly config: Required<BigQueryAdapterConfig> & { tables: Required<NonNullable<BigQueryAdapterConfig["tables"]>> };
  private bq: BigQueryClient | null = null;

  constructor(config: BigQueryAdapterConfig) {
    super(config.dataDir ?? "./data");
    this.config = {
      ...config,
      dataDir: config.dataDir ?? "./data",
      tables: {
        campaigns:           config.tables?.campaigns           ?? "platform_campaigns",
        performance:         config.tables?.performance         ?? "platform_daily_spend",
        benchmarks:          config.tables?.benchmarks          ?? "benchmarks",
        attribution_results: config.tables?.attribution_results ?? "attribution_channel_summary",
        attribution_runs:    config.tables?.attribution_runs    ?? "attribution_runs",
        watchdog_alerts:     config.tables?.watchdog_alerts     ?? "watchdog_alerts",
        analyst_insights:    config.tables?.analyst_insights    ?? "analyst_insights",
        pending_approvals:   config.tables?.pending_approvals   ?? "operator_pending_approvals",
      },
    };
  }

  private async client(): Promise<BigQueryClient> {
    if (!this.bq) {
      this.bq = await getBigQuery(this.config.projectId);
    }
    return this.bq;
  }

  // ── Cost / safety controls (every query goes through runQuery) ─────────────
  /** Hard ceiling on rows returned to the MCP context window. */
  private static readonly MAX_ROWS = 500;
  /** Per-query scan budget — queries billing more than this fail fast. */
  private static readonly MAX_BYTES_BILLED = "2000000000"; // 2 GB
  /** Server-side job timeout. */
  private static readonly JOB_TIMEOUT_MS = "60000";
  private static readonly TRANSIENT_ERROR =
    /rate ?limit|backend ?error|internal ?error|temporarily unavailable|connection reset|socket hang up|ECONNRESET|ETIMEDOUT|50[234]/i;

  /**
   * Central query runner: applies maximumBytesBilled + job timeout, retries
   * once on transient BigQuery errors, and truncates results to maxRows so a
   * broad filter can't blow up the agent context (or the scan bill).
   */
  private async runQuery(
    request: { query: string; params?: Record<string, unknown> },
    maxRows: number = BigQueryAdapter.MAX_ROWS,
  ): Promise<Record<string, unknown>[]> {
    const bq = await this.client();
    const fullRequest = {
      ...request,
      maximumBytesBilled: BigQueryAdapter.MAX_BYTES_BILLED,
      jobTimeoutMs: BigQueryAdapter.JOB_TIMEOUT_MS,
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const [rows] = await bq.query(fullRequest);
        if (rows.length > maxRows) {
          console.error(
            `[BigQueryAdapter] result truncated ${rows.length} → ${maxRows} rows — ` +
            "apply tighter filters to see the rest"
          );
          return (rows as Record<string, unknown>[]).slice(0, maxRows);
        }
        return rows as Record<string, unknown>[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 1 && BigQueryAdapter.TRANSIENT_ERROR.test(msg)) {
          console.error(`[BigQueryAdapter] transient error, retrying once: ${msg.slice(0, 200)}`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }
  }

  private table(name: keyof Required<NonNullable<BigQueryAdapterConfig["tables"]>>): string {
    return `\`${this.config.projectId}.${this.config.dataset}.${this.config.tables[name]}\``;
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────

  override async getCampaigns(filters: CampaignFilters = {}): Promise<Campaign[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Column names match paid-media-schema 03_platform.sql: platform_campaigns.
    // All filter values arrive via LLM tool args — always bind as named params.
    if (filters.team_id)          { conditions.push("team_id = @team_id");                 params.team_id = filters.team_id; }
    if (filters.account_id)       { conditions.push("platform_account_id = @account_id");  params.account_id = filters.account_id; }
    if (filters.platform)         { conditions.push("platform = @platform");               params.platform = filters.platform; }
    if (filters.status)           { conditions.push("status = @status");                   params.status = filters.status; }
    if (filters.objective)        { conditions.push("objective = @objective");             params.objective = filters.objective; }
    if (filters.funnel_stage)     { conditions.push("funnel_stage = @funnel_stage");       params.funnel_stage = filters.funnel_stage; }
    if (filters.start_date_after) { conditions.push("start_date >= DATE(@start_date_after)");    params.start_date_after = filters.start_date_after; }
    if (filters.end_date_before)  { conditions.push("end_date <= DATE(@end_date_before)");       params.end_date_before = filters.end_date_before; }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await this.runQuery({
      query: `SELECT * FROM ${this.table("campaigns")} ${where} ORDER BY campaign_name`,
      params,
    });
    return rows.map(rowToCampaign);
  }

  override async getCampaign(id: string): Promise<Campaign | null> {
    const rows = await this.runQuery({
      query: `SELECT * FROM ${this.table("campaigns")} WHERE id = @id LIMIT 1`,
      params: { id },
    });
    return rows.length ? rowToCampaign(rows[0]) : null;
  }

  // ── Performance ────────────────────────────────────────────────────────────

  override async getPerformance(filters: PerformanceFilters = {}): Promise<PerformanceRecord[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Column names match paid-media-schema 03_platform.sql: platform_daily_spend
    if (filters.campaign_id) {
      conditions.push("p.campaign_id = @campaign_id");
      params.campaign_id = filters.campaign_id;
    } else if (filters.team_id) {
      conditions.push("c.team_id = @team_id");
      params.team_id = filters.team_id;
    } else if (filters.platform) {
      conditions.push("p.platform = @platform");
      params.platform = filters.platform;
    }

    if (filters.date_from) { conditions.push("p.date >= DATE(@date_from)"); params.date_from = filters.date_from; }
    if (filters.date_to)   { conditions.push("p.date <= DATE(@date_to)");   params.date_to = filters.date_to; }

    const needsJoin = !!(filters.team_id);
    const from = needsJoin
      ? `${this.table("performance")} p JOIN ${this.table("campaigns")} c ON p.campaign_id = c.campaign_id`
      : `${this.table("performance")} p`;

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', p.date)   AS date,
        p.campaign_id,
        p.impressions,
        p.clicks,
        p.spend,
        p.platform_conversions             AS conversions,
        p.platform_conversion_value        AS conversion_value,
        p.reach,
        p.video_views,
        p.ctr,
        p.cpc,
        p.cpm,
        p.platform_cpa                     AS cpa,
        p.platform_roas                    AS roas
      FROM ${from}
      ${where}
      ORDER BY p.date DESC
      LIMIT 10000
    `;

    const rows = await this.runQuery({ query, params });
    return rows.map((r: Record<string, unknown>) => ({
      date: String(r.date),
      campaign_id: String(r.campaign_id),
      metrics: {
        impressions:      Number(r.impressions      ?? 0),
        clicks:           Number(r.clicks           ?? 0),
        spend:            Number(r.spend            ?? 0),
        conversions:      Number(r.conversions      ?? 0),
        conversion_value: Number(r.conversion_value ?? 0),
        reach:            r.reach      != null ? Number(r.reach)      : undefined,
        video_views:      r.video_views != null ? Number(r.video_views) : undefined,
        ctr:              r.ctr  != null ? Number(r.ctr)  : undefined,
        cpc:              r.cpc  != null ? Number(r.cpc)  : undefined,
        cpm:              r.cpm  != null ? Number(r.cpm)  : undefined,
        cpa:              r.cpa  != null ? Number(r.cpa)  : undefined,
        roas:             r.roas != null ? Number(r.roas) : undefined,
      },
    } satisfies PerformanceRecord));
  }

  override async getBenchmarks(
    platform?: Platform,
    objective?: CampaignObjective
  ) {
    try {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};
      if (platform)  { conditions.push("platform = @platform");   params.platform = platform; }
      if (objective) { conditions.push("objective = @objective"); params.objective = objective; }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await this.runQuery({
        query: `SELECT avg_ctr, avg_cpc, avg_cpm, avg_cpa, avg_roas FROM ${this.table("benchmarks")} ${where} LIMIT 1`,
        params,
      });
      if (!rows.length) return null;
      const r = rows[0] as Record<string, unknown>;
      return {
        avg_ctr: r.avg_ctr != null ? Number(r.avg_ctr) : undefined,
        avg_cpc: r.avg_cpc != null ? Number(r.avg_cpc) : undefined,
        avg_cpm: r.avg_cpm != null ? Number(r.avg_cpm) : undefined,
        avg_cpa: r.avg_cpa != null ? Number(r.avg_cpa) : undefined,
        avg_roas: r.avg_roas != null ? Number(r.avg_roas) : undefined,
      };
    } catch {
      // Fall back to file-based benchmarks if the table doesn't exist
      return super.getBenchmarks(platform, objective);
    }
  }

  // ── Attribution Results ─────────────────────────────────────────────────────

  override async getLatestAttributionResults(conversion_type?: string): Promise<AttributionChannelSummary | null> {
    try {
      // Get the most recent completed run
      const runRows = await this.runQuery({ query: `
        SELECT run_id, model_name, period_start, period_end, completed_at
        FROM ${this.table("attribution_runs")}
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      ` });
      if (!runRows.length) return null;
      const run = runRows[0] as Record<string, unknown>;

      const convFilter = conversion_type ? "AND conversion_type = @conversion_type" : "";
      const params: Record<string, unknown> = { run_id: String(run.run_id) };
      if (conversion_type) params.conversion_type = conversion_type;
      const rows = await this.runQuery({
        query: `
        SELECT
          platform,
          channel,
          conversion_type,
          attributed_conversions,
          attributed_value,
          credit_share_pct,
          total_spend,
          attributed_cpa,
          attributed_roas
        FROM ${this.table("attribution_results")}
        WHERE run_id = @run_id
        ${convFilter}
        ORDER BY attributed_conversions DESC
      `,
        params,
      });

      return {
        run_id:       String(run.run_id),
        model_name:   String(run.model_name),
        period_start: String(run.period_start),
        period_end:   String(run.period_end),
        generated_at: String(run.completed_at),
        channel_summary: rows.map((r: Record<string, unknown>) => ({
          platform:               String(r.platform),
          channel:                String(r.channel),
          conversion_type:        String(r.conversion_type),
          attributed_conversions: Number(r.attributed_conversions),
          attributed_value:       r.attributed_value != null ? Number(r.attributed_value) : undefined,
          credit_share_pct:       Number(r.credit_share_pct),
          total_spend:            r.total_spend != null ? Number(r.total_spend) : undefined,
          attributed_cpa:         r.attributed_cpa != null ? Number(r.attributed_cpa) : undefined,
          attributed_roas:        r.attributed_roas != null ? Number(r.attributed_roas) : undefined,
        })),
      };
    } catch { return null; }
  }

  override async getAttributionRuns(limit = 10): Promise<AttributionRun[]> {
    try {
      const rows = await this.runQuery({
        query: `
        SELECT
          run_id, model_name, period_start, period_end,
          paths_modeled, conversions_attributed, identity_match_rate,
          avg_path_length, status, started_at, completed_at, triggered_by
        FROM ${this.table("attribution_runs")}
        ORDER BY started_at DESC
        LIMIT @limit
      `,
        params: { limit: Math.trunc(limit) },
      });
      return rows.map((r: Record<string, unknown>) => ({
        run_id:                String(r.run_id),
        model_name:            String(r.model_name),
        period_start:          String(r.period_start),
        period_end:            String(r.period_end),
        paths_modeled:         r.paths_modeled != null ? Number(r.paths_modeled) : undefined,
        conversions_attributed: r.conversions_attributed != null ? Number(r.conversions_attributed) : undefined,
        identity_match_rate:   r.identity_match_rate != null ? Number(r.identity_match_rate) : undefined,
        avg_path_length:       r.avg_path_length != null ? Number(r.avg_path_length) : undefined,
        status:                String(r.status) as AttributionRun["status"],
        started_at:            String(r.started_at),
        completed_at:          r.completed_at ? String(r.completed_at) : undefined,
        triggered_by:          r.triggered_by ? String(r.triggered_by) : undefined,
      }));
    } catch { return []; }
  }

  // ── Agent Outputs ───────────────────────────────────────────────────────────

  override async getWatchdogAlerts(status?: "open" | "acknowledged" | "resolved" | "suppressed"): Promise<WatchdogAlert[]> {
    try {
      const where = status ? "WHERE status = @status" : "WHERE status IN ('open', 'acknowledged')";
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${this.table("watchdog_alerts")}
        ${where}
        ORDER BY detected_at DESC
        LIMIT 50
      `,
        params: status ? { status } : {},
      });
      return rows.map((r: Record<string, unknown>) => ({
        alert_id:           String(r.alert_id),
        alert_type:         String(r.alert_type),
        severity:           String(r.severity) as WatchdogAlert["severity"],
        status:             String(r.status) as WatchdogAlert["status"],
        affected_namespace: r.affected_namespace ? String(r.affected_namespace) : undefined,
        affected_platform:  r.affected_platform ? String(r.affected_platform) : undefined,
        metric_name:        r.metric_name ? String(r.metric_name) : undefined,
        metric_value:       r.metric_value != null ? Number(r.metric_value) : undefined,
        threshold_value:    r.threshold_value != null ? Number(r.threshold_value) : undefined,
        description:        String(r.description),
        probable_cause:     r.probable_cause ? String(r.probable_cause) : undefined,
        recommended_action: r.recommended_action ? String(r.recommended_action) : undefined,
        detected_at:        String(r.detected_at),
        resolved_at:        r.resolved_at ? String(r.resolved_at) : undefined,
      }));
    } catch { return []; }
  }

  override async getAnalystInsights(
    filters: { priority?: "high" | "medium" | "low"; status?: string; limit?: number } = {}
  ): Promise<AnalystInsight[]> {
    try {
      const conditions: string[] = [];
      const params: Record<string, unknown> = { limit: Math.trunc(filters.limit ?? 20) };
      if (filters.priority) { conditions.push("priority = @priority"); params.priority = filters.priority; }
      if (filters.status)   { conditions.push("status = @status");     params.status = filters.status; }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${this.table("analyst_insights")}
        ${where}
        ORDER BY generated_at DESC
        LIMIT @limit
      `,
        params,
      });
      return rows.map((r: Record<string, unknown>) => ({
        insight_id:        String(r.insight_id),
        insight_type:      String(r.insight_type),
        period_start:      r.period_start ? String(r.period_start) : undefined,
        period_end:        r.period_end ? String(r.period_end) : undefined,
        affected_platform: r.affected_platform ? String(r.affected_platform) : undefined,
        affected_channel:  r.affected_channel ? String(r.affected_channel) : undefined,
        headline:          String(r.headline),
        detail:            r.detail ? String(r.detail) : undefined,
        confidence:        String(r.confidence) as AnalystInsight["confidence"],
        has_recommendation: Boolean(r.has_recommendation),
        recommendation:    r.recommendation ? String(r.recommendation) : undefined,
        estimated_impact:  r.estimated_impact ? String(r.estimated_impact) : undefined,
        priority:          String(r.priority) as AnalystInsight["priority"],
        status:            String(r.status) as AnalystInsight["status"],
        generated_at:      String(r.generated_at),
      }));
    } catch { return []; }
  }

  override async getOperatorPendingApprovals(): Promise<OperatorPendingApproval[]> {
    try {
      const rows = await this.runQuery({ query: `
        SELECT *
        FROM ${this.table("pending_approvals")}
        ORDER BY proposed_at ASC
      ` });
      return rows.map((r: Record<string, unknown>) => ({
        action_id:            String(r.action_id),
        platform:             String(r.platform),
        action_type:          String(r.action_type),
        platform_entity_id:   String(r.platform_entity_id),
        campaign_id:          r.campaign_id ? String(r.campaign_id) : undefined,
        summary:              String(r.summary),
        rationale:            String(r.rationale),
        estimated_impact:     r.estimated_impact ? String(r.estimated_impact) : undefined,
        spend_at_risk:        r.spend_at_risk != null ? Number(r.spend_at_risk) : undefined,
        change_magnitude_pct: r.change_magnitude_pct != null ? Number(r.change_magnitude_pct) : undefined,
        proposed_at:          String(r.proposed_at),
        expires_at:           r.expires_at ? String(r.expires_at) : undefined,
      }));
    } catch { return []; }
  }

  // ── Analytics & Data Governance ───────────────────────────────────────────

  override async queryAccountJourney(
    account_domain: string,
    lookback_days: number,
    conversion_type?: string
  ) {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const convFilter = conversion_type ? "AND c.conversion_type = @conversion_type" : "";
    const lookback = Math.trunc(lookback_days);

    try {
      const touchRows = await this.runQuery({
        query: `
        WITH account_entities AS (
          -- Find canonical entities linked to this domain
          SELECT DISTINCT ies.entity_id
          FROM ${ds}.identity_entity_signals ies
          JOIN ${ds}.identity_entities e ON e.entity_id = ies.entity_id
          WHERE (
            e.company_domain = @account_domain
            OR ies.identifier_value = @account_domain
          )
          AND ies.is_active = TRUE
        )
        SELECT
          t.touchpoint_id,
          t.entity_id,
          t.touchpoint_at,
          t.touchpoint_type,
          t.platform,
          t.channel,
          t.campaign_id,
          t.funnel_stage,
          t.path_position,
          t.path_total_touches,
          r.credit_weight,
          r.credit_conversions,
          r.model_name
        FROM ${ds}.touchpoint_events t
        JOIN account_entities ae ON ae.entity_id = t.entity_id
        LEFT JOIN ${ds}.attribution_results r ON r.touchpoint_id = t.touchpoint_id
          AND r.run_id = (
            SELECT run_id FROM ${ds}.attribution_runs
            WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1
          )
        WHERE t.touchpoint_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback_days DAY)
        ORDER BY t.touchpoint_at ASC
        LIMIT 500
      `,
        params: { account_domain, lookback_days: lookback },
      });

      const convParams: Record<string, unknown> = { account_domain, lookback_days: lookback };
      if (conversion_type) convParams.conversion_type = conversion_type;
      const convRows = await this.runQuery({
        query: `
        WITH account_entities AS (
          SELECT DISTINCT ies.entity_id
          FROM ${ds}.identity_entity_signals ies
          JOIN ${ds}.identity_entities e ON e.entity_id = ies.entity_id
          WHERE e.company_domain = @account_domain AND ies.is_active = TRUE
        )
        SELECT
          c.conversion_id, c.entity_id, c.converted_at,
          c.conversion_type, c.conversion_value, c.deal_value, c.pipeline_stage
        FROM ${ds}.conversion_events c
        JOIN account_entities ae ON ae.entity_id = c.entity_id
        WHERE c.converted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback_days DAY)
        ${convFilter}
        ORDER BY c.converted_at ASC
      `,
        params: convParams,
      });

      const entities = new Set((touchRows as Record<string, unknown>[]).map(r => String(r.entity_id)));
      const channels = [...new Set((touchRows as Record<string, unknown>[]).map(r => String(r.channel)))];
      const platforms = [...new Set((touchRows as Record<string, unknown>[]).map(r => String(r.platform)))];
      const totalCredit = (touchRows as Record<string, unknown>[])
        .reduce((sum, r) => sum + Number(r.credit_weight ?? 0), 0);

      return {
        account_domain,
        entity_count:  entities.size,
        touchpoints:   touchRows as object[],
        conversions:   convRows as object[],
        path_summary: {
          total_touchpoints:  touchRows.length,
          total_conversions:  convRows.length,
          channels_touched:   channels,
          platforms_touched:  platforms,
          total_credit_weight: Math.round(totalCredit * 100) / 100,
          lookback_days,
        },
      };
    } catch { return null; }
  }

  override async getSignalCaptureRates(hours_back: number, platform?: string): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const pFilter = platform ? "AND platform = @platform" : "";
    const params: Record<string, unknown> = { hours_back: Math.trunc(hours_back) };
    if (platform) params.platform = platform;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT
          namespace_id,
          platform,
          AVG(capture_rate_pct)                    AS avg_capture_rate_pct,
          MIN(capture_rate_pct)                    AS min_capture_rate_pct,
          MAX(capture_rate_pct)                    AS max_capture_rate_pct,
          SUM(total_events)                        AS total_events,
          COUNTIF(is_anomaly)                      AS anomaly_count,
          MAX(logged_at)                           AS last_logged_at
        FROM ${ds}.watchdog_capture_rate_log
        WHERE logged_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours_back HOUR)
        ${pFilter}
        GROUP BY namespace_id, platform
        ORDER BY avg_capture_rate_pct ASC
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  override async getCrmNullFieldStats(since_hours: number) {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT
          COUNTIF(gclid IS NULL AND fbclid IS NULL AND li_fat_id IS NULL
                  AND ttclid IS NULL AND ga_client_id IS NULL) AS null_media_ids,
          COUNTIF(utm_source IS NULL OR utm_source = '')        AS null_utm,
          COUNT(*)                                               AS total_leads
        FROM ${ds}.crm_leads_staging
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @since_hours HOUR)
      `,
        params: { since_hours: Math.trunc(since_hours) },
      });
      if (!rows.length) return null;
      const r = rows[0] as Record<string, unknown>;
      const total = Number(r.total_leads ?? 0);
      const nullCount = Number(r.null_media_ids ?? 0);
      const nullPct = total > 0 ? Math.round((nullCount / total) * 1000) / 10 : 0;
      return {
        source:        "bigquery",
        hours_sampled: since_hours,
        total_leads:   total,
        null_media_ids: nullCount,
        null_pct:      nullPct,
        threshold_pct: 5,
        breach:        nullPct > 5 && total > 0,
      };
    } catch { return null; }
  }

  // ── Reporting Views (06_reporting.sql) ───────────────────────────────────
  // These methods query the pre-built reporting views. They are NOT yet part of
  // the PaidMediaAdapter interface — the interface will be extended in Task 31.
  // All views reference the latest completed attribution run automatically.

  /**
   * Campaign performance: spend + MTA attribution in one row per campaign.
   * Queries v_campaign_performance (see 06_reporting.sql).
   */
  async getCampaignPerformanceReport(filters: {
    platform?: string;
    team_id?: string;
    funnel_stage?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.platform)     { conditions.push("platform = @platform");           params.platform = filters.platform; }
    if (filters.team_id)      { conditions.push("team_id = @team_id");             params.team_id = filters.team_id; }
    if (filters.funnel_stage) { conditions.push("funnel_stage = @funnel_stage");   params.funnel_stage = filters.funnel_stage; }
    if (filters.status)       { conditions.push("campaign_status = @status");      params.status = filters.status; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_campaign_performance
        ${where}
        ORDER BY total_spend DESC
        LIMIT 500
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Pacing status for all active / paused campaigns that have started flying.
   * Queries v_pacing_status (see 06_reporting.sql).
   */
  async getPacingReport(filters: {
    platform?: string;
    team_id?: string;
    pacing_status?: "overpacing" | "underpacing" | "on_pace" | "no_budget_data";
    funnel_stage?: string;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.platform)      { conditions.push("platform = @platform");             params.platform = filters.platform; }
    if (filters.team_id)       { conditions.push("team_id = @team_id");               params.team_id = filters.team_id; }
    if (filters.pacing_status) { conditions.push("pacing_status = @pacing_status");   params.pacing_status = filters.pacing_status; }
    if (filters.funnel_stage)  { conditions.push("funnel_stage = @funnel_stage");     params.funnel_stage = filters.funnel_stage; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_pacing_status
        ${where}
        ORDER BY
          CASE pacing_status
            WHEN 'overpacing'   THEN 1
            WHEN 'underpacing'  THEN 2
            WHEN 'on_pace'      THEN 3
            ELSE 4
          END,
          ABS(COALESCE(pacing_variance_amount, 0)) DESC
        LIMIT 500
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * ROAS comparison: platform-reported vs MTA attributed vs margin ROI per channel.
   * Queries v_roas_comparison (see 06_reporting.sql).
   */
  async getRoasComparison(filters: {
    platform?: string;
    channel?: string;
    conversion_type?: string;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.platform)        { conditions.push("platform = @platform");                 params.platform = filters.platform; }
    if (filters.channel)         { conditions.push("channel = @channel");                   params.channel = filters.channel; }
    if (filters.conversion_type) { conditions.push("conversion_type = @conversion_type");   params.conversion_type = filters.conversion_type; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_roas_comparison
        ${where}
        ORDER BY total_spend DESC
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Cross-channel efficiency: attributed CPA, ROAS, pipeline share, and
   * spend vs pipeline gap per channel. Queries v_channel_efficiency.
   */
  async getChannelEfficiency(): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({ query: `
        SELECT *
        FROM ${ds}.v_channel_efficiency
        ORDER BY pipeline_share_pct DESC
      ` });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Ad/creative performance with attribution.
   * Queries v_ad_performance (see 06_reporting.sql).
   */
  async getAdPerformance(filters: {
    campaign_id?: string;
    platform?: string;
    creative_format?: string;
    min_spend?: number;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.campaign_id)     { conditions.push("campaign_id = @campaign_id");           params.campaign_id = filters.campaign_id; }
    if (filters.platform)        { conditions.push("platform = @platform");                 params.platform = filters.platform; }
    if (filters.creative_format) { conditions.push("creative_format = @creative_format");   params.creative_format = filters.creative_format; }
    if (filters.min_spend != null) { conditions.push("total_spend >= @min_spend");          params.min_spend = filters.min_spend; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_ad_performance
        ${where}
        ORDER BY total_spend DESC
        LIMIT 500
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Keyword performance with spend, quality scores, and impression share.
   * Queries v_keyword_performance (see 06_reporting.sql).
   */
  async getKeywordPerformance(filters: {
    campaign_id?: string;
    platform?: string;
    min_spend?: number;
    low_quality_score?: boolean;
    lost_is_budget?: boolean;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.campaign_id)   { conditions.push("campaign_id = @campaign_id");   params.campaign_id = filters.campaign_id; }
    if (filters.platform)      { conditions.push("platform = @platform");         params.platform = filters.platform; }
    if (filters.min_spend != null) { conditions.push("total_spend >= @min_spend"); params.min_spend = filters.min_spend; }
    if (filters.low_quality_score) conditions.push("quality_score <= 5");
    if (filters.lost_is_budget)    conditions.push("avg_is_lost_budget > 0.1");
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_keyword_performance
        ${where}
        ORDER BY total_spend DESC
        LIMIT 1000
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Daily performance trend for all campaigns.
   * Queries v_daily_performance (see 06_reporting.sql).
   */
  async getDailyPerformance(filters: {
    campaign_id?: string;
    platform?: string;
    team_id?: string;
    date_from?: string;
    date_to?: string;
    group_by?: "day" | "week" | "month";
  } = {}): Promise<object[]> {
    // Queries platform_daily_spend directly (deployed, always available).
    // Falls back gracefully without the v_daily_performance view dependency.
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.campaign_id) { conditions.push("s.campaign_id = @campaign_id"); params.campaign_id = filters.campaign_id; }
    if (filters.platform)    { conditions.push("s.platform = @platform");       params.platform = filters.platform; }
    if (filters.date_from)   { conditions.push("s.date >= DATE(@date_from)");         params.date_from = filters.date_from; }
    if (filters.date_to)     { conditions.push("s.date <= DATE(@date_to)");           params.date_to = filters.date_to; }
    // team_id not on platform_daily_spend — skip silently
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const groupBy = filters.group_by ?? "day";

    const periodExpr = groupBy === "week"
      ? "DATE_TRUNC(s.date, WEEK(MONDAY))"
      : groupBy === "month"
      ? "DATE_TRUNC(s.date, MONTH)"
      : "s.date";

    // Always GROUP BY — for "day" we group by date which gives one row per campaign/day.
    // This keeps the SELECT consistent (all metrics use SUM) and avoids BigQuery
    // "neither grouped nor aggregated" errors.
    try {
      const rows = await this.runQuery({
        query: `
        SELECT
          ${periodExpr}                          AS period,
          s.platform,
          s.campaign_id,
          MAX(c.campaign_name)                   AS campaign_name,
          MAX(c.objective)                       AS objective,
          SUM(CAST(s.spend AS FLOAT64))          AS spend,
          SUM(s.impressions)                     AS impressions,
          SUM(s.clicks)                          AS clicks,
          SUM(s.platform_conversions)            AS platform_conversions,
          SAFE_DIVIDE(SUM(s.clicks),
            NULLIF(SUM(s.impressions), 0))       AS ctr,
          SAFE_DIVIDE(SUM(CAST(s.spend AS FLOAT64)),
            NULLIF(SUM(s.clicks), 0))            AS cpc,
          SAFE_DIVIDE(SUM(CAST(s.spend AS FLOAT64)) * 1000,
            NULLIF(SUM(s.impressions), 0))       AS cpm
        FROM ${ds}.platform_daily_spend s
        LEFT JOIN ${ds}.platform_campaigns c
               ON s.campaign_id = c.campaign_id
        ${where}
        GROUP BY period, s.platform, s.campaign_id
        ORDER BY period DESC
        LIMIT 10000
      `,
        params,
      });
      return rows as object[];
    } catch (err) {
      console.error("[paid-media-mcp] getDailyPerformance error:", err);
      return [];
    }
  }

  // ── Account-Based Analytics (07_account_analytics.sql) ───────────────────
  // Methods for querying company profiles, sessions, engagement, and target
  // account activity. Not yet on PaidMediaAdapter interface — formalized in Task 31.

  /**
   * Look up enriched firmographic profile for a company domain.
   * Queries company_profiles table.
   */
  async getCompanyProfile(company_domain: string): Promise<object | null> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.company_profiles
        WHERE company_domain = @company_domain
          AND is_active = TRUE
        LIMIT 1
      `,
        params: { company_domain },
      });
      return rows.length ? rows[0] : null;
    } catch { return null; }
  }

  /**
   * Get the target account funnel view — ranked target accounts with
   * engagement, CRM status, paid media exposure, and intent scores.
   * Queries v_target_account_funnel.
   */
  async getTargetAccountFunnel(filters: {
    account_tier?: "tier_1" | "tier_2" | "tier_3";
    crm_pipeline_stage?: string;
    intent_spiking?: boolean;
    is_suppressed_tofu?: boolean;
    min_sessions_30d?: number;
    limit?: number;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = { limit: Math.trunc(filters.limit ?? 100) };
    if (filters.account_tier)       { conditions.push("account_tier = @account_tier");             params.account_tier = filters.account_tier; }
    if (filters.crm_pipeline_stage) { conditions.push("crm_pipeline_stage = @crm_pipeline_stage"); params.crm_pipeline_stage = filters.crm_pipeline_stage; }
    if (filters.intent_spiking != null)     { conditions.push("intent_spiking = @intent_spiking");         params.intent_spiking = filters.intent_spiking; }
    if (filters.is_suppressed_tofu != null) { conditions.push("is_suppressed_tofu = @is_suppressed_tofu"); params.is_suppressed_tofu = filters.is_suppressed_tofu; }
    if (filters.min_sessions_30d != null)   { conditions.push("sessions_30d >= @min_sessions_30d");        params.min_sessions_30d = Math.trunc(filters.min_sessions_30d); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_target_account_funnel
        ${where}
        ORDER BY funnel_priority_score DESC, account_tier_rank ASC
        LIMIT @limit
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Get de-anonymized sessions for a specific company.
   * Queries company_sessions table.
   */
  async getCompanySessions(company_domain: string, lookback_days = 30): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT
          session_id, session_date, session_start_at, session_duration_seconds,
          page_count, channel_grouping, landing_page, utm_campaign,
          visited_pricing, visited_demo, visited_contact, visited_docs,
          has_paid_touchpoint, paid_touchpoint_platform, paid_touchpoint_campaign_id,
          crm_pipeline_stage, is_target_account, resolution_method, resolution_confidence
        FROM ${ds}.company_sessions
        WHERE company_domain = @company_domain
          AND session_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback_days DAY)
        ORDER BY session_date DESC
        LIMIT 500
      `,
        params: { company_domain, lookback_days: Math.trunc(lookback_days) },
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Get engagement summary for a company over a time period.
   * Queries company_engagement table.
   */
  async getCompanyEngagement(company_domain: string, period_type = "rolling_30d"): Promise<object | null> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.company_engagement
        WHERE company_domain = @company_domain
          AND period_type = @period_type
        ORDER BY period_start DESC
        LIMIT 1
      `,
        params: { company_domain, period_type },
      });
      return rows.length ? rows[0] : null;
    } catch { return null; }
  }

  /**
   * Get dark funnel coverage: target accounts with no web presence.
   * Queries v_dark_funnel_coverage.
   */
  async getDarkFunnelCoverage(filters: {
    account_tier?: "tier_1" | "tier_2" | "tier_3";
    web_presence_status?: "dark" | "lapsed" | "visible";
    crm_pipeline_stage?: string;
  } = {}): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.account_tier)        { conditions.push("account_tier = @account_tier");               params.account_tier = filters.account_tier; }
    if (filters.web_presence_status) { conditions.push("web_presence_status = @web_presence_status"); params.web_presence_status = filters.web_presence_status; }
    if (filters.crm_pipeline_stage)  { conditions.push("crm_pipeline_stage = @crm_pipeline_stage");   params.crm_pipeline_stage = filters.crm_pipeline_stage; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.v_dark_funnel_coverage
        ${where}
        ORDER BY tier_rank ASC, icp_score DESC
        LIMIT 500
      `,
        params,
      });
      return rows as object[];
    } catch { return []; }
  }

  /**
   * Get daily target account activity history for a specific company.
   * Queries target_account_activity table.
   */
  async getTargetAccountActivity(company_domain: string, lookback_days = 30): Promise<object[]> {
    const ds = `\`${this.config.projectId}.${this.config.dataset}\``;
    try {
      const rows = await this.runQuery({
        query: `
        SELECT *
        FROM ${ds}.target_account_activity
        WHERE company_domain = @company_domain
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL @lookback_days DAY)
        ORDER BY date DESC
        LIMIT @lookback_days
      `,
        params: { company_domain, lookback_days: Math.trunc(lookback_days) },
      });
      return rows as object[];
    } catch { return []; }
  }

  // ── Interactive Media Actions ─────────────────────────────────────────────
  // BigQuery adapter routes these to the Operator agent (via inherited FileAdapter logic)
  // which already has the correct platform API credentials.
}

// ── Row mapping ──────────────────────────────────────────────────────────────

// Maps a platform_campaigns row (paid-media-schema 03_platform.sql) to Campaign type
function rowToCampaign(r: Record<string, unknown>): Campaign {
  return {
    id:           String(r.campaign_id ?? r.id),
    name:         String(r.campaign_name ?? r.name),
    account_id:   String(r.platform_account_id ?? r.account_id ?? ""),
    team_id:      String(r.team_id ?? ""),
    platform:     String(r.platform) as Platform,
    status:       String(r.status) as CampaignStatus,
    objective:    String(r.objective ?? "conversions") as CampaignObjective,
    funnel_stage: r.funnel_stage ? String(r.funnel_stage) as "upper" | "mid" | "lower" : undefined,
    budget: {
      amount:   r.budget_amount != null ? Number(r.budget_amount) : 0,
      type:     (String(r.budget_type ?? "lifetime")) as "daily" | "lifetime" | "monthly",
      currency: String(r.budget_currency ?? r.currency ?? "USD"),
    },
    start_date: String(r.start_date ?? ""),
    end_date:   r.end_date ? String(r.end_date) : undefined,
    notes:      r.notes ? String(r.notes) : undefined,
  };
}
