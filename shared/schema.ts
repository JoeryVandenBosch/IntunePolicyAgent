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
}

export interface PolicySecurityImpact {
  rating: "Low" | "Medium" | "High" | "Critical";
  description: string;
  complianceFrameworks: string[];
}

export interface AssignmentGroup {
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
}

export interface PolicyRecommendation {
  type: string;
  title: string;
  detail: string;
}

export interface AnalysisResult {
  summaries: Record<string, PolicySummary>;
  endUserImpact: Record<string, PolicyEndUserImpact>;
  securityImpact: Record<string, PolicySecurityImpact>;
  assignments: Record<string, PolicyAssignments>;
  conflicts: PolicyConflict[];
  recommendations: PolicyRecommendation[];
}
