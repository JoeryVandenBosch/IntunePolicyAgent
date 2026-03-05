import { useState, useMemo } from "react";
import { CheckCircle, XCircle, AlertCircle, ChevronDown } from "lucide-react";
import type {
  IntunePolicy,
  PolicyComplianceData,
  ComplianceBenchmarkMatch,
  ComplianceLookupResult,
} from "@shared/schema";

// ── helpers ──────────────────────────────────────────────────────────────────

function extractRecommended(title: string): string {
  const m = title.match(/is set to\s+['"'""]([^'"'""\n]+)['"'""]/) ||
            title.match(/is set to\s+(\S+)/i);
  return m ? m[1].replace(/\s*\(Automated\)|\s*\(Manual\)/gi, "").trim() : "See benchmark";
}

function normaliseVal(v: string) {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

function isCompliant(settingValue: string, match: ComplianceBenchmarkMatch): boolean {
  const recommended = normaliseVal(extractRecommended(match.title));
  const actual = normaliseVal(settingValue);
  if (!recommended || recommended === "see benchmark") return true;
  if (actual === recommended) return true;
  const positives = new Set(["enabled", "yes", "true", "1", "block", "required", "allowed"]);
  const negatives = new Set(["disabled", "no", "false", "0", "not configured", "allow"]);
  if (positives.has(actual) && positives.has(recommended)) return true;
  if (negatives.has(actual) && negatives.has(recommended)) return true;
  const numActual = parseFloat(actual);
  const numRec = parseFloat(recommended);
  if (!isNaN(numActual) && !isNaN(numRec) && numActual === numRec) return true;
  return false;
}

interface PlatformStat {
  platform: string;
  label: string;
  dot: string;
  matched: number;
  compliantCount: number;
}

const PLATFORM_TOTAL: Record<string, number> = { windows11: 1254, ios: 256, macos: 224 };
const PLATFORM_LABEL: Record<string, string> = { windows11: "Windows 11", ios: "iOS / iPadOS", macos: "macOS Sequoia" };
const PLATFORM_DOT: Record<string, string> = { windows11: "#3b82f6", ios: "#a78bfa", macos: "#f97316" };

interface EnrichedSetting {
  settingName: string;
  settingValue: string;
  compliance: ComplianceLookupResult | null;
  hasMatch: boolean;
  topMatch: ComplianceBenchmarkMatch | null;
  recommended: string;
  compliant: boolean | null;
  platform: string;
  level: "L1" | "L2" | null;
  cisId: string;
}

function buildEnrichedSettings(data: PolicyComplianceData, policy: IntunePolicy): EnrichedSetting[] {
  return data.settings.map(s => {
    const c = s.compliance;
    const top = c?.matches[0] ?? null;
    return {
      settingName: s.settingName,
      settingValue: s.settingValue,
      compliance: c,
      hasMatch: !!top,
      topMatch: top,
      recommended: top ? extractRecommended(top.title) : "",
      compliant: top ? isCompliant(s.settingValue, top) : null,
      platform: top?.platform ?? policy.platform,
      level: top?.level ?? null,
      cisId: top ? top.recommendationId : "",
    };
  });
}

interface IsoRollupRow {
  control: string;
  title: string;
  compliantSettings: number;
  totalSettings: number;
  settings: Array<{ name: string; value: string; compliant: boolean | null }>;
}

function buildIsoRollup(settings: EnrichedSetting[]): IsoRollupRow[] {
  const map = new Map<string, { title: string; compliant: number; total: number; settings: Array<{ name: string; value: string; compliant: boolean | null }> }>();
  for (const s of settings) {
    if (!s.hasMatch) continue;
    for (const iso of s.topMatch?.isoMappings ?? []) {
      const e = map.get(iso.isoControl) ?? { title: iso.isoTitle ?? iso.isoControl, compliant: 0, total: 0, settings: [] };
      e.total++;
      if (s.compliant !== false) e.compliant++;
      e.settings.push({ name: s.settingName, value: s.settingValue, compliant: s.compliant });
      map.set(iso.isoControl, e);
    }
  }
  return Array.from(map.entries())
    .map(([ctrl, v]) => ({ control: ctrl, title: v.title, compliantSettings: v.compliant, totalSettings: v.total, settings: v.settings }))
    .sort((a, b) => a.control.localeCompare(b.control));
}

// ── sub-components ─────────────────────────────────────────────────────────────

function PlatformCard({ stat }: { stat: PlatformStat }) {
  const pct = stat.matched > 0 ? Math.round((stat.compliantCount / stat.matched) * 100) : 0;
  const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-border/30 bg-card px-5 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: stat.dot, display: "inline-block", flexShrink: 0 }} />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</span>
      </div>
      <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: barColor }}>{pct}%</div>
      <div className="text-xs text-muted-foreground">{stat.compliantCount} of {stat.matched} matched settings compliant</div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="text-[11px] text-muted-foreground/50">{stat.matched} of {PLATFORM_TOTAL[stat.platform] ?? "?"} CIS benchmark items addressed</div>
    </div>
  );
}

