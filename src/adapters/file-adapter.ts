/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
import { readFileSync } from "fs";
import { existsSync } from "fs";
import { resolve } from "path";
import { agentBaseUrl } from "../config.js";
import type { PaidMediaAdapter, CampaignFilters, PerformanceFilters } from "./base.js";
import type {
  Account,
  AssetCategory,
  AssetLibrary,
  AssetType,
  AudienceLibrary,
  Campaign,
  CampaignObjective,
  ConversionAPI,
  DataProvider,
  FirstPartyAudience,
  MeasurementSetup,
  PaidMediaData,
  PixelTag,
  Platform,
  PlatformsConfig,
  PerformanceRecord,
  AttributionConfiguration,
  AttributionChannelSummary,
  AttributionRun,
  ReportingTemplate,
  Team,
  TeamMember,
  Test,
  TestingProgram,
  TestStatus,
  TestType,
  ThirdPartyAudienceLayer,
  IdentityNamespace,
  WatchdogAlert,
  AnalystInsight,
  OperatorPendingApproval,
} from "../types.js";

function loadJson<T>(filePath: string): T {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`Data file not found: ${abs}`);
  }
  return JSON.parse(readFileSync(abs, "utf-8")) as T;
}

/**
 * Reads a non-2xx agent response and formats "HTTP <status>: <body detail>"
 * so tool callers see the real failure instead of a generic message.
 */
async function agentErrorDetail(res: Response): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    detail = text.slice(0, 500);
  } catch { /* body unreadable — status alone will have to do */ }
  return `HTTP ${res.status}${detail ? `: ${detail}` : ""}`;
}

function matchesDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

const EMPTY_ASSET_LIBRARY: AssetLibrary = { categories: [] };
const EMPTY_TESTING_PROGRAM: TestingProgram = {
  methodology: { confidence_threshold: 95, require_stat_sig: true, winner_criteria: "Not configured" },
  tools: [],
  tests: [],
};
const EMPTY_AUDIENCE_LIBRARY: AudienceLibrary = {
  first_party_audiences: [],
  data_providers: [],
  onboarding_platforms: [],
  lookalike_strategy: { entries: [] },
  third_party_layers: [],
};
const EMPTY_MEASUREMENT: MeasurementSetup = {
  tag_management: { system: "other", implementation_type: "client_side" },
  pixels_and_tags: [],
  conversion_apis: [],
  website_data_capture: { data_layer_implemented: false, first_party_cookies_implemented: false },
  measurement_partners: [],
};

export class FileAdapter implements PaidMediaAdapter {
  private data: PaidMediaData;
  protected readonly dataDir: string;

  constructor(dataDir = "./data") {
    this.dataDir = dataDir;
    this.data = {
      metadata: { company_name: "", primary_currency: "USD", fiscal_year_start: "01-01", last_updated: "" },
      accounts: [],
      teams: [],
      team_members: [],
      campaigns: [],
      historical_performance: { records: [] },
      attribution_configurations: [],
      reporting_templates: [],
      asset_library: EMPTY_ASSET_LIBRARY,
      testing_program: EMPTY_TESTING_PROGRAM,
      audience_library: EMPTY_AUDIENCE_LIBRARY,
      measurement_setup: EMPTY_MEASUREMENT,
      platforms_config: { platforms: {} as PlatformsConfig["platforms"] },
    };

    const warn = (e: unknown) => console.error(`[FileAdapter] Warning: ${(e as Error).message}`);

    const loadInto = <K extends keyof PaidMediaData>(file: string, key: K) => {
      try {
        const raw = loadJson<Record<string, unknown>>(`${dataDir}/${file}`);
        this.data[key] = (Array.isArray(raw) ? raw : (raw[key] ?? raw)) as PaidMediaData[K];
      } catch (e) { warn(e); }
    };

    const loadObject = <K extends keyof PaidMediaData>(file: string, key: K) => {
      try {
        const raw = loadJson<Record<string, unknown>>(`${dataDir}/${file}`);
        this.data[key] = (raw[key] ?? raw) as PaidMediaData[K];
      } catch (e) { warn(e); }
    };

    try {
      const meta = loadJson<{ metadata: PaidMediaData["metadata"] }>(`${dataDir}/metadata.json`);
      this.data.metadata = meta.metadata ?? meta as unknown as PaidMediaData["metadata"];
    } catch { /* metadata is optional */ }

    loadInto("accounts.json", "accounts");
    loadInto("teams.json", "teams");
    loadInto("team-members.json", "team_members");
    loadInto("campaigns.json", "campaigns");

    try {
      this.data.historical_performance = loadJson(`${dataDir}/historical-performance.json`);
    } catch (e) { warn(e); }

    loadInto("attribution-models.json", "attribution_configurations");
    loadInto("reporting-templates.json", "reporting_templates");
    loadObject("assets.json", "asset_library");
    loadObject("testing.json", "testing_program");
    loadObject("audiences.json", "audience_library");
    loadObject("measurement.json", "measurement_setup");
    loadObject("platforms.json", "platforms_config");
  }

