import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Shield, BookOpen, ExternalLink, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type {
  IntunePolicy,
  PolicyComplianceData,
  PolicyComplianceSummary,
  ComplianceLookupResult,
  ComplianceBenchmarkMatch,
} from "@shared/schema";

// ── small reusable atoms ────────────────────────────────────────────────────

function CisTag({ control, title }: { control: string; title: string }) {
  return (
    <a
      href="https://www.cisecurity.org/controls/v8"
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded
                 bg-blue-500/10 text-blue-400 border border-blue-500/25
                 hover:bg-blue-500/20 transition-colors no-underline"
    >
      CIS {control}
    </a>
  );
}

function IsoTag({ control, title }: { control: string; title: string }) {
  return (
    <a
      href="https://www.iso.org/standard/27001"
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? control}
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded
                 bg-amber-500/10 text-amber-400 border border-amber-500/25
                 hover:bg-amber-500/20 transition-colors no-underline"
    >
      {control}
    </a>
  );
}

function LevelBadge({ level }: { level: "L1" | "L2" | null }) {
  if (!level) return null;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-bold border ${
        level === "L1"
          ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
          : "bg-orange-500/10 text-orange-400 border-orange-500/30"
      }`}
    >
      {level}
    </Badge>
  );
}

function TypeBadge({ type }: { type: "Automated" | "Manual" }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] border ${
        type === "Automated"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
          : "bg-muted text-muted-foreground border-border/40"
      }`}
    >
      {type}
    </Badge>
  );
}

function ConfidenceDot({ score }: { score: number }) {
  const color =
    score >= 0.7 ? "bg-emerald-400" : score >= 0.4 ? "bg-yellow-400" : "bg-orange-400";
  const label =
    score >= 0.7 ? "High confidence" : score >= 0.4 ? "Medium confidence" : "Low confidence";
  return (
    <span title={`${label} (${Math.round(score * 100)}%)`} className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] text-muted-foreground">{Math.round(score * 100)}%</span>
    </span>
  );
}

// ── benchmark match card ─────────────────────────────────────────────────────

