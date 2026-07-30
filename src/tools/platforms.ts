/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

const PLATFORM_ENUM = z.enum(["dv360", "sa360", "cm360"]);

export const platformTools = (adapter: PaidMediaAdapter) => [
  {
    name: "list_bulk_upload_platforms",
    description:
      "List the GMP platforms that support bulk upload (DV360 SDF, SA360 Bulksheet, CM360 Trafficking Sheet) with a summary of their format, entity types, and upload process.",
    inputSchema: z.object({}),
    handler: async () => {
      const config = await adapter.getPlatformsConfig();
      const summary = Object.values(config.platforms).map((p) => ({
        id: p.id,
        name: p.name,
        format: p.bulk_upload.format,
        version: p.bulk_upload.version,
        entity_types: p.bulk_upload.entities.map((e) => e.entity_type),
        documentation_url: p.bulk_upload.documentation_url,
        upload_instructions_summary: p.bulk_upload.upload_instructions.split(".")[0] + ".",
      }));
      return { content: [{ type: "text", text: JSON.stringify({ platforms: summary }, null, 2) }] };
    },
  },

  {
    name: "get_bulk_upload_schema",
    description:
      "Get the full field schema for a platform bulk upload entity type (e.g. DV360 line_item, SA360 campaign, CM360 placement). Returns all column names, data types, required status, valid values, and org-configured defaults.",
    inputSchema: z.object({
      platform: PLATFORM_ENUM.describe("Platform: dv360, sa360, or cm360"),
      entity_type: z.string().describe(
        "Entity type to get schema for. DV360: campaign | insertion_order | line_item | ad_group. SA360: campaign | ad_group | keyword | responsive_search_ad. CM360: placement | ad | creative"
      ),
    }),
    handler: async (args: { platform: string; entity_type: string }) => {
      const config = await adapter.getPlatformsConfig();
      const platform = config.platforms[args.platform as keyof typeof config.platforms];
      if (!platform) {
        return { content: [{ type: "text", text: `Platform not found: ${args.platform}. Available: dv360, sa360, cm360` }] };
      }
      const entity = platform.bulk_upload.entities.find(
        (e) => e.entity_type === args.entity_type
      );
      if (!entity) {
        const available = platform.bulk_upload.entities.map((e) => e.entity_type).join(", ");
        return { content: [{ type: "text", text: `Entity type '${args.entity_type}' not found for ${args.platform}. Available: ${available}` }] };
      }
      const orgDefaults = platform.bulk_upload.org_defaults[args.entity_type];
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            platform: args.platform,
            entity_type: args.entity_type,
            filename: entity.filename,
            description: entity.description,
            upload_instructions: platform.bulk_upload.upload_instructions,
            fields: entity.fields,
            org_defaults: orgDefaults ?? null,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_platform_org_defaults",
    description:
      "Get the org-configured default field values and naming conventions for a platform's entity types. Use this when generating bulk upload files to apply the team's standard settings.",
    inputSchema: z.object({
      platform: PLATFORM_ENUM.describe("Platform: dv360, sa360, or cm360"),
    }),
    handler: async (args: { platform: string }) => {
      const config = await adapter.getPlatformsConfig();
      const platform = config.platforms[args.platform as keyof typeof config.platforms];
      if (!platform) {
        return { content: [{ type: "text", text: `Platform not found: ${args.platform}` }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            platform: args.platform,
            name: platform.name,
            format: platform.bulk_upload.format,
            org_defaults: platform.bulk_upload.org_defaults,
            notes: platform.notes,
          }, null, 2),
        }],
      };
    },
  },

  {
    name: "get_bulk_upload_instructions",
    description:
      "Get step-by-step upload instructions and file naming requirements for a GMP platform's bulk upload format.",
    inputSchema: z.object({
      platform: PLATFORM_ENUM.describe("Platform: dv360, sa360, or cm360"),
    }),
    handler: async (args: { platform: string }) => {
      const config = await adapter.getPlatformsConfig();
      const platform = config.platforms[args.platform as keyof typeof config.platforms];
      if (!platform) {
        return { content: [{ type: "text", text: `Platform not found: ${args.platform}` }] };
      }
      const bu = platform.bulk_upload;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            platform: args.platform,
            name: platform.name,
            format: bu.format,
            version: bu.version,
            upload_instructions: bu.upload_instructions,
            file_naming_notes: bu.file_naming_notes,
            documentation_url: bu.documentation_url,
            entity_types_available: bu.entities.map((e) => ({
              type: e.entity_type,
              filename: e.filename,
              description: e.description,
            })),
          }, null, 2),
        }],
      };
    },
  },
];