  async getMetadata() { return this.data.metadata; }

  async getAccounts(team_id?: string): Promise<Account[]> {
    if (!team_id) return this.data.accounts;
    return this.data.accounts.filter((a) => a.team_id === team_id);
  }
  async getAccount(id: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }

  async getTeams(): Promise<Team[]> { return this.data.teams; }
  async getTeam(id: string): Promise<Team | null> {
    return this.data.teams.find((t) => t.id === id) ?? null;
  }
  async getTeamByAccount(account_id: string): Promise<Team | null> {
    return this.data.teams.find((t) => t.account_ids.includes(account_id)) ?? null;
  }

  async getTeamMembers(team_id?: string): Promise<TeamMember[]> {
    if (!team_id) return this.data.team_members;
    return this.data.team_members.filter((m) => m.team_ids.includes(team_id));
  }
  async getTeamMember(id: string): Promise<TeamMember | null> {
    return this.data.team_members.find((m) => m.id === id) ?? null;
  }

  async getCampaigns(filters: CampaignFilters = {}): Promise<Campaign[]> {
    let r = this.data.campaigns;
    if (filters.team_id)         r = r.filter((c) => c.team_id === filters.team_id);
    if (filters.account_id)      r = r.filter((c) => c.account_id === filters.account_id);
    if (filters.platform)        r = r.filter((c) => c.platform === filters.platform);
    if (filters.status)          r = r.filter((c) => c.status === filters.status);
    if (filters.objective)       r = r.filter((c) => c.objective === filters.objective);
    if (filters.funnel_stage)    r = r.filter((c) => c.funnel_stage === filters.funnel_stage);
    if (filters.tag)             r = r.filter((c) => c.tags?.includes(filters.tag!));
    if (filters.start_date_after) r = r.filter((c) => !c.start_date || c.start_date >= filters.start_date_after!);
    if (filters.end_date_before)  r = r.filter((c) => !c.end_date || c.end_date <= filters.end_date_before!);
    return r;
  }
  async getCampaign(id: string): Promise<Campaign | null> {
    return this.data.campaigns.find((c) => c.id === id) ?? null;
  }

  async getPerformance(filters: PerformanceFilters = {}): Promise<PerformanceRecord[]> {
    let records = this.data.historical_performance.records;
    if (filters.campaign_id) {
      records = records.filter((r) => r.campaign_id === filters.campaign_id);
    } else if (filters.team_id) {
      const ids = new Set(this.data.campaigns.filter((c) => c.team_id === filters.team_id).map((c) => c.id));
      records = records.filter((r) => ids.has(r.campaign_id));
    } else if (filters.platform) {
      const ids = new Set(this.data.campaigns.filter((c) => c.platform === filters.platform).map((c) => c.id));
      records = records.filter((r) => ids.has(r.campaign_id));
    }
    if (filters.date_from || filters.date_to) {
      records = records.filter((r) => matchesDateRange(r.date, filters.date_from, filters.date_to));
    }
    return records;
  }

  async getBenchmarks(platform?: Platform, objective?: CampaignObjective) {
    const match = (this.data.historical_performance.benchmarks ?? []).find(
      (b) => (!platform || b.platform === platform) && (!objective || b.objective === objective)
    );
    if (!match) return null;
    return { avg_ctr: match.avg_ctr, avg_cpc: match.avg_cpc, avg_cpm: match.avg_cpm, avg_cpa: match.avg_cpa, avg_roas: match.avg_roas };
  }

