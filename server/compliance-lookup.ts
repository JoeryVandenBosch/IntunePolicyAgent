/**
 * compliance-lookup.ts
 *
 * Phase 2 – CIS Benchmark → ISO 27001 Compliance Lookup Service
 *
 * This module loads the four JSON files generated in Phase 1 and exposes:
 *
 *   lookupComplianceForSetting(settingName, platform)
 *     → { benchmarkMatches, cisControls, isoControls, complianceScore }
 *
 *   enrichPolicyWithCompliance(policyName, settings, platform)
 *     → per-policy compliance summary injected into the analysis response
 *
 * Matching strategy (no AI required — fully deterministic):
 *   1. Normalize both the incoming setting name and benchmark titles.
 *   2. Try exact substring match on title / remediationPath.
 *   3. Fall back to keyword overlap scoring (Jaccard-style).
 *   4. Return top-3 matches with a confidence score 0–1.
 *
 * From those matches we follow the chain:
 *   Benchmark recommendation → CIS Control number → ISO 27001 control(s)
 */

import path from "path";
import fs from "fs";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CisControlRef {
  control: string;       // e.g. "4.8"
  title: string;
  version: string;       // "v8" | "v7"
  ig1: boolean;
  ig2: boolean;
  ig3: boolean;
}

export interface IsoMapping {
  isoControl: string;    // e.g. "A8.4"
  isoTitle: string | null;
  relationship: string | null;  // Subset | Intersect | Equal | Superset
}

export interface BenchmarkMatch {
  platform: string;
  recommendationId: string;  // e.g. "4.1.3.1"
  title: string;
  level: "L1" | "L2";
  type: "Automated" | "Manual";
  confidence: number;        // 0–1
  cisControls: CisControlRef[];
  isoMappings: IsoMapping[];
  implementationGroups: string[];  // which IG levels this covers (IG1/IG2/IG3)
}

export interface ComplianceLookupResult {
  settingName: string;
  platform: string;
  matches: BenchmarkMatch[];
  // Deduplicated union of all matched controls
  allCisControls: string[];    // ["3.3", "4.8"]
  allIsoControls: string[];    // ["A5.10", "A8.4"]
  highestLevel: "L1" | "L2" | null;
  implementationGroups: string[];
  complianceScore: number;     // 0–100: rough measure of CIS coverage completeness
}

// ── Data loading (singleton, loaded once at startup) ───────────────────────

// Resolve the data directory robustly regardless of whether we're running
// as raw TypeScript (tsx), compiled CJS (dist/index.cjs), or in tests.
// Strategy: try several candidate paths, pick the first that exists.
function resolveDataDir(): string {
  const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.join(currentDir, "data/compliance"),
    path.join(currentDir, "../server/data/compliance"),
    path.join(process.cwd(), "server/data/compliance"),
    path.join(process.cwd(), "data/compliance"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "cis-iso-mapping.json"))) {
        console.log(`[compliance-lookup] Data dir resolved: ${dir}`);
        return dir;
      }
    } catch { /* keep trying */ }
  }
  // Last resort — will produce a clear error message in loadData()
  console.warn("[compliance-lookup] Could not resolve data dir, falling back to cwd");
  return path.join(process.cwd(), "server/data/compliance");
}

const DATA_DIR = resolveDataDir();

interface BenchmarkRec {
  id: string;
  title: string;
  level: string;
  type: string;
  description: string;
  rationale: string;
  impact: string;
  remediationPath: string;
  references: string[];
  cisControls: CisControlRef[];
}

interface BenchmarkFile {
  metadata: { platform: string; platformLabel: string; version: string };
  recommendations: BenchmarkRec[];
}

interface IsoMappingFile {
  safeguards: {
    cisControl: string;
    cisSafeguard: string;
    assetType: string | null;
    securityFunction: string | null;
    title: string;
    description: string | null;
    implementationGroups: string[];
    isoMappings: IsoMapping[];
  }[];
}

let _benchmarks: BenchmarkFile[] | null = null;
let _isoMapping: IsoMappingFile | null = null;

// CIS safeguard → {implementationGroups, isoMappings} fast lookup
let _cisSafeguardIndex: Map<string, { implementationGroups: string[]; isoMappings: IsoMapping[] }> | null = null;

function loadData(): void {
  if (_benchmarks && _isoMapping) return;

  try {
    _benchmarks = [
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cis-benchmark-windows11.json"), "utf8")),
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cis-benchmark-ios.json"), "utf8")),
      JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cis-benchmark-macos.json"), "utf8")),
    ];
    _isoMapping = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cis-iso-mapping.json"), "utf8"));

    // Build fast index
    _cisSafeguardIndex = new Map();
    for (const safeguard of _isoMapping.safeguards) {
      _cisSafeguardIndex.set(safeguard.cisSafeguard, {
        implementationGroups: safeguard.implementationGroups,
        isoMappings: safeguard.isoMappings,
      });
    }

    console.log(
      `[compliance-lookup] Loaded ${_benchmarks.reduce((n, b) => n + b.recommendations.length, 0)} benchmark recommendations` +
      ` + ${_isoMapping.safeguards.length} CIS→ISO mappings`
    );
  } catch (err) {
    console.error("[compliance-lookup] Failed to load data files:", err);
    _benchmarks = [];
    _isoMapping = { safeguards: [] };
    _cisSafeguardIndex = new Map();
  }
}

