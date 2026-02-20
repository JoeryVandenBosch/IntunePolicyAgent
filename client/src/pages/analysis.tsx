import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { IntunePolicy, AnalysisResult } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shield, FileText, Users, ShieldAlert, AlertTriangle, Lightbulb, ArrowLeft, Download, ChevronDown, Loader2, BookOpen, Target } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-4 rounded-md bg-card border border-border/30 space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PolicySection({ policy, children }: { policy: IntunePolicy; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const platformColor = PLATFORM_COLORS[policy.platform] || "bg-muted text-muted-foreground";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border border-border/30 rounded-md">
      <CollapsibleTrigger className="flex items-center gap-3 w-full p-4 text-left" data-testid={`trigger-policy-${policy.id}`}>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        <span className="font-medium text-foreground text-sm">{policy.name}</span>
        <Badge variant="outline" className={`text-xs border ${platformColor}`}>{policy.platform}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-0">
        {children}
      </CollapsibleContent>
    </Collapsible>
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
  const queryClientInstance = useQueryClient();
  const selectedPolicies = getSelectedPolicies(queryClientInstance);

  const { data: analysis, isLoading, error } = useQuery<AnalysisResult>({
    queryKey: ["/api/analyze"],
    queryFn: async () => {
      if (!selectedPolicies || selectedPolicies.length === 0) throw new Error("No policies selected");
      const res = await apiRequest("POST", "/api/analyze", { policyIds: selectedPolicies.map(p => p.id) });
      return res.json();
    },
    enabled: !!selectedPolicies && selectedPolicies.length > 0,
    retry: false,
  });

  useEffect(() => {
    if (!selectedPolicies || selectedPolicies.length === 0) {
      setLocation("/policies");
    }
  }, [selectedPolicies, setLocation]);

  if (!selectedPolicies || selectedPolicies.length === 0) return null;

  const totalSettings = selectedPolicies.reduce((sum, p) => sum + p.settingsCount, 0);
  const conflictCount = analysis?.conflicts?.length || 0;
  const recCount = analysis?.recommendations?.length || 0;

  const handleExport = async (format: "html" | "text") => {
    try {
      const res = await apiRequest("POST", `/api/export/${format}`, {
        policies: selectedPolicies,
        analysis,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intune-analysis.${format === "html" ? "html" : "txt"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Powered by AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleExport("html")} data-testid="button-export-html" disabled={!analysis}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export HTML
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("text")} data-testid="button-export-text" disabled={!analysis}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Text
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/policies")} data-testid="button-new-analysis">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              New Analysis
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing {selectedPolicies.length} {selectedPolicies.length === 1 ? "policy" : "policies"} with AI...</p>
            <p className="text-xs text-muted-foreground/70">This may take a moment depending on the number of policies</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-destructive text-sm" data-testid="text-analysis-error">Analysis failed: {(error as Error).message}</p>
            <Button variant="secondary" size="sm" onClick={() => setLocation("/policies")}>Go Back</Button>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Policies Analyzed" value={selectedPolicies.length} color="text-primary" />
              <StatCard label="Total Settings" value={totalSettings} color="text-primary" />
              <StatCard label="Conflicts Found" value={conflictCount} color={conflictCount > 0 ? "text-orange-400" : "text-emerald-400"} />
              <StatCard label="Recommendations" value={recCount} color="text-chart-4" />
            </div>

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
                  <AlertTriangle className="w-3.5 h-3.5" /> Conflicts ({conflictCount})
                </TabsTrigger>
                <TabsTrigger value="recommendations" data-testid="tab-recommendations" className="gap-1.5 text-xs">
                  <Lightbulb className="w-3.5 h-3.5" /> Recommendations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-3">
                {selectedPolicies.map(policy => (
                  <PolicySection key={policy.id} policy={policy}>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {analysis.summaries[policy.id]?.overview || "No summary available."}
                    </p>
                  </PolicySection>
                ))}
              </TabsContent>

              <TabsContent value="enduser" className="space-y-3">
                {selectedPolicies.map(policy => {
                  const impact = analysis.endUserImpact[policy.id];
                  if (!impact) return null;
                  const severityColor = SEVERITY_COLORS[impact.severity] || SEVERITY_COLORS["Minimal"];
                  return (
                    <PolicySection key={policy.id} policy={policy}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${severityColor}`}>{impact.severity}</Badge>
                          <span className="text-xs text-muted-foreground">impact level</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{impact.description}</p>
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="security" className="space-y-3">
                {selectedPolicies.map(policy => {
                  const impact = analysis.securityImpact[policy.id];
                  if (!impact) return null;
                  const ratingColor = SEVERITY_COLORS[impact.rating] || SEVERITY_COLORS["Medium"];
                  return (
                    <PolicySection key={policy.id} policy={policy}>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${ratingColor}`}>{impact.rating}</Badge>
                          <span className="text-xs text-muted-foreground">security rating</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{impact.description}</p>
                        {impact.complianceFrameworks.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                            {impact.complianceFrameworks.map(fw => (
                              <Badge key={fw} variant="outline" className="text-xs">{fw}</Badge>
                            ))}
                          </div>
                        )}
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
                    <PolicySection key={policy.id} policy={policy}>
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
                                <span className="text-xs text-muted-foreground">{g.memberCount} members</span>
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
                                <span className="text-xs text-muted-foreground">{g.memberCount} members</span>
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
                          <p className="text-sm text-muted-foreground">No assignment information available.</p>
                        )}
                      </div>
                    </PolicySection>
                  );
                })}
              </TabsContent>

              <TabsContent value="conflicts" className="space-y-3">
                {analysis.conflicts.length === 0 ? (
                  <Card className="border-border/30">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-emerald-400">No conflicts detected among the selected policies.</p>
                    </CardContent>
                  </Card>
                ) : (
                  analysis.conflicts.map((conflict, i) => {
                    const color = CONFLICT_SEVERITY_COLORS[conflict.severity] || CONFLICT_SEVERITY_COLORS["Info"];
                    return (
                      <Card key={i} className="border-border/30 border-l-2 border-l-orange-500/50" data-testid={`card-conflict-${i}`}>
                        <CardContent className="pt-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-400" />
                            <span className="text-sm font-medium text-orange-400">{conflict.type}</span>
                            <Badge variant="outline" className={`text-xs border ${color}`}>{conflict.severity}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{conflict.detail}</p>
                          <p className="text-xs text-muted-foreground">
                            Policies: {conflict.policies.join(" <> ")}
                          </p>
                          {conflict.recommendation && (
                            <div className="flex items-start gap-1.5 pt-1">
                              <Lightbulb className="w-3.5 h-3.5 text-chart-4 mt-0.5 shrink-0" />
                              <p className="text-xs text-chart-4">{conflict.recommendation}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
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
      </main>
    </div>
  );
}
