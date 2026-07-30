/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
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
        message: "This tool queries pre-built BigQuery views and is not available in file mode. " +
                 "Set the BIGQUERY_PROJECT_ID environment variable to your GCP project ID to enable live data.",
        docs: "See SETUP.md → BigQuery section for configuration steps.",
      }, null, 2),
    }],
  };
}

export const reportingTools = (adapter: PaidMediaAdapter) => [
  {
    name: "list_reporting_templates",
    description:
      "List available reporting and dashboard templates. Filter by audience (executive, media_team, client, internal). Returns template structure, metrics, delivery format, and cadence.",
    inputSchema: z.object({
      audience: z
        .enum(["executive", "media_team", "client", "internal"])
        .optional()
        .describe("Filter templates by intended audience"),
    }),
    handler: async (args: { audience?: string }) => {
      const templates = await adapter.getReportingTemplates(args.audience);
      if (templates.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No reporting templates found. Add them to data/reporting-templates.json.",
            },
          ],
        };
      }
      // Return a summary view (full sections can be retrieved via get_reporting_template)
      const summaries = templates.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        audience: t.audience,
        cadence: t.cadence,
        delivery_format: t.delivery_format,
        section_count: t.sections.length,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: templates.length, templates: summaries }, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_reporting_template",
    description:
      "Get the full structure of a reporting template including all sections, metrics, dimensions, and visualizations.",
    inputSchema: z.object({
      template_id: z.string().describe("The reporting template ID"),
    }),
    handler: async (args: { template_id: string }) => {
      const template = await adapter.getReportingTemplate(args.template_id);
      if (!template) {
        return {
          content: [
            {
              type: "text",
              text: `No reporting template found with ID: ${args.template_id}`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(template, null, 2) }] };
    },
  },

  {
    name: "build_performance_report",
    description:
      "Generate a narrative performance report for a campaign or team, combining live performance data with the appropriate reporting template. Best used with a reporting template ID to match the intended audience format.",
    inputSchema: z.object({
      target_type: z.enum(["campaign", "team"]).describe("Whether to report on a campaign or a team"),
      target_id: z.string().describe("Campaign ID or team ID"),
      date_from: z.string().describe("Report start date (YYYY-MM-DD)"),
      date_to: z.string().describe("Report end date (YYYY-MM-DD)"),
      template_id: z.string().optional().describe("Reporting template to use for structure/format"),
    }),
    handler: async (args: {
      target_type: "campaign" | "team";
      target_id: string;
      date_from: string;
      date_to: string;
      template_id?: string;
    }) => {
      const [records, template] = await Promise.all([
        adapter.getPerformance({
          [args.target_type === "campaign" ? "campaign_id" : "team_id"]: args.target_id,
          date_from: args.date_from,
          date_to: args.date_to,
        }),
        args.template_id ? adapter.getReportingTemplate(args.template_id) : Promise.resolve(null),
      ]);

      const entity =
        args.target_type === "campaign"
          ? await adapter.getCampaign(args.target_id)
          : await adapter.getTeam(args.target_id);

      const payload = {
        report_for: { type: args.target_type, id: args.target_id, name: (entity as { name: string } | null)?.name },
        date_range: { from: args.date_from, to: args.date_to },
        template: template
          ? { id: template.id, name: template.name, sections: template.sections }
          : null,
        data: {
          record_count: records.length,
          records,
        },
        instructions:
          "Use the template sections as the report structure. Compute totals and rates from the raw records. Highlight trends, anomalies, and recommendations.",
      };

      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    },
  },

  // ── Live BigQuery Reporting Views ─────────────────────────────────────────
  // These tools query the pre-built views in 06_reporting.sql. They require
  // BigQuery mode (BIGQUERY_PROJECT_ID). All views auto-reference the latest
  // completed attribution run — no run_id filtering needed.

  {
    name: "get_campaign_performance_report",
    description:
      "Query live campaign performance from BigQuery. Returns spend, impressions, clicks, " +
      "platform ROAS, MTA attributed ROAS, margin ROI, attributed CPA, and pipeline value per campaign. " +
      "All three ROAS numbers are returned side-by-side so you can see the gap between what " +
      "platforms claim vs what multi-touch attribution shows. Requires BigQuery mode.",
    inputSchema: z.object({
      platform: z.string().optional().describe("Filter to a specific platform (google_ads, meta, linkedin, tiktok, dv360)"),
      team_id:  z.string().optional().describe("Filter to campaigns belonging to a specific team"),
      funnel_stage: z.enum(["upper", "mid", "lower"]).optional().describe("Filter by funnel stage"),
      status:   z.string().optional().describe("Filter by campaign status (active, paused, completed)"),
      date_from: z.string().optional().describe("Start date filter (YYYY-MM-DD) — applies to spend aggregation window"),
      date_to:   z.string().optional().describe("End date filter (YYYY-MM-DD)"),
    }),
    handler: async (args: {
      platform?: string; team_id?: string; funnel_stage?: string;
      status?: string; date_from?: string; date_to?: string;
    }) => {
      const rows = await adapter.getCampaignPerformanceReport(args);
      if (rows.length === 0) {
        // Distinguish between "BQ mode not enabled" and "no data"
        const test = await adapter.getCampaignPerformanceReport({});
        if (test.length === 0) return bqRequiredMessage("get_campaign_performance_report");
        return { content: [{ type: "text", text: JSON.stringify({ count: 0, campaigns: [] }, null, 2) }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            note: "platform_roas = platform-reported | attributed_roas = MTA model | margin_roi = revenue × margin",
            campaigns: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_pacing_report",
    description:
      "Return budget pacing status for all campaigns that have started flying. " +
      "Shows expected spend (based on days elapsed) vs actual spend, required daily spend " +
      "to hit budget, projected total spend at current burn rate, and a pacing_status label. " +
      "Overpacing: >110% of expected. Underpacing: <90%. " +
      "Sorted by urgency: overpacing first, then underpacing, then on_pace. Requires BigQuery mode.",
    inputSchema: z.object({
      platform: z.string().optional().describe("Filter to a specific platform"),
      team_id:  z.string().optional().describe("Filter to a specific team"),
      pacing_status: z.enum(["overpacing", "underpacing", "on_pace", "no_budget_data"]).optional()
        .describe("Filter to campaigns with a specific pacing status"),
      funnel_stage: z.enum(["upper", "mid", "lower"]).optional().describe("Filter by funnel stage"),
    }),
    handler: async (args: {
      platform?: string; team_id?: string;
      pacing_status?: "overpacing" | "underpacing" | "on_pace" | "no_budget_data";
      funnel_stage?: string;
    }) => {
      const rows = await adapter.getPacingReport(args);
      if (rows.length === 0) return bqRequiredMessage("get_pacing_report");
      const byStatus = {
        overpacing:    rows.filter((r) => (r as Record<string, unknown>)["pacing_status"] === "overpacing").length,
        underpacing:   rows.filter((r) => (r as Record<string, unknown>)["pacing_status"] === "underpacing").length,
        on_pace:       rows.filter((r) => (r as Record<string, unknown>)["pacing_status"] === "on_pace").length,
        no_budget_data: rows.filter((r) => (r as Record<string, unknown>)["pacing_status"] === "no_budget_data").length,
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ summary: byStatus, count: rows.length, campaigns: rows }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_roas_comparison",
    description:
      "Compare platform-reported ROAS vs MTA attributed ROAS vs margin ROI for each channel. " +
      "Returns platform_overcount_pct — the percentage by which platforms over-claim credit " +
      "compared to the attribution model. Use this to quantify platform attribution inflation " +
      "and justify budget reallocation decisions. Requires BigQuery mode.",
    inputSchema: z.object({
      platform: z.string().optional().describe("Filter to a specific platform"),
      channel:  z.string().optional().describe("Filter to a specific channel (e.g. paid_search_brand)"),
      conversion_type: z.string().optional().describe("Filter to a conversion type (e.g. opportunity_created)"),
    }),
    handler: async (args: { platform?: string; channel?: string; conversion_type?: string }) => {
      const rows = await adapter.getRoasComparison(args);
      if (rows.length === 0) return bqRequiredMessage("get_roas_comparison");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            note: "platform_overcount_pct: how much MORE the platform claims vs MTA model. Positive = platform over-counting.",
            channels: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_channel_efficiency",
    description:
      "Cross-channel efficiency report showing attributed CPA, attributed ROAS, pipeline share, " +
      "and spend share per channel. The pipeline_vs_spend_gap_pct column shows which channels " +
      "punch above their spend weight (positive gap = efficient) vs drag (negative gap). " +
      "Use for budget allocation recommendations. Requires BigQuery mode.",
    inputSchema: z.object({}),
    handler: async (_args: Record<string, never>) => {
      const rows = await adapter.getChannelEfficiency();
      if (rows.length === 0) return bqRequiredMessage("get_channel_efficiency");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            note: "pipeline_vs_spend_gap_pct: positive = channel generates more pipeline share than it consumes in spend. Prioritize these.",
            channels: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_ad_performance",
    description:
      "Ad/creative level performance with multi-touch attribution credit. Returns thumbstop_rate, " +
      "frequency, view_through_rate, attributed_cpa, and attributed_roas per creative. " +
      "Use to identify winning creatives for scaling and underperforming ones to pause or rotate. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      campaign_id: z.string().optional().describe("Filter to a specific campaign"),
      platform:    z.string().optional().describe("Filter to a specific platform"),
      creative_format: z.string().optional().describe("Filter by creative format (video, image, carousel, responsive)"),
      min_spend: z.number().optional().describe("Minimum total spend to include (filters out low-volume creatives)"),
    }),
    handler: async (args: {
      campaign_id?: string; platform?: string;
      creative_format?: string; min_spend?: number;
    }) => {
      const rows = await adapter.getAdPerformance(args);
      if (rows.length === 0) return bqRequiredMessage("get_ad_performance");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            note: "thumbstop_rate = 3s video views / impressions. attributed_roas uses MTA model, not platform-reported.",
            ads: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_keyword_performance",
    description:
      "Keyword performance with spend, quality scores, and Google impression share metrics. " +
      "Excludes negative keywords. Returns quality_score (1–10), avg_search_impression_share, " +
      "avg_IS_lost_budget, and avg_IS_lost_rank. Use low_quality_score=true to find SQO " +
      "opportunities and lost_is_budget=true to find keywords throttled by budget caps. " +
      "Requires BigQuery mode.",
    inputSchema: z.object({
      campaign_id: z.string().optional().describe("Filter to a specific campaign"),
      platform:    z.string().optional().describe("Filter to a specific platform (google_ads, microsoft_ads)"),
      min_spend:   z.number().optional().describe("Minimum total spend threshold"),
      low_quality_score: z.boolean().optional().describe("Set true to show only keywords with quality_score ≤ 5"),
      lost_is_budget:    z.boolean().optional().describe("Set true to show keywords losing impression share to budget (avg_is_lost_budget > 10%)"),
    }),
    handler: async (args: {
      campaign_id?: string; platform?: string; min_spend?: number;
      low_quality_score?: boolean; lost_is_budget?: boolean;
    }) => {
      const rows = await adapter.getKeywordPerformance(args);
      if (rows.length === 0) return bqRequiredMessage("get_keyword_performance");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            note: "quality_score: 1–10 (Google scale). avg_is_lost_budget: % of auctions lost due to budget cap.",
            keywords: rows,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_daily_performance",
    description:
      "Daily performance time series across all campaigns. Supports optional aggregation by " +
      "week or month. Returns spend, impressions, clicks, video_views, platform_conversions, " +
      "platform_conversion_value, CTR, CPC, and CPM. Use for trend analysis, anomaly detection, " +
      "and week-over-week or month-over-month reporting. Requires BigQuery mode.",
    inputSchema: z.object({
      campaign_id: z.string().optional().describe("Filter to a specific campaign"),
      platform:    z.string().optional().describe("Filter to a specific platform"),
      team_id:     z.string().optional().describe("Filter to a specific team"),
      date_from:   z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to:     z.string().optional().describe("End date (YYYY-MM-DD)"),
      group_by:    z.enum(["day", "week", "month"]).optional()
        .describe("Aggregate into weekly or monthly buckets. Omit for raw daily rows."),
    }),
    handler: async (args: {
      campaign_id?: string; platform?: string; team_id?: string;
      date_from?: string; date_to?: string; group_by?: "day" | "week" | "month";
    }) => {
      const rows = await adapter.getDailyPerformance(args);
      if (rows.length === 0) return bqRequiredMessage("get_daily_performance");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: rows.length,
            group_by: args.group_by ?? "day",
            rows,
          }, null, 2),
        }],
      };
    },
  },
];
