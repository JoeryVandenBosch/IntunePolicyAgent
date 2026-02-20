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
}

export interface PolicySummary {
  overview: string;
  keySettings: number;
  lastModified: string;
  configuredSettings?: string[];
}

export interface PolicyEndUserImpact {
  severity: "Minimal" | "Low" | "Medium" | "High" | "Critical";
  description: string;
  workarounds?: string;
  policySettingsAndImpact?: string;
  assignmentScope?: string;
  riskAnalysis?: string;
  conflictAnalysis?: string;
  overallSummary?: string;
}

export interface PolicySecurityImpact {
  rating: "Low" | "Medium" | "High" | "Critical";
  description: string;
  complianceFrameworks: string[];
  policySettingsAndSecurityImpact?: string;
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

export interface AnalysisResult {
  summaries: Record<string, PolicySummary>;
  endUserImpact: Record<string, PolicyEndUserImpact>;
  securityImpact: Record<string, PolicySecurityImpact>;
  assignments: Record<string, PolicyAssignments>;
  settingConflicts: SettingConflict[];
  allSettings: SettingComparison[];
  conflicts: PolicyConflict[];
  recommendations: PolicyRecommendation[];
}
