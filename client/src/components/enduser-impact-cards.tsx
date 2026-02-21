import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Users, ChevronsUpDown, Info } from "lucide-react";
import type { EndUserSettingDetail } from "@shared/schema";

const IMPACT_DESCRIPTIONS: Record<string, string> = {
  "Critical": "Fundamentally changes how users work. Blocks access to key features or requires major workflow changes.",
  "High": "Noticeably disrupts daily workflow. Users will need to adapt their habits or learn new processes.",
  "Medium": "Moderate friction. Users will notice the change but can adapt quickly with minimal disruption.",
  "Low": "Minor inconvenience. Most users won't notice or will adapt immediately.",
  "Minimal": "No perceptible impact on daily work. Runs silently in the background.",
};

function ImpactTooltip({ level }: { level: string }) {
  const [show, setShow] = useState(false);
  const desc = IMPACT_DESCRIPTIONS[level];
  if (!desc) return null;
  return (
    <div className="relative inline-flex shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help">
        <Info className="w-3 h-3" />
      </span>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-popover border border-border rounded-lg p-2.5 w-[240px] shadow-xl pointer-events-none">
          <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-popover border-r border-b border-border rotate-45" />
          <span className="text-xs text-muted-foreground leading-snug">
            <strong className="text-foreground">{level}</strong> — {desc}
          </span>
        </div>
      )}
    </div>
  );
}

const IMPACT_COLORS: Record<string, string> = {
  "Critical": "bg-red-700/20 text-red-500 border-red-500/30",
  "High": "bg-red-500/20 text-red-400 border-red-500/30",
  "Medium": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Low": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "Minimal": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

function EndUserSettingCard({ setting, forceOpen }: { setting: EndUserSettingDetail; forceOpen?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const impactColor = IMPACT_COLORS[setting.impactLevel] || IMPACT_COLORS["Minimal"];

  useEffect(() => {
    if (forceOpen !== undefined) setExpanded(forceOpen);
  }, [forceOpen]);

  return (
    <div className="rounded-lg bg-card border border-border/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Badge variant="outline" className={`text-[10px] font-semibold border shrink-0 ${impactColor}`}>
            {setting.impactLevel}
          </Badge>
          <ImpactTooltip level={setting.impactLevel} />
          <span className="text-sm font-medium text-foreground break-all">{setting.settingName}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {setting.technicalName && setting.technicalName !== setting.settingName && (
        <div className="text-[10px] text-muted-foreground/60 font-mono truncate" title={setting.technicalName}>
          {setting.technicalName}
        </div>
      )}

      <div className="text-xs text-muted-foreground font-mono">
        Value: {setting.settingValue}
      </div>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-border/20">
          {setting.userExperience && (
            <div>
              <p className="text-[10px] font-medium text-foreground/70 mb-0.5">User experience:</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{setting.userExperience}</p>
            </div>
          )}
          {setting.workaround ? (
            <div className="rounded bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1.5">
              <p className="text-xs text-emerald-400/90">
                <span className="font-medium">Workaround:</span> {setting.workaround}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/50 italic">No workaround needed</p>
          )}
        </div>
      )}
    </div>
  );
}

interface EndUserImpactCardsProps {
  settings: EndUserSettingDetail[];
}

export default function EndUserImpactCards({ settings }: EndUserImpactCardsProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const [forceOpen, setForceOpen] = useState<boolean | undefined>(undefined);

  const counts = {
    Critical: settings.filter(s => s.impactLevel === "Critical").length,
    High: settings.filter(s => s.impactLevel === "High").length,
    Medium: settings.filter(s => s.impactLevel === "Medium").length,
    Low: settings.filter(s => s.impactLevel === "Low").length,
    Minimal: settings.filter(s => s.impactLevel === "Minimal").length,
  };

  const sortOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Minimal: 4 };
  const sorted = [...settings].sort((a, b) =>
    (sortOrder[a.impactLevel] ?? 5) - (sortOrder[b.impactLevel] ?? 5)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        {counts.Critical > 0 && <span className="text-red-500 font-medium">{counts.Critical} Critical</span>}
        {counts.High > 0 && <span className="text-red-400 font-medium">{counts.High} High</span>}
        {counts.Medium > 0 && <span className="text-orange-400 font-medium">{counts.Medium} Medium</span>}
        {counts.Low > 0 && <span className="text-yellow-400 font-medium">{counts.Low} Low</span>}
        {counts.Minimal > 0 && <span className="text-emerald-400 font-medium">{counts.Minimal} Minimal</span>}
        <span className="text-muted-foreground">({settings.length} settings)</span>
        {settings.length > 1 && (
          <button
            onClick={() => { const next = !allExpanded; setAllExpanded(next); setForceOpen(next); }}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-expand-collapse-cards"
          >
            <ChevronsUpDown className="w-3 h-3" />
            <span className="text-[10px]">{allExpanded ? "Collapse" : "Expand"} All</span>
          </button>
        )}
      </div>
      <div className="grid gap-2">
        {sorted.map((setting, idx) => (
          <EndUserSettingCard key={idx} setting={setting} forceOpen={forceOpen} />
        ))}
      </div>
    </div>
  );
}
