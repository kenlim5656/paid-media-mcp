/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const assetTools = (adapter: PaidMediaAdapter) => [
  {
    name: "get_asset_library",
    description:
      "Get the asset library overview: DAM system name and URL, access instructions, brand and copy guidelines links, and a summary of asset categories available.",
    inputSchema: z.object({}),
    handler: async () => {
      const lib = await adapter.getAssetLibrary();
      const summary = {
        dam_system: lib.dam_system,
        dam_url: lib.dam_url,
        access_instructions: lib.access_instructions,
        brand_guidelines_url: lib.brand_guidelines_url,
        copy_guidelines_url: lib.copy_guidelines_url,
        notes: lib.notes,
        category_count: lib.categories?.length ?? 0,
        categories: lib.categories?.map((c) => ({ id: c.id, name: c.name, type: c.type })) ?? [],
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  },

  {
    name: "list_asset_categories",
    description:
      "List asset categories (image, video, copy, etc.) with their storage locations, naming conventions, and platform specs. Optionally filter by asset type.",
    inputSchema: z.object({
      type: z
        .enum(["image", "video", "copy", "audio", "html5", "document", "other"])
        .optional()
        .describe("Filter by asset type"),
    }),
    handler: async (args: { type?: string }) => {
      const categories = await adapter.getAssetCategories(args.type as Parameters<typeof adapter.getAssetCategories>[0]);
      if (categories.length === 0) {
        return { content: [{ type: "text", text: "No asset categories found. Add them to data/assets.json." }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ count: categories.length, categories }, null, 2) }],
      };
    },
  },

  {
    name: "get_asset_category",
    description:
      "Get full details for an asset category: location URL, naming convention, and per-platform specs (dimensions, file size limits, formats, aspect ratios).",
    inputSchema: z.object({
      category_id: z.string().describe("Asset category ID"),
    }),
    handler: async (args: { category_id: string }) => {
      const cat = await adapter.getAssetCategory(args.category_id);
      if (!cat) {
        return { content: [{ type: "text", text: `No asset category found with ID: ${args.category_id}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(cat, null, 2) }] };
    },
  },

  {
    name: "get_asset_specs",
    description:
      "Get platform-specific asset specs (dimensions, file size, aspect ratio, duration limits) for a given asset type and platform combination.",
    inputSchema: z.object({
      type: z
        .enum(["image", "video", "copy", "audio", "html5", "document", "other"])
        .describe("Asset type to look up specs for"),
      platform: z
        .enum(["google_ads", "meta", "dv360", "youtube", "linkedin", "tiktok", "twitter_x", "pinterest", "snapchat", "amazon", "other"])
        .optional()
        .describe("Narrow to specs for a specific platform"),
    }),
    handler: async (args: { type: string; platform?: string }) => {
      const categories = await adapter.getAssetCategories(args.type as Parameters<typeof adapter.getAssetCategories>[0]);
      if (categories.length === 0) {
        return { content: [{ type: "text", text: `No asset categories found for type: ${args.type}` }] };
      }

      const results = categories.map((cat) => {
        const specs = args.platform
          ? (cat.specs ?? []).filter((s) => s.platform === args.platform)
          : (cat.specs ?? []);
        return { category_id: cat.id, category_name: cat.name, specs };
      }).filter((r) => r.specs.length > 0);

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No specs found for type "${args.type}"${args.platform ? ` on platform "${args.platform}"` : ""}.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  },
];
