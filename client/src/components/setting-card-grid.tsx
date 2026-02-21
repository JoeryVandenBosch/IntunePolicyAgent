import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ShieldCheck, ChevronsUpDown } from "lucide-react";
import type { SecuritySettingDetail } from "@shared/schema";

const RATING_COLORS: Record<string, string> = {
  "Critical": "bg-red-700/20 text-red-500 border-red-500/30",
  "High": "bg-red-500/20 text-red-400 border-red-500/30",
  "Medium": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Low": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const FRAMEWORK_COLOR = "bg-muted text-muted-foreground border-border/40";
const FRAMEWORK_LINK_COLOR = "bg-muted text-muted-foreground border-border/40 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer";

/** Map AI-generated framework labels to reference documentation URLs */
function getFrameworkUrl(fw: string): string | null {
  const f = fw.trim();

  // NIST SP 800-53 controls: e.g. "NIST AC-7", "NIST SC-28", "NIST SP 800-53 AC-7"
  const nistMatch = f.match(/(?:NIST\s*(?:SP\s*)?(?:800-53\s*)?)?([A-Z]{2})-(\d+)/i);
  if (nistMatch && /NIST|SP.?800/i.test(f)) {
    const family = nistMatch[1].toLowerCase();
    const num = nistMatch[2];
    return `https://csf.tools/reference/nist-sp-800-53/r5/${family}/${family}-${num}/`;
  }

  // CIS Controls: e.g. "CIS 1.1.1", "CIS Control 4.1", "CIS Critical Security Controls"
  const cisMatch = f.match(/CIS\s*(?:Control\s*)?(?:Critical\s*Security\s*Controls?\s*)?(\d+(?:\.\d+)*)/i);
  if (cisMatch) {
    return `https://www.cisecurity.org/controls/v8`;
  }
  if (/CIS/i.test(f) && !cisMatch) {
    return `https://www.cisecurity.org/controls/v8`;
  }

  // ISO 27001: e.g. "ISO 27001 A.10", "ISO/IEC 27001:2022"
  if (/ISO.*27001/i.test(f)) {
    return `https://www.iso.org/standard/27001`;
  }

  // NIST CSF: e.g. "NIST CSF PR.DS-1"
  if (/NIST\s*CSF/i.test(f)) {
    return `https://www.nist.gov/cyberframework`;
  }

  // Generic NIST (no specific control)
  if (/NIST/i.test(f)) {
    return `https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final`;
  }

  return null;
}

function SettingCard({ setting, forceOpen }: { setting: SecuritySettingDetail; forceOpen?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ratingColor = RATING_COLORS[setting.securityRating] || RATING_COLORS["Medium"];

  useEffect(() => {
    if (forceOpen !== undefined) setExpanded(forceOpen);
  }, [forceOpen]);

  return (
    <div className="rounded-lg bg-card border border-border/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Badge variant="outline" className={`text-[10px] font-semibold border shrink-0 ${ratingColor}`}>
            {setting.securityRating}
          </Badge>
          <span className="text-sm font-medium text-foreground break-all">{setting.settingName}</span>
        </div>
        {(setting.recommendation || setting.detail) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div className="text-xs text-muted-foreground font-mono">
        Value: {setting.settingValue}
      </div>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-border/20">
          {setting.detail && (
            <p className="text-xs text-muted-foreground leading-relaxed">{setting.detail}</p>
          )}
          {setting.recommendation && (
            <div className="rounded bg-primary/5 border border-primary/10 px-2.5 py-1.5">
              <p className="text-xs text-primary/90">
                <span className="font-medium">Recommendation:</span> {setting.recommendation}
              </p>
            </div>
          )}
        </div>
      )}

      {setting.frameworks && setting.frameworks.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {setting.frameworks.map((fw) => {
            const url = getFrameworkUrl(fw);
            return url ? (
              <a key={fw} href={url} target="_blank" rel="noopener noreferrer" className="no-underline">
                <Badge variant="outline" className={`text-[10px] border ${FRAMEWORK_LINK_COLOR}`}>
                  {fw} ↗
                </Badge>
              </a>
            ) : (
              <Badge key={fw} variant="outline" className={`text-[10px] border ${FRAMEWORK_COLOR}`}>
                {fw}
              </Badge>
            );
          })}
          <span className="text-[9px] text-muted-foreground/40 italic ml-1">AI-suggested mappings</span>
        </div>
      )}
    </div>
  );
}

interface SettingCardGridProps {
  settings: SecuritySettingDetail[];
}

export default function SettingCardGrid({ settings }: SettingCardGridProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const [forceOpen, setForceOpen] = useState<boolean | undefined>(undefined);

  const counts = {
    Critical: settings.filter(s => s.securityRating === "Critical").length,
    High: settings.filter(s => s.securityRating === "High").length,
    Medium: settings.filter(s => s.securityRating === "Medium").length,
    Low: settings.filter(s => s.securityRating === "Low").length,
  };

  const sortOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const sorted = [...settings].sort((a, b) =>
    (sortOrder[a.securityRating] ?? 4) - (sortOrder[b.securityRating] ?? 4)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        {counts.Critical > 0 && <span className="text-red-500 font-medium">{counts.Critical} Critical</span>}
        {counts.High > 0 && <span className="text-red-400 font-medium">{counts.High} High</span>}
        {counts.Medium > 0 && <span className="text-orange-400 font-medium">{counts.Medium} Medium</span>}
        {counts.Low > 0 && <span className="text-yellow-400 font-medium">{counts.Low} Low</span>}
        <span className="text-muted-foreground">({settings.length} settings)</span>
        {settings.length > 1 && (
          <button
            onClick={() => { const next = !allExpanded; setAllExpanded(next); setForceOpen(next); }}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-expand-collapse-security-cards"
          >
            <ChevronsUpDown className="w-3 h-3" />
            <span className="text-[10px]">{allExpanded ? "Collapse" : "Expand"} All</span>
          </button>
        )}
      </div>
      <div className="grid gap-2">
        {sorted.map((setting, idx) => (
          <SettingCard key={idx} setting={setting} forceOpen={forceOpen} />
        ))}
      </div>
    </div>
  );
}