  async getAttributionConfigurations(): Promise<AttributionConfiguration[]> { return this.data.attribution_configurations; }
  async getAttributionConfiguration(id: string): Promise<AttributionConfiguration | null> {
    return this.data.attribution_configurations.find((a) => a.id === id) ?? null;
  }

  async getReportingTemplates(audience?: string): Promise<ReportingTemplate[]> {
    if (!audience) return this.data.reporting_templates;
    return this.data.reporting_templates.filter((t) => t.audience === audience);
  }
  async getReportingTemplate(id: string): Promise<ReportingTemplate | null> {
    return this.data.reporting_templates.find((t) => t.id === id) ?? null;
  }

  // ── Assets ──────────────────────────────────────────────────────────────────

  async getAssetLibrary(): Promise<AssetLibrary> { return this.data.asset_library; }

  async getAssetCategories(type?: AssetType): Promise<AssetCategory[]> {
    const cats = this.data.asset_library.categories ?? [];
    if (!type) return cats;
    return cats.filter((c) => c.type === type);
  }

  async getAssetCategory(id: string): Promise<AssetCategory | null> {
    return (this.data.asset_library.categories ?? []).find((c) => c.id === id) ?? null;
  }

  // ── Testing ─────────────────────────────────────────────────────────────────

  async getTestingProgram(): Promise<TestingProgram> { return this.data.testing_program; }

  async getTests(filters: { status?: TestStatus; type?: TestType; team_id?: string; platform?: Platform } = {}): Promise<Test[]> {
    let tests = this.data.testing_program.tests ?? [];
    if (filters.status)    tests = tests.filter((t) => t.status === filters.status);
    if (filters.type)      tests = tests.filter((t) => t.type === filters.type);
    if (filters.team_id)   tests = tests.filter((t) => t.team_id === filters.team_id);
    if (filters.platform)  tests = tests.filter((t) => t.platform === filters.platform);
    return tests;
  }

  async getTest(id: string): Promise<Test | null> {
    return (this.data.testing_program.tests ?? []).find((t) => t.id === id) ?? null;
  }

  // ── Audiences ───────────────────────────────────────────────────────────────

  async getAudienceLibrary(): Promise<AudienceLibrary> { return this.data.audience_library; }

  async getFirstPartyAudiences(filters: { business_unit?: string; platform?: Platform } = {}): Promise<FirstPartyAudience[]> {
    let auds = this.data.audience_library.first_party_audiences ?? [];
    if (filters.business_unit) auds = auds.filter((a) => a.business_unit === filters.business_unit);
    if (filters.platform)      auds = auds.filter((a) => a.platforms_available.includes(filters.platform!));
    return auds;
  }

  async getDataProviders(status?: string): Promise<DataProvider[]> {
    const providers = this.data.audience_library.data_providers ?? [];
    if (!status) return providers;
    return providers.filter((p) => p.contract_status === status);
  }

  async getThirdPartyLayers(filters: { platform?: Platform; is_default?: boolean; is_best_performer?: boolean } = {}): Promise<ThirdPartyAudienceLayer[]> {
    let layers = this.data.audience_library.third_party_layers ?? [];
    if (filters.platform)          layers = layers.filter((l) => l.platforms_available.includes(filters.platform!));
    if (filters.is_default != null) layers = layers.filter((l) => l.is_default === filters.is_default);
    if (filters.is_best_performer != null) layers = layers.filter((l) => l.is_best_performer === filters.is_best_performer);
    return layers;
  }

  // ── Measurement ─────────────────────────────────────────────────────────────

  async getMeasurementSetup(): Promise<MeasurementSetup> { return this.data.measurement_setup; }

  async getPixelTags(platform?: Platform): Promise<PixelTag[]> {
    const tags = this.data.measurement_setup.pixels_and_tags ?? [];
    if (!platform) return tags;
    return tags.filter((t) => t.platform === platform);
  }

  async getConversionAPIs(platform?: Platform): Promise<ConversionAPI[]> {
    const apis = this.data.measurement_setup.conversion_apis ?? [];
    if (!platform) return apis;
    return apis.filter((a) => a.platform === platform);
  }

