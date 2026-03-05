import React, { useState, useMemo, useRef } from "react";
import { CheckCircle, XCircle, AlertCircle, ChevronDown } from "lucide-react";
import type {
  IntunePolicy,
  PolicyComplianceData,
  ComplianceBenchmarkMatch,
  ComplianceLookupResult,
} from "@shared/schema";

// ── InfoTooltip — position:fixed so it never clips ───────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      const w = 240;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
      setCoords({ top: r.top, left });
    }
    setVisible(true);
  }
  function hide() { timer.current = setTimeout(() => setVisible(false), 120); }

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 4, verticalAlign: "middle" }}>
      <span
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex items-center justify-center cursor-default select-none flex-shrink-0"
        style={{
          width: 13, height: 13, borderRadius: "50%",
          background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
          color: "#818cf8", fontSize: 8, fontWeight: 700,
        }}
      >i</span>
      {visible && (
        <span
          onMouseEnter={() => { if (timer.current) clearTimeout(timer.current); }}
          onMouseLeave={hide}
          style={{
            position: "fixed", top: coords.top, left: coords.left,
            transform: "translateY(calc(-100% - 8px))",
            background: "#1c2128", border: "1px solid rgba(56,139,253,0.3)",
            borderRadius: 8, padding: "9px 12px", width: 240,
            fontSize: 11, lineHeight: 1.65, color: "#cdd9e5",
            zIndex: 99999, boxShadow: "0 8px 28px rgba(0,0,0,0.7)",
            fontWeight: 400, pointerEvents: "auto",
          }}
        >{text}</span>
      )}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Translate common Windows SIDs to friendly names */
function translateSids(value: string): string {
  const SID_MAP: Record<string, string> = {
    "*S-1-5-32-544": "Administrators",
    "*S-1-5-32-545": "Users",
    "*S-1-5-32-546": "Guests",
    "*S-1-5-32-547": "Power Users",
    "*S-1-5-32-548": "Account Operators",
    "*S-1-5-32-550": "Print Operators",
    "*S-1-5-32-551": "Backup Operators",
    "S-1-5-32-544":  "Administrators",
    "S-1-5-32-545":  "Users",
  };
  let result = value;
  for (const [sid, name] of Object.entries(SID_MAP)) {
    result = result.replace(new RegExp(sid.replace(/[*]/g, "\\*"), "gi"), name);
  }
  return result;
}

function extractRecommended(title: string): string {
  const clean = title.replace(/[\u2018\u2019\u201C\u201D]/g, "'");
  const m = clean.match(/is set to\s+'([^'\n]+)'/) ||
            clean.match(/is set to\s+"([^"\n]+)"/) ||
            clean.match(/is set to\s+(\S+)/i);
  return m ? m[1].replace(/\s*\(Automated\)|\s*\(Manual\)/gi, "").trim() : "See benchmark";
}

