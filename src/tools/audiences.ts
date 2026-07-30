/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";
import type { Platform } from "../types.js";

export const audienceTools = (adapter: PaidMediaAdapter) => [
  {
    name: "get_audience_library_overview",
    description:
      "Get a high-level overview of the full audience library: count of first-party audiences, contracted data providers, onboarding platforms, lookalike strategy summary, and third-party layer count.",
    inputSchema: z.object({}),
    handler: async () => {
      const lib = await adapter.getAudienceLibrary();
      const overview = {
        business_unit: lib.business_unit,
        first_party_audience_count: lib.first_party_audiences?.length ?? 0,
        data_provider_count: lib.data_providers?.length ?? 0,
        active_data_providers: lib.data_providers?.filter((p) => p.contract_status === "active").map((p) => p.name) ?? [],
        onboarding_platforms: lib.onboarding_platforms?.map((p) => ({ name: p.name, type: p.type })) ?? [],
        lookalike_strategy: lib.lookalike_strategy,
        third_party_layer_count: lib.third_party_layers?.length ?? 0,
        default_third_party_layers: lib.third_party_layers?.filter((l) => l.is_default).map((l) => l.name) ?? [],
      };
      return { content: [{ type: "text", text: JSON.stringify(overview, null, 2) }] };
    },
  },

  {
    name: "list_first_party_audiences",
    description:
      "List first-party audiences (CRM lists, pixel-based, customer match, suppression lists, lookalike seeds, etc.). Filter by business unit or platform availability.",
    inputSchema: z.object({
      business_unit: z.string().optional().describe("Filter by business unit"),
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter to audiences available on a specific platform"),
    }),
    handler: async (args: { business_unit?: string; platform?: string }) => {
      const audiences = await adapter.getFirstPartyAudiences(
        args as Parameters<typeof adapter.getFirstPartyAudiences>[0]
      );
      if (audiences.length === 0) {
        return { content: [{ type: "text", text: "No first-party audiences found matching the filters." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: audiences.length, audiences }, null, 2) }],
      };
    },
  },

  {
    name: "list_data_providers",
    description:
      "List contracted third-party data providers (e.g. Oracle Data Cloud, Acxiom, Experian). Shows contract status, available segments, platforms, and contact info.",
    inputSchema: z.object({
      status: z
        .enum(["active", "expired", "negotiating", "evaluating"])
        .optional()
        .describe("Filter by contract status (default: all)"),
    }),
    handler: async (args: { status?: string }) => {
      const providers = await adapter.getDataProviders(args.status);
      if (providers.length === 0) {
        return { content: [{ type: "text", text: "No data providers found." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: providers.length, providers }, null, 2) }],
      };
    },
  },

  {
    name: "get_lookalike_strategy",
    description:
      "Get the full lookalike audience strategy: seed audiences used per platform, expansion percentages tested, best-performing expansion sizes, and strategic notes.",
    inputSchema: z.object({}),
    handler: async () => {
      const lib = await adapter.getAudienceLibrary();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(lib.lookalike_strategy, null, 2),
        }],
      };
    },
  },

  {
    name: "list_third_party_audience_layers",
    description:
      "List third-party audience segments and layers used as targeting overlays. Filter by platform, default use, or best-performing flag. Includes CPM premium estimates and performance notes.",
    inputSchema: z.object({
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Filter by platform availability"),
      best_performers_only: z
        .boolean()
        .optional()
        .describe("Return only layers flagged as best-performing"),
      defaults_only: z
        .boolean()
        .optional()
        .describe("Return only default layers applied to all campaigns"),
    }),
    handler: async (args: { platform?: string; best_performers_only?: boolean; defaults_only?: boolean }) => {
      const layerFilters: { platform?: Platform; is_best_performer?: boolean; is_default?: boolean } = {};
      if (args.platform) layerFilters.platform = args.platform as Platform;
      if (args.best_performers_only != null) layerFilters.is_best_performer = args.best_performers_only;
      if (args.defaults_only != null) layerFilters.is_default = args.defaults_only;
      const layers = await adapter.getThirdPartyLayers(layerFilters);
      if (layers.length === 0) {
        return { content: [{ type: "text", text: "No third-party audience layers found matching the filters." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: layers.length, layers }, null, 2) }],
      };
    },
  },

  {
    name: "get_onboarding_platforms",
    description:
      "Get details on first-party data onboarding platforms and clean rooms in use (e.g. LiveRamp, Habu, InfoSum): platforms connected, use cases, and contact info.",
    inputSchema: z.object({}),
    handler: async () => {
      const lib = await adapter.getAudienceLibrary();
      const platforms = lib.onboarding_platforms ?? [];
      if (platforms.length === 0) {
        return { content: [{ type: "text", text: "No onboarding platforms configured. Add them to data/audiences.json." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: platforms.length, platforms }, null, 2) }],
      };
    },
  },
];
