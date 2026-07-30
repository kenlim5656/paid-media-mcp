/**
 * Copyright 2026 @kenlim5656. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1)
 * Persistent Attribution Required. See /LICENSE and /NOTICE for terms.
 * Central Suite Repository: https://github.com/kenlim5656/paid-media-suite
 */
/**
 * CompositeAdapter
 *
 * Routes each data domain to a different underlying adapter. Use this when
 * your data is genuinely spread across multiple sources — for example:
 *
 *   - Campaign metadata and performance  → BigQuery (daily platform exports)
 *   - Audiences                          → Meta Marketing API (live)
 *   - Teams, attribution, measurement    → Local JSON files
 *
 * Every domain has a `default` fallback so you only need to specify the
 * domains that differ from your primary source.
 *
 * Example:
 *
 *   import { FileAdapter }     from "./file-adapter.js";
 *   import { BigQueryAdapter } from "./bigquery-adapter.js";
 *   import { CompositeAdapter } from "./composite-adapter.js";
 *
 *   const files = new FileAdapter("./data");
 *   const bq    = new BigQueryAdapter({ projectId: "my-project", dataset: "paid_media" });
 *
 *   const adapter = new CompositeAdapter({
 *     default:     files,   // JSON for all org knowledge
 *     campaigns:   bq,      // BQ for campaign metadata
 *     performance: bq,      // BQ for daily performance
 *   });
 */

import type {
  PaidMediaAdapter,
  CampaignFilters,
  PerformanceFilters,
} from "./base.js";
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
  PerformanceRecord,
  PixelTag,
  Platform,
  PlatformsConfig,
  AttributionConfiguration,
  ReportingTemplate,
  Team,
  TeamMember,
  Test,
  TestingProgram,
  TestStatus,
  TestType,
  ThirdPartyAudienceLayer,
} from "../types.js";

export interface CompositeAdapterConfig {
  /** Fallback adapter used for any domain not explicitly overridden */
  default: PaidMediaAdapter;
  /** Adapter for getMetadata */
  metadata?: PaidMediaAdapter;
  /** Adapter for getAccounts, getAccount */
  accounts?: PaidMediaAdapter;
  /** Adapter for getTeams, getTeam, getTeamByAccount, getTeamMembers, getTeamMember */
  teams?: PaidMediaAdapter;
  /** Adapter for getCampaigns, getCampaign */
  campaigns?: PaidMediaAdapter;
  /** Adapter for getPerformance, getBenchmarks */
  performance?: PaidMediaAdapter;
  /** Adapter for getAttributionConfigurations, getAttributionConfiguration */
  attribution?: PaidMediaAdapter;
  /** Adapter for getReportingTemplates, getReportingTemplate */
  reporting?: PaidMediaAdapter;
  /** Adapter for getAssetLibrary, getAssetCategories, getAssetCategory */
  assets?: PaidMediaAdapter;
  /** Adapter for getTestingProgram, getTests, getTest */
  testing?: PaidMediaAdapter;
  /** Adapter for getAudienceLibrary, getFirstPartyAudiences, getDataProviders, getThirdPartyLayers */
  audiences?: PaidMediaAdapter;
  /** Adapter for getMeasurementSetup, getPixelTags, getConversionAPIs */
  measurement?: PaidMediaAdapter;
  /** Adapter for getPlatformsConfig */
  platforms?: PaidMediaAdapter;
  /**
   * Adapter for reporting view methods: getCampaignPerformanceReport, getPacingReport,
   * getRoasComparison, getChannelEfficiency, getAdPerformance, getKeywordPerformance,
   * getDailyPerformance. Requires BigQuery — defaults to the primary adapter.
   */
  analytics_reporting?: PaidMediaAdapter;
  /**
   * Adapter for account-based analytics: getCompanyProfile, getTargetAccountFunnel,
   * getCompanySessions, getCompanyEngagement, getDarkFunnelCoverage, getTargetAccountActivity.
   * Requires BigQuery — defaults to the primary adapter.
   */
  account_analytics?: PaidMediaAdapter;
}

export class CompositeAdapter implements PaidMediaAdapter {
  private readonly cfg: CompositeAdapterConfig;

  constructor(config: CompositeAdapterConfig) {
    this.cfg = config;
  }

  private d(domain: keyof Omit<CompositeAdapterConfig, "default">): PaidMediaAdapter {
    return this.cfg[domain] ?? this.cfg.default;
  }

  // ── Metadata ───────────────────────────────────────────────────────────────

  getMetadata() { return this.d("metadata").getMetadata(); }