function normaliseVal(v: string) {
  return translateSids(v).toLowerCase().replace(/\s+/g, " ").trim();
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

const PLATFORM_TOTAL: Record<string, number> = { windows11: 1254, ios: 256, macos: 224 };
const PLATFORM_LABEL: Record<string, string> = { windows11: "Windows 11", ios: "iOS / iPadOS", macos: "macOS Sequoia" };
const PLATFORM_DOT: Record<string, string>   = { windows11: "#3b82f6", ios: "#a78bfa", macos: "#f97316" };

interface PlatformStat { platform: string; label: string; dot: string; matched: number; compliantCount: number; }

interface EnrichedSetting {
  settingName: string;
  settingValue: string;
  displayValue: string;
  hasSid: boolean;
  compliance: ComplianceLookupResult | null;
  hasMatch: boolean;
  topMatch: ComplianceBenchmarkMatch | null;
  recommended: string;
  compliant: boolean | null;
  platform: string;
  level: "L1" | "L2" | null;
  cisId: string;
  policyName: string;
  policyId: string;
}

function buildEnrichedSettings(
  data: PolicyComplianceData,
  policy: IntunePolicy
): EnrichedSetting[] {
  return data.settings.map(s => {
    const c = s.compliance;
    const top = c?.matches[0] ?? null;
    const displayValue = translateSids(s.settingValue);
    const hasSid = displayValue !== s.settingValue;
    return {
      settingName: s.settingName,
      settingValue: s.settingValue,
      displayValue,
      hasSid,
      compliance: c,
      hasMatch: !!top,
      topMatch: top,
      recommended: top ? extractRecommended(top.title) : "",
      compliant: top ? isCompliant(s.settingValue, top) : null,
      platform: top?.platform ?? policy.platform,
      level: top?.level ?? null,
      cisId: top ? top.recommendationId : "",
      policyName: policy.name ?? "Unknown policy",
      policyId: policy.id,
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
      e.settings.push({ name: s.settingName, value: s.displayValue, compliant: s.compliant });
      map.set(iso.isoControl, e);
    }
  }
  return Array.from(map.entries())
    .map(([ctrl, v]) => ({ control: ctrl, title: v.title, compliantSettings: v.compliant, totalSettings: v.total, settings: v.settings }))
    .sort((a, b) => a.control.localeCompare(b.control));
}

// ── ValueComparison bar ───────────────────────────────────────────────────────

function ValueComparison({ s }: { s: EnrichedSetting }) {
  const compliant = s.compliant;
  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      borderRadius: 8, overflow: "hidden",
      border: `1px solid ${compliant ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.25)"}`,
      marginBottom: 14, fontSize: 12,
    }}>
      {/* current */}
      <div style={{ flex: 1, padding: "10px 14px", background: compliant ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.08)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 10, color: "#484f58", marginBottom: 4, fontWeight: 600 }}>
          Current value
          {s.hasSid && <InfoTooltip text={`Intune returns raw Windows SID values. Translated: ${s.displayValue}. Original: ${s.settingValue}`} />}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: compliant ? "#22c55e" : "#ef4444", display: "flex", alignItems: "center", gap: 6 }}>
          <span>{compliant ? "✓" : "✕"}</span>
          {s.displayValue || "Not Configured"}
        </div>
      </div>
      {/* divider */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px", background: "rgba(255,255,255,0.02)", color: "#484f58", fontSize: 16, flexShrink: 0 }}>
        {compliant ? "=" : "≠"}
      </div>
      {/* recommended */}
      <div style={{ flex: 1, padding: "10px 14px", background: "rgba(56,139,253,0.06)", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 10, color: "#484f58", marginBottom: 4, fontWeight: 600 }}>
          CIS recommended
          <InfoTooltip text="The value the CIS Microsoft Intune benchmark recommends for this setting." />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#58a6ff" }}>{s.recommended}</div>
      </div>
      {/* status */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", background: compliant ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", borderLeft: `1px solid ${compliant ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.2)"}`, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: compliant ? "#22c55e" : "#ef4444" }}>
          {compliant ? "Compliant" : "Non-Compliant"}
        </span>
      </div>
    </div>
  );
}

// ── PlatformCard ──────────────────────────────────────────────────────────────

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

// ── SettingCard ───────────────────────────────────────────────────────────────

