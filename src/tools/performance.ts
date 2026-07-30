/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";
import type { PerformanceMetrics, PerformanceRecord } from "../types.js";

function sumMetrics(records: PerformanceRecord[]): PerformanceMetrics {
  const totals: PerformanceMetrics = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r.metrics)) {
      if (typeof v === "number") {
        (totals as Record<string, number>)[k] =
          ((totals as Record<string, number>)[k] ?? 0) + v;
      }
    }
  }
  // Recalculate derived rate metrics
  if (totals.clicks != null && totals.impressions) {
    totals.ctr = parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(4));
  }
  if (totals.spend != null && totals.clicks) {
    totals.cpc = parseFloat((totals.spend / totals.clicks).toFixed(4));
  }
  if (totals.spend != null && totals.impressions) {
    totals.cpm = parseFloat(((totals.spend / totals.impressions) * 1000).toFixed(4));
  }
  if (totals.spend != null && totals.conversions) {
    totals.cpa = parseFloat((totals.spend / totals.conversions).toFixed(4));
  }
  if (totals.conversion_value != null && totals.spend) {
    totals.roas = parseFloat((totals.conversion_value / totals.spend).toFixed(4));
  }
  return totals;
}

export const performanceTools = (adapter: PaidMediaAdapter) => [
  {
    name: "get_campaign_performance",
    description:
      "Get historical performance data for a campaign. Returns per-day records plus aggregated totals for the date range.",
    inputSchema: z.object({
      campaign_id: z.string().describe("The campaign ID"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    }),
    handler: async (args: { campaign_id: string; date_from?: string; date_to?: string }) => {
      const records = await adapter.getPerformance({
        campaign_id: args.campaign_id,
        date_from: args.date_from,
        date_to: args.date_to,
      });
      if (records.length === 0) {
        return {
          content: [{ type: "text", text: `No performance data found for campaign: ${args.campaign_id}` }],
        };
      }
      const totals = sumMetrics(records);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { campaign_id: args.campaign_id, record_count: records.length, totals, records },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_team_performance",
    description:
      "Get aggregated performance data across all campaigns for a team, within an optional date range.",
    inputSchema: z.object({
      team_id: z.string().describe("The team ID"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    }),
    handler: async (args: { team_id: string; date_from?: string; date_to?: string }) => {
      const records = await adapter.getPerformance({
        team_id: args.team_id,
        date_from: args.date_from,
        date_to: args.date_to,
      });
      if (records.length === 0) {
        return {
          content: [{ type: "text", text: `No performance data found for team: ${args.team_id}` }],
        };
      }
      const totals = sumMetrics(records);

      // Group by campaign for breakdown
      const byCampaign: Record<string, PerformanceRecord[]> = {};
      for (const r of records) {
        (byCampaign[r.campaign_id] ??= []).push(r);
      }
      const campaignSummaries = Object.entries(byCampaign).map(([id, recs]) => ({
        campaign_id: id,
        totals: sumMetrics(recs),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { team_id: args.team_id, record_count: records.length, totals, campaign_summaries: campaignSummaries },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  {
    name: "get_benchmarks",
    description:
      "Get industry/platform benchmarks for key metrics (CTR, CPC, CPM, CPA, ROAS) to compare against actual performance.",
    inputSchema: z.object({
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("The ad platform"),
      objective: z
        .enum(["awareness", "reach", "traffic", "engagement", "video_views", "lead_generation", "app_installs", "conversions", "catalog_sales", "store_visits"])
        .optional()
        .describe("Campaign objective"),
    }),
    handler: async (args: { platform?: string; objective?: string }) => {
      const benchmarks = await adapter.getBenchmarks(
        args.platform as Parameters<typeof adapter.getBenchmarks>[0],
        args.objective as Parameters<typeof adapter.getBenchmarks>[1]
      );
      if (!benchmarks) {
        return {
          content: [
            {
              type: "text",
              text: "No benchmarks found for the specified platform/objective combination. Add benchmarks to data/historical-performance.json.",
            },
          ],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(benchmarks, null, 2) }] };
    },
  },
];
