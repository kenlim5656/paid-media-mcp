/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";
import type { Platform, TestStatus, TestType } from "../types.js";

export const testingTools = (adapter: PaidMediaAdapter) => [
  {
    name: "get_testing_methodology",
    description:
      "Get the team's testing methodology: confidence threshold (e.g. 95%), stat sig requirements, minimum sample size and duration, minimum detectable effect, and what constitutes a winning test.",
    inputSchema: z.object({}),
    handler: async () => {
      const program = await adapter.getTestingProgram();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            methodology: program.methodology,
            tools: program.tools,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "list_tests",
    description:
      "List tests — active, planned, completed, or all. Covers both in-campaign A/B tests (creative, audience, bidding, etc.) and vendor/partner evaluations (dsp, agency, ad_network, platform, tool). Filter by status, type, team, or platform.",
    inputSchema: z.object({
      status: z
        .enum(["planned", "active", "completed", "paused", "abandoned"])
        .optional()
        .describe("Filter by test status"),
      type: z
        .enum(["creative", "audience", "bidding", "landing_page", "copy", "format", "offer", "ad_network", "dsp", "agency", "platform", "tool", "other"])
        .optional()
        .describe("Filter by test type"),
      team_id: z.string().optional().describe("Filter by team ID"),
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter by platform"),
    }),
    handler: async (args: Record<string, unknown>) => {
      const tests = await adapter.getTests(args as Parameters<typeof adapter.getTests>[0]);
      if (tests.length === 0) {
        return { content: [{ type: "text", text: "No tests found matching the specified filters." }] };
      }
      const summary = tests.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        type: t.type,
        platform: t.platform,
        team_id: t.team_id,
        start_date: t.start_date,
        end_date: t.end_date,
        variant_count: t.variants.length,
        has_results: !!t.results,
        winner: t.results?.winner_variant_id
          ? t.variants.find((v) => v.id === t.results?.winner_variant_id)?.name
          : null,
        stat_sig: t.results?.stat_sig_achieved,
        vendor_subject: t.vendor_context?.subject,
        recommendation: t.vendor_context?.recommendation,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ count: tests.length, tests: summary }, null, 2) }] };
    },
  },

  {
    name: "get_test",
    description:
      "Get full details for a single test: hypothesis, all variants, results, confidence level, primary metric lift, conclusion, and action taken.",
    inputSchema: z.object({
      test_id: z.string().describe("Test ID"),
    }),
    handler: async (args: { test_id: string }) => {
      const test = await adapter.getTest(args.test_id);
      if (!test) {
        return { content: [{ type: "text", text: `No test found with ID: ${args.test_id}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(test, null, 2) }] };
    },
  },

  {
    name: "get_test_learnings",
    description:
      "Summarize completed test results: what was tested, which variant won, lift achieved, whether stat sig was reached, and action taken. Covers both in-campaign A/B tests and vendor/partner evaluations (dsp, agency, ad_network, platform, tool).",
    inputSchema: z.object({
      team_id: z.string().optional().describe("Filter by team ID"),
      type: z
        .enum(["creative", "audience", "bidding", "landing_page", "copy", "format", "offer", "ad_network", "dsp", "agency", "platform", "tool", "other"])
        .optional()
        .describe("Filter by test type"),
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter by platform"),
    }),
    handler: async (args: { team_id?: string; type?: string; platform?: string }) => {
      const filters: { status?: TestStatus; type?: TestType; team_id?: string; platform?: Platform } = { status: "completed" };
      if (args.team_id) filters.team_id = args.team_id;
      if (args.type) filters.type = args.type as TestType;
      if (args.platform) filters.platform = args.platform as Platform;
      const tests = await adapter.getTests(filters);

      if (tests.length === 0) {
        return { content: [{ type: "text", text: "No completed tests found matching the filters." }] };
      }

      const learnings = tests.map((t) => {
        const base = {
          id: t.id,
          name: t.name,
          type: t.type,
          platform: t.platform,
          hypothesis: t.hypothesis,
          winner: t.results?.winner_variant_id
            ? t.variants.find((v) => v.id === t.results?.winner_variant_id)?.name ?? t.results.winner_variant_id
            : "No winner declared",
          stat_sig_achieved: t.results?.stat_sig_achieved ?? false,
          confidence_level: t.results?.confidence_level,
          primary_metric: t.results?.primary_metric,
          lift_pct: t.results?.primary_metric_lift_pct,
          conclusion: t.results?.conclusion,
          action_taken: t.results?.action_taken,
          tags: t.tags,
        };
        if (t.vendor_context) {
          return {
            ...base,
            vendor_subject: t.vendor_context.subject,
            incumbent: t.vendor_context.incumbent,
            challenger: t.vendor_context.challenger,
            evaluation_criteria: t.vendor_context.evaluation_criteria,
            recommendation: t.vendor_context.recommendation,
          };
        }
        return base;
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ count: learnings.length, learnings }, null, 2) }],
      };
    },
  },
];