  async getPlatformsConfig(): Promise<PlatformsConfig> {
    return this.data.platforms_config;
  }

  // ── Identity ────────────────────────────────────────────────────────────────
  // Namespace registry is read from paid-media-schema/namespaces/identity_namespaces.json
  // if PAID_MEDIA_SCHEMA_DIR is set, otherwise from data/identity_namespaces.json.

  private loadNamespaces(): IdentityNamespace[] {
    const candidates = [
      process.env.PAID_MEDIA_SCHEMA_DIR
        ? resolve(process.env.PAID_MEDIA_SCHEMA_DIR, "namespaces/identity_namespaces.json")
        : null,
      resolve(this.dataDir as string, "identity_namespaces.json"),
    ].filter(Boolean) as string[];

    for (const path of candidates) {
      if (existsSync(path)) {
        try {
          const raw = JSON.parse(readFileSync(path, "utf-8")) as { namespaces: IdentityNamespace[] };
          return raw.namespaces ?? [];
        } catch { /* try next */ }
      }
    }
    return [];
  }

  async getIdentityNamespaces(category?: string): Promise<IdentityNamespace[]> {
    const all = this.loadNamespaces();
    return category ? all.filter(n => n.category === category) : all;
  }

  async getIdentityNamespace(namespace_id: string): Promise<IdentityNamespace | null> {
    return this.loadNamespaces().find(n => n.namespace_id === namespace_id) ?? null;
  }

  // ── Attribution Results ─────────────────────────────────────────────────────

