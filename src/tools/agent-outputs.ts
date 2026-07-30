/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const agentOutputTools = (adapter: PaidMediaAdapter) => [

  // ── Attribution Results ───────────────────────────────────────────────────

  {
    name: "get_attribution_results",
    description:
      "Get the latest multi-touch attribution results from the most recent Analyst agent run. " +
      "Returns weighted credit by channel and platform: attributed conversions, conversion value, " +
      "spend, attributed CPA, attributed ROAS, and each channel's share of total credit. " +
      "This is the output of the MTA model — distinct from platform-reported attribution. " +
      "Filter by conversion_type for B2B pipeline stages (e.g. 'opportunity_created') or B2C events.",
    inputSchema: z.object({
      conversion_type: z.string().optional().describe(
        "Filter to a specific conversion type, e.g. 'opportunity_created', 'purchase', 'lead'"
      ),
    }),
    handler: async (args: { conversion_type?: string }) => {
      const results = await adapter.getLatestAttributionResults(args.conversion_type);

      if (!results) {
        return {
          content: [{
            type: "text",
            text: "No attribution results found. The Analyst agent has not completed a run yet, " +
              "or the attribution-results data file is missing. " +
              "Trigger a run with trigger_agent_run (agent: 'analyst') or check the data directory.",
          }],
        };
      }

      const sorted = [...results.channel_summary].sort(
        (a, b) => b.attributed_conversions - a.attributed_conversions
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            model:        results.model_name,
            period:       `${results.period_start} → ${results.period_end}`,
            generated_at: results.generated_at,
            run_id:       results.run_id,
            channel_summary: sorted,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_attribution_run_history",
    description:
      "List recent attribution model runs: model used, date range, number of paths modeled, " +
      "identity match rate, and run status. Use this to check when the model last ran, " +
      "whether it succeeded, and whether a new run is needed.",
    inputSchema: z.object({
      limit: z.number().optional().describe("Number of recent runs to return (default 10)"),
    }),
    handler: async (args: { limit?: number }) => {
      const runs = await adapter.getAttributionRuns(args.limit ?? 10);

      if (runs.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No attribution runs found. The Analyst agent has not run yet.",
          }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ runs }, null, 2) }],
      };
    },
  },

  // ── Watchdog Alerts ───────────────────────────────────────────────────────

  {
    name: "get_watchdog_alerts",
    description:
      "Get data quality alerts from the Watchdog agent. Returns active alerts about signal " +
      "capture rate drops (gclid, fbclid, etc.), spikes in null CRM fields, CAPI match rate " +
      "issues, spend anomalies, or identity match rate declines. Always check this before " +
      "running attribution analysis — active critical alerts mean the underlying data is " +
      "unreliable and attribution results should be treated with caution.",
    inputSchema: z.object({
      status: z
        .enum(["open", "acknowledged", "resolved", "suppressed"])
        .optional()
        .describe("Filter by alert status. Defaults to open + acknowledged."),
    }),
    handler: async (args: { status?: "open" | "acknowledged" | "resolved" | "suppressed" }) => {
      const alerts = await adapter.getWatchdogAlerts(args.status);

      if (alerts.length === 0) {
        return {
          content: [{
            type: "text",
            text: args.status
              ? `No ${args.status} alerts.`
              : "No active data quality alerts. Signal capture rates are within thresholds.",
          }],
        };
      }

      const critical = alerts.filter((a) => a.severity === "critical");
      const warnings = alerts.filter((a) => a.severity === "warning");

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            summary: {
              total:    alerts.length,
              critical: critical.length,
              warning:  warnings.length,
            },
            alerts,
          }, null, 2),
        }],
      };
    },
  },

  // ── Analyst Insights ──────────────────────────────────────────────────────

  {
    name: "get_analyst_insights",
    description:
      "Get insights and recommendations produced by the Analyst agent: channel anomalies, " +
      "attribution model readiness assessments, stitching quality findings, budget efficiency " +
      "observations, and incrementality signals. Filter by priority or status to focus on " +
      "what needs attention now.",
    inputSchema: z.object({
      priority: z
        .enum(["high", "medium", "low"])
        .optional()
        .describe("Filter to insights of a specific priority"),
      status: z
        .enum(["new", "reviewed", "actioned", "dismissed"])
        .optional()
        .describe("Filter by review status (default: new)"),
      limit: z.number().optional().describe("Max insights to return (default 20)"),
    }),
    handler: async (args: { priority?: "high" | "medium" | "low"; status?: string; limit?: number }) => {
      const insights = await adapter.getAnalystInsights({
        priority: args.priority,
        status:   args.status ?? "new",
        limit:    args.limit ?? 20,
      });

      if (insights.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No insights found matching the specified filters.",
          }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ count: insights.length, insights }, null, 2) }],
      };
    },
  },

  // ── Operator Pending Approvals ────────────────────────────────────────────

  {
    name: "get_pending_approvals",
    description:
      "Get media actions proposed by the Operator agent that are awaiting human approval. " +
      "Each approval includes: what action is proposed, which platform entity is affected, " +
      "the rationale from attribution data, estimated impact, and budget at stake. " +
      "Review these before they expire — the Operator agent will not execute them until approved.",
    inputSchema: z.object({}),
    handler: async () => {
      const approvals = await adapter.getOperatorPendingApprovals();

      if (approvals.length === 0) {
        return {
          content: [{ type: "text", text: "No actions pending approval from the Operator agent." }],
        };
      }

      const totalSpendAtRisk = approvals.reduce(
        (sum, a) => sum + (a.spend_at_risk ?? 0), 0
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            summary: {
              pending_count:      approvals.length,
              total_spend_at_risk: totalSpendAtRisk,
            },
            actions: approvals,
          }, null, 2),
        }],
      };
    },
  },

  // ── Trigger Agent Run ─────────────────────────────────────────────────────

  {
    name: "trigger_agent_run",
    description:
      "Trigger an on-demand run of one of the autonomous agents: " +
      "'watchdog' (data quality audit), 'analyst' (attribution model run), or " +
      "'operator' (media optimization pass). " +
      "Requires PAID_MEDIA_AGENT_URL to be set in the MCP server's environment. " +
      "The agent runs asynchronously — use get_attribution_run_history or get_watchdog_alerts " +
      "to check results after a few minutes.",
    inputSchema: z.object({
      agent: z
        .enum(["watchdog", "analyst", "operator"])
        .describe("Which agent to trigger"),
      reason: z.string().describe(
        "Brief explanation of why this run is being triggered manually, e.g. 'Data quality issue resolved, refreshing attribution model'"
      ),
    }),
    handler: async (args: { agent: "watchdog" | "analyst" | "operator"; reason: string }) => {
      const result = await adapter.triggerAgentRun(args.agent, args.reason);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

];
