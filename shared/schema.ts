import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  tenantId: text("tenant_id"),
  userEmail: text("user_email"),
  policyCount: integer("policy_count"),
  policyTypes: text("policy_types"),
  platforms: text("platforms"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({ id: true, createdAt: true });
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

export interface IntunePolicy {
  id: string;
  name: string;
  type: string;
  platform: string;
  lastModified: string;
  settingsCount: number;
  description?: string;
  source?: string;
  odataType?: string;
  templateId?: string;
}

export interface PolicySummarySettingGroup {
  groupName: string;  // Thematic group label (e.g. "Bluetooth advertising, discoverability, and pre-pairing")
  summary: string;    // One sentence describing all settings in this group and their values
}

export interface PolicySummaryTopSetting {
  name: string;   // Human-readable setting name
  value: string;  // Configured value
  impact: string; // One sentence on why this setting matters
}

export interface PolicySummary {
  // Core fields (always present)
  overview: string;
  keySettings: number;
  lastModified: string;

  // Security Copilot-style structured fields
  headline?: string;                          // One-sentence policy purpose chip
  introParagraph?: string;                    // Plain-language intro paragraph
  settingGroups?: PolicySummarySettingGroup[]; // Numbered thematic groups
  topSettings?: PolicySummaryTopSetting[];    // Top N most important settings ranked by impact
  assignmentScope?: string;                   // Who is targeted (plain language)
  overallSummary?: string;                    // Closing verdict paragraph
  footerNote?: string;                        // Footnote about additional settings
}

export interface EndUserSettingDetail {
  settingName: string;
  technicalName: string;
  settingValue: string;
  impactLevel: "Minimal" | "Low" | "Medium" | "High" | "Critical";
  userExperience: string;
  workaround: string | null;
}

export interface PolicyEndUserImpact {
  severity: "Minimal" | "Low" | "Medium" | "High" | "Critical";
  description: string;
  workarounds?: string;
  policySettingsAndImpact?: string;
  settings?: EndUserSettingDetail[] | null;
  assignmentScope?: string;
  riskAnalysis?: string;
  conflictAnalysis?: string;
  overallSummary?: string;
}

export interface SecuritySettingDetail {
  settingName: string;
  settingValue: string;
  securityRating: "Critical" | "High" | "Medium" | "Low";
  detail: string;
  frameworks: string[];
  recommendation: string;
}

export interface PolicySecurityImpact {
  rating: "Low" | "Medium" | "High" | "Critical";
  description: string;
  complianceFrameworks: string[];
  policySettingsAndSecurityImpact?: string;
  settings?: SecuritySettingDetail[] | null;
  assignmentScope?: string;
  riskAnalysis?: string;
  conflictAnalysis?: string;
  overallSummary?: string;
}

export interface AssignmentGroup {
  id: string;
  name: string;
  type: string;
  memberCount: number;
}

export interface AssignmentFilter {
  name: string;
  mode: "Include" | "Exclude";
}

export interface PolicyAssignments {
  included: AssignmentGroup[];
  excluded: AssignmentGroup[];
  filters: AssignmentFilter[];
  isUnassigned?: boolean;
}

export interface PolicyConflict {
  type: string;
  severity: "Info" | "Warning" | "Critical";
  policies: string[];
  detail: string;
  recommendation: string;
  conflictingSettings?: string;
  assignmentOverlap?: string;
  impactAssessment?: string;
  resolutionSteps?: string;
}

export interface PolicyRecommendation {
  type: string;
  title: string;
  detail: string;
}

export interface SettingConflict {
  settingName: string;
  settingDefinitionId: string;
  sourcePolicies: {
    policyId: string;
    policyName: string;
    value: string;
    intuneUrl: string;
  }[];
}

export interface SettingComparison {
  settingName: string;
  settingDefinitionId: string;
  isConflict: boolean;
  policyValues: {
    policyId: string;
    policyName: string;
    value: string;
    intuneUrl: string;
  }[];
}

// ── Compliance types (Phase 2: CIS Benchmark → ISO 27001 mapping) ──────────

export interface ComplianceIsoMapping {
  isoControl: string;
  isoTitle: string | null;
  relationship: string | null;
}

export interface ComplianceCisControl {
  control: string;
  title: string;
  version: string;
  ig1: boolean;
  ig2: boolean;
  ig3: boolean;
}

export interface ComplianceBenchmarkMatch {
  platform: string;
  recommendationId: string;
  title: string;
  level: "L1" | "L2";
  type: "Automated" | "Manual";
  confidence: number;
  cisControls: ComplianceCisControl[];
  isoMappings: ComplianceIsoMapping[];
  implementationGroups: string[];
}

export interface ComplianceLookupResult {
  settingName: string;
  platform: string;
  matches: ComplianceBenchmarkMatch[];
  allCisControls: string[];
  allIsoControls: string[];
  highestLevel: "L1" | "L2" | null;
  implementationGroups: string[];
  complianceScore: number;
}

export interface PolicyComplianceSummary {
  coveredSettings: number;
  totalSettings: number;
  coveragePercent: number;
  allCisControls: string[];
  allIsoControls: string[];
  implementationGroups: string[];
  l1Count: number;
  l2Count: number;
}

export interface PolicyComplianceData {
  settings: Array<SecuritySettingDetail & { compliance: ComplianceLookupResult | null }>;
  summary: PolicyComplianceSummary;
}

export interface AnalysisResult {
  summaries: Record<string, PolicySummary>;
  endUserImpact: Record<string, PolicyEndUserImpact>;
  securityImpact: Record<string, PolicySecurityImpact>;
  assignments: Record<string, PolicyAssignments>;
  settingConflicts: SettingConflict[];
  allSettings: SettingComparison[];
  conflicts: PolicyConflict[];
  recommendations: PolicyRecommendation[];
  unassignedCount?: number;
  compliance?: Record<string, PolicyComplianceData>;
}
