/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
/**
 * Account-Based Analytics Tools
 *
 * MCP tools for B2B dark funnel visibility: company profiles, de-anonymized
 * sessions, engagement scoring, target account funnel, and dark funnel coverage.
 *
 * All tools query BigQuery tables created by paid-media-schema 07_account_analytics.sql.
 * They require BigQuery mode (BIGQUERY_PROJECT_ID env var). FileAdapter stubs return
 * empty results with a clear error message.
 *
 * Data flows:
 *   sgtm_request_logs → EnrichmentJob (paid-media-agent) → ip_resolution_cache
 *   → company_sessions → company_profiles → company_engagement
 *   → target_account_activity → v_target_account_funnel / v_dark_funnel_coverage
 *
 * Privacy guarantee: no raw IP addresses are stored anywhere in BigQuery.
 * Only /24 prefix + resolved company_domain are persisted.
 */

import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function bqRequiredMessage(tool: string): object {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: "BigQuery mode required",
        tool,
        message:
          "This tool queries account-based analytics tables populated by the Analyst agent's " +
          "IP enrichment pipeline. Set BIGQUERY_PROJECT_ID to enable, and ensure the Analyst " +
          "agent has run at least one enrichment job (tool: enrich_sessions).",
        setup_steps: [
          "1. Set BIGQUERY_PROJECT_ID in paid-media-mcp environment",
          "2. Run: trigger_agent_run { agent: 'analyst', reason: 'initial enrichment' }",
          "3. Or directly: call enrich_sessions from the Analyst agent",
        ],
      }, null, 2),
    }],
  };
}

// ── Account Analytics Tools ───────────────────────────────────────────────────

