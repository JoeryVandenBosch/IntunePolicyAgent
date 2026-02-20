import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { ArrowLeft, BarChart3, Users, Building2, FileText, Activity, Clock, Shield, TrendingUp } from "lucide-react";

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

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/analytics"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
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
    analyses: d.analyses,
    policies: d.policies,
  }));

  const platformData = (data?.platformBreakdown || []).map((p: any, i: number) => ({
    name: p.platform || "Unknown",
    value: p.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const policyTypeData = (data?.policyTypeBreakdown || []).map((p: any, i: number) => ({
    name: (p.policyType || "Unknown").length > 20 ? (p.policyType || "Unknown").substring(0, 20) + "..." : (p.policyType || "Unknown"),
    value: p.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/policies")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Analytics Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{auth?.user?.displayName}</span>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={BarChart3} label="Total Analyses" value={data?.totals?.analyses || 0} subtitle={`${data?.periods?.last7Days || 0} last 7 days`} />
          <StatCard icon={Users} label="Unique Users" value={data?.totals?.uniqueUsers || 0} />
          <StatCard icon={Building2} label="Tenants" value={data?.totals?.uniqueTenants || 0} />
          <StatCard icon={FileText} label="Policies Analyzed" value={data?.totals?.policiesAnalyzed || 0} />
          <StatCard icon={Activity} label="Logins" value={data?.totals?.logins || 0} subtitle={`${data?.periods?.last24Hours || 0} analyses today`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/40">
            <CardContent className="pt-5 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Last 24 Hours</p>
              <p className="text-3xl font-bold text-primary mt-1">{data?.periods?.last24Hours || 0}</p>
              <p className="text-xs text-muted-foreground">analyses</p>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-5 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Last 7 Days</p>
              <p className="text-3xl font-bold text-blue-400 mt-1">{data?.periods?.last7Days || 0}</p>
              <p className="text-xs text-muted-foreground">analyses</p>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-5 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Last 30 Days</p>
              <p className="text-3xl font-bold text-purple-400 mt-1">{data?.periods?.last30Days || 0}</p>
              <p className="text-xs text-muted-foreground">analyses</p>
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
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="analysesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="analyses" name="Analyses" stroke="#3b82f6" fill="url(#analysesGradient)" strokeWidth={2} />
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
                      <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
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

        {(data?.recentEvents?.length > 0) && (
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.recentEvents.map((event: any) => (
                  <div key={event.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 text-sm" data-testid={`event-row-${event.id}`}>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={event.eventType === "analysis" ? "border-blue-500/30 text-blue-400" : "border-green-500/30 text-green-400"}>
                        {event.eventType}
                      </Badge>
                      <span className="text-muted-foreground">{event.userEmail || "Anonymous"}</span>
                      {event.policyCount && (
                        <span className="text-xs text-muted-foreground">
                          {event.policyCount} {event.policyCount === 1 ? "policy" : "policies"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {event.platforms && (
                        <span className="text-xs text-muted-foreground">{event.platforms}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(!data?.recentEvents?.length && !dailyData.length) && (
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