  // ── Accounts ───────────────────────────────────────────────────────────────

  getAccounts(team_id?: string): Promise<Account[]> {
    return this.d("accounts").getAccounts(team_id);
  }
  getAccount(id: string): Promise<Account | null> {
    return this.d("accounts").getAccount(id);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  getTeams(): Promise<Team[]> { return this.d("teams").getTeams(); }
  getTeam(id: string): Promise<Team | null> { return this.d("teams").getTeam(id); }
  getTeamByAccount(account_id: string): Promise<Team | null> {
    return this.d("teams").getTeamByAccount(account_id);
  }
  getTeamMembers(team_id?: string): Promise<TeamMember[]> {
    return this.d("teams").getTeamMembers(team_id);
  }
  getTeamMember(id: string): Promise<TeamMember | null> {
    return this.d("teams").getTeamMember(id);
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────

  getCampaigns(filters?: CampaignFilters): Promise<Campaign[]> {
    return this.d("campaigns").getCampaigns(filters);
  }
  getCampaign(id: string): Promise<Campaign | null> {
    return this.d("campaigns").getCampaign(id);
  }

  // ── Performance ────────────────────────────────────────────────────────────

  getPerformance(filters?: PerformanceFilters): Promise<PerformanceRecord[]> {
    return this.d("performance").getPerformance(filters);
  }
  getBenchmarks(platform?: Platform, objective?: CampaignObjective) {
    return this.d("performance").getBenchmarks(platform, objective);
  }

  // ── Attribution ────────────────────────────────────────────────────────────

  getAttributionConfigurations(): Promise<AttributionConfiguration[]> {
    return this.d("attribution").getAttributionConfigurations();
  }
  getAttributionConfiguration(id: string): Promise<AttributionConfiguration | null> {
    return this.d("attribution").getAttributionConfiguration(id);
  }

  // ── Reporting ──────────────────────────────────────────────────────────────

  getReportingTemplates(audience?: string): Promise<ReportingTemplate[]> {
    return this.d("reporting").getReportingTemplates(audience);
  }
  getReportingTemplate(id: string): Promise<ReportingTemplate | null> {
    return this.d("reporting").getReportingTemplate(id);
  }

  // ── Assets ─────────────────────────────────────────────────────────────────

  getAssetLibrary(): Promise<AssetLibrary> { return this.d("assets").getAssetLibrary(); }
  getAssetCategories(type?: AssetType): Promise<AssetCategory[]> {
    return this.d("assets").getAssetCategories(type);
  }
  getAssetCategory(id: string): Promise<AssetCategory | null> {
    return this.d("assets").getAssetCategory(id);
  }

  // ── Testing ────────────────────────────────────────────────────────────────

  getTestingProgram(): Promise<TestingProgram> { return this.d("testing").getTestingProgram(); }
  getTests(filters?: { status?: TestStatus; type?: TestType; team_id?: string; platform?: Platform }): Promise<Test[]> {
    return this.d("testing").getTests(filters);
  }
  getTest(id: string): Promise<Test | null> { return this.d("testing").getTest(id); }

  // ── Audiences ──────────────────────────────────────────────────────────────

  getAudienceLibrary(): Promise<AudienceLibrary> { return this.d("audiences").getAudienceLibrary(); }
  getFirstPartyAudiences(filters?: { business_unit?: string; platform?: Platform }): Promise<FirstPartyAudience[]> {
    return this.d("audiences").getFirstPartyAudiences(filters);
  }
  getDataProviders(status?: string): Promise<DataProvider[]> {
    return this.d("audiences").getDataProviders(status);
  }
  getThirdPartyLayers(filters?: { platform?: Platform; is_default?: boolean; is_best_performer?: boolean }): Promise<ThirdPartyAudienceLayer[]> {
    return this.d("audiences").getThirdPartyLayers(filters);
  }

  // ── Measurement ────────────────────────────────────────────────────────────

  getMeasurementSetup(): Promise<MeasurementSetup> { return this.d("measurement").getMeasurementSetup(); }
  getPixelTags(platform?: Platform): Promise<PixelTag[]> {
    return this.d("measurement").getPixelTags(platform);
  }
  getConversionAPIs(platform?: Platform): Promise<ConversionAPI[]> {
    return this.d("measurement").getConversionAPIs(platform);
  }

  // ── Platforms ──────────────────────────────────────────────────────────────

  getPlatformsConfig(): Promise<PlatformsConfig> { return this.d("platforms").getPlatformsConfig(); }

  // ── Identity ───────────────────────────────────────────────────────────────

  getIdentityNamespaces(category?: string) { return this.cfg.default.getIdentityNamespaces(category); }
  getIdentityNamespace(namespace_id: string) { return this.cfg.default.getIdentityNamespace(namespace_id); }

  // ── Attribution Results ────────────────────────────────────────────────────

  getLatestAttributionResults(conversion_type?: string) { return this.cfg.default.getLatestAttributionResults(conversion_type); }
  getAttributionRuns(limit?: number) { return this.cfg.default.getAttributionRuns(limit); }

  // ── Agent Outputs ──────────────────────────────────────────────────────────

  getWatchdogAlerts(status?: "open" | "acknowledged" | "resolved" | "suppressed") { return this.cfg.default.getWatchdogAlerts(status); }
  getAnalystInsights(filters?: { priority?: "high" | "medium" | "low"; status?: string; limit?: number }) { return this.cfg.default.getAnalystInsights(filters); }
  getOperatorPendingApprovals() { return this.cfg.default.getOperatorPendingApprovals(); }
  triggerAgentRun(agent: "watchdog" | "analyst" | "operator", reason: string) { return this.cfg.default.triggerAgentRun(agent, reason); }

  // ── Analytics & Data Governance ───────────────────────────────────────────
  queryAccountJourney(domain: string, days: number, type?: string) { return this.cfg.default.queryAccountJourney(domain, days, type); }
  getSignalCaptureRates(hours: number, platform?: string) { return this.cfg.default.getSignalCaptureRates(hours, platform); }
  getCrmNullFieldStats(hours: number) { return this.cfg.default.getCrmNullFieldStats(hours); }

  // ── Reporting Views ───────────────────────────────────────────────────────

  getCampaignPerformanceReport(filters?: Parameters<PaidMediaAdapter["getCampaignPerformanceReport"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getCampaignPerformanceReport(filters);
  }
  getPacingReport(filters?: Parameters<PaidMediaAdapter["getPacingReport"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getPacingReport(filters);
  }
  getRoasComparison(filters?: Parameters<PaidMediaAdapter["getRoasComparison"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getRoasComparison(filters);
  }
  getChannelEfficiency() {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getChannelEfficiency();
  }
  getAdPerformance(filters?: Parameters<PaidMediaAdapter["getAdPerformance"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getAdPerformance(filters);
  }
  getKeywordPerformance(filters?: Parameters<PaidMediaAdapter["getKeywordPerformance"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getKeywordPerformance(filters);
  }
  getDailyPerformance(filters?: Parameters<PaidMediaAdapter["getDailyPerformance"]>[0]) {
    return (this.cfg.analytics_reporting ?? this.cfg.default).getDailyPerformance(filters);
  }

  // ── Account-Based Analytics ───────────────────────────────────────────────

  getCompanyProfile(company_domain: string) {
    return (this.cfg.account_analytics ?? this.cfg.default).getCompanyProfile(company_domain);
  }
  getTargetAccountFunnel(filters?: Parameters<PaidMediaAdapter["getTargetAccountFunnel"]>[0]) {
    return (this.cfg.account_analytics ?? this.cfg.default).getTargetAccountFunnel(filters);
  }
  getCompanySessions(company_domain: string, lookback_days?: number) {
    return (this.cfg.account_analytics ?? this.cfg.default).getCompanySessions(company_domain, lookback_days);
  }
  getCompanyEngagement(company_domain: string, period_type?: string) {
    return (this.cfg.account_analytics ?? this.cfg.default).getCompanyEngagement(company_domain, period_type);
  }
  getDarkFunnelCoverage(filters?: Parameters<PaidMediaAdapter["getDarkFunnelCoverage"]>[0]) {
    return (this.cfg.account_analytics ?? this.cfg.default).getDarkFunnelCoverage(filters);
  }
  getTargetAccountActivity(company_domain: string, lookback_days?: number) {
    return (this.cfg.account_analytics ?? this.cfg.default).getTargetAccountActivity(company_domain, lookback_days);
  }

  // ── Interactive Media Actions ─────────────────────────────────────────────
  pushAudienceSuppression(platform: string, adv: string, list: string, domains: string[], rationale: string) {
    return this.cfg.default.pushAudienceSuppression(platform, adv, list, domains, rationale);
  }
  reallocateMediaBudget(platform: string, adv: string, src: string, tgt: string, amt: number, rationale: string) {
    return this.cfg.default.reallocateMediaBudget(platform, adv, src, tgt, amt, rationale);
  }
}