export const accountAnalyticsTools = (adapter: PaidMediaAdapter) => [

  {
    name: "get_company_profile",
    description:
      "Look up the enriched firmographic profile for a company domain. Returns industry, " +
      "employee range, annual revenue range, technology stack, CRM pipeline stage, account tier " +
      "(tier_1/tier_2/tier_3/nurture/excluded), ICP score, and enrichment metadata. " +
      "Populated by the Analyst agent's IP intelligence enrichment pipeline. Requires BigQuery mode.",
    inputSchema: z.object({
      company_domain: z.string().describe(
        "The company's root domain (e.g. 'acme.com'). Must match the resolved domain in company_profiles."
      ),
    }),
    handler: async (args: { company_domain: string }) => {
      const profile = await adapter.getCompanyProfile(args.company_domain);
      if (!profile) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              found: false,
              company_domain: args.company_domain,
              message:
                "No profile found. Either this domain has not been resolved by IP intelligence yet, " +
                "or the company has not visited the website within the enrichment lookback window. " +
                "Run the Analyst agent's enrich_sessions tool to populate new profiles.",
            }, null, 2),
          }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ found: true, profile }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_target_account_funnel",
    description:
      "Return ranked target accounts from the dark funnel, sorted by composite priority score. " +
      "Score = pipeline stage (0–30pts) + intent score×0.25 (0–25pts) + recency (0–20pts) + " +
      "key page visits (0–15pts) + paid exposure (0–10pts). " +
      "Use intent_spiking=true to surface accounts with sudden engagement increases (today > 30d avg × 1.5). " +
      "Requires BigQuery mode and at least one completed enrichment run.",
    inputSchema: z.object({
      account_tier: z.enum(["tier_1", "tier_2", "tier_3"]).optional()
        .describe("Filter to accounts in a specific tier (tier_1 = highest priority ICP fit)"),
      crm_pipeline_stage: z.string().optional()
        .describe("Filter to accounts at a specific CRM stage (e.g. 'Opportunity', 'Evaluation')"),
      intent_spiking: z.boolean().optional()
        .describe("Set true to show only accounts where today's engagement > 30-day average × 1.5"),
      is_suppressed_tofu: z.boolean().optional()
        .describe("Set false (default) to exclude accounts already suppressed from top-of-funnel ads"),
      min_sessions_30d: z.number().optional()
        .describe("Minimum sessions in the last 30 days to include an account"),
      limit: z.number().optional()
        .describe("Maximum number of accounts to return (default: 100)"),
    }),
    handler: async (args: {
      account_tier?: "tier_1" | "tier_2" | "tier_3";
      crm_pipeline_stage?: string;
      intent_spiking?: boolean;
      is_suppressed_tofu?: boolean;
      min_sessions_30d?: number;
      limit?: number;
    }) => {
      const rows = await adapter.getTargetAccountFunnel(args);
      if (rows.length === 0) return bqRequiredMessage("get_target_account_funnel");

      // Compute summary stats
      const intents = rows.filter((r) => (r as Record<string, unknown>)["intent_spiking"] === true).length;
      const tierCounts: Record<string, number> = {};
      for (const r of rows) {
        const tier = String((r as Record<string, unknown>)["account_tier"] ?? "unknown");
        tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            summary: {
              intent_spiking: intents,
              by_tier: tierCounts,
            },
            note: "Sorted by funnel_priority_score DESC. Higher score = more urgent to engage.",
            accounts: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_company_sessions",
    description:
      "Return de-anonymized web sessions for a specific company over a lookback window. " +
      "Each session includes channel, UTM campaign, landing page, page flag signals " +
      "(visited_pricing, visited_demo, visited_contact, visited_docs), and paid touchpoint info. " +
      "Note: no raw IP addresses are stored — sessions are linked via /24 prefix resolution only. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      company_domain: z.string().describe("Company root domain (e.g. 'acme.com')"),
      lookback_days:  z.number().optional().describe("How many days of sessions to return (default: 30, max: 365)"),
    }),
    handler: async (args: { company_domain: string; lookback_days?: number }) => {
      const sessions = await adapter.getCompanySessions(
        args.company_domain,
        args.lookback_days ?? 30
      );
      if (sessions.length === 0) {
        const profile = await adapter.getCompanyProfile(args.company_domain);
        if (!profile) return bqRequiredMessage("get_company_sessions");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: 0,
              company_domain: args.company_domain,
              lookback_days: args.lookback_days ?? 30,
              message: "No sessions found in this lookback window. The company may have sessions outside this range.",
            }, null, 2),
          }],
        };
      }

      // Aggregate key page signals
      const pricingVisits = sessions.filter((s) => (s as Record<string, unknown>)["visited_pricing"]).length;
      const demoVisits    = sessions.filter((s) => (s as Record<string, unknown>)["visited_demo"]).length;
      const paidTouches   = sessions.filter((s) => (s as Record<string, unknown>)["has_paid_touchpoint"]).length;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: sessions.length,
            company_domain: args.company_domain,
            lookback_days: args.lookback_days ?? 30,
            signals: {
              pricing_page_visits: pricingVisits,
              demo_page_visits:    demoVisits,
              paid_touchpoints:    paidTouches,
            },
            sessions,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_company_engagement",
    description:
      "Return the rolling engagement summary for a company, including composite intent score. " +
      "Intent score = recency (50%) + depth/page signals (30%) + content/paid exposure (20%). " +
      "Also returns pricing_page_sessions, demo_page_sessions, session_growth_pct vs prior period, " +
      "and the intent_spiking flag. Use this for a quick account health check before outreach. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      company_domain: z.string().describe("Company root domain (e.g. 'acme.com')"),
      period_type: z.enum(["rolling_30d", "rolling_7d", "rolling_90d", "monthly"]).optional()
        .describe("Engagement aggregation period (default: rolling_30d)"),
    }),
    handler: async (args: { company_domain: string; period_type?: string }) => {
      const engagement = await adapter.getCompanyEngagement(
        args.company_domain,
        args.period_type ?? "rolling_30d"
      );
      if (!engagement) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              found: false,
              company_domain: args.company_domain,
              period_type: args.period_type ?? "rolling_30d",
              message:
                "No engagement data found. Run the Analyst agent's enrich_sessions tool to " +
                "populate company_engagement records, or try a different period_type.",
            }, null, 2),
          }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            found: true,
            company_domain: args.company_domain,
            note: "intent_score: 0–100. >70 = high intent. intent_spiking = true when today > 30d avg × 1.5.",
            engagement,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_dark_funnel_coverage",
    description:
      "Classify target accounts by web presence: 'dark' (never seen on website), " +
      "'lapsed' (last seen >90 days ago), or 'visible' (recent web activity detected). " +
      "Use to identify which in-pipeline accounts are invisible to your tracking and trigger " +
      "outbound, direct mail, or LinkedIn outreach for dark/lapsed accounts in key pipeline stages. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      account_tier: z.enum(["tier_1", "tier_2", "tier_3"]).optional()
        .describe("Filter to accounts in a specific ICP tier"),
      web_presence_status: z.enum(["dark", "lapsed", "visible"]).optional()
        .describe("Filter to a specific coverage status: dark = never seen, lapsed = >90d, visible = recent"),
      crm_pipeline_stage: z.string().optional()
        .describe("Filter to accounts at a specific CRM pipeline stage"),
    }),
    handler: async (args: {
      account_tier?: "tier_1" | "tier_2" | "tier_3";
      web_presence_status?: "dark" | "lapsed" | "visible";
      crm_pipeline_stage?: string;
    }) => {
      const rows = await adapter.getDarkFunnelCoverage(args);
      if (rows.length === 0) return bqRequiredMessage("get_dark_funnel_coverage");

      const darkCount   = rows.filter((r) => (r as Record<string, unknown>)["web_presence_status"] === "dark").length;
      const lapsedCount = rows.filter((r) => (r as Record<string, unknown>)["web_presence_status"] === "lapsed").length;
      const visibleCount = rows.filter((r) => (r as Record<string, unknown>)["web_presence_status"] === "visible").length;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            summary: { dark: darkCount, lapsed: lapsedCount, visible: visibleCount },
            note: "dark = zero web presence ever. lapsed = last seen >90 days ago. Both warrant outbound action for in-pipeline accounts.",
            accounts: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_target_account_activity",
    description:
      "Return the daily activity history for a specific target account: web sessions (today/7d/30d/90d), " +
      "pricing and demo visits, paid touchpoints, intent spikes, and coverage completeness score. " +
      "Use to build a longitudinal engagement chart or brief a sales rep before an outreach call. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      company_domain: z.string().describe("Company root domain (e.g. 'acme.com')"),
      lookback_days:  z.number().optional().describe("Days of history to return (default: 30)"),
    }),
    handler: async (args: { company_domain: string; lookback_days?: number }) => {
      const rows = await adapter.getTargetAccountActivity(
        args.company_domain,
        args.lookback_days ?? 30
      );
      if (rows.length === 0) {
        const profile = await adapter.getCompanyProfile(args.company_domain);
        if (!profile) return bqRequiredMessage("get_target_account_activity");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: 0,
              company_domain: args.company_domain,
              message: "No daily activity records found. The Analyst agent writes target_account_activity once per run.",
            }, null, 2),
          }],
        };
      }

      // Find most recent day's intent_spiking
      const latest = rows[0] as Record<string, unknown>;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            company_domain: args.company_domain,
            lookback_days: args.lookback_days ?? 30,
            latest_day: {
              date: latest["date"],
              intent_spiking: latest["intent_spiking"],
              web_sessions_today: latest["web_sessions_today"],
              web_sessions_7d: latest["web_sessions_7d"],
              web_sessions_30d: latest["web_sessions_30d"],
              paid_touchpoints_7d: latest["paid_touchpoints_7d"],
              coverage_completeness_score: latest["coverage_completeness_score"],
            },
            note: "coverage_completeness_score: 0–1 (0.25 each for web/crm/paid/identified signals). 1.0 = fully visible account.",
            history: rows,
          }, null, 2),
        }],
      };
    },
  },
];
