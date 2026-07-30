/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { z } from "zod";
import type { PaidMediaAdapter } from "../adapters/base.js";

export const teamTools = (adapter: PaidMediaAdapter) => [
  {
    name: "list_teams",
    description:
      "List all media teams, their objectives, KPIs, managed platforms, and account assignments.",
    inputSchema: z.object({}),
    handler: async () => {
      const teams = await adapter.getTeams();
      return {
        content: [{ type: "text", text: JSON.stringify({ count: teams.length, teams }, null, 2) }],
      };
    },
  },

  {
    name: "get_team",
    description:
      "Get full details for a single media team: objectives, KPIs, platforms, members, and managed accounts.",
    inputSchema: z.object({
      team_id: z.string().describe("The team ID"),
    }),
    handler: async (args: { team_id: string }) => {
      const team = await adapter.getTeam(args.team_id);
      if (!team) {
        return { content: [{ type: "text", text: `No team found with ID: ${args.team_id}` }] };
      }
      // Enrich with members
      const members = await adapter.getTeamMembers(team.id);
      const accounts = await adapter.getAccounts(team.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ team, members, accounts }, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_team_for_account",
    description: "Look up which team owns a given ad account.",
    inputSchema: z.object({
      account_id: z.string().describe("The ad account ID"),
    }),
    handler: async (args: { account_id: string }) => {
      const team = await adapter.getTeamByAccount(args.account_id);
      if (!team) {
        return {
          content: [{ type: "text", text: `No team found for account ID: ${args.account_id}` }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(team, null, 2) }] };
    },
  },

  {
    name: "list_team_members",
    description:
      "List team members, their roles, platform specialties, and responsibilities. Optionally filter by team.",
    inputSchema: z.object({
      team_id: z.string().optional().describe("Filter by team ID (omit for all members)"),
    }),
    handler: async (args: { team_id?: string }) => {
      const members = await adapter.getTeamMembers(args.team_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: members.length, members }, null, 2),
          },
        ],
      };
    },
  },

  {
    name: "get_team_member",
    description: "Get full details for a single team member by ID.",
    inputSchema: z.object({
      member_id: z.string().describe("The team member ID"),
    }),
    handler: async (args: { member_id: string }) => {
      const member = await adapter.getTeamMember(args.member_id);
      if (!member) {
        return { content: [{ type: "text", text: `No member found with ID: ${args.member_id}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(member, null, 2) }] };
    },
  },
];