function BenchmarkMatchCard({ match }: { match: ComplianceBenchmarkMatch }) {
  const [open, setOpen] = useState(false);

  const platformLabel =
    match.platform === "windows11" ? "Windows 11"
    : match.platform === "ios" ? "iOS / iPadOS"
    : match.platform === "macos" ? "macOS"
    : match.platform;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors group">
          {/* toggle chevron */}
          {open
            ? <ChevronDown className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
          }

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {/* title row */}
            <span className="text-xs text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {match.title}
            </span>
            {/* badges row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-mono">{match.recommendationId}</span>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <span className="text-[10px] text-muted-foreground">{platformLabel}</span>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <LevelBadge level={match.level} />
              <TypeBadge type={match.type} />
              <ConfidenceDot score={match.confidence} />
            </div>
          </div>

          {/* quick CIS + ISO tags */}
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            {match.cisControls.slice(0, 2).map(c => (
              <CisTag key={c.control} control={c.control} title={c.title} />
            ))}
            <span className="text-[10px] text-muted-foreground/30">→</span>
            {match.isoMappings.slice(0, 2).map(i => (
              <IsoTag key={i.isoControl} control={i.isoControl} title={i.isoTitle ?? ""} />
            ))}
            {match.isoMappings.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{match.isoMappings.length - 2}</span>
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-5 mt-1 mb-2 space-y-3 border-l border-border/30 pl-3">

          {/* CIS Controls */}
          {match.cisControls.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                CIS Controls v8
              </p>
              <div className="space-y-1.5">
                {match.cisControls.map(c => (
                  <div
                    key={c.control}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded bg-blue-500/5 border border-blue-500/10"
                  >
                    <span className="font-mono text-[11px] font-bold text-blue-400 shrink-0 mt-0.5">
                      {c.control}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-1 leading-snug">
                      {c.title}
                    </span>
                    <div className="flex gap-0.5 shrink-0">
                      {[c.ig1, c.ig2, c.ig3].map((active, idx) =>
                        active ? (
                          <span
                            key={idx}
                            className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20"
                          >
                            IG{idx + 1}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ISO 27001 Controls */}
          {match.isoMappings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                ISO/IEC 27001:2022 Controls
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.isoMappings.map(i => (
                  <a
                    key={i.isoControl}
                    href="https://www.iso.org/standard/27001"
                    target="_blank"
                    rel="noopener noreferrer"
                    title={i.isoTitle ?? i.isoControl}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded
                               bg-amber-500/7 border border-amber-500/20 no-underline
                               hover:bg-amber-500/15 transition-colors group/iso"
                  >
                    <span className="font-mono text-[11px] font-bold text-amber-400">{i.isoControl}</span>
                    {i.isoTitle && (
                      <span className="text-[11px] text-muted-foreground group-hover/iso:text-foreground transition-colors">
                        {i.isoTitle}
                      </span>
                    )}
                    {i.relationship && (
                      <span className="text-[9px] text-muted-foreground/50 border border-border/30 px-1 rounded">
                        {i.relationship}
                      </span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── per-setting row ──────────────────────────────────────────────────────────

function SettingComplianceRow({
  settingName,
  settingValue,
  compliance,
}: {
  settingName: string;
  settingValue: string;
  compliance: ComplianceLookupResult | null;
}) {
  const [open, setOpen] = useState(false);
  const hasMatch = compliance && compliance.matches.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full text-left">
        <div className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/20 transition-colors group border border-border/20 mb-1">
          {/* match indicator */}
          {hasMatch ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
          )}

          {/* setting name */}
          <span className="text-xs font-medium text-foreground flex-1 truncate">{settingName}</span>

          {/* setting value */}
          <Badge variant="outline" className="text-[10px] border-border/30 text-muted-foreground shrink-0 max-w-[120px] truncate">
            {settingValue}
          </Badge>

          {/* quick tags when matched */}
          {hasMatch && (
            <>
              <div className="flex gap-1 items-center">
                {compliance.allCisControls.slice(0, 2).map(c => (
                  <span key={c} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    CIS {c}
                  </span>
                ))}
                {compliance.allCisControls.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{compliance.allCisControls.length - 2}</span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/30">→</span>
              <div className="flex gap-1 items-center">
                {compliance.allIsoControls.slice(0, 2).map(c => (
                  <span key={c} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {c}
                  </span>
                ))}
                {compliance.allIsoControls.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{compliance.allIsoControls.length - 2}</span>
                )}
              </div>
              <LevelBadge level={compliance.highestLevel} />
            </>
          )}

          {/* expand chevron */}
          {hasMatch && (
            open
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </CollapsibleTrigger>

      {hasMatch && (
        <CollapsibleContent>
          <div className="ml-6 mb-3 space-y-1 border-l border-border/20 pl-3">
            {compliance.matches.map((m, idx) => (
              <BenchmarkMatchCard key={idx} match={m} />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ── per-policy summary bar ───────────────────────────────────────────────────

function PolicyComplianceSummaryBar({ summary }: { summary: PolicyComplianceSummary }) {
  const pct = summary.coveragePercent;
  const barColor =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-orange-500";

  return (
    <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-md bg-muted/20 border border-border/20">
      {/* coverage bar */}
      <div className="flex items-center gap-2 flex-1 min-w-[160px]">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
          CIS Coverage
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-bold text-foreground tabular-nums">{pct}%</span>
        <span className="text-[10px] text-muted-foreground">
          ({summary.coveredSettings}/{summary.totalSettings})
        </span>
      </div>

      {/* stat chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {summary.l1Count > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20">
            <span className="text-[10px] font-bold text-yellow-400">{summary.l1Count}</span>
            <span className="text-[10px] text-muted-foreground">L1 settings</span>
          </div>
        )}
        {summary.l2Count > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
            <span className="text-[10px] font-bold text-orange-400">{summary.l2Count}</span>
            <span className="text-[10px] text-muted-foreground">L2 settings</span>
          </div>
        )}
        {summary.allCisControls.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
            <span className="text-[10px] font-bold text-blue-400">{summary.allCisControls.length}</span>
            <span className="text-[10px] text-muted-foreground">CIS controls</span>
          </div>
        )}
        {summary.allIsoControls.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] font-bold text-amber-400">{summary.allIsoControls.length}</span>
            <span className="text-[10px] text-muted-foreground">ISO 27001 controls</span>
          </div>
        )}
        {summary.implementationGroups.length > 0 && (
          <div className="flex gap-1">
            {summary.implementationGroups.map(ig => (
              <span
                key={ig}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
              >
                {ig}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main export ──────────────────────────────────────────────────────────────

interface ComplianceTabProps {
  policies: IntunePolicy[];
  compliance: Record<string, PolicyComplianceData>;
}

export default function ComplianceTab({ policies, compliance }: ComplianceTabProps) {
  const totalPolicies = policies.length;
  const policiesWithData = policies.filter(p => compliance[p.id]).length;
  const allCisControls = new Set<string>();
  const allIsoControls = new Set<string>();
  let totalCovered = 0;
  let totalSettings = 0;

  for (const data of Object.values(compliance)) {
    data.summary.allCisControls.forEach(c => allCisControls.add(c));
    data.summary.allIsoControls.forEach(c => allIsoControls.add(c));
    totalCovered += data.summary.coveredSettings;
    totalSettings += data.summary.totalSettings;
  }

  const overallPct = totalSettings > 0 ? Math.round((totalCovered / totalSettings) * 100) : 0;

  if (policiesWithData === 0) {
    return (
      <Card className="border-border/30">
        <CardContent className="pt-6 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            No compliance data available. This usually means the selected policies had no security settings that could be matched against CIS benchmarks.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Compliance mapping works best with Settings Catalog policies on Windows 11, iOS, or macOS.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── overall header card ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-md bg-card border border-border/30 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Overall Coverage</p>
          <p className={`text-2xl font-bold ${overallPct >= 70 ? "text-emerald-400" : overallPct >= 40 ? "text-yellow-400" : "text-orange-400"}`}>
            {overallPct}%
          </p>
          <p className="text-[10px] text-muted-foreground">{totalCovered}/{totalSettings} settings mapped</p>
        </div>
        <div className="p-3 rounded-md bg-card border border-border/30 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CIS Controls</p>
          <p className="text-2xl font-bold text-blue-400">{allCisControls.size}</p>
          <p className="text-[10px] text-muted-foreground">unique controls matched</p>
        </div>
        <div className="p-3 rounded-md bg-card border border-border/30 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">ISO 27001 Controls</p>
          <p className="text-2xl font-bold text-amber-400">{allIsoControls.size}</p>
          <p className="text-[10px] text-muted-foreground">unique controls matched</p>
        </div>
        <div className="p-3 rounded-md bg-card border border-border/30 space-y-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Source</p>
          <p className="text-2xl font-bold text-foreground">{policiesWithData}</p>
          <p className="text-[10px] text-muted-foreground">
            of {totalPolicies} {totalPolicies === 1 ? "policy" : "policies"} mapped
          </p>
        </div>
      </div>

      {/* ── legend ── */}
      <div className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-muted/10 border border-border/20 text-[11px] text-muted-foreground">
        <Shield className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <span>
          Each setting below is matched against{" "}
          <strong className="text-foreground">1,734 CIS Intune benchmark recommendations</strong>{" "}
          (Windows 11, iOS 18, macOS 15), then chained to{" "}
          <strong className="text-foreground">ISO/IEC 27001:2022 controls</strong>{" "}
          via the official CIS v8.1→ISO mapping.{" "}
          <span className="text-muted-foreground/60">
            Matching is deterministic — no AI calls. Click any row to expand the full chain.
          </span>
        </span>
      </div>

      {/* ── per-policy sections ── */}
      {policies.map(policy => {
        const data = compliance[policy.id];
        if (!data) return null;

        return (
          <Card key={policy.id} className="border-border/30">
            <CardContent className="pt-4">

              {/* policy header */}
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">{policy.name}</span>
                <Badge variant="outline" className="text-[10px] border-border/30 text-muted-foreground">
                  {policy.platform}
                </Badge>
              </div>

              {/* per-policy summary bar */}
              <PolicyComplianceSummaryBar summary={data.summary} />

              {/* setting rows */}
              <div className="space-y-0.5">
                {data.settings.map((s, idx) => (
                  <SettingComplianceRow
                    key={idx}
                    settingName={s.settingName}
                    settingValue={s.settingValue}
                    compliance={s.compliance}
                  />
                ))}
              </div>

            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