// ── Text normalisation helpers ─────────────────────────────────────────────

/** Tokenise and normalise a string for fuzzy matching */
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/['"''""\(\)\\\/]/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t))
  );
}

// Deliberately kept small — we only strip structural/connector words,
// NOT platform names ("windows") or action words ("enable", "disable")
// because those are meaningful for matching.
const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are",
  "ensure", "not", "yes", "true", "false",
  "value", "settings", "setting", "policy",
  "microsoft", "intune", "apple",
  "configured", "recommended", "default",
]);

/** Jaccard similarity between two token sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter(t => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/**
 * Substring containment boost.
 * IMPORTANT: both q and t must be non-empty before calling this.
 * JavaScript's String.includes("") is always true, so we guard at the call site.
 */
function substringScore(query: string, target: string): number {
  const q = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
  const t = target.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();

  // Guard: empty target would make q.includes(t) trivially true
  if (!t || t.length < 4) return 0;

  if (t.includes(q)) return 0.9;
  if (q.includes(t)) return 0.8;

  // bigram overlap bonus
  const qWords = q.split(/\s+/).filter(w => w.length >= 3);
  const tWords = t.split(/\s+/).filter(w => w.length >= 3);
  if (qWords.length < 2 || tWords.length < 2) return 0;

  const qBigrams = new Set(qWords.slice(0, -1).map((w, i) => `${w} ${qWords[i+1]}`));
  const tBigrams = new Set(tWords.slice(0, -1).map((w, i) => `${w} ${tWords[i+1]}`));
  const bigramOverlap = [...qBigrams].filter(b => tBigrams.has(b)).length;
  return bigramOverlap > 0 ? Math.min(0.6, bigramOverlap * 0.25) : 0;
}

/** Map platform string from Intune to benchmark platform key */
function normalizePlatform(platform: string): string[] {
  const p = platform.toLowerCase();
  if (p.includes("windows")) return ["windows11"];
  if (p.includes("ios") || p.includes("ipad")) return ["ios"];
  if (p.includes("macos") || p.includes("mac")) return ["macos"];
  if (p.includes("android")) return []; // no Android benchmark yet
  // Unknown — search all
  return ["windows11", "ios", "macos"];
}

// ── Core lookup ────────────────────────────────────────────────────────────

/**
 * Find matching CIS Benchmark recommendations for a given Intune setting.
 *
 * @param settingName  Human-readable setting name from AI analysis (e.g. "Require Encryption")
 * @param platform     Policy platform from Intune (e.g. "windows10", "ios", "macOS")
 * @param topK         Max number of matches to return (default 3)
 */
