import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { IntunePolicy, AnalysisResult } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shield, FileText, Users, ShieldAlert, AlertTriangle, Lightbulb, ArrowLeft, Download, ChevronDown, ChevronRight, Loader2, BookOpen, Target, LogOut, ExternalLink, User, Monitor, Sun, Moon, Square, FileDown, AlertCircle, ChevronsUpDown, Info } from "lucide-react";
import PdfBrandingDialog, { type PdfBrandingSettings } from "@/components/pdf-branding-dialog";
import SettingCardGrid from "@/components/setting-card-grid";
import EndUserImpactCards from "@/components/enduser-impact-cards";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";

function stripSourcePrefix(name: string): string {
  return name.replace(/^(?:DeviceConfigurations|ConfigurationPolicies|DeviceCompliancePolicies|Intents|deviceManagementConfigurationPolicy|device_vendor_msft|user_vendor_msft|vendor_msft)[/\\.\\\\]/i, "");
}

function parseSettingLine(line: string): { name: string; value: string; detail: string } | null {
  const settingMatch = line.match(/^[-•*]?\s*([\w/.>: ]+(?:\[.*?\])?)\s*[:]\s*(.+)/);
  const emDashMatch = !settingMatch ? line.match(/^[-•*]?\s*([\w/.>: ]+(?:\[.*?\])?)\s*[—–]\s*(.+)/) : null;
  const match = settingMatch || emDashMatch;
  if (!match) return null;

  let name = stripSourcePrefix(match[1].trim());
  const rest = match[2];
  const dashSplit = rest.split(/\s+[—–]\s+/);
  if (dashSplit.length >= 2) {
    return { name, value: dashSplit[0].trim(), detail: dashSplit.slice(1).join(" — ").trim() };
  }
  const semiSplit = rest.split(/;\s*(?:security impact|end-user impact|impact|note|user impact)\s*:\s*/i);
  return { name, value: semiSplit[0]?.trim() || "", detail: semiSplit.slice(1).join("; ").trim() };
}

