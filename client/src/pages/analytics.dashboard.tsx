import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { ArrowLeft, BarChart3, Users, Building2, FileText, Clock, Shield, TrendingUp, LogIn } from "lucide-react";

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

function StatCard({ icon: Icon, label, value, subtitle, color = "text-primary" }: {
  icon: any; label: string; value: string | number; subtitle?: string; color?: string;
}) {
  return (
    <Card className="border-border/40" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { auth, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"overview" | "tenants" | "users" | "activity">("overview");

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md border-border/40">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-destructive">Failed to load analytics</p>
            <Button variant="outline" onClick={() => setLocation("/policies")} data-testid="button-back-policies">
              Back to Policies
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dailyData = (data?.dailyStats || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    analyses: Number(d.analyses) || 0,
    logins: Number(d.logins) || 0,
    policies: Number(d.policies) || 0,
  }));

  const platformData = (data?.platformBreakdown || []).map((p: any, i: number) => ({
    name: p.platform || "Unknown",
    value: p.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const policyTypeData = (data?.policyTypeBreakdown || []).map((p: any, i: number) => ({
    name: (p.policyType || "Unknown").length > 25 ? (p.policyType || "Unknown").substring(0, 25) + "..." : (p.policyType || "Unknown"),
    value: p.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: BarChart3 },
    { key: "tenants" as const, label: "Tenants", icon: Building2 },
    { key: "users" as const, label: "Users", icon: Users },
    { key: "activity" as const, label: "Activity Log", icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/policies")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Global Analytics</h1>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">All Tenants</Badge>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{auth?.user?.displayName}</span>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b border-border/40 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pb-6 space-y-6">
        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard icon={BarChart3} label="Total Analyses" value={data?.totals?.analyses || 0} subtitle={`${data?.periods?.last7Days || 0} last 7 days`} />
              <StatCard icon={LogIn} label="Total Logins" value={data?.totals?.logins || 0} subtitle={`${data?.periods?.loginsLast7Days || 0} last 7 days`} />
              <StatCard icon={Building2} label="Tenants" value={data?.totals?.uniqueTenants || 0} />
              <StatCard icon={Users} label="Unique Users" value={data?.totals?.uniqueUsers || 0} />
              <StatCard icon={FileText} label="Policies Analyzed" value={data?.totals?.policiesAnalyzed || 0} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-border/40">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Analyses</p>
                      <p className="text-2xl font-bold text-primary mt-1">{data?.periods?.last24Hours || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Logins</p>
                      <p className="text-2xl font-bold text-green-400 mt-1">{data?.periods?.loginsLast24Hours || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">Last 24 Hours</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Analyses</p>
                      <p className="text-2xl font-bold text-blue-400 mt-1">{data?.periods?.last7Days || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Logins</p>
                      <p className="text-2xl font-bold text-green-400 mt-1">{data?.periods?.loginsLast7Days || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">Last 7 Days</p>
                </CardContent>
              </Card>
              <Card className="border-border/40">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Analyses</p>
                      <p className="text-2xl font-bold text-purple-400 mt-1">{data?.periods?.last30Days || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Logins</p>
                      <p className="text-2xl font-bold text-green-400 mt-1">{data?.periods?.loginsLast30Days || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">Last 30 Days</p>
                </CardContent>
              </Card>
            </div>

            {dailyData.length > 0 && (
              <Card className="border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Daily Activity (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyData}>
                        <defs>
                          <linearGradient id="analysesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="loginsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                        <Area type="monotone" dataKey="analyses" name="Analyses" stroke="#3b82f6" fill="url(#analysesGradient)" strokeWidth={2} />
                        <Area type="monotone" dataKey="logins" name="Logins" stroke="#10b981" fill="url(#loginsGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {platformData.length > 0 && (
                <Card className="border-border/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Platform Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} strokeWidth={0} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {platformData.map((entry: any, i: number) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {policyTypeData.length > 0 && (
                <Card className="border-border/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Policy Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={policyTypeData} layout="vertical">
                          <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" name="Analyses" radius={[0, 4, 4, 0]}>
                            {policyTypeData.map((entry: any, i: number) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {activeTab === "tenants" && (
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Tenant Activity Across All Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!data?.tenantBreakdown?.length) ? (
                <div className="text-center py-12">
                  <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No tenant data yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-tenants">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Tenant ID</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Logins</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Analyses</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Policies</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Users</th>
                        <th className="text-right py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tenantBreakdown.map((t: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors" data-testid={`tenant-row-${i}`}>
                          <td className="py-3 px-3">
                            <code className="text-xs bg-muted/30 px-2 py-1 rounded font-mono">{t.tenantIdShort}</code>
                          </td>
                          <td className="text-center py-3 px-3">
                            <Badge variant="outline" className="border-green-500/30 text-green-400">{t.logins}</Badge>
                          </td>
                          <td className="text-center py-3 px-3">
                            <Badge variant="outline" className="border-blue-500/30 text-blue-400">{t.analyses}</Badge>
                          </td>
                          <td className="text-center py-3 px-3">
                            <span className="text-muted-foreground">{t.policies}</span>
                          </td>
                          <td className="text-center py-3 px-3">
                            <span className="text-muted-foreground">{t.users}</span>
                          </td>
                          <td className="text-right py-3 px-3 text-xs text-muted-foreground">
                            {t.lastActive ? new Date(t.lastActive).toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/40 bg-muted/10">
                        <td className="py-3 px-3 font-medium text-xs uppercase tracking-wider">Total ({data.tenantBreakdown.length} tenants)</td>
                        <td className="text-center py-3 px-3 font-bold text-green-400">{data.totals.logins}</td>
                        <td className="text-center py-3 px-3 font-bold text-blue-400">{data.totals.analyses}</td>
                        <td className="text-center py-3 px-3 font-bold">{data.totals.policiesAnalyzed}</td>
                        <td className="text-center py-3 px-3 font-bold">{data.totals.uniqueUsers}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "users" && (
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                User Activity Across All Tenants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!data?.topUsers?.length) ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No user data yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-users">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">User</th>
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Tenant</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Logins</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Analyses</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Policies</th>
                        <th className="text-right py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topUsers.map((u: any, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors" data-testid={`user-row-${i}`}>
                          <td className="py-3 px-3">
                            <span className="text-sm">{u.email}</span>
                          </td>
                          <td className="py-3 px-3">
                            <code className="text-xs bg-muted/30 px-2 py-1 rounded font-mono">{u.tenantIdShort}</code>
                          </td>
                          <td className="text-center py-3 px-3">
                            <Badge variant="outline" className="border-green-500/30 text-green-400">{u.logins}</Badge>
                          </td>
                          <td className="text-center py-3 px-3">
                            <Badge variant="outline" className="border-blue-500/30 text-blue-400">{u.analyses}</Badge>
                          </td>
                          <td className="text-center py-3 px-3">
                            <span className="text-muted-foreground">{u.policies}</span>
                          </td>
                          <td className="text-right py-3 px-3 text-xs text-muted-foreground">
                            {u.lastActive ? new Date(u.lastActive).toLocaleString() : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "activity" && (
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Recent Activity (Last 100 Events)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!data?.recentEvents?.length) ? (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No activity yet. Start analyzing policies to see events here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-activity">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Type</th>
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">User</th>
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Tenant</th>
                        <th className="text-center py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Policies</th>
                        <th className="text-left py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Platforms</th>
                        <th className="text-right py-3 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((event: any) => (
                        <tr key={event.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors" data-testid={`event-row-${event.id}`}>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={
                                event.eventType === "analysis"
                                  ? "border-blue-500/30 text-blue-400"
                                  : event.eventType === "login"
                                  ? "border-green-500/30 text-green-400"
                                  : "border-yellow-500/30 text-yellow-400"
                              }
                            >
                              {event.eventType}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{event.userEmail || "-"}</td>
                          <td className="py-2.5 px-3">
                            {event.tenantId ? (
                              <code className="text-xs bg-muted/30 px-1.5 py-0.5 rounded font-mono">{event.tenantId}</code>
                            ) : "-"}
                          </td>
                          <td className="text-center py-2.5 px-3 text-muted-foreground">
                            {event.policyCount || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">{event.platforms || "-"}</td>
                          <td className="text-right py-2.5 px-3 text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "overview" && (!data?.recentEvents?.length && !dailyData.length) && (
          <Card className="border-border/40">
            <CardContent className="pt-12 pb-12 text-center space-y-3">
              <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto" />
              <p className="text-muted-foreground">No analytics data yet. Start analyzing policies to see usage data here.</p>
              <Button variant="outline" onClick={() => setLocation("/policies")} data-testid="button-start-analyzing">
                Analyze Policies
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