function SettingCard({ s }: { s: EnrichedSetting }) {
  const [open, setOpen] = useState(false);
  const top = s.topMatch;
  return (
    <div className={`rounded-lg border bg-card transition-colors ${s.compliant === false ? "border-red-500/25" : "border-border/30"}`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer" onClick={() => s.hasMatch && setOpen(o => !o)}>
        <div className="flex-1 min-w-0 space-y-2">
          {/* name row */}
          <div className="flex items-center gap-2">
            {s.compliant === true  && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
            {s.compliant === false && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
            {s.compliant === null  && <span className="w-4 h-4 shrink-0" />}
            <span className="text-sm font-semibold text-foreground">{s.settingName}</span>
          </div>
          {/* metadata row */}
          <div className="flex items-center gap-4 pl-6 flex-wrap">
            <span className="text-xs text-muted-foreground">Current Value <span className={`font-semibold ${s.compliant === false ? "text-red-400" : "text-emerald-400"}`}>{s.settingValue || "Not Configured"}</span></span>
            {top && <span className="text-xs text-muted-foreground">CIS Recommended <span className="font-semibold text-foreground">{s.recommended}</span></span>}
            {s.level && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.level === "L1" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"}`}>
                {s.level}
              </span>
            )}
            {top?.platform && top.platform !== "windows11" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 border border-border/20 text-muted-foreground">{PLATFORM_LABEL[top.platform] ?? top.platform}</span>
            )}
            {s.compliant === true  && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"><CheckCircle className="w-3 h-3" />Compliant</span>}
            {s.compliant === false && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25"><XCircle className="w-3 h-3" />Non-Compliant</span>}
          </div>
          {/* tags row */}
          {top && (
            <div className="flex items-center gap-1.5 pl-6 flex-wrap">
              {top.cisControls.slice(0, 2).map(c => (
                <a key={c.control} href="https://www.cisecurity.org/controls/v8" target="_blank" rel="noopener noreferrer" title={c.title}
                   className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors no-underline whitespace-nowrap">
                  CIS v8: {c.control} {c.title.split(" ").slice(0, 4).join(" ")}
                </a>
              ))}
              {top.isoMappings.slice(0, 3).map(i => (
                <a key={i.isoControl} href="https://www.iso.org/standard/27001" target="_blank" rel="noopener noreferrer" title={i.isoTitle ?? ""}
                   className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors no-underline whitespace-nowrap">
                  <span className="text-muted-foreground/50 font-normal">ISO</span> {i.isoControl} {(i.isoTitle ?? "").split(" ").slice(0, 3).join(" ")}
                </a>
              ))}
            </div>
          )}
        </div>
        {s.cisId && (
          <div className="shrink-0 text-[10px] font-bold px-2 py-1 rounded bg-muted/30 border border-border/30 text-muted-foreground font-mono">
            CIS {s.cisId}
          </div>
        )}
      </div>

      {/* expanded detail */}
      {open && top && (
        <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4">
          {s.compliance!.matches.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{m.recommendationId}</span>
                <span className="text-[10px] text-muted-foreground">· {PLATFORM_LABEL[m.platform] ?? m.platform} ·</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.level === "L1" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"}`}>{m.level}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.type === "Automated" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border/20"}`}>{m.type}</span>
                <span className="text-[10px] text-muted-foreground/60">● {Math.round(m.confidence * 100)}%</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{m.title}</p>
              {m.cisControls.length > 0 && (
                <div className="space-y-1 pl-3 border-l-2 border-blue-500/20">
                  {m.cisControls.map(c => (
                    <div key={c.control} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono font-bold text-blue-400 w-8 shrink-0">{c.control}</span>
                      <span className="text-muted-foreground flex-1">{c.title}</span>
                      <div className="flex gap-0.5">
                        {[c.ig1, c.ig2, c.ig3].map((a, idx) => a ? (
                          <span key={idx} className="text-[9px] font-bold px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15">IG{idx+1}</span>
                        ) : null)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {m.isoMappings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.isoMappings.map(iso => (
                    <a key={iso.isoControl} href="https://www.iso.org/standard/27001" target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-amber-500/20 bg-amber-500/5 no-underline hover:bg-amber-500/15 transition-colors">
                      <span className="font-mono font-bold text-amber-400">{iso.isoControl}</span>
                      {iso.isoTitle && <span className="text-muted-foreground">{iso.isoTitle}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IsoRollupRowItem({ row, isLast }: { row: IsoRollupRow; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const pct = row.totalSettings > 0 ? Math.round((row.compliantSettings / row.totalSettings) * 100) : 0;
  const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className={isLast ? "" : "border-b border-border/20"}>
      <div
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${open ? "bg-muted/10" : "hover:bg-muted/5"}`}
      >
        <span className="font-mono text-sm font-bold text-blue-400 w-12 shrink-0">{row.control}</span>
        <span className="text-sm text-muted-foreground flex-1">{row.title}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          <strong className="text-foreground">{row.compliantSettings}</strong> of {row.totalSettings} settings
        </span>
        <div className="w-32 h-1.5 rounded-full bg-muted/40 overflow-hidden shrink-0">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </div>
      {open && (
        <div className="border-t border-border/20 bg-background/50 pb-2 pt-1">
          <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider px-5 py-2 pl-20">
            Settings mapped to {row.control}
          </div>
          {row.settings.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 px-5 py-2 pl-20 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
              {s.compliant === false
                ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                : <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              <span className="text-xs text-foreground flex-1">{s.name}</span>
              <span className={`text-xs font-semibold shrink-0 ${s.compliant === false ? "text-red-400" : "text-emerald-400"}`}>
                {s.value || "Not Configured"}
              </span>
              {s.compliant === false
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">Non-Compliant</span>
                : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">Compliant</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IsoRollupSection({ rows }: { rows: IsoRollupRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">ISO 27001:2022 Control Coverage</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Rollup of CIS benchmark compliance grouped by ISO Annex A control</p>
      </div>
      <div className="rounded-lg border border-border/30 overflow-hidden">
        {rows.map((row, i) => (
          <IsoRollupRowItem key={row.control} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

type FilterType = "all" | "compliant" | "non-compliant" | "windows11" | "ios" | "macos";

interface ComplianceTabProps {
  policies: IntunePolicy[];
  compliance: Record<string, PolicyComplianceData>;
}

export default function ComplianceTab({ policies, compliance }: ComplianceTabProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const allSettings = useMemo<EnrichedSetting[]>(() => {
    const result: EnrichedSetting[] = [];
    for (const policy of policies) {
      const data = compliance[policy.id];
      if (data) result.push(...buildEnrichedSettings(data, policy));
    }
    return result;
  }, [policies, compliance]);

  const matched = allSettings.filter(s => s.hasMatch);

  const platformStats = useMemo<PlatformStat[]>(() => {
    return ["windows11", "ios", "macos"]
      .map(p => {
        const ps = matched.filter(s => s.platform === p);
        if (!ps.length) return null;
        return { platform: p, label: PLATFORM_LABEL[p], dot: PLATFORM_DOT[p], matched: ps.length, compliantCount: ps.filter(s => s.compliant !== false).length } as PlatformStat;
      })
      .filter(Boolean) as PlatformStat[];
  }, [matched]);

  const compliantCount = matched.filter(s => s.compliant !== false).length;
  const nonCompliantCount = matched.filter(s => s.compliant === false).length;
  const platformsPresent = [...new Set(matched.map(s => s.platform))];

  const filtered = useMemo(() => {
    if (filter === "all") return matched;
    if (filter === "compliant") return matched.filter(s => s.compliant !== false);
    if (filter === "non-compliant") return matched.filter(s => s.compliant === false);
    return matched.filter(s => s.platform === filter);
  }, [matched, filter]);

  const isoRollup = useMemo(() => buildIsoRollup(matched), [matched]);

  if (!matched.length) {
    return (
      <div className="rounded-lg border border-border/30 bg-card p-8 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">No CIS benchmark matches found for the selected policies.</p>
        <p className="text-xs text-muted-foreground/60">CIS / ISO 27001 mapping works with Settings Catalog policies on Windows 11, iOS, or macOS.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* platform summary cards */}
      <div className="flex gap-3 flex-wrap">
        {platformStats.map(s => <PlatformCard key={s.platform} stat={s} />)}
      </div>

      {/* CIS benchmark compliance list */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">CIS Benchmark Compliance</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Settings matched against CIS Microsoft Intune Benchmarks</p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {([
              ["all",           `All (${matched.length})`],
              ["compliant",     `Compliant (${compliantCount})`],
              ["non-compliant", `Non-Compliant (${nonCompliantCount})`],
              ...(platformsPresent.includes("windows11") ? [["windows11","Windows"]] : []),
              ...(platformsPresent.includes("ios")       ? [["ios","iOS"]]           : []),
              ...(platformsPresent.includes("macos")     ? [["macos","macOS"]]       : []),
            ] as [FilterType, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${filter === key ? "bg-primary/10 text-primary border-primary/30" : "bg-transparent text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {filtered.map((s, i) => <SettingCard key={i} s={s} />)}
        </div>
      </div>

      {/* ISO 27001 rollup */}
      <IsoRollupSection rows={isoRollup} />

    </div>
  );
}
