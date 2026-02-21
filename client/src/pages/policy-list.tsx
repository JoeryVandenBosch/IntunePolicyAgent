import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import type { IntunePolicy } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Search, Sparkles, LogOut, RefreshCw, ExternalLink, Sun, Moon, AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme-context";

function getIntuneUrl(policy: IntunePolicy): string {
  const source = policy.source || "";
  const id = policy.id;
  if (source === "configurationPolicies") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/SettingsCatalog/policyId/${id}/policyType~/%7B%22PolicyType%22%3A2%7D`;
  } else if (source === "deviceConfigurations") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesConfigurationMenu/configurationId/${id}`;
  } else if (source === "deviceCompliancePolicies") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/policyId/${id}`;
  } else if (source === "intents") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/EndpointSecurityDetail/policyId/${id}`;
  }
  return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration`;
}

const PLATFORM_COLORS: Record<string, string> = {
  "Windows": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "iOS/iPadOS": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "macOS": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "Android Enterprise": "bg-green-500/20 text-green-400 border-green-500/30",
  "Android": "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function PolicyListPage() {
  const { auth, logout } = useAuth();
  const userName = auth?.user?.displayName || auth?.user?.email || "";
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { theme, toggleTheme } = useTheme();
  const { data: policies, isLoading, error, refetch, isFetching } = useQuery<IntunePolicy[]>({
    queryKey: ["/api/policies"],
  });

  const types = useMemo(() => {
    if (!policies) return [];
    return [...new Set(policies.map(p => p.type))].sort();
  }, [policies]);

  const platforms = useMemo(() => {
    if (!policies) return [];
    return [...new Set(policies.map(p => p.platform))].sort();
  }, [policies]);

  const filtered = useMemo(() => {
    if (!policies) return [];
    return policies.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesPlatform = platformFilter === "all" || p.platform === platformFilter;
      return matchesSearch && matchesType && matchesPlatform;
    });
  }, [policies, search, typeFilter, platformFilter]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [showLargeSelectionWarning, setShowLargeSelectionWarning] = useState(false);

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
      setShowLargeSelectionWarning(false);
    } else {
      if (filtered.length >= 50) {
        setShowLargeSelectionWarning(true);
      }
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  const handleAnalyze = () => {
    const selectedPolicies = policies?.filter(p => selected.has(p.id)) || [];
    queryClient.setQueryData(["selectedPolicies"], selectedPolicies);
    try { sessionStorage.setItem("selectedPolicies", JSON.stringify(selectedPolicies)); } catch {}
    setLocation("/analysis");
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
          <div className="flex items-center gap-3">
            {userName && <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-user-name">{userName}</span>}
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-toggle-theme" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selected.size > 0 ? "pb-24" : ""}`}>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Select policies to analyze</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose one or more Intune policies. The agent will summarize each policy, assess end-user and security impact, retrieve assignments with filters, and detect potential conflicts.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sticky top-14 z-40 bg-background py-3 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 border-b border-border/30">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search-policies"
                placeholder="Search policies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-border/60"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-card border-border/60" data-testid="select-type-filter">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {types.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-card border-border/60" data-testid="select-platform-filter">
                <SelectValue placeholder="All Platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {platforms.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              {filtered.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-select-all-filtered"
                  onClick={toggleAll}
                  className="text-xs h-8"
                >
                  {selected.size === filtered.length ? "Deselect All" : `Select All (${filtered.length})`}
                </Button>
              )}
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {selected.size > 0 && `${selected.size} of `}{filtered.length} {filtered.length === 1 ? 'policy' : 'policies'}
              </span>
            </div>
          </div>

          {showLargeSelectionWarning && selected.size >= 50 && (
            <div className="flex items-start gap-2.5 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3" data-testid="warning-large-selection">
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="text-yellow-500 font-medium">Large selection.</span>{" "}
                <span className="text-muted-foreground">Analyzing {selected.size} policies at once may take a long time and could result in errors. Consider selecting fewer policies for faster, more reliable results.</span>
              </div>
              <button onClick={() => setShowLargeSelectionWarning(false)} className="text-muted-foreground hover:text-foreground text-xs ml-auto shrink-0 mt-0.5" data-testid="button-dismiss-warning">&times;</button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-md bg-card/50 border border-border/30">
                  <Skeleton className="w-5 h-5 rounded" />
                  <Skeleton className="h-4 flex-1 max-w-[250px]" />
                  <Skeleton className="h-4 w-[120px]" />
                  <Skeleton className="h-5 w-[80px] rounded-full" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[30px]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div data-testid="text-policy-error" className="text-center py-16 space-y-3">
              <p className="text-destructive text-sm">Failed to load policies. Please check your credentials and permissions.</p>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : (
            <div className="border border-border/40 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40 bg-card/30">
                      <th className="w-12 p-3">
                        <Checkbox
                          data-testid="checkbox-select-all"
                          checked={filtered.length > 0 && selected.size === filtered.length}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Policy Name</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Type</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Platform</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Modified</th>
                      <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((policy) => {
                      const isSelected = selected.has(policy.id);
                      const platformColor = PLATFORM_COLORS[policy.platform] || "bg-muted text-muted-foreground";
                      return (
                        <tr
                          key={policy.id}
                          data-testid={`row-policy-${policy.id}`}
                          onClick={() => toggleSelect(policy.id)}
                          className={`border-b border-border/20 cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-card/50"
                          }`}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              data-testid={`checkbox-policy-${policy.id}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(policy.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                                {policy.name}
                              </span>
                              <a
                                href={getIntuneUrl(policy)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 px-1.5 py-0.5 rounded border border-border/40 hover:border-primary/40 hover:bg-primary/5"
                                title="Open in Intune admin center"
                                data-testid={`link-intune-${policy.id}`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Intune</span>
                              </a>
                            </div>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">{policy.type}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-xs font-medium border ${platformColor}`}>
                              {policy.platform}
                            </Badge>
                          </td>
                          <td className="p-3 hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">{policy.lastModified}</span>
                          </td>
                          <td className="p-3 text-right hidden sm:table-cell">
                            <span className="text-sm text-muted-foreground">{policy.settingsCount === -1 ? "—" : policy.settingsCount}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                          No policies match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} {selected.size === 1 ? "policy" : "policies"} selected
            </span>
            <Button
              data-testid="button-analyze"
              onClick={handleAnalyze}
              size="lg"
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Analyze {selected.size} {selected.size === 1 ? "Policy" : "Policies"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