export function lookupComplianceForSetting(
  settingName: string,
  platform: string = "",
  topK = 3
): ComplianceLookupResult {
  loadData();

  const queryTokens = tokenize(settingName);
  const targetPlatforms = normalizePlatform(platform);

  const candidates: Array<{ rec: BenchmarkRec; platformKey: string; score: number }> = [];

  for (const benchmark of _benchmarks!) {
    const pKey = benchmark.metadata.platform;
    if (targetPlatforms.length > 0 && !targetPlatforms.includes(pKey)) continue;

    for (const rec of benchmark.recommendations) {
      // 1. Jaccard on title tokens
      const titleTokens = tokenize(rec.title);
      let score = jaccard(queryTokens, titleTokens);

      // 2. Substring / bigram containment check on raw title (strong signal)
      const sub = substringScore(settingName, rec.title);
      score = Math.max(score, sub);

      // 3. Remediation path — Settings Catalog path often has the exact
      //    setting name, so weight it higher
      if (rec.remediationPath) {
        const pathTokens = tokenize(rec.remediationPath);
        const pathJaccard = jaccard(queryTokens, pathTokens);
        const pathSub = substringScore(settingName, rec.remediationPath);
        score = Math.max(score, pathJaccard * 1.3, pathSub * 1.1);
      }

      // 4. Description match as a weaker signal
      if (score < 0.15 && rec.description) {
        const descTokens = tokenize(rec.description.slice(0, 200));
        const descScore = jaccard(queryTokens, descTokens) * 0.7;
        score = Math.max(score, descScore);
      }

      // Minimum threshold: 0.35 means at least a solid Jaccard overlap or
      // a partial bigram match. This filters out noise entirely.
      if (score >= 0.35) {
        candidates.push({ rec, platformKey: pKey, score: Math.min(score, 1) });
      }
    }
  }

  // Sort by confidence desc, take top K
  candidates.sort((a, b) => b.score - a.score);
  // Only keep truly confident matches (≥0.45) — low scores are noise
  const confident = candidates.filter(c => c.score >= 0.45);
  const top = confident.slice(0, topK);

  // Build enriched matches with CIS controls + ISO mappings
  const matches: BenchmarkMatch[] = top.map(({ rec, platformKey, score }) => {
    const isoMappingsAll: IsoMapping[] = [];
    const implementationGroupsSet = new Set<string>();

    for (const cisCtrl of rec.cisControls) {
      const mapping = _cisSafeguardIndex!.get(cisCtrl.control);
      if (mapping) {
        isoMappingsAll.push(...mapping.isoMappings);
        mapping.implementationGroups.forEach(ig => implementationGroupsSet.add(ig));
      }
    }

    // Deduplicate ISO mappings by control number
    const seenIso = new Set<string>();
    const deduped = isoMappingsAll.filter(m => {
      if (seenIso.has(m.isoControl)) return false;
      seenIso.add(m.isoControl);
      return true;
    });

    return {
      platform: platformKey,
      recommendationId: rec.id,
      title: rec.title,
      level: rec.level as "L1" | "L2",
      type: rec.type as "Automated" | "Manual",
      confidence: Math.round(score * 100) / 100,
      cisControls: rec.cisControls,
      isoMappings: deduped,
      implementationGroups: [...implementationGroupsSet],
    };
  });

  // Aggregate
  const allCisSet = new Set<string>();
  const allIsoSet = new Set<string>();
  const allIgSet = new Set<string>();
  let highestLevel: "L1" | "L2" | null = null;

  for (const m of matches) {
    m.cisControls.forEach(c => allCisSet.add(c.control));
    m.isoMappings.forEach(i => allIsoSet.add(i.isoControl));
    m.implementationGroups.forEach(ig => allIgSet.add(ig));
    if (m.level === "L1") highestLevel = highestLevel ?? "L1";
    if (m.level === "L2") highestLevel = "L2";
  }

  // Compliance score: presence of L1 automated mapping = best, manual = partial
  let complianceScore = 0;
  if (matches.length > 0) {
    const hasL1Automated = matches.some(m => m.level === "L1" && m.type === "Automated");
    const hasL1Manual    = matches.some(m => m.level === "L1" && m.type === "Manual");
    const hasIso         = allIsoSet.size > 0;
    const confidence     = matches[0]?.confidence ?? 0;

    complianceScore = Math.round(
      (hasL1Automated ? 50 : hasL1Manual ? 30 : 10) +
      (hasIso ? 30 : 0) +
      (confidence * 20)
    );
  }

  return {
    settingName,
    platform,
    matches,
    allCisControls: [...allCisSet].sort(),
    allIsoControls: [...allIsoSet].sort(),
    highestLevel,
    implementationGroups: [...allIgSet].sort(),
    complianceScore,
  };
}

/**
 * Enrich a full policy's security settings with CIS/ISO compliance data.
 * Called from the analysis pipeline after AI analysis completes.
 *
 * @param settings  Array of SecuritySettingDetail from AI analysis
 * @param platform  Policy platform string
 */
export function enrichSettingsWithCompliance(
  settings: Array<{ settingName: string; [key: string]: any }>,
  platform: string
): Array<{ settingName: string; compliance: ComplianceLookupResult | null; [key: string]: any }> {
  loadData();
  return settings.map(setting => {
    const result = lookupComplianceForSetting(setting.settingName, platform);
    return {
      ...setting,
      compliance: result.matches.length > 0 ? result : null,
    };
  });
}

/**
 * Compute a policy-level compliance summary from its settings.
 * Returns aggregate CIS/ISO coverage stats.
 */
export function computePolicyComplianceSummary(
  settings: Array<{ settingName: string; [key: string]: any }>,
  platform: string
): {
  coveredSettings: number;
  totalSettings: number;
  coveragePercent: number;
  allCisControls: string[];
  allIsoControls: string[];
  implementationGroups: string[];
  l1Count: number;
  l2Count: number;
} {
  loadData();

  const allCisSet = new Set<string>();
  const allIsoSet = new Set<string>();
  const allIgSet  = new Set<string>();
  let covered = 0;
  let l1Count = 0;
  let l2Count = 0;

  for (const s of settings) {
    const result = lookupComplianceForSetting(s.settingName, platform);
    if (result.matches.length > 0) {
      covered++;
      result.allCisControls.forEach(c => allCisSet.add(c));
      result.allIsoControls.forEach(c => allIsoSet.add(c));
      result.implementationGroups.forEach(ig => allIgSet.add(ig));
      if (result.highestLevel === "L1") l1Count++;
      if (result.highestLevel === "L2") l2Count++;
    }
  }

  return {
    coveredSettings: covered,
    totalSettings: settings.length,
    coveragePercent: settings.length > 0 ? Math.round((covered / settings.length) * 100) : 0,
    allCisControls: [...allCisSet].sort(),
    allIsoControls: [...allIsoSet].sort(),
    implementationGroups: [...allIgSet].sort(),
    l1Count,
    l2Count,
  };
}

// Eagerly load on module import (warm-up)
loadData();