  async getLatestAttributionResults(conversion_type?: string): Promise<AttributionChannelSummary | null> {
    const path = resolve(this.dataDir as string, "attribution-results.json");
    if (!existsSync(path)) return null;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as AttributionChannelSummary;
      if (conversion_type) {
        return {
          ...raw,
          channel_summary: raw.channel_summary.filter(c => c.conversion_type === conversion_type),
        };
      }
      return raw;
    } catch { return null; }
  }

  async getAttributionRuns(limit = 10): Promise<AttributionRun[]> {
    const path = resolve(this.dataDir as string, "attribution-runs.json");
    if (!existsSync(path)) return [];
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as AttributionRun[];
      return raw.slice(0, limit);
    } catch { return []; }
  }

  // ── Agent Outputs ───────────────────────────────────────────────────────────

  async getWatchdogAlerts(status?: "open" | "acknowledged" | "resolved" | "suppressed"): Promise<WatchdogAlert[]> {
    const path = resolve(this.dataDir as string, "watchdog-alerts.json");
    if (!existsSync(path)) return [];
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as WatchdogAlert[];
      return status ? raw.filter(a => a.status === status) : raw;
    } catch { return []; }
  }

  async getAnalystInsights(filters: { priority?: "high" | "medium" | "low"; status?: string; limit?: number } = {}): Promise<AnalystInsight[]> {
    const path = resolve(this.dataDir as string, "analyst-insights.json");
    if (!existsSync(path)) return [];
    try {
      let raw = JSON.parse(readFileSync(path, "utf-8")) as AnalystInsight[];
      if (filters.priority) raw = raw.filter(i => i.priority === filters.priority);
      if (filters.status)   raw = raw.filter(i => i.status === filters.status);
      return raw.slice(0, filters.limit ?? 20);
    } catch { return []; }
  }

  async getOperatorPendingApprovals(): Promise<OperatorPendingApproval[]> {
    const path = resolve(this.dataDir as string, "operator-pending-approvals.json");
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as OperatorPendingApproval[];
    } catch { return []; }
  }

  // ── Analytics & Data Governance ───────────────────────────────────────────
  // File mode cannot run live BigQuery queries. These return "not available"
  // stubs that tell the user to enable BigQuery mode.

  async queryAccountJourney(
    account_domain: string,
    _lookback_days: number,
    _conversion_type?: string
  ): Promise<{ account_domain: string; entity_count: number; touchpoints: object[]; conversions: object[]; path_summary: object } | null> {
    const agentUrl = agentBaseUrl();
    if (agentUrl) {
      try {
        const res = await fetch(`${agentUrl}/query/account-journey`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_domain, lookback_days: _lookback_days, conversion_type: _conversion_type }),
        });
        if (res.ok) return res.json() as Promise<{ account_domain: string; entity_count: number; touchpoints: object[]; conversions: object[]; path_summary: object }>;
        console.error(`[FileAdapter] queryAccountJourney agent call failed: ${await agentErrorDetail(res)}`);
      } catch (err) {
        console.error(`[FileAdapter] queryAccountJourney agent unreachable: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.error("[FileAdapter] queryAccountJourney requires BigQuery mode (PAID_MEDIA_GCP_PROJECT) or PAID_MEDIA_AGENT_URL");
    return null;
  }

  async getSignalCaptureRates(_hours_back: number, _platform?: string): Promise<object[]> {
    // Read from cached watchdog_capture_rate_log file if present
    const path = resolve(this.dataDir, "watchdog-capture-rates.json");
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf-8")) as object[];
        return _platform ? raw.filter((r) => (r as Record<string, unknown>)["platform"] === _platform) : raw;
      } catch { /* fall through */ }
    }
    return [];
  }

  async getCrmNullFieldStats(_since_hours: number) {
    // Check watchdog alerts for null_crm_fields type as a proxy
    const alerts = await this.getWatchdogAlerts("open");
    const nullAlert = alerts.find((a) => a.alert_type === "null_crm_fields");
    if (nullAlert) {
      return {
        source:        "watchdog_alert_cache",
        hours_sampled: _since_hours,
        total_leads:   0,
        null_media_ids: 0,
        null_pct:      nullAlert.metric_value ?? 0,
        threshold_pct: nullAlert.threshold_value ?? 5,
        breach:        nullAlert.status === "open",
      };
    }
    return null;
  }

  // ── Reporting Views ───────────────────────────────────────────────────────
  // All reporting view methods require BigQuery mode. In file mode they return
  // empty results and log a clear message. Enable by setting PAID_MEDIA_GCP_PROJECT.

  private _bqRequired(method: string): never[] {
    console.error(`[FileAdapter] ${method} requires BigQuery mode. Set PAID_MEDIA_GCP_PROJECT to enable.`);
    return [];
  }

  async getCampaignPerformanceReport(_filters?: {
    platform?: string; team_id?: string; funnel_stage?: string;
    status?: string; date_from?: string; date_to?: string;
  }): Promise<object[]> { return this._bqRequired("getCampaignPerformanceReport"); }

  async getPacingReport(_filters?: {
    platform?: string; team_id?: string;
    pacing_status?: "overpacing" | "underpacing" | "on_pace" | "no_budget_data";
    funnel_stage?: string;
  }): Promise<object[]> { return this._bqRequired("getPacingReport"); }

  async getRoasComparison(_filters?: {
    platform?: string; channel?: string; conversion_type?: string;
  }): Promise<object[]> { return this._bqRequired("getRoasComparison"); }

  async getChannelEfficiency(): Promise<object[]> { return this._bqRequired("getChannelEfficiency"); }

  async getAdPerformance(_filters?: {
    campaign_id?: string; platform?: string; creative_format?: string; min_spend?: number;
  }): Promise<object[]> { return this._bqRequired("getAdPerformance"); }

  async getKeywordPerformance(_filters?: {
    campaign_id?: string; platform?: string; min_spend?: number;
    low_quality_score?: boolean; lost_is_budget?: boolean;
  }): Promise<object[]> { return this._bqRequired("getKeywordPerformance"); }

  async getDailyPerformance(_filters?: {
    campaign_id?: string; platform?: string; team_id?: string;
    date_from?: string; date_to?: string; group_by?: "day" | "week" | "month";
  }): Promise<object[]> { return this._bqRequired("getDailyPerformance"); }

  // ── Account-Based Analytics ───────────────────────────────────────────────
  // All account analytics methods require BigQuery mode.

  async getCompanyProfile(_company_domain: string): Promise<object | null> {
    console.error("[FileAdapter] getCompanyProfile requires BigQuery mode. Set PAID_MEDIA_GCP_PROJECT to enable.");
    return null;
  }

  async getTargetAccountFunnel(_filters?: {
    account_tier?: "tier_1" | "tier_2" | "tier_3"; crm_pipeline_stage?: string;
    intent_spiking?: boolean; is_suppressed_tofu?: boolean;
    min_sessions_30d?: number; limit?: number;
  }): Promise<object[]> { return this._bqRequired("getTargetAccountFunnel"); }

  async getCompanySessions(_company_domain: string, _lookback_days?: number): Promise<object[]> {
    return this._bqRequired("getCompanySessions");
  }

  async getCompanyEngagement(_company_domain: string, _period_type?: string): Promise<object | null> {
    console.error("[FileAdapter] getCompanyEngagement requires BigQuery mode. Set PAID_MEDIA_GCP_PROJECT to enable.");
    return null;
  }

  async getDarkFunnelCoverage(_filters?: {
    account_tier?: "tier_1" | "tier_2" | "tier_3";
    web_presence_status?: "dark" | "lapsed" | "visible";
    crm_pipeline_stage?: string;
  }): Promise<object[]> { return this._bqRequired("getDarkFunnelCoverage"); }

  async getTargetAccountActivity(_company_domain: string, _lookback_days?: number): Promise<object[]> {
    return this._bqRequired("getTargetAccountActivity");
  }

  // ── Interactive Media Actions ─────────────────────────────────────────────

  async pushAudienceSuppression(
    platform: string,
    advertiser_id: string,
    audience_list_id: string,
    domains: string[],
    rationale: string
  ): Promise<object> {
    const agentUrl = agentBaseUrl();
    if (agentUrl) {
      try {
        const res = await fetch(`${agentUrl}/action/audience-suppression`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, advertiser_id, audience_list_id, domains, rationale }),
        });
        if (!res.ok) {
          return { executed: false, message: `Agent rejected audience suppression: ${await agentErrorDetail(res)}` };
        }
        return res.json() as object;
      } catch (err) {
        return { executed: false, message: `Agent unreachable at ${agentUrl}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return {
      executed:      false,
      queued:        true,
      message:       "PAID_MEDIA_AGENT_URL not configured. Action logged as pending. Set the env var to enable autonomous execution.",
      pending_action: { platform, advertiser_id, audience_list_id, domain_count: domains.length, rationale },
    };
  }

  async reallocateMediaBudget(
    platform: string,
    advertiser_id: string,
    source_campaign_id: string,
    target_campaign_id: string,
    amount_usd: number,
    rationale: string
  ): Promise<object> {
    const agentUrl = agentBaseUrl();
    if (agentUrl) {
      try {
        const res = await fetch(`${agentUrl}/action/reallocate-budget`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, advertiser_id, source_campaign_id, target_campaign_id, amount_usd, rationale }),
        });
        if (!res.ok) {
          return { executed: false, message: `Agent rejected budget reallocation: ${await agentErrorDetail(res)}` };
        }
        return res.json() as object;
      } catch (err) {
        return { executed: false, message: `Agent unreachable at ${agentUrl}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return {
      executed:      false,
      queued:        true,
      message:       "PAID_MEDIA_AGENT_URL not configured. Action logged as pending.",
      pending_action: { platform, source_campaign_id, target_campaign_id, amount_usd, rationale },
    };
  }

  async triggerAgentRun(
    agent: "watchdog" | "analyst" | "operator",
    reason: string
  ): Promise<{ triggered: boolean; job_id?: string; message: string }> {
    const agentUrl = agentBaseUrl();
    if (!agentUrl) {
      return {
        triggered: false,
        message: "PAID_MEDIA_AGENT_URL is not configured. Set this env var to the base URL of your deployed paid-media-agent service.",
      };
    }
    try {
      const res = await fetch(`${agentUrl}/run?agent=${agent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        return {
          triggered: false,
          message: `Agent trigger failed: ${await agentErrorDetail(res)}`,
        };
      }
      const body = await res.json() as { job_id?: string; result?: string };
      return {
        triggered: true,
        job_id: body.job_id,
        message: `${agent} agent triggered successfully.${body.job_id ? ` Job ID: ${body.job_id}` : ""}`,
      };
    } catch (err) {
      return {
        triggered: false,
        message: `Failed to reach agent service at ${agentUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