function FormattedSettingsBlock({ text }: { text: string }) {
  let lines = text.split(/\n/).filter(l => l.trim());

  if (lines.length <= 2) {
    const inlinePattern = /(?:^|(?:\.\s+))([A-Z][\w]+(?:[A-Z][\w]*)+)\s*:\s*([^.]+(?:\.[^A-Z][^.]*)*)/g;
    const inlineItems: { name: string; value: string; detail: string }[] = [];
    let m;
    while ((m = inlinePattern.exec(text)) !== null) {
      const name = stripSourcePrefix(m[1].trim());
      const rest = m[2].trim();
      const dashSplit = rest.split(/\s+[—–]\s+/);
      if (dashSplit.length >= 2) {
        inlineItems.push({ name, value: dashSplit[0].trim(), detail: dashSplit.slice(1).join(" — ").trim() });
      } else {
        inlineItems.push({ name, value: rest, detail: "" });
      }
    }
    if (inlineItems.length >= 3) {
      return (
        <div className="space-y-1">
          {inlineItems.map((item, idx) => (
            <div key={idx} className="rounded-md bg-muted/30 border border-border/30 px-3 py-1.5 text-xs">
              <div className="flex flex-wrap gap-x-2">
                <span className="text-foreground font-medium break-all">{item.name}:</span>
                <span className="text-muted-foreground">{item.value}</span>
              </div>
              {item.detail && (
                <p className="text-muted-foreground/80 mt-0.5 text-[11px] italic">{item.detail}</p>
              )}
            </div>
          ))}
        </div>
      );
    }
    return <p className="whitespace-pre-line">{text}</p>;
  }

  const items: { name: string; value: string; detail: string }[] = [];
  const plainLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseSettingLine(trimmed);
    if (parsed) {
      items.push(parsed);
    } else {
      plainLines.push(trimmed);
    }
  }

  if (items.length === 0) {
    return <p className="whitespace-pre-line">{text}</p>;
  }

  return (
    <div className="space-y-1.5">
      {plainLines.length > 0 && (
        <p className="mb-2">{plainLines.join(". ")}</p>
      )}
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-md bg-muted/30 border border-border/30 px-3 py-1.5 text-xs">
            <div className="flex flex-wrap gap-x-2">
              <span className="text-foreground font-medium break-all">{item.name}:</span>
              <span className="text-muted-foreground">{item.value}</span>
            </div>
            {item.detail && (
              <p className="text-muted-foreground/80 mt-0.5 text-[11px] italic">{item.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  "Minimal": "bg-emerald-500/20 text-emerald-400",
  "Low": "bg-yellow-500/20 text-yellow-400",
  "Medium": "bg-orange-500/20 text-orange-400",
  "High": "bg-red-500/20 text-red-400",
  "Critical": "bg-red-700/20 text-red-500",
};

const CONFLICT_SEVERITY_COLORS: Record<string, string> = {
  "Info": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Warning": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Critical": "bg-red-500/20 text-red-400 border-red-500/30",
};

const PLATFORM_COLORS: Record<string, string> = {
  "Windows": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "iOS/iPadOS": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "macOS": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "Android Enterprise": "bg-green-500/20 text-green-400 border-green-500/30",
  "Android": "bg-green-500/20 text-green-400 border-green-500/30",
};

function GroupMemberList({ groupId, groupName, memberCount }: { groupId: string; groupName: string; memberCount: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!isOpen && members === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/groups/${groupId}/members`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMembers(data.members || []);
        } else {
          setMembers([]);
        }
      } catch {
        setMembers([]);
      }
      setLoading(false);
    }
    setIsOpen(!isOpen);
  };

  const isSystemGroup = groupId === "all-devices" || groupId === "all-users";
  if (isSystemGroup) {
    return <span className="text-xs text-muted-foreground">All targeted</span>;
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleToggle}
        className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
        data-testid={`btn-expand-members-${groupId}`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {memberCount} {memberCount === 1 ? "member" : "members"}
      </button>
      {isOpen && members && (
        <div className="mt-2 w-full max-h-48 overflow-y-auto rounded border border-border/20 bg-background/50">
          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No members found</p>
          ) : (
            members.map((m, idx) => (
              <div key={m.id || idx} className="flex items-center gap-2 px-2 py-1.5 border-b border-border/10 last:border-0" data-testid={`member-row-${m.id}`}>
                {m.type === "device" ? (
                  <Monitor className="w-3 h-3 text-blue-400 shrink-0" />
                ) : (
                  <User className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
                <span className="text-xs text-foreground truncate">{m.displayName}</span>
                {m.upn && <span className="text-[10px] text-muted-foreground truncate ml-auto">{m.upn}</span>}
                {m.os && <span className="text-[10px] text-muted-foreground ml-auto">{m.os}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-4 rounded-md bg-card border border-border/30 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PolicySection({ policy, children, isUnassigned, forceOpen }: { policy: IntunePolicy; children: React.ReactNode; isUnassigned?: boolean; forceOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const platformColor = PLATFORM_COLORS[policy.platform] || "bg-muted text-muted-foreground";

  useEffect(() => {
    if (forceOpen !== undefined) setIsOpen(forceOpen);
  }, [forceOpen]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border/30 rounded-md">
      <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 text-left" data-testid={`trigger-policy-${policy.id}`}>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        <div className="flex flex-col">
          <span className="font-medium text-foreground text-sm">{policy.name}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{policy.id}</span>
        </div>
        <Badge variant="outline" className={`text-xs border ${platformColor}`}>{policy.platform}</Badge>
        {isUnassigned && (
          <Badge variant="outline" className="text-[10px] border border-amber-500/30 bg-amber-500/10 text-amber-500">
            Cleanup Candidate
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExpandCollapseBar({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-expand-collapse-all"
      >
        <ChevronsUpDown className="w-3.5 h-3.5" />
        {expanded ? "Collapse All" : "Expand All"}
      </button>
    </div>
  );
}

const ENDUSER_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Critical": "Fundamentally changes how users work. Blocks access to key features or requires major workflow changes.",
  "High": "Noticeably disrupts daily workflow. Users will need to adapt their habits or learn new processes.",
  "Medium": "Moderate friction. Users will notice the change but can adapt quickly with minimal disruption.",
  "Low": "Minor inconvenience. Most users won't notice or will adapt immediately.",
  "Minimal": "No perceptible impact on daily work. Runs silently in the background.",
};

const SECURITY_LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Critical": "Directly prevents data breaches, unauthorized access, or compliance violations. Disabling creates immediate, severe risk.",
  "High": "Significantly strengthens security posture. Weakening it would leave a notable gap attackers could exploit.",
  "Medium": "Contributes to defense-in-depth. Important but not the last line of defense — other controls may partially compensate.",
  "Low": "Best practice or hardening measure. Useful but has minimal direct security impact on its own.",
};

function SeverityTooltip({ level, descriptions }: { level: string; descriptions: Record<string, string> }) {
  const [show, setShow] = useState(false);
  const desc = descriptions[level];
  if (!desc) return null;
  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setShow(!show)}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        data-testid="button-severity-tooltip"
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 bg-card border border-border/30 rounded-lg p-2.5 w-[280px] shadow-xl">
          <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-card border-r border-b border-border/30 rotate-45" />
          <span className="text-xs text-muted-foreground leading-snug">
            <strong className="text-foreground">{level}</strong> — {desc}
          </span>
        </div>
      )}
    </div>
  );
}

function getSelectedPolicies(queryClientInstance: ReturnType<typeof useQueryClient>): IntunePolicy[] | undefined {
  let policies = queryClientInstance.getQueryData<IntunePolicy[]>(["selectedPolicies"]);
  if (!policies) {
    try {
      const stored = sessionStorage.getItem("selectedPolicies");
      if (stored) {
        policies = JSON.parse(stored);
        if (policies) queryClientInstance.setQueryData(["selectedPolicies"], policies);
      }
    } catch {}
  }
  return policies;
}

export default function AnalysisPage() {
  const [, setLocation] = useLocation();
  const { auth, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const queryClientInstance = useQueryClient();
  const selectedPolicies = getSelectedPolicies(queryClientInstance);

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [enduserExpanded, setEnduserExpanded] = useState(false);
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [summaryForce, setSummaryForce] = useState<boolean | undefined>(undefined);
  const [enduserForce, setEnduserForce] = useState<boolean | undefined>(undefined);
  const [securityForce, setSecurityForce] = useState<boolean | undefined>(undefined);

  const [analysisRunId] = useState(() => Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const policyIdKey = selectedPolicies ? selectedPolicies.map(p => p.id).sort().join(",") : "";
  const { data: analysis, isLoading, error } = useQuery<AnalysisResult>({
    queryKey: ["/api/analyze", policyIdKey, analysisRunId],
    queryFn: async ({ signal }) => {
      if (!selectedPolicies || selectedPolicies.length === 0) throw new Error("No policies selected");
      const controller = new AbortController();
      abortControllerRef.current = controller;
      signal?.addEventListener("abort", () => controller.abort());
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyIds: selectedPolicies.map(p => p.id) }),
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: "Analysis failed" }));
        throw new Error(errBody.message || "Analysis failed");
      }
      return res.json();
    },
    enabled: !!selectedPolicies && selectedPolicies.length > 0,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const handleStopAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setWasCancelled(true);
    queryClientInstance.cancelQueries({ queryKey: ["/api/analyze"] });
    queryClientInstance.removeQueries({ queryKey: ["/api/analyze"] });
    setLocation("/policies");
  }, [queryClientInstance, setLocation]);

  useEffect(() => {
    if (!selectedPolicies || selectedPolicies.length === 0) {
      setLocation("/policies");
    }
  }, [selectedPolicies, setLocation]);

  if (!selectedPolicies || selectedPolicies.length === 0) return null;

  const totalSettings = selectedPolicies.reduce((sum, p) => sum + Math.max(0, p.settingsCount), 0);
  const settingConflictCount = analysis?.settingConflicts?.length || 0;
  const aiConflictCount = analysis?.conflicts?.length || 0;
  const conflictCount = settingConflictCount + aiConflictCount;
  const recCount = analysis?.recommendations?.length || 0;

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const handleExport = async (format: "html" | "csv") => {
    try {
      const res = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ policies: selectedPolicies, analysis }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intune-analysis.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`${format} export error:`, err);
    }
  };

  const handlePdfExport = async (settings: PdfBrandingSettings) => {
    setPdfExporting(true);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ policies: selectedPolicies, analysis, branding: settings }),
      });
      if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${settings.documentTitle || "intune-analysis"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfDialogOpen(false);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">Intune Policy Intelligence Agent</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Powered by IntuneStuff</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-toggle-theme-analysis" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("html")} data-testid="button-export-html" disabled={!analysis}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              HTML
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("csv")} data-testid="button-export-csv" disabled={!analysis}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              CSV
            </Button>
            <Button variant="secondary" size="sm" disabled={!analysis} onClick={() => setPdfDialogOpen(true)} data-testid="button-export-pdf">
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>
            <PdfBrandingDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} onExport={handlePdfExport} exporting={pdfExporting} />
            <Button variant="ghost" size="sm" onClick={() => { queryClientInstance.removeQueries({ predicate: (q) => q.queryKey[0] === "/api/analyze" }); setLocation("/policies"); }} data-testid="button-new-analysis">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              New Analysis
            </Button>
            {auth?.user?.displayName && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{auth.user.displayName}</span>
            )}
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing with IntuneStuff magic...</p>
            <p className="text-xs text-muted-foreground/70">This may take a moment depending on the number of policies</p>
            <Button variant="destructive" size="sm" onClick={handleStopAnalysis} data-testid="button-stop-analysis" className="mt-4">
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop Analysis
            </Button>
          </div>
        ) : error ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-destructive text-sm" data-testid="text-analysis-error">Analysis failed: {(error as Error).message}</p>
            <Button variant="secondary" size="sm" onClick={() => { queryClientInstance.removeQueries({ predicate: (q) => q.queryKey[0] === "/api/analyze" }); setLocation("/policies"); }}>Go Back</Button>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Policies Analyzed" value={selectedPolicies.length} color="text-primary" />
              <StatCard label="Total Settings" value={totalSettings} color="text-primary" />
              <StatCard label="Conflicting Settings" value={settingConflictCount} color={settingConflictCount > 0 ? "text-orange-400" : "text-emerald-400"} />
              <StatCard label="Recommendations" value={recCount} color="text-chart-4" />
            </div>

            {/* Unassigned policy banner (#15) */}
            {analysis.unassignedCount != null && analysis.unassignedCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3" data-testid="banner-unassigned">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="text-amber-500 font-medium">
                    {analysis.unassignedCount} of {selectedPolicies.length} analyzed {analysis.unassignedCount === 1 ? "policy is" : "policies are"} unassigned
                  </span>
                  <span className="text-muted-foreground">
                    {" "}— These policies have no group assignments and are not actively enforced. Consider assigning them or removing them to reduce policy clutter.
                  </span>
                </div>
              </div>
            )}

            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="bg-card border border-border/40 p-1 h-auto flex-wrap">
                <TabsTrigger value="summary" data-testid="tab-summary" className="gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" /> Summary
                </TabsTrigger>
                <TabsTrigger value="enduser" data-testid="tab-enduser" className="gap-1.5 text-xs">
                  <Users className="w-3.5 h-3.5" /> End-User Impact
                </TabsTrigger>
                <TabsTrigger value="security" data-testid="tab-security" className="gap-1.5 text-xs">
                  <ShieldAlert className="w-3.5 h-3.5" /> Security Impact
                </TabsTrigger>
                <TabsTrigger value="assignments" data-testid="tab-assignments" className="gap-1.5 text-xs">
                  <Target className="w-3.5 h-3.5" /> Assignments & Filters
                </TabsTrigger>
                <TabsTrigger value="conflicts" data-testid="tab-conflicts" className="gap-1.5 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5" /> Conflicts ({settingConflictCount})
                </TabsTrigger>
                <TabsTrigger value="recommendations" data-testid="tab-recommendations" className="gap-1.5 text-xs">
                  <Lightbulb className="w-3.5 h-3.5" /> Recommendations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-3">
                <ExpandCollapseBar expanded={summaryExpanded} onToggle={() => { const next = !summaryExpanded; setSummaryExpanded(next); setSummaryForce(next); }} />
                {selectedPolicies.map(policy => {
                  const overview = analysis.summaries[policy.id]?.overview || "No summary available.";
                  return (
                    <PolicySection key={policy.id} policy={policy} isUnassigned={analysis.assignments[policy.id]?.isUnassigned} forceOpen={summaryForce}>
                      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                        <div className="bg-muted/30 rounded-md p-3 text-xs space-y-0.5 border border-border/40">
                          <div><span className="text-foreground font-medium">Policy name:</span> {policy.name} ({policy.id})</div>
                          <div><span className="text-foreground font-medium">Type:</span> {policy.type}</div>
                          <div><span className="text-foreground font-medium">Platform:</span> {policy.platform}</div>
                          <div><span className="text-foreground font-medium">Last Modified:</span> {policy.lastModified}</div>
                          {policy.description && (
                            <div><span className="text-foreground font-medium">Description:</span> {policy.description}</div>
                          )}
                        </div>
                        <div className="whitespace-pre-line">
                          {overview.split(/\n\n+/).map((paragraph, idx) => {
                            const isHeader = /^(Key Configured Settings?:|Most Important Settings?:|Configured Settings?:|Assignment Scope Summary?:|Assignment Scope:|Overall Summary:|Summary:)/i.test(paragraph.trim());
                            if (isHeader) {
                              const colonIdx = paragraph.indexOf(":");
                              const header = paragraph.substring(0, colonIdx).trim();
                              const rest = paragraph.substring(colonIdx + 1).trim();
                              return (
                                <div key={idx}>
                                  <h4 className="text-xs font-semibold text-foreground mt-2 mb-1">{header}:</h4>
                                  {rest && <p>{rest}</p>}
                                </div>
                              );
                            }
                            return <p key={idx}>{paragraph}</p>;
                          })}
                        </div>
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="enduser" className="space-y-3">
                <ExpandCollapseBar expanded={enduserExpanded} onToggle={() => { const next = !enduserExpanded; setEnduserExpanded(next); setEnduserForce(next); }} />
                {selectedPolicies.map(policy => {
                  const impact = analysis.endUserImpact[policy.id];
                  if (!impact) return null;
                  const severityColor = SEVERITY_COLORS[impact.severity] || SEVERITY_COLORS["Minimal"];
                  const hasSettingsArray = impact.settings && Array.isArray(impact.settings) && impact.settings.length > 0;
                  const hasStructuredData = impact.policySettingsAndImpact || impact.assignmentScope || impact.riskAnalysis || impact.overallSummary;
                  return (
                    <PolicySection key={policy.id} policy={policy} isUnassigned={analysis.assignments[policy.id]?.isUnassigned} forceOpen={enduserForce}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge className={`text-xs ${severityColor}`}>{impact.severity}</Badge>
                          <SeverityTooltip level={impact.severity} descriptions={ENDUSER_LEVEL_DESCRIPTIONS} />
                          <span className="text-xs text-muted-foreground">impact level</span>
                        </div>

                        {/* Per-setting structured cards (Sprint 1 #14) */}
                        {hasSettingsArray && (
                          <div className="mb-4">
                            <h4 className="text-xs font-bold text-foreground mb-2">Settings Impact on End-Users:</h4>
                            <EndUserImpactCards settings={impact.settings!} />
                          </div>
                        )}

                        {/* Fallback: old text-based sections */}
                        {!hasSettingsArray && hasStructuredData ? (
                          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                            {impact.policySettingsAndImpact && (
                              <div>
                                <h4 className="text-xs font-bold text-foreground mb-1.5">Policy Settings and Impact on End-Users:</h4>
                                <FormattedSettingsBlock text={impact.policySettingsAndImpact} />
                              </div>
                            )}
                          </div>
                        ) : !hasSettingsArray ? (
                          <p className="text-sm text-muted-foreground leading-relaxed">{impact.description}</p>
                        ) : null}

                        {/* These sections always render when available */}
                        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                          {impact.assignmentScope && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Assignment Scope:</h4>
                              <p className="whitespace-pre-line">{impact.assignmentScope}</p>
                            </div>
                          )}
                          {impact.riskAnalysis && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Risk Analysis:</h4>
                              <p className="whitespace-pre-line">{impact.riskAnalysis}</p>
                            </div>
                          )}
                          {impact.overallSummary && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Overall Summary:</h4>
                              <p className="whitespace-pre-line">{impact.overallSummary}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="security" className="space-y-3">
                <ExpandCollapseBar expanded={securityExpanded} onToggle={() => { const next = !securityExpanded; setSecurityExpanded(next); setSecurityForce(next); }} />
                {selectedPolicies.map(policy => {
                  const impact = analysis.securityImpact[policy.id];
                  if (!impact) return null;
                  const ratingColor = SEVERITY_COLORS[impact.rating] || SEVERITY_COLORS["Medium"];
                  const hasSettingsArray = impact.settings && Array.isArray(impact.settings) && impact.settings.length > 0;
                  const hasStructuredData = impact.policySettingsAndSecurityImpact || impact.assignmentScope || impact.riskAnalysis || impact.overallSummary;
                  return (
                    <PolicySection key={policy.id} policy={policy} isUnassigned={analysis.assignments[policy.id]?.isUnassigned} forceOpen={securityForce}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Badge className={`text-xs ${ratingColor}`}>{impact.rating}</Badge>
                          <SeverityTooltip level={impact.rating} descriptions={SECURITY_LEVEL_DESCRIPTIONS} />
                          <span className="text-xs text-muted-foreground">security rating</span>
                        </div>

                        {/* Per-setting structured cards (Sprint 1 #13) */}
                        {hasSettingsArray && (
                          <div className="mb-4">
                            <h4 className="text-xs font-bold text-foreground mb-2">Security Impact per Setting:</h4>
                            <SettingCardGrid settings={impact.settings!} />
                          </div>
                        )}

                        {/* Fallback: old text-based sections */}
                        {!hasSettingsArray && hasStructuredData ? (
                          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                            {impact.policySettingsAndSecurityImpact && (
                              <div>
                                <h4 className="text-xs font-bold text-foreground mb-1.5">Policy Settings and Security Impact:</h4>
                                <FormattedSettingsBlock text={impact.policySettingsAndSecurityImpact} />
                              </div>
                            )}
                          </div>
                        ) : !hasSettingsArray ? (
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground leading-relaxed">{impact.description}</p>
                          </div>
                        ) : null}

                        {/* These sections always render when available */}
                        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                          {impact.assignmentScope && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Assignment Scope:</h4>
                              <p className="whitespace-pre-line">{impact.assignmentScope}</p>
                            </div>
                          )}
                          {impact.riskAnalysis && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Risk Analysis:</h4>
                              <p className="whitespace-pre-line">{impact.riskAnalysis}</p>
                            </div>
                          )}
                          {impact.overallSummary && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Overall Summary:</h4>
                              <p className="whitespace-pre-line">{impact.overallSummary}</p>
                            </div>
                          )}
                          {impact.complianceFrameworks?.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-1.5">Compliance Frameworks:</h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                                {impact.complianceFrameworks.map(fw => (
                                  <Badge key={fw} variant="outline" className="text-xs">{fw}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="assignments" className="space-y-3">
                {selectedPolicies.map(policy => {
                  const assign = analysis.assignments[policy.id];
                  if (!assign) return null;
                  return (
                    <PolicySection key={policy.id} policy={policy} isUnassigned={analysis.assignments[policy.id]?.isUnassigned}>
                      <div className="space-y-4">
                        {assign.included.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" /> Included Groups
                            </h4>
                            {assign.included.map((g, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-card/50 border border-border/20">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{g.name}</span>
                                  <span className="text-xs text-muted-foreground">{g.type}</span>
                                </div>
                                <GroupMemberList groupId={g.id} groupName={g.name} memberCount={g.memberCount} />
                              </div>
                            ))}
                          </div>
                        )}
                        {assign.excluded.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                              <span className="text-red-400">X</span> Excluded Groups
                            </h4>
                            {assign.excluded.map((g, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded bg-card/50 border border-border/20">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{g.name}</span>
                                  <span className="text-xs text-muted-foreground">{g.type}</span>
                                </div>
                                <GroupMemberList groupId={g.id} groupName={g.name} memberCount={g.memberCount} />
                              </div>
                            ))}
                          </div>
                        )}
                        {assign.filters.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5" /> Assignment Filters
                            </h4>
                            <div className="flex items-center gap-2 flex-wrap">
                              {assign.filters.map((f, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-xs">{f.name}</Badge>
                                  <Badge className={`text-xs ${f.mode === "Include" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                    {f.mode}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {assign.included.length === 0 && assign.excluded.length === 0 && assign.filters.length === 0 && (
                          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-1">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-400" />
                              <span className="text-sm font-medium text-yellow-400">Unassigned Policy</span>
                            </div>
                            <p className="text-xs text-muted-foreground pl-6">
                              This policy has no group assignments or filters configured. Unassigned policies have no effect on devices or users and may be candidates for cleanup or intentional staging.
                            </p>
                          </div>
                        )}
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="conflicts" className="space-y-6">
                {/* Setting-Level Conflicts grouped by policy */}
                {(analysis.settingConflicts?.length || 0) > 0 && (() => {
                  const policyConflictMap = new Map<string, { policyName: string; intuneUrl: string; settings: Map<string, { settingName: string; myValue: string; others: { policyName: string; value: string; intuneUrl: string }[] }> }>();
                  for (const sc of analysis.settingConflicts) {
                    for (const sp of sc.sourcePolicies) {
                      if (!policyConflictMap.has(sp.policyId)) {
                        policyConflictMap.set(sp.policyId, { policyName: sp.policyName, intuneUrl: sp.intuneUrl, settings: new Map() });
                      }
                      const entry = policyConflictMap.get(sp.policyId)!;
                      if (!entry.settings.has(sc.settingDefinitionId)) {
                        entry.settings.set(sc.settingDefinitionId, {
                          settingName: sc.settingName,
                          myValue: sp.value,
                          others: sc.sourcePolicies.filter(o => o.policyId !== sp.policyId).map(o => ({ policyName: o.policyName, value: o.value, intuneUrl: o.intuneUrl })),
                        });
                      }
                    }
                  }
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <h3 className="text-sm font-semibold text-foreground">Setting Conflicts ({analysis.settingConflicts.length})</h3>
                        <p className="text-xs text-muted-foreground ml-auto">Settings configured with different values across policies</p>
                      </div>
                      {Array.from(policyConflictMap.entries()).map(([policyId, policyData]) => (
                        <Card key={policyId} className="border-border/30 border-l-2 border-l-orange-500/50" data-testid={`card-policy-conflicts-${policyId}`}>
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <a
                                href={policyData.intuneUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-foreground hover:text-primary flex items-center gap-1.5"
                              >
                                {policyData.policyName}
                                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              </a>
                              <Badge variant="outline" className="text-xs border bg-orange-500/20 text-orange-400 border-orange-500/30">
                                {policyData.settings.size} conflicting setting{policyData.settings.size !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {Array.from(policyData.settings.entries()).map(([defId, setting]) => (
                                <div key={defId} className="rounded bg-card/50 border border-border/20 p-3 space-y-2" data-testid={`conflict-detail-${policyId}-${defId}`}>
                                  <div className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                    <span className="text-sm font-medium text-orange-400">{setting.settingName}</span>
                                  </div>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground">This policy:</span>
                                      <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">{setting.myValue}</Badge>
                                    </div>
                                    {setting.others.map((other, oi) => (
                                      <div key={oi} className="flex items-center gap-2 flex-wrap">
                                        <span className="text-muted-foreground">Conflicts with</span>
                                        <a
                                          href={other.intuneUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                          {other.policyName}
                                          <ExternalLink className="w-3 h-3 shrink-0" />
                                        </a>
                                        <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">{other.value}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                })()}

                {/* AI-Powered Conflict Analysis */}
                {analysis.conflicts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">AI Conflict Analysis ({analysis.conflicts.length})</h3>
                    </div>
                    {analysis.conflicts.map((conflict, i) => {
                      const color = CONFLICT_SEVERITY_COLORS[conflict.severity] || CONFLICT_SEVERITY_COLORS["Info"];
                      const severityBorderColor = conflict.severity === "Critical" ? "border-l-red-500/50" : conflict.severity === "Warning" ? "border-l-orange-500/50" : "border-l-blue-500/50";
                      const hasStructuredData = conflict.conflictingSettings || conflict.assignmentOverlap || conflict.impactAssessment || conflict.resolutionSteps;
                      return (
                        <Card key={i} className={`border-border/30 border-l-2 ${severityBorderColor}`} data-testid={`card-conflict-${i}`}>
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <AlertTriangle className={`w-4 h-4 ${conflict.severity === "Critical" ? "text-red-400" : conflict.severity === "Warning" ? "text-orange-400" : "text-blue-400"}`} />
                              <span className={`text-sm font-medium ${conflict.severity === "Critical" ? "text-red-400" : conflict.severity === "Warning" ? "text-orange-400" : "text-blue-400"}`}>{conflict.type}</span>
                              <Badge variant="outline" className={`text-xs border ${color}`}>{conflict.severity}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{conflict.detail}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-medium">Policies:</span>
                              {conflict.policies.map((p, j) => (
                                <Badge key={j} variant="outline" className="text-xs">{p}</Badge>
                              ))}
                            </div>
                            {hasStructuredData ? (
                              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed pt-2 border-t border-border/20">
                                {conflict.conflictingSettings && (
                                  <div>
                                    <h4 className="text-xs font-bold text-foreground mb-1.5">Conflicting Settings:</h4>
                                    <p>{conflict.conflictingSettings}</p>
                                  </div>
                                )}
                                {conflict.assignmentOverlap && (
                                  <div>
                                    <h4 className="text-xs font-bold text-foreground mb-1.5">Assignment Overlap:</h4>
                                    <p>{conflict.assignmentOverlap}</p>
                                  </div>
                                )}
                                {conflict.impactAssessment && (
                                  <div>
                                    <h4 className="text-xs font-bold text-foreground mb-1.5">Impact Assessment:</h4>
                                    <p>{conflict.impactAssessment}</p>
                                  </div>
                                )}
                                {conflict.resolutionSteps && (
                                  <div>
                                    <h4 className="text-xs font-bold text-foreground mb-1.5">Resolution Steps:</h4>
                                    <p>{conflict.resolutionSteps}</p>
                                  </div>
                                )}
                              </div>
                            ) : conflict.recommendation ? (
                              <div className="flex items-start gap-1.5 pt-1">
                                <Lightbulb className="w-3.5 h-3.5 text-chart-4 mt-0.5 shrink-0" />
                                <p className="text-xs text-chart-4">{conflict.recommendation}</p>
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {conflictCount === 0 && (
                  <Card className="border-border/30">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-emerald-400">No conflicts detected among the selected policies.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-3">
                {analysis.recommendations.length === 0 ? (
                  <Card className="border-border/30">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">No recommendations at this time.</p>
                    </CardContent>
                  </Card>
                ) : (
                  analysis.recommendations.map((rec, i) => (
                    <Card key={i} className="border-border/30" data-testid={`card-recommendation-${i}`}>
                      <CardContent className="pt-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-chart-4" />
                          <span className="text-sm font-medium text-foreground">{rec.title}</span>
                          <Badge variant="outline" className="text-xs">{rec.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground pl-6">{rec.detail}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        {analysis && (
          <p className="text-[11px] text-muted-foreground/50 text-center mt-8 pb-2">AI-generated content may be incorrect. Check it for accuracy.</p>
        )}
      </main>
    </div>
  );
}