function SettingCard({ s, open, onToggle }: { s: EnrichedSetting; open: boolean; onToggle: () => void }) {
  const top = s.topMatch;
  return (
    <div className={`rounded-lg border bg-card transition-colors ${s.compliant === false ? "border-red-500/20" : "border-border/30"}`}>

      {/* collapsed header — always visible */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        {s.compliant === true  && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
        {s.compliant === false && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
        {s.compliant === null  && <span className="w-4 h-4 shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-1">{s.settingName}</div>
          {/* policy name — always visible */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/50">Policy</span>
            <span className="text-[11px] font-bold text-foreground px-2 py-0.5 rounded"
              style={{ background: "rgba(56,139,253,0.12)", border: "1px solid rgba(56,139,253,0.25)" }}>
              {s.policyName}
            </span>
          </div>
        </div>

        {/* right side summary */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* inline value comparison when collapsed */}
          {!open && top && (
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
              <span style={{ color: s.compliant === false ? "#ef4444" : "#22c55e", fontWeight: 600 }}>{s.displayValue || "Not set"}</span>
              <span className="text-muted-foreground/30">{s.compliant ? "=" : "≠"}</span>
              <span className="text-blue-400 font-medium" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.recommended}</span>
            </span>
          )}

          {/* level badge */}
          {s.level && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center ${s.level === "L1" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"}`}>
              {s.level}
              <InfoTooltip text="L1 means recommended for all environments with minimal usability impact. L2 means higher security but may affect usability." />
            </span>
          )}

          {/* compliant pill */}
          {s.compliant === true  && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle className="w-3 h-3" />Compliant</span>}
          {s.compliant === false && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" />Non-Compliant</span>}

          {/* CIS ID */}
          {s.cisId && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/30 border border-border/30 text-muted-foreground inline-flex items-center">
              CIS {s.cisId}
              <InfoTooltip text="The numbered item in the CIS Microsoft Intune benchmark document — a specific 'Ensure X is set to Y' hardening recommendation." />
            </span>
          )}

          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/40 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        </div>
      </div>

      {/* expanded body */}
      {open && top && (
        <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-3" style={{ background: "rgba(0,0,0,0.2)" }}>

          {/* value comparison bar */}
          <ValueComparison s={s} />

          {/* type + confidence */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded border ${top.type === "Automated" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border/20"}`}>
              {top.type}
              <InfoTooltip text={top.type === "Automated"
                ? "Automated means this CIS check can be verified by a script — no manual review needed."
                : "Manual means this CIS check requires a human to verify — it cannot be checked automatically."} />
            </span>
            <span className="text-[10px] text-muted-foreground/50">● {Math.round(top.confidence * 100)}% match confidence</span>
          </div>

          {/* benchmark title */}
          <p className="text-xs text-muted-foreground leading-relaxed px-3 py-2 rounded border-l-2 border-border/30" style={{ background: "rgba(255,255,255,0.02)" }}>
            {top.title}
          </p>

          {/* CIS Controls + ISO two columns */}
          <div className="flex gap-4 flex-wrap">
            {/* CIS Controls */}
            <div className="flex-1 min-w-[200px] space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center">
                CIS Controls v8
                <InfoTooltip text="High-level security control categories from CIS Controls v8 that this benchmark recommendation contributes to." />
              </div>
              {top.cisControls.map(c => (
                <div key={c.control} className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px]" style={{ background: "rgba(56,139,253,0.04)", border: "1px solid rgba(56,139,253,0.1)" }}>
                  <span className="font-mono font-bold text-blue-400 w-8 shrink-0">{c.control}</span>
                  <span className="text-muted-foreground flex-1">{c.title}</span>
                  <div className="flex gap-1">
                    {([c.ig1, c.ig2, c.ig3] as boolean[]).map((a, idx) => a ? (
                      <span key={idx} className="inline-flex items-center text-[9px] font-bold px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15">
                        IG{idx + 1}
                        <InfoTooltip text={["IG1: Basic cyber hygiene — every organisation should implement this.", "IG2: For mid-size organisations with dedicated IT staff.", "IG3: For mature security teams with specialised expertise."][idx]} />
                      </span>
                    ) : null)}
                  </div>
                </div>
              ))}
            </div>

            {/* ISO */}
            <div className="flex-1 min-w-[180px] space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center">
                ISO 27001:2022
                <InfoTooltip text="ISO/IEC 27001:2022 Annex A controls that this CIS recommendation maps to, via the official CIS v8 → ISO mapping." />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {top.isoMappings.map(iso => (
                  <a key={iso.isoControl} href="https://www.iso.org/standard/27001" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-amber-500/20 no-underline hover:bg-amber-500/10 transition-colors"
                    style={{ background: "rgba(245,158,11,0.05)" }}>
                    <span className="font-mono font-bold text-amber-400">{iso.isoControl}</span>
                    {iso.isoTitle && <span className="text-muted-foreground">{iso.isoTitle}</span>}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ISO rollup ────────────────────────────────────────────────────────────────

function IsoRollupRowItem({ row, isLast }: { row: IsoRollupRow; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const pct = row.totalSettings > 0 ? Math.round((row.compliantSettings / row.totalSettings) * 100) : 0;
  const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className={isLast ? "" : "border-b border-border/20"}>
      <div onClick={() => setOpen(o => !o)} className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${open ? "bg-muted/10" : "hover:bg-muted/5"}`}>
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
          <div className="text-[10px] font-bold text-muted-foreground/40 tracking-wider px-5 py-2 pl-20">
            Settings mapped to {row.control}
          </div>
          {row.settings.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 px-5 py-2 pl-20 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
              {s.compliant === false
                ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                : <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              <span className="text-xs text-foreground flex-1">{s.name}</span>
              <span className={`text-xs font-semibold shrink-0 ${s.compliant === false ? "text-red-400" : "text-emerald-400"}`}>{s.value || "Not Configured"}</span>
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

// ── Error boundary ────────────────────────────────────────────────────────────

class ComplianceErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: e?.message ?? String(e) }; }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-card p-6 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-red-400/50 mx-auto" />
          <p className="text-sm text-red-400">Compliance tab encountered an error</p>
          <p className="text-xs text-muted-foreground font-mono break-all">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

type FilterType = "all" | "compliant" | "non-compliant" | "windows11" | "ios" | "macos";

interface ComplianceTabProps {
  policies: IntunePolicy[];
  compliance: Record<string, PolicyComplianceData>;
}

function ComplianceTabInner({ policies, compliance }: ComplianceTabProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [openStates, setOpenStates] = useState<boolean[]>([]);

  const allSettings = useMemo<EnrichedSetting[]>(() => {
    const result: EnrichedSetting[] = [];
    for (const policy of policies) {
      const data = compliance[policy.id];
      if (data) result.push(...buildEnrichedSettings(data, policy));
    }
    return result;
  }, [policies, compliance]);

  const matched = allSettings.filter(s => s.hasMatch);

  // Initialise open states when matched changes — all collapsed by default
  const prevMatchedLen = useRef(-1);
  if (prevMatchedLen.current !== matched.length) {
    prevMatchedLen.current = matched.length;
    // Can't call setState here directly — use a ref to signal init needed
  }

  const effectiveOpen = useMemo(() => {
    if (openStates.length !== matched.length) return matched.map(() => false);
    return openStates;
  }, [openStates, matched.length]);

  const allOpen = effectiveOpen.length > 0 && effectiveOpen.every(Boolean);

  function toggleAll() {
    const next = !allOpen;
    setOpenStates(matched.map(() => next));
  }
  function toggleOne(i: number) {
    const base = effectiveOpen.length === matched.length ? effectiveOpen : matched.map(() => false);
    setOpenStates(base.map((v, idx) => idx === i ? !v : v));
  }

  const platformStats = useMemo<PlatformStat[]>(() =>
    ["windows11", "ios", "macos"].map(p => {
      const ps = matched.filter(s => s.platform === p);
      if (!ps.length) return null;
      return { platform: p, label: PLATFORM_LABEL[p], dot: PLATFORM_DOT[p], matched: ps.length, compliantCount: ps.filter(s => s.compliant !== false).length } as PlatformStat;
    }).filter(Boolean) as PlatformStat[],
    [matched]
  );

  const compliantCount    = matched.filter(s => s.compliant !== false).length;
  const nonCompliantCount = matched.filter(s => s.compliant === false).length;
  const platformsPresent  = [...new Set(matched.map(s => s.platform))];

  const filtered = useMemo(() => {
    if (filter === "all") return matched.map((s, i) => ({ s, i }));
    if (filter === "compliant") return matched.map((s, i) => ({ s, i })).filter(({ s }) => s.compliant !== false);
    if (filter === "non-compliant") return matched.map((s, i) => ({ s, i })).filter(({ s }) => s.compliant === false);
    return matched.map((s, i) => ({ s, i })).filter(({ s }) => s.platform === filter);
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

      {/* platform cards */}
      <div className="flex gap-3 flex-wrap">
        {platformStats.map(s => <PlatformCard key={s.platform} stat={s} />)}
      </div>

      {/* CIS list */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground">CIS Benchmark Compliance</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Settings matched against CIS Microsoft Intune Benchmarks</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={toggleAll}
              className="px-3 py-1 rounded text-xs font-medium border border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground transition-colors"
            >
              {allOpen ? "⊟ Collapse all" : "⊞ Expand all"}
            </button>
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
          {filtered.map(({ s, i }) => (
            <SettingCard key={i} s={s} open={effectiveOpen[i] ?? false} onToggle={() => toggleOne(i)} />
          ))}
        </div>
      </div>

      {/* ISO rollup */}
      <IsoRollupSection rows={isoRollup} />
    </div>
  );
}

export default function ComplianceTab(props: ComplianceTabProps) {
  return <ComplianceErrorBoundary><ComplianceTabInner {...props} /></ComplianceErrorBoundary>;
}
