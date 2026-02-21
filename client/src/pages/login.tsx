import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, LogIn, FileText, ShieldCheck, Users, AlertTriangle, Lightbulb, Sparkles, Lock, ServerOff, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <Card className="border-border/40">
      <CardContent className="pt-5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="text-center space-y-2 p-4">
      <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary font-bold text-sm">
        {step}
      </div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export default function LoginPage() {
  const { auth } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (auth?.authenticated) {
      setLocation("/policies");
    }
  }, [auth, setLocation]);

  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get("auth_error");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">Intune Policy Intelligence Agent</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Powered by IntuneStuff</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-toggle-theme-login" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl sm:text-4xl font-light leading-tight text-foreground">
                Intune Policy
                <br />
                <span className="font-semibold">Intelligence Agent</span>
              </h2>
              <p className="text-muted-foreground text-base leading-relaxed max-w-md">
                AI-powered analysis of your Microsoft Intune policies. Get summaries, end-user impact assessments, security ratings, assignment details, conflict detection, and actionable recommendations.
              </p>
              {authError && (
                <Card className="border-destructive bg-destructive/10">
                  <CardContent className="p-3" data-testid="text-login-error">
                    <p className="text-sm text-destructive">
                      Sign-in failed: {decodeURIComponent(authError)}
                    </p>
                  </CardContent>
                </Card>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <a href="/api/auth/login">
                  <Button size="lg" data-testid="button-sign-in">
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign in with Microsoft
                  </Button>
                </a>
                <a href="#features">
                  <Button variant="outline" size="lg" data-testid="button-learn-more">
                    Learn More
                  </Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Admin consent required | No app registration needed on your end
              </p>
            </div>
            <div className="flex justify-center">
              <div className="w-56 h-56 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                <Shield className="w-24 h-24 text-primary/30" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-16 sm:py-20 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-semibold mb-2">Analysis Features</h3>
            <div className="w-12 h-0.5 bg-primary mx-auto mt-3" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={FileText}
              title="Policy Summaries"
              description="AI-generated overviews of each policy's purpose, configured settings, and scope in clear, actionable language."
            />
            <FeatureCard
              icon={Users}
              title="End-User Impact"
              description="Assess how policies affect daily user workflows with severity ratings from Minimal to Critical."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Security Impact"
              description="Evaluate security posture improvements with compliance framework mappings (NIST, CIS, ISO 27001, etc.)."
            />
            <FeatureCard
              icon={Sparkles}
              title="Assignments & Filters"
              description="View included/excluded groups and assignment filters with resolved group names and member counts."
            />
            <FeatureCard
              icon={AlertTriangle}
              title="Conflict Detection"
              description="Identify setting conflicts, overlapping scopes, and redundant configurations across selected policies."
            />
            <FeatureCard
              icon={Lightbulb}
              title="Recommendations"
              description="Get actionable recommendations for security hardening, optimization, and compliance improvements."
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-semibold mb-2">How It Works</h3>
            <div className="w-12 h-0.5 bg-primary mx-auto mt-3" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StepCard step={1} title="Sign In" description="Click 'Sign in with Microsoft' and grant admin consent for your organization." />
            <StepCard step={2} title="Select Policies" description="Browse your Intune policies with search and filter. Select one or more to analyze." />
            <StepCard step={3} title="AI Analysis" description="The agent retrieves policy details and runs AI-powered analysis across 6 dimensions." />
            <StepCard step={4} title="Review & Export" description="Review results in tabbed view and export as HTML or text reports." />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-semibold mb-2">Admin Consent</h3>
            <div className="w-12 h-0.5 bg-primary mx-auto mt-3" />
          </div>
          <div className="max-w-2xl mx-auto">
            <Card className="border-border/40">
              <CardContent className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  When you sign in for the first time, a Global Administrator will need to consent to the following delegated permissions on behalf of your organization. This is a one-time process.
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Required Permissions:</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2"><Lock className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /><span><strong>DeviceManagementConfiguration.Read.All</strong> — Read policies</span></li>
                    <li className="flex items-start gap-2"><Lock className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /><span><strong>Group.Read.All</strong> — Resolve group names</span></li>
                    <li className="flex items-start gap-2"><Lock className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /><span><strong>Directory.Read.All</strong> — Read directory data</span></li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  These are read-only permissions. No changes are made to your tenant. No app registration is required on your end.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-semibold mb-2">Privacy & Security</h3>
            <div className="w-12 h-0.5 bg-primary mx-auto mt-3" />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="border-border/40">
              <CardContent className="pt-5 space-y-2 text-center">
                <ServerOff className="w-8 h-8 text-primary mx-auto" />
                <h4 className="text-sm font-semibold">No Data Storage</h4>
                <p className="text-xs text-muted-foreground">All operations run live via Microsoft Graph API. No tenant data is stored on our servers.</p>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardContent className="pt-5 space-y-2 text-center">
                <Lock className="w-8 h-8 text-primary mx-auto" />
                <h4 className="text-sm font-semibold">Secure Authentication</h4>
                <p className="text-xs text-muted-foreground">OAuth2 via Microsoft Identity Platform. Your credentials never touch our servers.</p>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardContent className="pt-5 space-y-2 text-center">
                <ShieldCheck className="w-8 h-8 text-primary mx-auto" />
                <h4 className="text-sm font-semibold">Read-Only Access</h4>
                <p className="text-xs text-muted-foreground">Only read permissions are requested. No changes are made to your tenant configuration.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h3 className="text-2xl font-semibold mb-3">Ready to Analyze Your Policies?</h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Sign in with your Microsoft account to start analyzing your Intune policies with AI-powered intelligence.
          </p>
          <a href="/api/auth/login">
            <Button size="lg" data-testid="button-sign-in-bottom">
              <LogIn className="h-4 w-4 mr-2" />
              Sign in with Microsoft
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t border-border/30 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center text-xs text-muted-foreground/60">
          Intune Policy Intelligence Agent — Powered by IntuneStuff
        </div>
      </footer>
    </div>
  );
}
