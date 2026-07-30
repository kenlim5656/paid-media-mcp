/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import type { PaidMediaAdapter } from "../adapters/base.js";

export const registerResources = (adapter: PaidMediaAdapter) => [
  // ── System context ────────────────────────────────────────────────────────
  // Read this first. Tells Claude what data is available and how to use tools.
  {
    uri: "paid-media://system",
    name: "Paid Media MCP — System Context",
    description:
      "Start here. Describes what data this MCP server has, what tools are available, " +
      "and how to answer paid media questions without asking for credentials.",
    mimeType: "text/plain",
    handler: async () => {
      const bqMode = !!process.env.BIGQUERY_PROJECT_ID;
      const project = process.env.BIGQUERY_PROJECT_ID ?? "not configured";
      const dataset = process.env.BIGQUERY_DATASET_ID ?? "paid_media";

      return `# Paid Media MCP — System Context

## What this server is
This MCP server gives you direct, read access to a live BigQuery paid media dataset.
You do NOT need to ask the user for credentials, API keys, or Google Ads / Meta / LinkedIn
authentication. All data is already in BigQuery and available through the tools below.

## Data mode
Mode:    ${bqMode ? "BigQuery (live)" : "File (demo)"}
Project: ${project}
Dataset: ${dataset}

## What data is available
- **Campaigns** (16 active): Google Ads, Meta, LinkedIn, TikTok, Reddit — use list_campaigns
- **Daily spend & performance** (90 days): spend, impressions, clicks, conversions by campaign/geo — use get_daily_performance
- **Sessions** (10,910 rows): GA4 sessions with click ID signals (gclid, fbclid, etc.) — use analytics tools
- **CRM leads** (499 rows): lead source, attribution tokens, opportunity pipeline — use attribution tools
- **Attribution results**: multi-touch attribution channel summaries — use get_attribution_results
- **Watchdog alerts**: data quality alerts from the autonomous Watchdog agent — use get_watchdog_alerts
- **Analyst insights**: findings from the autonomous Analyst agent — use get_analyst_insights
- **Account-based analytics**: company profiles, engagement, target account activity — use account analytics tools

## How to answer common questions — use tools immediately, never ask for credentials
- "Google Ads performance last 7 days" → call get_daily_performance(platform="google_ads", date_from=..., date_to=...)
- "Which campaign has the best ROAS?" → call get_campaign_performance_report or get_roas_comparison
- "What are the active alerts?" → call get_watchdog_alerts(status="open")
- "Attribution breakdown" → call get_attribution_results or compare_attribution_models
- "Pacing this month" → call get_pacing_report
- "Which companies are visiting our site?" → call get_target_account_funnel or get_company_profile

## Key rule
**Always call the relevant tool first.** Never ask the user to authenticate, export data,
or provide campaign IDs. The data is here. If a tool returns empty results, say so and
explain what data you'd need to populate it — do not ask for credentials.
`;
    },
  },

  {
    uri: "paid-media://overview",
    name: "Company & Team Overview",
    description: "Company metadata, all teams, and their account/platform assignments",
    mimeType: "application/json",
    handler: async () => {
      const [metadata, teams, accounts] = await Promise.all([
        adapter.getMetadata(),
        adapter.getTeams(),
        adapter.getAccounts(),
      ]);
      return JSON.stringify({ metadata, teams, accounts }, null, 2);
    },
  },

  {
    uri: "paid-media://campaigns",
    name: "All Campaigns",
    description: "Full list of all campaigns across all teams and platforms",
    mimeType: "application/json",
    handler: async () => {
      const campaigns = await adapter.getCampaigns();
      return JSON.stringify({ count: campaigns.length, campaigns }, null, 2);
    },
  },

  {
    uri: "paid-media://team-structure",
    name: "Team Structure",
    description: "All teams, their members, objectives, KPIs, and account assignments",
    mimeType: "application/json",
    handler: async () => {
      const [teams, members] = await Promise.all([
        adapter.getTeams(),
        adapter.getTeamMembers(),
      ]);
      const enriched = teams.map((t) => ({
        ...t,
        members: members.filter((m) => m.team_ids.includes(t.id)),
      }));
      return JSON.stringify({ teams: enriched }, null, 2);
    },
  },

  {
    uri: "paid-media://attribution-models",
    name: "Attribution Models",
    description: "All attribution configurations including models, windows, and conversion events",
    mimeType: "application/json",
    handler: async () => {
      const configs = await adapter.getAttributionConfigurations();
      return JSON.stringify({ count: configs.length, configurations: configs }, null, 2);
    },
  },

  {
    uri: "paid-media://reporting-templates",
    name: "Reporting Templates",
    description: "All reporting and dashboard templates by audience and cadence",
    mimeType: "application/json",
    handler: async () => {
      const templates = await adapter.getReportingTemplates();
      return JSON.stringify({ count: templates.length, templates }, null, 2);
    },
  },

  {
    uri: "paid-media://asset-library",
    name: "Asset Library",
    description: "DAM system info, asset categories, naming conventions, and per-platform specs",
    mimeType: "application/json",
    handler: async () => {
      const lib = await adapter.getAssetLibrary();
      return JSON.stringify(lib, null, 2);
    },
  },

  {
    uri: "paid-media://testing-program",
    name: "Testing Program",
    description: "Testing methodology, tools, and full test history (active, planned, completed)",
    mimeType: "application/json",
    handler: async () => {
      const program = await adapter.getTestingProgram();
      return JSON.stringify(program, null, 2);
    },
  },

  {
    uri: "paid-media://audience-library",
    name: "Audience Library",
    description: "First-party audiences, data providers, onboarding platforms, lookalike strategy, and third-party layers",
    mimeType: "application/json",
    handler: async () => {
      const lib = await adapter.getAudienceLibrary();
      return JSON.stringify(lib, null, 2);
    },
  },

  {
    uri: "paid-media://measurement-setup",
    name: "Measurement & Tracking Setup",
    description: "Tag management, pixels, conversion APIs, CM360 u-variables, website data capture, and measurement partners",
    mimeType: "application/json",
    handler: async () => {
      const setup = await adapter.getMeasurementSetup();
      return JSON.stringify(setup, null, 2);
    },
  },

  {
    uri: "paid-media://gmp-platforms",
    name: "GMP Platform Bulk Upload Schemas",
    description: "DV360 SDF, SA360 Bulksheet, and CM360 Trafficking Sheet schemas with field definitions, valid values, and org defaults",
    mimeType: "application/json",
    handler: async () => {
      const config = await adapter.getPlatformsConfig();
      return JSON.stringify(config, null, 2);
    },
  },

  // ── Schema resources (from paid-media-schema) ─────────────────────────────
  // These expose the BigQuery table schemas so Claude can write accurate SQL
  // without guessing field names. Critical for text-to-SQL attribution queries.

  {
    uri: "paid-media://schema/identity",
    name: "Identity Schema Reference",
    description:
      "The paid-media-schema identity layer table schemas: identity_signals, identity_entities, " +
      "identity_entity_signals, identity_stitching_log. " +
      "Read this before writing any SQL that joins on entity_id, namespace_id, or identifier_value. " +
      "Also includes the namespace category taxonomy and confidence scoring rules.",
    mimeType: "text/plain",
    handler: async () => {
      const namespaces = await adapter.getIdentityNamespaces();
      const categories = [...new Set(namespaces.map(n => n.category))];
      return [
        "# Identity Layer Schema Reference",
        "",
        "## Table: identity_signals",
        "| Column | Type | Description |",
        "|--------|------|-------------|",
        "| signal_id | STRING | UUID primary key |",
        "| session_id | STRING | Links to sessions.session_id |",
        "| namespace_id | STRING | e.g. 'platform_click_id.google.gclid' |",
        "| identifier_value | STRING | The actual signal value (hashed where PII) |",
        "| captured_at | TIMESTAMP | When the signal was captured |",
        "| capture_source | STRING | landing_page \\| analytics \\| crm \\| capi \\| sdk |",
        "| confidence_score | FLOAT64 | 0.0–1.0 |",
        "| is_deterministic | BOOL | From namespace registry |",
        "| expires_at | TIMESTAMP | Nullable — based on namespace lifetime_days |",
        "",
        "## Table: identity_entities",
        "| Column | Type | Description |",
        "|--------|------|-------------|",
        "| entity_id | STRING | UUID — stable canonical entity identifier |",
        "| entity_type | STRING | person \\| account \\| household |",
        "| company_domain | STRING | e.g. 'acme.com' (B2B account stitching) |",
        "| company_name | STRING | From CRM or IP intelligence |",
        "| confidence_tier | STRING | high \\| medium \\| low |",
        "| signal_count | INT64 | Total signals stitched |",
        "| first_seen_at | TIMESTAMP | |",
        "| last_seen_at | TIMESTAMP | |",
        "",
        "## Table: identity_entity_signals (the graph)",
        "| Column | Type | Description |",
        "|--------|------|-------------|",
        "| entity_id | STRING | → identity_entities.entity_id |",
        "| namespace_id | STRING | → identity_namespaces registry |",
        "| identifier_value | STRING | |",
        "| match_method | STRING | deterministic \\| probabilistic \\| declarative |",
        "| confidence_score | FLOAT64 | |",
        "| stitched_by | STRING | analyst_agent \\| watchdog_agent \\| import |",
        "| first_observed_at | TIMESTAMP | |",
        "| last_observed_at | TIMESTAMP | |",
        "| observation_count | INT64 | |",
        "",
        "## Namespace Categories",
        categories.map(c => `- ${c}`).join("\n"),
        "",
        "## Registered Namespaces (sample — use list_identity_namespaces for full list)",
        namespaces.slice(0, 15).map(n =>
          `- ${n.namespace_id} | ${n.display_name} | deterministic: ${n.deterministic}`
        ).join("\n"),
      ].join("\n");
    },
  },

  {
    uri: "paid-media://schema/attribution",
    name: "Attribution Schema Reference",
    description:
      "The paid-media-schema attribution layer table schemas: attribution_paths, attribution_runs, " +
      "attribution_results, attribution_channel_summary. " +
      "Read this before writing attribution SQL or interpreting model outputs. " +
      "Includes column descriptions, the credit_weight formula logic, and join keys.",
    mimeType: "text/plain",
    handler: async () => {
      const latestRun = await adapter.getAttributionRuns(1);
      const runContext = latestRun[0]
        ? `Latest run: ${latestRun[0].run_id} | Model: ${latestRun[0].model_name} | ` +
          `Period: ${latestRun[0].period_start} → ${latestRun[0].period_end} | Status: ${latestRun[0].status}`
        : "No completed runs yet.";
      return [
        "# Attribution Layer Schema Reference",
        "",
        `## Context: ${runContext}`,
        "",
        "## Table: attribution_results (touchpoint-level credit)",
        "| Column | Type | Description |",
        "|--------|------|-------------|",
        "| result_id | STRING | UUID |",
        "| run_id | STRING | → attribution_runs.run_id |",
        "| entity_id | STRING | → identity_entities.entity_id |",
        "| conversion_date | DATE | When the conversion occurred |",
        "| touchpoint_date | DATE | When the touchpoint occurred |",
        "| platform | STRING | google_ads \\| meta \\| linkedin \\| dv360 \\| etc. |",
        "| channel | STRING | paid_search_brand \\| paid_social_prospecting \\| display_retargeting \\| etc. |",
        "| campaign_id | STRING | Internal campaign ID |",
        "| path_position | INT64 | 1 = first touch, path_total_touches = last touch |",
        "| path_total_touches | INT64 | Total touches in this conversion path |",
        "| conversion_type | STRING | opportunity_created \\| purchase \\| lead \\| etc. |",
        "| conversion_value | FLOAT64 | Monetary value at conversion |",
        "| deal_value | FLOAT64 | Full deal/ARR value (B2B) |",
        "| credit_weight | FLOAT64 | 0.0–1.0: this touch's share of conversion credit |",
        "| credit_conversions | FLOAT64 | credit_weight × 1 (fractional conversion count) |",
        "| credit_value | FLOAT64 | credit_weight × conversion_value |",
        "| model_name | STRING | full_path \\| first_touch \\| last_touch \\| linear \\| etc. |",
        "",
        "## Table: attribution_channel_summary (pre-aggregated — use for reporting)",
        "| Column | Type | Description |",
        "|--------|------|-------------|",
        "| run_id | STRING | |",
        "| model_name | STRING | |",
        "| period_start | DATE | |",
        "| period_end | DATE | |",
        "| platform | STRING | |",
        "| channel | STRING | |",
        "| conversion_type | STRING | |",
        "| attributed_conversions | FLOAT64 | SUM of credit_conversions |",
        "| attributed_value | FLOAT64 | SUM of credit_value |",
        "| credit_share_pct | FLOAT64 | % of total attributed credit |",
        "| total_spend | FLOAT64 | Joined from platform_daily_spend |",
        "| attributed_cpa | FLOAT64 | spend / attributed_conversions |",
        "| attributed_roas | FLOAT64 | attributed_value / spend |",
        "",
        "## Full-Path Model Credit Formula",
        "- Single touch: 100%",
        "- First touch: configured first_touch_pct (default 30%)",
        "- Last touch: configured last_touch_pct (default 30%)",
        "- Middle touches: remaining (40%) split equally across all middle touches",
        "",
        "## Key Join Pattern",
        "attribution_results → identity_entities: JOIN ON entity_id",
        "attribution_results → platform_campaigns: JOIN ON campaign_id",
        "attribution_channel_summary → platform_daily_spend: JOIN ON platform + date range",
        "Use run_id to filter to a specific model run; omit for latest run using MAX(completed_at).",
      ].join("\n");
    },
  },

  {
    uri: "paid-media://config/attribution-milestones",
    name: "Attribution Milestones & Model Config",
    description:
      "B2B pipeline stage definitions and attribution model weight configurations. " +
      "Defines what each conversion_type means in the pipeline (Lead → MQL → SQL → Opportunity → Won), " +
      "which touches get credit at each stage, and the configured model weights. " +
      "Read this before analyzing attribution results to understand what 'good' looks like " +
      "and which conversion types correspond to which pipeline stages.",
    mimeType: "application/json",
    handler: async () => {
      const configs = await adapter.getAttributionConfigurations();
      return JSON.stringify({
        attribution_model_configs: configs,
        b2b_pipeline_stages: {
          description: "Standard B2B funnel stages mapped to conversion_type values in the schema",
          stages: [
            {
              stage:           "Awareness",
              conversion_types: [],
              funnel_position: "upper",
              notes:           "No conversion event — touchpoints only. Credit tracked but no milestone.",
            },
            {
              stage:           "Lead",
              conversion_types: ["lead", "lead_form", "contact_form", "content_download", "webinar_registration"],
              funnel_position: "upper-mid",
              weight_context:  "First-touch credit is highest here — awareness channels drive lead volume.",
            },
            {
              stage:           "MQL",
              conversion_types: ["mql", "demo_booked", "trial_started"],
              funnel_position: "mid",
              weight_context:  "Middle touches matter here — nurture campaigns and retargeting.",
            },
            {
              stage:           "Opportunity Created",
              conversion_types: ["opportunity_created", "sql"],
              funnel_position: "lower-mid",
              weight_context:  "Most valuable B2B leading indicator. Balance of all touch types.",
              notes:           "Primary KPI for B2B paid media attribution.",
            },
            {
              stage:           "Closed Won",
              conversion_types: ["opportunity_won", "contract_signed", "purchase", "subscription"],
              funnel_position: "lower",
              weight_context:  "Last-touch credit highest. Often shows brand and search.",
              notes:           "Revenue milestone — use deal_value not conversion_value for ARR.",
            },
          ],
        },
        full_path_weights: {
          description: "Default Full-Path attribution weights used by the Analyst agent",
          first_touch_pct: 0.30,
          last_touch_pct:  0.30,
          middle_pct:      0.40,
          middle_distribution: "Split equally across all middle touches",
          upgrade_trigger: "When path count > 1,000, Shapley/Markov models are statistically valid",
        },
        signal_confidence_tiers: {
          high:   "≥1 deterministic signal (hashed email, CRM ID, authenticated user ID, platform click ID)",
          medium: "2+ probabilistic signals that corroborate (email domain + analytics cookie)",
          low:    "Single probabilistic signal only (IP address, session cookie alone)",
        },
      }, null, 2);
    },
  },

  // ── Reporting schema resources ────────────────────────────────────────────

  {
    uri: "paid-media://schema/reporting",
    name: "Reporting Views Schema Reference",
    description:
      "The paid-media-schema reporting layer view schemas (06_reporting.sql): " +
      "v_campaign_performance, v_pacing_status, v_roas_comparison, v_channel_efficiency, " +
      "v_ad_performance, v_keyword_performance, v_daily_performance. " +
      "Read this before calling any get_*_report or get_*_performance MCP tools to understand " +
      "what columns are returned and how the views join underlying tables.",
    mimeType: "text/plain",
    handler: async () => [
      "# Reporting Views Schema Reference",
      "Source: paid-media-schema/bigquery/06_reporting.sql",
      "All views auto-reference the latest completed attribution run (no run_id filtering needed).",
      "",
      "## v_campaign_performance  →  get_campaign_performance_report",
      "Joins: platform_campaigns + platform_daily_spend + attribution_channel_summary",
      "| Column | Description |",
      "|--------|-------------|",
      "| campaign_id, campaign_name, platform, team_id, funnel_stage | Campaign identity |",
      "| total_spend NUMERIC | Total spend in the aggregation window |",
      "| total_impressions, total_clicks, total_conversions | Volume metrics |",
      "| platform_roas NUMERIC | Revenue / spend as reported by the platform |",
      "| attributed_conversions, attributed_value NUMERIC | From MTA model |",
      "| attributed_roas NUMERIC | attributed_value / total_spend (MTA) |",
      "| margin_roi NUMERIC | Revenue × margin_pct / spend (from platform_data JSON) |",
      "| attributed_cpa NUMERIC | total_spend / attributed_conversions |",
      "| pipeline_value NUMERIC | Total deal value from attribution_results |",
      "| platform_overcount_pct FLOAT64 | (platform_roas - attributed_roas) / attributed_roas |",
      "",
      "## v_pacing_status  →  get_pacing_report",
      "Joins: platform_campaigns + platform_daily_spend",
      "| Column | Description |",
      "|--------|-------------|",
      "| campaign_id, platform, team_id, funnel_stage | Identity |",
      "| budget_amount, budget_type | Campaign budget config |",
      "| days_elapsed, days_remaining, days_total | Timeline |",
      "| expected_spend NUMERIC | budget × (days_elapsed / days_total) |",
      "| actual_spend NUMERIC | Sum of spend so far |",
      "| pacing_variance_pct FLOAT64 | (actual - expected) / expected |",
      "| required_daily_spend NUMERIC | Remaining budget / days remaining |",
      "| projected_total_spend NUMERIC | actual × (days_total / days_elapsed) |",
      "| pacing_status STRING | overpacing >110% | underpacing <90% | on_pace | no_budget_data |",
      "",
      "## v_roas_comparison  →  get_roas_comparison",
      "Joins: attribution_channel_summary + platform_daily_spend aggregated by channel",
      "| Column | Description |",
      "|--------|-------------|",
      "| platform, channel, conversion_type | Breakdown keys |",
      "| total_spend NUMERIC | Blended spend across dates |",
      "| platform_roas NUMERIC | Weighted avg of platform-reported ROAS |",
      "| attributed_roas NUMERIC | MTA model ROAS (attributed_value / spend) |",
      "| margin_roi NUMERIC | Gross margin adjusted return |",
      "| platform_overcount_pct FLOAT64 | How much platform over-claims vs MTA |",
      "",
      "## v_channel_efficiency  →  get_channel_efficiency",
      "Computes share metrics across all channels using window functions",
      "| Column | Description |",
      "|--------|-------------|",
      "| channel, platform | Breakdown |",
      "| total_spend, attributed_cpa, attributed_roas NUMERIC | Efficiency |",
      "| pipeline_share_pct FLOAT64 | % of total pipeline driven by this channel |",
      "| spend_share_pct FLOAT64 | % of total spend consumed by this channel |",
      "| pipeline_vs_spend_gap_pct FLOAT64 | pipeline_share - spend_share (positive = efficient) |",
      "",
      "## v_ad_performance  →  get_ad_performance",
      "Joins: platform_daily_spend_ad + attribution_results by ad_id",
      "| Column | Description |",
      "|--------|-------------|",
      "| ad_id, ad_name, campaign_id, platform, creative_format | Identity |",
      "| total_spend NUMERIC, total_impressions, total_clicks | Volume |",
      "| thumbstop_rate FLOAT64 | 3s_video_views / impressions |",
      "| frequency FLOAT64 | impressions / reach |",
      "| attributed_cpa, attributed_roas NUMERIC | MTA model credit |",
      "",
      "## v_keyword_performance  →  get_keyword_performance",
      "Joins: platform_keywords + platform_daily_spend_keyword (excludes negative keywords)",
      "| Column | Description |",
      "|--------|-------------|",
      "| keyword_text, match_type, campaign_id, platform | Identity |",
      "| total_spend NUMERIC, total_impressions, total_clicks | Volume |",
      "| quality_score INT64 | Google Ads quality score 1–10 |",
      "| avg_search_impression_share FLOAT64 | Avg IS in date range |",
      "| avg_is_lost_budget FLOAT64 | IS lost due to budget (>0.1 = opportunity) |",
      "| avg_is_lost_rank FLOAT64 | IS lost due to ad rank |",
      "",
      "## v_daily_performance  →  get_daily_performance",
      "Denormalized daily rows across all campaigns",
      "| Column | Description |",
      "|--------|-------------|",
      "| date DATE, day_of_week, week_start, month_start | Time dimensions |",
      "| campaign_id, platform, channel, team_id, brand | Breakdown keys |",
      "| spend, impressions, clicks, video_views, engagements NUMERIC/INT64 | Metrics |",
      "| platform_conversions INT64, platform_conversion_value NUMERIC | Platform-reported conversions |",
      "| ctr, cpc, cpm FLOAT64 | Computed rates |",
    ].join("\n"),
  },

  {
    uri: "paid-media://account-analytics/overview",
    name: "Account Analytics Overview",
    description:
      "Summary of B2B dark funnel visibility: top target accounts by intent, dark funnel " +
      "coverage breakdown (dark/lapsed/visible), and recent intent spikes. " +
      "Read this at the start of any ABM or account analytics session to understand which " +
      "accounts are heating up and which are invisible to your tracking.",
    mimeType: "application/json",
    handler: async () => {
      const [funnel, darkFunnel] = await Promise.all([
        adapter.getTargetAccountFunnel({ limit: 10, intent_spiking: undefined }).catch(() => []),
        adapter.getDarkFunnelCoverage({}).catch(() => []),
      ]);

      const darkCount   = (darkFunnel as Record<string, unknown>[]).filter(r => r["web_presence_status"] === "dark").length;
      const lapsedCount = (darkFunnel as Record<string, unknown>[]).filter(r => r["web_presence_status"] === "lapsed").length;
      const visibleCount = (darkFunnel as Record<string, unknown>[]).filter(r => r["web_presence_status"] === "visible").length;
      const intentSpikes = (funnel as Record<string, unknown>[]).filter(r => r["intent_spiking"] === true);

      const payload = {
        dark_funnel_coverage: {
          total_target_accounts: darkFunnel.length,
          dark:    darkCount,
          lapsed:  lapsedCount,
          visible: visibleCount,
          dark_pct: darkFunnel.length > 0 ? Math.round((darkCount / darkFunnel.length) * 100) : 0,
        },
        intent_spikes: {
          count: intentSpikes.length,
          accounts: intentSpikes.slice(0, 5).map((r) => ({
            company_domain:   r["company_domain"],
            account_tier:     r["account_tier"],
            sessions_today:   r["web_sessions_today"],
            sessions_30d:     r["web_sessions_30d"],
            intent_score:     r["intent_score"],
            crm_stage:        r["crm_pipeline_stage"],
          })),
        },
        top_priority_accounts: (funnel as Record<string, unknown>[]).slice(0, 10).map((r) => ({
          company_domain:         r["company_domain"],
          account_tier:           r["account_tier"],
          funnel_priority_score:  r["funnel_priority_score"],
          intent_score:           r["intent_score"],
          intent_spiking:         r["intent_spiking"],
          crm_pipeline_stage:     r["crm_pipeline_stage"],
          sessions_30d:           r["sessions_30d"],
          pricing_visits_30d:     r["pricing_visits_30d"],
          paid_touchpoints_30d:   r["paid_touchpoints_30d"],
        })),
        _note: funnel.length === 0
          ? "No data available — BigQuery mode required and at least one enrichment run needed."
          : "Data from v_target_account_funnel and v_dark_funnel_coverage.",
      };

      return JSON.stringify(payload, null, 2);
    },
  },

  // ── Live agent output resources ───────────────────────────────────────────

  {
    uri: "paid-media://agent-status",
    name: "Autonomous Agent Status",
    description:
      "Current status of all three autonomous agents: latest Watchdog alerts, most recent " +
      "Analyst attribution run, and any Operator actions pending approval. " +
      "Read this at the start of any analysis session to understand the current data quality " +
      "and what the agents have found since the last run.",
    mimeType: "application/json",
    handler: async () => {
      const [alerts, runs, insights, approvals] = await Promise.all([
        adapter.getWatchdogAlerts("open"),
        adapter.getAttributionRuns(1),
        adapter.getAnalystInsights({ status: "new", limit: 5 }),
        adapter.getOperatorPendingApprovals(),
      ]);
      return JSON.stringify({
        data_quality: {
          status:         alerts.filter(a => a.severity === "critical").length > 0 ? "RED" :
                          alerts.length > 0 ? "YELLOW" : "GREEN",
          open_alerts:    alerts.length,
          critical_alerts: alerts.filter(a => a.severity === "critical").length,
          latest_alerts:  alerts.slice(0, 3),
        },
        attribution: {
          latest_run:     runs[0] ?? null,
          new_insights:   insights,
        },
        operator: {
          pending_approvals: approvals.length,
          actions:          approvals,
        },
      }, null, 2);
    },
  },
];
