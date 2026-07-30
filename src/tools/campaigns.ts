/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const campaignTools = (adapter: PaidMediaAdapter) => [
  {
    name: "list_campaigns",
    description:
      "List and filter paid media campaigns. Filter by team, platform, status, objective, funnel stage, or tag. Returns campaign details including budget, targeting, and status.",
    inputSchema: z.object({
      team_id: z.string().optional().describe("Filter by team ID"),
      account_id: z.string().optional().describe("Filter by ad account ID"),
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter by ad platform"),
      status: z.enum(["active", "paused", "ended", "draft", "archived"]).optional().describe("Campaign status"),
      objective: z
        .enum(["awareness", "reach", "traffic", "engagement", "video_views", "lead_generation", "app_installs", "conversions", "catalog_sales", "store_visits"])
        .optional()
        .describe("Campaign objective"),
      funnel_stage: z.enum(["upper", "mid", "lower"]).optional().describe("Funnel stage"),
      tag: z.string().optional().describe("Filter by tag"),
    }),
    handler: async (args: Record<string, unknown>) => {
      const campaigns = await adapter.getCampaigns(args as Parameters<typeof adapter.getCampaigns>[0]);
      if (campaigns.length === 0) {
        return { content: [{ type: "text", text: "No campaigns found matching the specified filters." }] };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: campaigns.length, campaigns }, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_campaign",
    description: "Get full details for a single campaign by its ID.",
    inputSchema: z.object({
      campaign_id: z.string().describe("The campaign ID"),
    }),
    handler: async (args: { campaign_id: string }) => {
      const campaign = await adapter.getCampaign(args.campaign_id);
      if (!campaign) {
        return { content: [{ type: "text", text: `No campaign found with ID: ${args.campaign_id}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
    },
  },

  {
    name: "get_account",
    description: "Get details for an ad account, including which team manages it and its budget.",
    inputSchema: z.object({
      account_id: z.string().describe("The account ID"),
    }),
    handler: async (args: { account_id: string }) => {
      const account = await adapter.getAccount(args.account_id);
      if (!account) {
        return { content: [{ type: "text", text: `No account found with ID: ${args.account_id}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }] };
    },
  },

  {
    name: "list_accounts",
    description: "List all ad accounts, optionally filtered by team.",
    inputSchema: z.object({
      team_id: z.string().optional().describe("Filter accounts by team ID"),
    }),
    handler: async (args: { team_id?: string }) => {
      const accounts = await adapter.getAccounts(args.team_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: accounts.length, accounts }, null, 2),
          },
        ],
      };
    },
  },
];
