/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
/**
 * Interactive media action tools
 *
 * These let practitioners trigger Operator-style actions manually from a
 * skill session, without waiting for the autonomous agent's cron schedule.
 * All actions are logged to operator_action_log and, if approval is required,
 * to operator_pending_approvals — same tables the autonomous Operator writes to.
 *
 * Tools:
 *   push_audience_suppression — add domains to platform exclusion list
 *   reallocate_media_budget   — shift budget between campaigns/line items
 *
 * TODO(task27): the Operator also writes task27.v1 MMM budget packages
 * (multi-channel, pre-flight-swept reallocations). This surface only handles
 * single source→target moves; wire a package-aware tool once the agent
 * exposes an endpoint for executing a stored task27.v1 package.
 */

import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

// ── Local guardrails (defense-in-depth) ─────────────────────────────────────
// Authoritative enforcement lives server-side in the agent (MAX_BUDGET_SHIFT_PCT
// inside the platform clients, OPERATOR_REQUIRE_APPROVAL). These local checks
// reject obviously-bad requests before they leave the MCP at all.

/** Sanity ceiling on a single budget move via this tool. */
const MAX_SINGLE_MOVE_USD = 100_000;
/** Cap on domains per suppression push (platform list APIs choke beyond this). */
const MAX_DOMAINS_PER_PUSH = 10_000;
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{0,252}[a-z0-9]$/;

export const mediaActionTools = (adapter: PaidMediaAdapter) => [

  {
    name: "push_audience_suppression",
    description:
      "Add a list of company domains to an audience exclusion list on a supported ad platform " +
      "(DV360, Meta, LinkedIn, Google Ads, TikTok, Reddit Ads) to stop showing top-of-funnel ads " +
      "to accounts already in open pipeline. " +
      "This is the 'closed-loop' action that connects CRM pipeline data to media buying. " +
      "The action is logged to operator_action_log. If PAID_MEDIA_AGENT_URL is configured, " +
      "the request is forwarded to the agent's /action/audience-suppression route, which runs the " +
      "Operator's guardrail path (approval gating via OPERATOR_REQUIRE_APPROVAL, audit logging). " +
      "Otherwise, it is queued as a pending approval with full context for manual execution.",
    inputSchema: z.object({
      platform: z
        .enum(["dv360", "meta", "linkedin", "google_ads", "tiktok", "reddit_ads"])
        .describe("Which platform to push the exclusion to"),
      advertiser_id: z
        .string()
        .describe("Platform advertiser / account ID"),
      audience_list_id: z
        .string()
        .describe("The exclusion audience list ID in the platform"),
      domains: z
        .array(z.string())
        .min(1)
        .max(MAX_DOMAINS_PER_PUSH)
        .describe(
          "Company domains to exclude, e.g. ['acme.com', 'bigcorp.io']. " +
          "Get these from get_accounts_in_open_pipeline or a Salesforce export."
        ),
      rationale: z
        .string()
        .describe(
          "Why this suppression is being pushed — which accounts, which pipeline stage. " +
          "Shown in the approval queue if approval is required."
        ),
    }),
    handler: async (args: {
      platform: string;
      advertiser_id: string;
      audience_list_id: string;
      domains: string[];
      rationale: string;
    }) => {
      const invalid = args.domains.filter((d) => !DOMAIN_RE.test(d.toLowerCase().trim()));
      if (invalid.length) {
        return {
          content: [{
            type: "text",
            text:
              `Rejected locally: ${invalid.length} entr${invalid.length === 1 ? "y" : "ies"} ` +
              `do not look like domains (first few: ${invalid.slice(0, 5).join(", ")}). ` +
              "Pass bare domains like 'acme.com' — no URLs, schemes, or paths.",
          }],
        };
      }
      const result = await adapter.pushAudienceSuppression(
        args.platform,
        args.advertiser_id,
        args.audience_list_id,
        args.domains,
        args.rationale
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

  {
    name: "reallocate_media_budget",
    description:
      "Shift budget from an underperforming campaign or line item to one with higher " +
      "attributed pipeline contribution. Supports DV360, SA360, Meta, LinkedIn, Google Ads, " +
      "TikTok, and Reddit Ads. " +
      "When PAID_MEDIA_AGENT_URL is configured, the request is forwarded to the agent's " +
      "/action/reallocate-budget route, where the Operator's guardrails apply: the platform " +
      "clients enforce the MAX_BUDGET_SHIFT_PCT cap and OPERATOR_REQUIRE_APPROVAL queues the " +
      "action for human approval instead of executing immediately. " +
      "The action is logged to operator_action_log with full attribution rationale. " +
      "Without an agent URL it is queued for manual execution with a pending approval record. " +
      "Always provide the attribution insight that drives the recommendation.",
    inputSchema: z.object({
      platform: z
        .enum(["dv360", "sa360", "meta", "linkedin", "google_ads", "tiktok", "reddit_ads"])
        .describe("Which platform the campaigns are on"),
      advertiser_id: z
        .string()
        .describe("Platform advertiser or manager account ID"),
      source_campaign_id: z
        .string()
        .describe("The underperforming campaign or line item to reduce budget from"),
      target_campaign_id: z
        .string()
        .describe("The high-performing campaign or line item to increase budget for"),
      amount_usd: z
        .number()
        .describe(
          "Dollar amount to move. Must be positive; the agent additionally rejects moves " +
          "exceeding its MAX_BUDGET_SHIFT_PCT cap against the live campaign budget."
        ),
      rationale: z
        .string()
        .describe(
          "The attribution-based reasoning. Include: which model, which metric drove the decision, " +
          "and what the expected impact is. E.g. 'Paid social has 42% attributed pipeline credit " +
          "but only 18% of budget. Shifting $2,000 from display awareness to LinkedIn retargeting.'"
        ),
    }),
    handler: async (args: {
      platform: string;
      advertiser_id: string;
      source_campaign_id: string;
      target_campaign_id: string;
      amount_usd: number;
      rationale: string;
    }) => {
      // The authoritative ±MAX_BUDGET_SHIFT_PCT check needs the live campaign
      // budget and runs in the agent; these are the cheap local rejections.
      if (!Number.isFinite(args.amount_usd) || args.amount_usd <= 0) {
        return {
          content: [{ type: "text", text: "Rejected locally: amount_usd must be a positive number." }],
        };
      }
      if (args.amount_usd > MAX_SINGLE_MOVE_USD) {
        return {
          content: [{
            type: "text",
            text:
              `Rejected locally: amount_usd $${args.amount_usd.toLocaleString()} exceeds the ` +
              `$${MAX_SINGLE_MOVE_USD.toLocaleString()} single-move sanity ceiling. ` +
              "Split the reallocation or run it through an MMM package with human approval.",
          }],
        };
      }
      if (args.source_campaign_id === args.target_campaign_id) {
        return {
          content: [{ type: "text", text: "Rejected locally: source and target campaign are the same." }],
        };
      }
      const result = await adapter.reallocateMediaBudget(
        args.platform,
        args.advertiser_id,
        args.source_campaign_id,
        args.target_campaign_id,
        args.amount_usd,
        args.rationale
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  },

];
