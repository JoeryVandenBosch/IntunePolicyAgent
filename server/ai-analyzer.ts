import OpenAI from "openai";
import type { IntunePolicyRaw } from "./graph-client";
import type { SettingConflict, SettingComparison } from "@shared/schema";
import { getIntunePortalUrl as generateIntuneUrl } from "../shared/intune-urls";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function callAI(systemPrompt: string, userPrompt: string, maxTokens: number = 4096): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
    });
    const content = response.choices[0]?.message?.content || "";
    const finishReason = response.choices[0]?.finish_reason;
    if (finishReason === "length") {
      console.warn(`AI response truncated (hit ${maxTokens} token limit). Content length: ${content.length}`);
    }
    if (!content) {
      console.error("AI returned empty content");
    }
    return content;
  } catch (error: any) {
    console.error("AI API call failed:", error?.message || error);
    throw error;
  }
}

function extractJSON(raw: string): any {
  let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {}
  }
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace > 0) {
    const truncated = cleaned.substring(0, lastBrace + 1);
    try {
      return JSON.parse(truncated);
    } catch {}
  }
  // Try fixing truncated JSON by closing open braces/brackets
  let attempt = cleaned;
  const firstBrace = attempt.indexOf("{");
  if (firstBrace >= 0) {
    attempt = attempt.substring(firstBrace);
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;
    for (const ch of attempt) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") openBraces++;
      if (ch === "}") openBraces--;
      if (ch === "[") openBrackets++;
      if (ch === "]") openBrackets--;
    }
    // Truncate any incomplete string value
    if (inString) {
      const lastQuote = attempt.lastIndexOf('"');
      if (lastQuote > 0) {
        attempt = attempt.substring(0, lastQuote) + '"';
        // Recount after truncation
        openBraces = 0; openBrackets = 0; inString = false; escape = false;
        for (const ch of attempt) {
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") openBraces++;
          if (ch === "}") openBraces--;
          if (ch === "[") openBrackets++;
          if (ch === "]") openBrackets--;
        }
      }
    }
    attempt += "]".repeat(Math.max(0, openBrackets));
    attempt += "}".repeat(Math.max(0, openBraces));
    try {
      return JSON.parse(attempt);
    } catch {}
  }
  throw new Error("Could not parse AI response as JSON");
}

function formatSettingIdToName(defId: string): string {
  let name = defId.replace(/^.*~/, "");
  const vendorPrefixes = /^(device_vendor_msft_|user_vendor_msft_|vendor_msft_)/i;
  name = name.replace(vendorPrefixes, "");
  const parts = name.split("_").filter(Boolean);
  if (parts.length <= 2) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }
  const meaningful = parts.slice(-3);
  return meaningful.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" > ");
}

function cleanFriendlyName(name: string): string {
  let clean = name.replace(/^(?:DeviceConfigurations|ConfigurationPolicies|DeviceCompliancePolicies|Intents|deviceManagementConfigurationPolicy)[/\\]/i, "");
  clean = clean.replace(/^(device_vendor_msft_|user_vendor_msft_|vendor_msft_)/i, "");
  return clean;
}

function formatSettingsForContext(settings: any[]): string {
  return settings.map((s, idx) => {
    let name = s._settingFriendlyName || "";
    if (!name) {
      const defId = s.settingInstance?.settingDefinitionId || "";
      name = defId ? formatSettingIdToName(defId) : `Setting ${idx + 1}`;
    }
    name = cleanFriendlyName(name);
    const value = s._settingFriendlyValue || getSettingValueForContext(s) || "Configured";
    const category = s._category ? ` [${s._category}]` : "";
    const omaUri = s._omaUri ? ` (OMA-URI: ${s._omaUri})` : "";
    return `  - ${name}: ${value}${category}${omaUri}`;
  }).join("\n");
}

function getSettingValueForContext(setting: any): string {
  if (setting.settingInstance) {
    if (setting.settingInstance.choiceSettingValue) {
      const val = setting.settingInstance.choiceSettingValue.value || "";
      if (val.includes("_1")) return "Enabled";
      if (val.includes("_0")) return "Disabled";
      return val.replace(/^.*~/, "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    if (setting.settingInstance.simpleSettingValue) {
      return String(setting.settingInstance.simpleSettingValue.value || "");
    }
    if (setting.settingInstance.simpleSettingCollectionValue) {
      const items = setting.settingInstance.simpleSettingCollectionValue;
      if (Array.isArray(items)) {
        return items.map((item: any) => String(item.value || item)).join(", ");
      }
    }
  }
  return "Configured";
}

// ── Ground truth extraction ──────────────────────────────────────────────────
// Builds a stable list of { settingKey, settingName, settingValue } purely from
// Graph API data. No AI involved. Used to pre-populate setting names/values in
// prompts AND to overwrite any AI-produced values after the AI responds.

export interface GroundTruthSetting {
  settingKey: string;   // unique stable key for matching (defId or index-based)
  settingName: string;  // human-readable name from API
  settingValue: string; // raw value from API — authoritative, never changes
}

/** Split camelCase or PascalCase into space-separated words.
 *  "DevicePasswordEnabled" → "Device Password Enabled"
 *  Already-spaced names are returned unchanged.
 */
function splitCamelCase(s: string): string {
  if (s.includes(" ")) return s; // already has spaces, leave as-is
  // Insert space before sequences of uppercase+lowercase (PascalCase/camelCase)
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .trim();
}

export function extractGroundTruth(detail: any): GroundTruthSetting[] {
  if (!detail?.settings) return [];
  return detail.settings.map((s: any, idx: number) => {
    // Name: prefer _settingFriendlyName (already resolved via Graph API definition lookup)
    let settingName = s._settingFriendlyName || "";
    if (!settingName) {
      const defId = s.settingInstance?.settingDefinitionId || "";
      settingName = defId ? cleanFriendlyName(formatSettingIdToName(defId)) : `Setting ${idx + 1}`;
    }
    settingName = cleanFriendlyName(settingName);
    // For flat Configuration Profile properties, name is PascalCase without spaces.
    // Split into words so CIS benchmark matching works ("DevicePasswordEnabled" → "Device Password Enabled")
    settingName = splitCamelCase(settingName);

    // Value: cascade through all known Graph API value formats
    let settingValue = "";

    // 1. Already resolved by enrichedDetails pipeline (most reliable)
    if (s._settingFriendlyValue !== undefined && s._settingFriendlyValue !== null && s._settingFriendlyValue !== "") {
      settingValue = String(s._settingFriendlyValue);
    }
    // 2. Settings Catalog: choiceSettingValue
    else if (s.settingInstance?.choiceSettingValue?.value !== undefined) {
      const raw = s.settingInstance.choiceSettingValue.value || "";
      // Suffix-based boolean: _1 = enabled, _0 = disabled (strict suffix match)
      if (/[^a-z]1$/.test(raw) || raw.endsWith("_1") || raw.endsWith("~1")) {
        settingValue = "Enabled";
      } else if (/[^a-z]0$/.test(raw) || raw.endsWith("_0") || raw.endsWith("~0")) {
        settingValue = "Disabled";
      } else {
        settingValue = raw.replace(/^.*[~_]/, "").replace(/_/g, " ").replace(/\w/g, (c: string) => c.toUpperCase());
      }
    }
    // 3. Settings Catalog: simpleSettingValue (integer, string)
    else if (s.settingInstance?.simpleSettingValue?.value !== undefined) {
      settingValue = String(s.settingInstance.simpleSettingValue.value);
    }
    // 4. Settings Catalog: simpleSettingCollectionValue
    else if (Array.isArray(s.settingInstance?.simpleSettingCollectionValue)) {
      settingValue = s.settingInstance.simpleSettingCollectionValue
        .map((item: any) => String(item.value ?? item)).join(", ");
    }
    // 5. Settings Catalog: groupSettingCollectionValue (nested groups)
    else if (Array.isArray(s.settingInstance?.groupSettingCollectionValue)) {
      settingValue = "Configured (group)";
    }
    // 6. OMA-URI raw value
    else if (s._rawValue !== undefined) {
      settingValue = String(s._rawValue);
    }
    // 7. Configuration Profile flat property (boolean true/false from Graph API)
    else if (s._settingFriendlyValue !== undefined) {
      settingValue = String(s._settingFriendlyValue);
    }
    // 8. Fallback
    else {
      settingValue = "Configured";
    }

    // Normalise true/false strings from flat Configuration Profile properties
    if (settingValue === "true") settingValue = "Enabled";
    if (settingValue === "false") settingValue = "Disabled";

    // Stable key: prefer settingDefinitionId, fall back to index
    const settingKey = s.settingInstance?.settingDefinitionId || `idx_${idx}`;

    return { settingKey, settingName, settingValue };
  });
}

// After AI returns its settings array, overwrite every settingName+settingValue
// with the ground truth. AI is only allowed to set securityRating/impactLevel,
// detail/userExperience, recommendation, workaround, frameworks.
export function mergeGroundTruth(
  aiSettings: any[],
  groundTruth: GroundTruthSetting[],
  nameField: string,
  valueField: string
): any[] {
  if (!groundTruth.length) return aiSettings;

  // Build a lookup by index (order is preserved since AI receives the same ordered list)
  return groundTruth.map((gt, idx) => {
    const aiSetting = aiSettings?.[idx] || {};
    return {
      ...aiSetting,
      [nameField]: gt.settingName,   // always from API
      [valueField]: gt.settingValue, // always from API
    };
  });
}

function formatAssignmentsForContext(assignments: any[]): string {
  return assignments.map((a) => {
    const target = a.target || {};
    const type = target["@odata.type"] || "";
    const groupName = target._resolvedGroupName || target.groupId || "Unknown";
    const groupType = target._resolvedGroupType || "";
    const memberCount = target._resolvedMemberCount || 0;
    const filterName = target._resolvedFilterName || target.deviceAndAppManagementAssignmentFilterId || "";
    const filterRule = target._resolvedFilterRule || "";
    const filterType = target.deviceAndAppManagementAssignmentFilterType || "";

    let line = "";
    if (type.includes("allDevices")) {
      line = "  - Target: All Devices";
    } else if (type.includes("allLicensedUsers")) {
      line = "  - Target: All Users";
    } else if (type.includes("exclusion")) {
      line = `  - Excluded Group: "${groupName}" (${groupType}, ${memberCount} members)`;
    } else {
      line = `  - Included Group: "${groupName}" (${groupType}, ${memberCount} members)`;
    }

    if (filterName && filterName !== target.deviceAndAppManagementAssignmentFilterId) {
      line += `\n    Filter: "${filterName}" (mode: ${filterType})`;
      if (filterRule) line += `\n    Filter Rule: ${filterRule}`;
    }

    return line;
  }).join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// DETERMINISTIC API-DRIVEN HELPERS
// These replace AI for fields that can be computed exactly from Graph API data.
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. Assignment scope — built purely from resolved Graph API data ──────────
export function buildAssignmentScope(detail: any): string {
  const assignments = detail?.assignments;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return "This policy is not currently assigned to any users or devices, so it provides no active security protection.";
  }

  const included: string[] = [];
  const excluded: string[] = [];
  const filters: string[] = [];

  for (const a of assignments) {
    const target = a.target;
    if (!target) continue;
    const type = target["@odata.type"] || "";

    if (type.includes("allDevices")) {
      included.push("All Devices");
    } else if (type.includes("allLicensedUsers")) {
      included.push("All Licensed Users");
    } else if (type.includes("exclusion")) {
      const name = target._resolvedGroupName || target.groupId || "Unknown group";
      const count = target._resolvedMemberCount;
      excluded.push(count ? `${name} (${count} members)` : name);
    } else if (target.groupId) {
      const name = target._resolvedGroupName || target.groupId || "Unknown group";
      const count = target._resolvedMemberCount;
      included.push(count ? `${name} (${count} members)` : name);
    }

    if (target.deviceAndAppManagementAssignmentFilterId && target._resolvedFilterName) {
      const mode = target.deviceAndAppManagementAssignmentFilterType === "include" ? "Include" : "Exclude";
      const rule = target._resolvedFilterRule ? ` — rule: ${target._resolvedFilterRule}` : "";
      filters.push(`${target._resolvedFilterName} (mode: ${mode}${rule})`);
    }
  }

  if (included.length === 0) {
    return "This policy is not currently assigned to any users or devices, so it provides no active security protection.";
  }

  let scope = `This policy is assigned to: ${included.join(", ")}.`;
  if (excluded.length > 0) {
    scope += ` The following are excluded: ${excluded.join(", ")}.`;
  }
  if (filters.length > 0) {
    scope += ` Assignment filters applied: ${filters.join("; ")}.`;
  }
  return scope;
}

// ── 2. Policy-level rating rollup from per-setting ratings ───────────────────
// No more AI guessing — if any setting is Critical, policy is Critical, etc.
export function calculatePolicyRating(
  settings: any[],
  ratingField: "securityRating" | "impactLevel"
): string {
  if (!settings || settings.length === 0) return "Low";
  const ORDER = ["Critical", "High", "Medium", "Low", "Minimal"];
  let highest = ORDER.length - 1;
  for (const s of settings) {
    const r = s[ratingField] || "Low";
    const idx = ORDER.indexOf(r);
    if (idx !== -1 && idx < highest) highest = idx;
  }
  return ORDER[highest];
}

// ── 3. Compliance frameworks — aggregated from compliance-lookup, not AI ─────
import { lookupComplianceForSetting } from "./compliance-lookup.js";

export function aggregateComplianceFrameworks(
  settings: Array<{ settingName: string }>,
  platform: string
): string[] {
  const frameworks = new Set<string>();
  // Always include the three core frameworks if we have any settings
  if (settings.length > 0) {
    frameworks.add("NIST SP 800-53 Rev. 5");
    frameworks.add("CIS Critical Security Controls v8");
    frameworks.add("ISO/IEC 27001");
  }
  // Add specific ones from compliance-lookup matches
  for (const s of settings.slice(0, 30)) { // cap at 30 to avoid perf hit
    try {
      const result = lookupComplianceForSetting(s.settingName, platform);
      for (const match of result.matches) {
        if (match.level === "L1" || match.level === "L2") {
          frameworks.add("CIS Critical Security Controls v8");
        }
        for (const iso of match.isoMappings) {
          if (iso.isoControl) frameworks.add("ISO/IEC 27001");
        }
        for (const cis of match.cisControls) {
          if (cis.version === "v8") frameworks.add("CIS Critical Security Controls v8");
        }
      }
    } catch { /* non-fatal */ }
  }
  return [...frameworks].sort();
}

// ── 4. Known-setting security risk registry ──────────────────────────────────
// Maps exact settingDefinitionId substrings → deterministic security rating.
// Covers the most common CSP paths across Windows, iOS, Android, macOS.
// AI rating is overridden with this value when a match is found.
// Sources: Windows Security Baseline, CIS Benchmarks L1/L2, NIST guidance.

type RiskLevel = "Critical" | "High" | "Medium" | "Low";

interface KnownRisk {
  rating: RiskLevel;
  // Optionally override the plain-language detail/userExperience when blank
  hint?: string;
}

const KNOWN_RISK_REGISTRY: Array<{ pattern: string; risk: KnownRisk }> = [
  // ── Defender / Antivirus ──────────────────────────────────────────────────
  { pattern: "defender_allowrealtimemonitoring",          risk: { rating: "Critical", hint: "Real-time malware protection" } },
  { pattern: "defender_allowbehaviormonitoring",          risk: { rating: "Critical", hint: "Behavioral threat detection" } },
  { pattern: "defender_allowcloudprotection",             risk: { rating: "Critical", hint: "Cloud-delivered threat intelligence" } },
  { pattern: "defender_allowioavprotection",              risk: { rating: "Critical", hint: "On-access file scanning" } },
  { pattern: "defender_enablenetworkprotection",          risk: { rating: "Critical", hint: "Network-based exploit protection" } },
  { pattern: "defender_disablecatchupfullscan",           risk: { rating: "High"     } },
  { pattern: "defender_disablecatchupquickscan",          risk: { rating: "High"     } },
  { pattern: "defender_allowscanningnetworkfiles",        risk: { rating: "High"     } },
  { pattern: "defender_allowscriptscanning",              risk: { rating: "High"     } },
  { pattern: "defender_allowscanarchivefiles",            risk: { rating: "Medium"   } },
  { pattern: "defender_allowremovablevolumefilesinspect", risk: { rating: "High"     } },
  { pattern: "defender_puaprotection",                    risk: { rating: "Medium"   } },
  { pattern: "defender_submitsamplesconsent",             risk: { rating: "Medium"   } },
  { pattern: "defender_signatureupdatefallbackorder",     risk: { rating: "Medium"   } },
  { pattern: "defender_schedulequickscantime",            risk: { rating: "Low"      } },
  { pattern: "defender_schedulescanday",                  risk: { rating: "Low"      } },

  // ── BitLocker / Encryption ────────────────────────────────────────────────
  { pattern: "bitlocker_requiredeviceencryption",         risk: { rating: "Critical", hint: "Full-disk encryption enforcement" } },
  { pattern: "bitlocker_encryptionmethod",                risk: { rating: "High"     } },
  { pattern: "bitlocker_enableprebootinputprotectors",    risk: { rating: "High"     } },
  { pattern: "bitlocker_allowstandarduserencryption",     risk: { rating: "Medium"   } },
  { pattern: "bitlocker_recoveryoptions",                 risk: { rating: "Medium"   } },
  { pattern: "devicepasswordenabled",                     risk: { rating: "Critical", hint: "Device PIN/password enforcement" } },
  { pattern: "requiredeviceencryption",                   risk: { rating: "Critical", hint: "Storage encryption" } },
  { pattern: "storagecardencrypt",                        risk: { rating: "High"     } },

  // ── Authentication / Password ─────────────────────────────────────────────
  { pattern: "devicelock_devicepasswordenabled",          risk: { rating: "Critical" } },
  { pattern: "devicelock_mindevicepasswordlength",        risk: { rating: "High"     } },
  { pattern: "devicelock_devicepasswordexpiration",       risk: { rating: "Medium"   } },
  { pattern: "devicelock_maxinactivitytimedevicelock",    risk: { rating: "High"     } },
  { pattern: "devicelock_maxdevicepasswordfailedattempts",risk: { rating: "High"     } },
  { pattern: "devicelock_allowsimpledevicepassword",      risk: { rating: "High"     } },
  { pattern: "devicelock_alphanumericdevicepasswordreq",  risk: { rating: "High"     } },
  { pattern: "devicelock_minpasswordcomplexcharacters",   risk: { rating: "High"     } },
  { pattern: "accountsettings_allowmicrosoftaccountconn", risk: { rating: "Medium"   } },
  { pattern: "accounts_allowaddingnonmicrosoftaccount",   risk: { rating: "Medium"   } },
  { pattern: "localpoliciessecurityoptions_accounts",     risk: { rating: "High"     } },
  { pattern: "localpoliciessecurityoptions_interactivelog",risk: { rating: "High"    } },
  { pattern: "authentication_allowfastreconnect",         risk: { rating: "Medium"   } },
  { pattern: "passcodelock",                              risk: { rating: "Critical" } },
  { pattern: "minimumpasscodelength",                     risk: { rating: "High"     } },
  { pattern: "maxinactivitytimedevicelock",               risk: { rating: "High"     } },

  // ── Windows Firewall ──────────────────────────────────────────────────────
  { pattern: "firewall_enablefirewall",                   risk: { rating: "Critical", hint: "Host-based firewall protection" } },
  { pattern: "firewall_defaultinboundaction",             risk: { rating: "High"     } },
  { pattern: "firewall_defaultoutboundaction",            risk: { rating: "Medium"   } },
  { pattern: "firewall_disablestealthmode",               risk: { rating: "High"     } },
  { pattern: "firewall_disableunirecast",                 risk: { rating: "Medium"   } },
  { pattern: "firewall_allowlocalfirewallrules",          risk: { rating: "Medium"   } },

  // ── SmartScreen / Browser ─────────────────────────────────────────────────
  { pattern: "smartscreen_enablesmartscreeninshell",      risk: { rating: "High",    hint: "Windows SmartScreen protection" } },
  { pattern: "smartscreen_enableappsinstallcontrol",      risk: { rating: "High"     } },
  { pattern: "browser_allowsmartscreen",                  risk: { rating: "High"     } },
  { pattern: "browser_preventsmartscreenpromptoverride",  risk: { rating: "High"     } },
  { pattern: "browser_preventsmartscreenpromptoverrideforfiles", risk: { rating: "High" } },
  { pattern: "browser_blockmixedcontent",                 risk: { rating: "High"     } },
  { pattern: "browser_allowpasswordmanager",              risk: { rating: "Medium"   } },
  { pattern: "browser_allowinprivate",                    risk: { rating: "Low"      } },
  { pattern: "browser_allowdevelopertools",               risk: { rating: "Low"      } },
  { pattern: "browserblock",                              risk: { rating: "Medium"   } },
  { pattern: "safariallowpopups",                         risk: { rating: "Low"      } },
  { pattern: "safaricookieacceptpolicy",                  risk: { rating: "Medium"   } },

  // ── Windows Update / Patching ─────────────────────────────────────────────
  { pattern: "update_requireupdateapproval",              risk: { rating: "High"     } },
  { pattern: "update_allowautoupdate",                    risk: { rating: "High",    hint: "Automatic security patch delivery" } },
  { pattern: "update_deferqualityupdatesperioddays",      risk: { rating: "High",    hint: "Delay before security patches install" } },
  { pattern: "update_deferfeatureupdatesperioddays",      risk: { rating: "Medium"   } },
  { pattern: "update_scheduledinstallday",                risk: { rating: "Low"      } },
  { pattern: "update_pausequalityupdates",                risk: { rating: "High"     } },
  { pattern: "update_managepreviewbuilds",                risk: { rating: "Medium"   } },
  { pattern: "softwareupdates_enforcedos",                risk: { rating: "High"     } },

  // ── App Installation / Store ──────────────────────────────────────────────
  { pattern: "applicationmanagement_allowappstoreautoupdate", risk: { rating: "High" } },
  { pattern: "applicationmanagement_allowgaminginisolateduserenv", risk: { rating: "Medium" } },
  { pattern: "applicationmanagement_allowstore",          risk: { rating: "Medium"   } },
  { pattern: "applicationmanagement_allowalltrustedapps", risk: { rating: "High",    hint: "Sideloading unsigned applications" } },
  { pattern: "applicationmanagement_requireprivatestoreonly", risk: { rating: "High" } },
  { pattern: "appinstallcontrol",                         risk: { rating: "High"     } },
  { pattern: "enterpriseallowedapps",                     risk: { rating: "Medium"   } },

  // ── USB / Removable Storage ───────────────────────────────────────────────
  { pattern: "storage_allowremovablestorage",             risk: { rating: "High",    hint: "USB and removable media data exfiltration" } },
  { pattern: "connectivity_allowusbconnection",           risk: { rating: "High"     } },
  { pattern: "devicelock_allowidlereturnwithoutpassword", risk: { rating: "High"     } },
  { pattern: "removabledrivespolicy",                     risk: { rating: "High"     } },

  // ── Bluetooth ─────────────────────────────────────────────────────────────
  { pattern: "bluetooth_allowadvertising",                risk: { rating: "Medium"   } },
  { pattern: "bluetooth_allowdiscoverablemode",           risk: { rating: "Medium"   } },
  { pattern: "bluetooth_allowprepairing",                 risk: { rating: "Medium"   } },
  { pattern: "bluetooth_allowpromotedconnection",         risk: { rating: "Low"      } },
  { pattern: "bluetooth_localdevicename",                 risk: { rating: "Low"      } },

  // ── VPN / Network ─────────────────────────────────────────────────────────
  { pattern: "vpn_allowvpn",                              risk: { rating: "Medium"   } },
  { pattern: "wifi_allowwifi",                            risk: { rating: "Medium"   } },
  { pattern: "wifi_allowautomaticconnectinghotspot",      risk: { rating: "High",    hint: "Automatic connection to unknown networks" } },
  { pattern: "wifi_allowmanualwificonfiguration",         risk: { rating: "Medium"   } },
  { pattern: "connectivity_allowcellulardata",            risk: { rating: "Low"      } },

  // ── Windows Hello / Biometrics ────────────────────────────────────────────
  { pattern: "passportforwork",                           risk: { rating: "Medium"   } },
  { pattern: "biometrics_allowbiometrics",                risk: { rating: "Medium"   } },
  { pattern: "biometrics_facialfeaturesuseenhancedantisp",risk: { rating: "High"     } },
  { pattern: "windowshello",                              risk: { rating: "Medium"   } },

  // ── Telemetry / Privacy ───────────────────────────────────────────────────
  { pattern: "system_allowtelemetry",                     risk: { rating: "Low"      } },
  { pattern: "privacy_letappsaccesscalendar",             risk: { rating: "Medium"   } },
  { pattern: "privacy_letappsaccesscamera",               risk: { rating: "Medium"   } },
  { pattern: "privacy_letappsaccesscontacts",             risk: { rating: "Medium"   } },
  { pattern: "privacy_letappsaccesslocation",             risk: { rating: "Medium"   } },
  { pattern: "privacy_letappsaccessmicrophone",           risk: { rating: "Medium"   } },
  { pattern: "experience_allowwindowsspotlight",          risk: { rating: "Low"      } },
  { pattern: "experience_allowtailoredexperienceswithdiagnosticdata", risk: { rating: "Low" } },
  { pattern: "experience_allowcortana",                   risk: { rating: "Medium"   } },

  // ── Credential Guard / Virtualization ────────────────────────────────────
  { pattern: "virtualizationbasedtechnology",             risk: { rating: "High"     } },
  { pattern: "credentialguard",                           risk: { rating: "High",    hint: "Credential theft protection" } },
  { pattern: "hypervisorprotectedcodeintegrity",          risk: { rating: "High"     } },
  { pattern: "lsaprotection",                             risk: { rating: "Critical", hint: "Protects Windows credential store from LSASS attacks" } },

  // ── Audit / Logging ───────────────────────────────────────────────────────
  { pattern: "auditpolicy",                               risk: { rating: "High"     } },
  { pattern: "eventlog",                                  risk: { rating: "Medium"   } },

  // ── Email / Exchange ──────────────────────────────────────────────────────
  { pattern: "email_allowidlereturnwithoutpassword",      risk: { rating: "High"     } },
  { pattern: "exchange_requiressl",                       risk: { rating: "High",    hint: "Encrypted email transmission" } },

  // ── iOS / macOS specific ──────────────────────────────────────────────────
  { pattern: "allowscreenshot",                           risk: { rating: "Medium"   } },
  { pattern: "allowfingerprintunlock",                    risk: { rating: "Medium"   } },
  { pattern: "allowfaceid",                               risk: { rating: "Medium"   } },
  { pattern: "forcedencryptedbackup",                     risk: { rating: "High"     } },
  { pattern: "allowcloudbackup",                          risk: { rating: "Medium"   } },
  { pattern: "allowcloudkeychainsyncing",                 risk: { rating: "Medium"   } },
  { pattern: "allowmanagedappscloudiorcloud",             risk: { rating: "Medium"   } },
  { pattern: "allowcopypastetoenterprisecontexts",        risk: { rating: "High",    hint: "Data exfiltration via clipboard" } },
  { pattern: "requiremanageddomainsforpasswords",         risk: { rating: "Medium"   } },
  { pattern: "safeguard",                                 risk: { rating: "Medium"   } },
  { pattern: "gatekeeper",                                risk: { rating: "High",    hint: "macOS application trust enforcement" } },
  { pattern: "systeminboundconnections",                  risk: { rating: "High"     } },
  { pattern: "automaticupdates",                          risk: { rating: "High"     } },
];

// Lookup a setting's risk from the registry by matching its settingDefinitionId
export function lookupKnownRisk(settingKey: string): KnownRisk | null {
  const key = settingKey.toLowerCase();
  for (const entry of KNOWN_RISK_REGISTRY) {
    if (key.includes(entry.pattern.toLowerCase())) {
      return entry.risk;
    }
  }
  return null;
}

// Apply known-risk registry to a ground truth list, returning enriched objects
// with pre-filled securityRating. AI will then only fill gaps (unknown settings).
export function applyKnownRisks(groundTruth: GroundTruthSetting[]): Array<GroundTruthSetting & { knownRating?: RiskLevel; knownHint?: string }> {
  return groundTruth.map(s => {
    const known = lookupKnownRisk(s.settingKey);
    if (known) {
      return { ...s, knownRating: known.rating, knownHint: known.hint };
    }
    return s;
  });
}

function buildPolicyContext(policies: IntunePolicyRaw[], details: any[]): string {
  return policies.map((p, i) => {
    const detail = details[i];

    // Use ground truth for setting names/values — pure API data, no AI interpretation
    const gt = extractGroundTruth(detail);
    let settingsInfo = "";
    if (gt.length > 0) {
      const totalSettings = gt.length;
      const maxDisplay = 100;
      const displayed = gt.slice(0, maxDisplay);
      const enriched = applyKnownRisks(displayed);
      const rows = enriched.map((s, idx) => {
        const ratingHint = s.knownRating ? ` [KNOWN-RISK:${s.knownRating}]` : "";
        return `  [${idx}] ${s.settingName}: ${s.settingValue}${ratingHint}`;
      }).join("\n");
      settingsInfo = `\nConfigured Settings (${totalSettings} total${totalSettings > maxDisplay ? `, showing first ${maxDisplay}` : ""}):\n${rows}`;
      settingsInfo += `\n\nIMPORTANT: The [index], settingName, and settingValue above are authoritative API values. ` +
        `Copy them EXACTLY into your settings array. Do NOT change, rephrase, or infer any name or value. ` +
        `Your only job for each setting is to add: securityRating or impactLevel, detail or userExperience, recommendation or workaround, frameworks, technicalName.`;
    }

    let assignmentInfo = "";
    if (detail?.assignments) {
      assignmentInfo = `\nAssignments:\n${formatAssignmentsForContext(detail.assignments)}`;
    }
    const odataType = p.rawData?.["@odata.type"] || "";
    const source = p.rawData?._source || "";
    return `
## Policy: ${p.name}
- JSON Key (use this EXACT value as the key in your JSON response): "${p.id}"
- Type: ${p.type}
- Platform: ${p.platform}
- Source: ${source}${odataType ? ` (${odataType})` : ""}
- Last Modified: ${p.lastModified}
- Settings Count: ${detail?.settingsCount || p.settingsCount}
- Description: ${p.description || "N/A"}
${settingsInfo}
${assignmentInfo}
`;
  }).join("\n---\n");
}

function remapAIResponseKeys(aiResult: Record<string, any>, policies: IntunePolicyRaw[]): Record<string, any> {
  const mapped: Record<string, any> = {};
  const policyIds = policies.map(p => p.id);
  const nameToId = new Map(policies.map(p => [p.name.toLowerCase(), p.id]));

  for (const [key, value] of Object.entries(aiResult)) {
    if (policyIds.includes(key)) {
      mapped[key] = value;
    } else {
      const matchByName = nameToId.get(key.toLowerCase());
      if (matchByName) {
        mapped[matchByName] = value;
      } else {
        const partialMatch = policies.find(p =>
          key.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(key.toLowerCase()) ||
          key.includes(p.id.substring(0, 8))
        );
        if (partialMatch) {
          mapped[partialMatch.id] = value;
        } else if (policies.length === 1) {
          mapped[policies[0].id] = value;
        } else {
          mapped[key] = value;
        }
      }
    }
  }
  return mapped;
}

async function analyzeSinglePolicySummary(policy: IntunePolicyRaw, detail: any): Promise<{ id: string; data: any }> {
  const context = buildPolicyContext([policy], [detail]);

  const result = await callAI(
    `You are Microsoft Security Copilot embedded in Microsoft Intune. When an admin clicks "Summarize with Copilot" on a policy, produce output that matches Security Copilot's exact style: a brief intro, a numbered list of thematically-grouped settings, a ranked "Top N Most Important" list, an assignment scope paragraph, and a closing overall summary.

CRITICAL RULES:
- Base your analysis ONLY on actual setting names and values in the provided data. Never invent or infer settings not listed.
- Use plain business English. Translate technical OMA-URI and CSP setting names into human-readable labels.
- Group related settings together thematically (e.g. all Bluetooth settings in one group, all Edge browser settings in one group, all Defender settings in one group).
- Do NOT analyse conflicts — that is handled separately.

Produce a JSON object with ALL of these fields:

- headline: A single crisp sentence summarising what this policy does and why it exists (e.g. "Maximises privacy and restricts user access by disabling Windows Spotlight, Edge browser features, and Bluetooth capabilities.").

- introParagraph: 2–3 sentences in plain language introducing the policy's purpose, what it enforces or restricts, and why it matters. End with "Below is a summary of the key configured settings and their values:".

- settingGroups: A JSON array of thematic groups. Bundle related settings together — do NOT list each setting individually. Each object:
  { "groupName": "Human-readable group label covering all settings in this group (e.g. 'Bluetooth advertising, discoverability, pre-pairing, and proximal connections')", "summary": "One sentence describing what all settings in this group are configured to and what effect that has." }
  Aim for 8–20 groups depending on policy size. Group settings by feature area, not alphabetically.

- topSettings: A JSON array of the most important configured settings, ranked by security/privacy/user-experience impact (most impactful first). Include up to 10. Each object:
  { "name": "Human-readable setting name", "value": "Configured value", "impact": "One sentence explaining why this setting matters and what it protects or restricts." }

- assignmentScope: A plain-language paragraph describing which users, devices, or groups are targeted. Include group names, member counts, and any assignment filters with their rules. If the policy is not assigned, write: "There is no assignment information provided for this policy, meaning it is not currently assigned to any users or devices."

- overallSummary: A closing paragraph (4–6 sentences) summarising the policy's purpose, scope, number of configured settings, what it does well, and any notable gaps or caveats. Reference the policy name (with GUID in parentheses).

- footerNote: A single sentence noting that the summary covers the most important settings and that the policy may contain additional settings not listed here.

- keySettings: Total number of configured settings (integer).
- lastModified: Last modified date as "YYYY-MM-DD".

Return ONLY valid JSON. No markdown, no backticks, no preamble:
{ "headline": "...", "introParagraph": "...", "settingGroups": [...], "topSettings": [...], "assignmentScope": "...", "overallSummary": "...", "footerNote": "...", "keySettings": N, "lastModified": "YYYY-MM-DD" }`,
    `Summarize this Intune policy:\n${context}`,
    12000
  );

  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response for summary");
    }
    if (parsed.headline || parsed.introParagraph || parsed.overallSummary) {
      if (!parsed.overview) parsed.overview = parsed.overallSummary || "";
      // Always inject from API — never trust AI for these
      parsed.keySettings = detail?.settingsCount ?? policy.settingsCount;
      parsed.lastModified = policy.lastModified;
      // Assignment scope from API
      parsed.assignmentScope = buildAssignmentScope(detail);
      return { id: policy.id, data: parsed };
    }
    const firstValue = Object.values(parsed)[0] as any;
    if (firstValue?.headline || firstValue?.introParagraph) {
      if (!firstValue.overview) firstValue.overview = firstValue.overallSummary || "";
      firstValue.keySettings = detail?.settingsCount ?? policy.settingsCount;
      firstValue.lastModified = policy.lastModified;
      firstValue.assignmentScope = buildAssignmentScope(detail);
      return { id: policy.id, data: firstValue };
    }
    throw new Error("Unexpected response structure");
  } catch (e) {
    console.error(`Failed to parse summary for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return {
      id: policy.id,
      data: {
        headline: `${policy.type} policy for ${policy.platform}`,
        introParagraph: `${policy.name} is a ${policy.type} policy targeting ${policy.platform} devices with ${policy.settingsCount} configured settings.`,
        settingGroups: [],
        topSettings: [],
        assignmentScope: "Assignment information not available.",
        overallSummary: `${policy.type} policy for ${policy.platform} with ${policy.settingsCount} configured settings.`,
        overview: `${policy.type} policy for ${policy.platform} with ${policy.settingsCount} configured settings.`,
        footerNote: "",
        keySettings: policy.settingsCount,
        lastModified: policy.lastModified,
      },
    };
  }
}

export async function analyzePolicySummaries(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { overview: string; keySettings: number; lastModified: string }>> {
  const results = await Promise.allSettled(
    policies.map((policy, i) => analyzeSinglePolicySummary(policy, details[i]))
  );
  const merged: Record<string, any> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      merged[result.value.id] = result.value.data;
    } else {
      const p = policies[i];
      console.error(`Summary analysis failed for policy ${p.name}:`, result.reason);
      merged[p.id] = { overview: `${p.type} policy for ${p.platform} with ${p.settingsCount} configured settings.`, keySettings: p.settingsCount, lastModified: p.lastModified };
    }
  });
  return merged;
}

async function analyzeSingleEndUserImpact(policy: IntunePolicyRaw, detail: any): Promise<{ id: string; data: any }> {
  const context = buildPolicyContext([policy], [detail]);

  const result = await callAI(
    `You are Microsoft Security Copilot embedded in Microsoft Intune. When an admin asks about end-user impact of a policy, produce output matching Security Copilot's exact style: per-setting impact details, a numbered thematic group list, a risk analysis split into Productivity/Security/Configuration sub-sections, an assignment scope paragraph, and a closing overall summary.

CRITICAL RULES:
- Base your analysis ONLY on the actual setting names and values provided in the data. Do NOT infer or fabricate settings not listed.
- Use plain business English. Translate technical OMA-URI and CSP setting names into human-readable labels.
- For the keyImpactGroups, group related settings thematically — do NOT list each setting individually.
- Do NOT include conflict analysis — that is handled separately.

Produce a JSON object with ALL of these fields:

- severity: "Minimal"|"Low"|"Medium"|"High"|"Critical" — overall end-user impact severity.

- description: 1–2 sentence plain-language summary of the overall user impact.

- settings: Array of per-setting impact objects — one per configured setting:
  { "settingName": "Human-readable name (NOT raw OMA-URI)", "technicalName": "actual setting path or OMA-URI", "settingValue": "configured value", "impactLevel": "Minimal"|"Low"|"Medium"|"High"|"Critical", "userExperience": "What the end user will actually see or experience in plain language", "workaround": "Workaround the user can apply, or null if none" }
  Include EVERY setting. Sorted by impactLevel descending (Critical first).

- keyImpactGroups: Array of thematic groups bundling related settings — matching Security Copilot's numbered list format:
  { "groupName": "Human-readable group label covering all settings in this group", "impact": "One sentence describing the user-facing impact of all settings in this group." }
  Aim for 5–15 groups. Group by feature area (e.g. all Bluetooth, all Edge privacy, all Defender, all notifications).

- footerNote: One sentence noting the policy configures many more settings all contributing to a controlled environment.

- riskAnalysis: Object with three arrays:
  { "productivity": ["bullet 1", "bullet 2", ...], "security": ["bullet 1", ...], "configuration": ["bullet 1", ...] }
  Each array has 2–4 concrete bullet points referencing actual settings and values. Productivity = user frustration/workflow impact. Security = risks from disabled protections. Configuration = gaps, unassigned state, not-configured settings.

- assignmentScope: Plain-language paragraph describing which users/devices are targeted. Include group names, member counts, and filters. If unassigned: "This policy is not currently assigned to any users or devices, so it has no active impact."

- overallSummary: Closing paragraph (4–6 sentences) summarising purpose, scope, number of configured settings, net user effect, and a verdict on productivity vs security balance.

Return ONLY valid JSON. No markdown, no backticks, no preamble:
{ "severity": "...", "description": "...", "settings": [...], "keyImpactGroups": [...], "footerNote": "...", "riskAnalysis": { "productivity": [...], "security": [...], "configuration": [...] }, "assignmentScope": "...", "overallSummary": "..." }`,
    `Analyze end-user impact for this policy:\n${context}`,
    14000
  );

  const gt = extractGroundTruth(detail);
  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response");
    }
    let data = parsed.severity ? parsed : (Object.values(parsed)[0] as any);
    if (!data?.severity) throw new Error("Unexpected response structure");

    // 1. Overwrite settingName/settingValue with authoritative API values
    if (gt.length > 0 && Array.isArray(data.settings)) {
      data.settings = mergeGroundTruth(data.settings, gt, "settingName", "settingValue");
    }

    // 2. Override AI impactLevel with known-risk registry where available
    const enrichedGtEu = applyKnownRisks(gt);
    if (Array.isArray(data.settings)) {
      data.settings = data.settings.map((s: any, idx: number) => {
        const known = enrichedGtEu[idx]?.knownRating;
        return known ? { ...s, impactLevel: known } : s;
      });
    }

    // 3. Policy severity: rolled up from per-setting impactLevel, not AI guess
    data.severity = calculatePolicyRating(data.settings || [], "impactLevel");

    // 4. Assignment scope: built from resolved API data, not AI
    data.assignmentScope = buildAssignmentScope(detail);

    return { id: policy.id, data };
  } catch (e) {
    console.error(`Failed to parse end-user impact for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return {
      id: policy.id,
      data: {
        severity: "Minimal",
        description: `Standard ${policy.type} configuration with typical user impact.`,
        settings: gt.map(s => ({ settingName: s.settingName, settingValue: s.settingValue, impactLevel: "Minimal", userExperience: "", workaround: null, technicalName: s.settingKey })),
        keyImpactGroups: [],
        footerNote: "",
        riskAnalysis: { productivity: [], security: [], configuration: [] },
        assignmentScope: buildAssignmentScope(detail),
        overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings.`,
      },
    };
  }
}

export async function analyzeEndUserImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { severity: string; description: string; workarounds?: string; policySettingsAndImpact?: string; settings?: any[] | null; assignmentScope?: string; riskAnalysis?: string; overallSummary?: string }>> {
  const results = await Promise.allSettled(
    policies.map((policy, i) => analyzeSingleEndUserImpact(policy, details[i]))
  );
  const merged: Record<string, any> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      merged[result.value.id] = result.value.data;
    } else {
      const p = policies[i];
      console.error(`End-user impact analysis failed for policy ${p.name}:`, result.reason);
      merged[p.id] = { severity: "Minimal", description: `Standard ${p.type} configuration with typical user impact.`, policySettingsAndImpact: `This policy configures ${p.type} settings for ${p.platform}.`, assignmentScope: "Assignment information not available.", riskAnalysis: "Risk analysis not available.", overallSummary: `The "${p.name}" policy is a ${p.type} configuration for ${p.platform} with ${p.settingsCount} configured settings.` };
    }
  });
  return merged;
}

async function analyzeSingleSecurityImpact(policy: IntunePolicyRaw, detail: any): Promise<{ id: string; data: any }> {
  const context = buildPolicyContext([policy], [detail]);

  const result = await callAI(
    `You are Microsoft Security Copilot embedded in Microsoft Intune. When an admin asks about security impact of a policy, produce output matching Security Copilot's exact style: per-setting security details, a numbered thematic group list, named risk categories for C-level leadership, assignment scope, and a board-ready overall summary.

CRITICAL RULES:
- Base your analysis ONLY on the actual setting names and values provided. Do NOT infer or fabricate settings not listed.
- Write in plain business English suitable for a CISO presenting to a board. Avoid jargon.
- Translate technical OMA-URI and CSP setting names into human-readable labels.
- For securityImpactGroups, group related settings thematically — do NOT list each setting individually.
- For riskItems, each item must have a short bold title and 2-3 sentences of plain-language explanation.
- Do NOT include conflict analysis — that is handled separately.

Produce a JSON object with ALL of these fields:

- rating: "Low"|"Medium"|"High"|"Critical" — overall security rating for the policy.

- description: 1-2 sentence plain-language summary of the overall security posture.

- complianceFrameworks: Array of relevant framework names for the whole policy (e.g. ["NIST SP 800-53 Rev. 5", "CIS Critical Security Controls v8", "ISO/IEC 27001"]).

- settings: Array of per-setting security objects — one per configured setting, sorted by securityRating descending (Critical first):
  { "settingName": "Human-readable name", "settingValue": "configured value", "securityRating": "Critical"|"High"|"Medium"|"Low", "detail": "What this protects or risks in plain business terms", "frameworks": ["NIST ...", "CIS ..."], "recommendation": "Specific actionable recommendation" }
  Include EVERY setting. Use human-readable names.

- securityImpactGroups: Array of thematic groups — matching Security Copilot's numbered list format:
  { "groupName": "Human-readable group label", "impact": "One sentence describing the security impact of all settings in this group." }
  Aim for 5-12 groups. Group by feature area (e.g. Defender Antivirus, Browser Security, Device Connectivity, Authentication, Encryption).

- footerNote: One italic sentence noting this covers the most impactful settings and the policy contains many more configurations.

- riskItems: Array of named risk categories — each with a bold title and explanation:
  { "name": "Short bold risk title (e.g. Reduced Threat Detection)", "text": "2-3 sentences explaining the risk in plain language a CISO can present to the board." }
  Aim for 4-7 risk items. Reference actual settings and values.

- assignmentScope: Plain-language paragraph describing which users/devices are protected. Include group names, member counts, and filters. If unassigned: "This policy is not currently assigned to any users or devices, so it provides no active security protection."

- overallSummary: Board-ready closing paragraph (4-6 sentences). Summarise the policy's security controls, assignment scope, number of configured settings, what it protects well, and where gaps exist. End with a clear verdict a CISO could read aloud in a board meeting. Reference specific settings.

Return ONLY valid JSON. No markdown, no backticks, no preamble:
{ "rating": "...", "description": "...", "complianceFrameworks": [...], "settings": [...], "securityImpactGroups": [...], "footerNote": "...", "riskItems": [...], "assignmentScope": "...", "overallSummary": "..." }`,
    `Analyze security impact for this policy:\n${context}`,
    14000
  );

  const gt = extractGroundTruth(detail);
  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response for security impact");
    }
    let data = parsed.rating ? parsed : (Object.values(parsed)[0] as any);
    if (!data?.rating) throw new Error("Unexpected response structure");

    // 1. Overwrite settingName/settingValue with authoritative API values
    if (gt.length > 0 && Array.isArray(data.settings)) {
      data.settings = mergeGroundTruth(data.settings, gt, "settingName", "settingValue");
    }

    // 2. Override AI securityRating with known-risk registry where available
    const enrichedGt = applyKnownRisks(gt);
    if (Array.isArray(data.settings)) {
      data.settings = data.settings.map((s: any, idx: number) => {
        const known = enrichedGt[idx]?.knownRating;
        return known ? { ...s, securityRating: known } : s;
      });
    }

    // 3. Policy-level rating: calculated from per-setting ratings, not AI guess
    data.rating = calculatePolicyRating(data.settings || [], "securityRating");

    // 4. Assignment scope: built from resolved API data, not AI
    data.assignmentScope = buildAssignmentScope(detail);

    // 5. Compliance frameworks: aggregated from compliance-lookup, not AI
    data.complianceFrameworks = aggregateComplianceFrameworks(
      (data.settings || []).map((s: any) => ({ settingName: s.settingName })),
      policy.platform
    );

    return { id: policy.id, data };
  } catch (e) {
    console.error(`Failed to parse security impact for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return {
      id: policy.id,
      data: {
        rating: "Medium",
        description: `Contributes to organisational security posture through ${policy.type} enforcement.`,
        complianceFrameworks: ["General Best Practice"],
        settings: gt.map(s => ({ settingName: s.settingName, settingValue: s.settingValue, securityRating: "Low", detail: "", frameworks: [], recommendation: "" })),
        securityImpactGroups: [],
        footerNote: "",
        riskItems: [],
        assignmentScope: buildAssignmentScope(detail),
        overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings that contributes to organisational security.`,
      },
    };
  }
}

export async function analyzeSecurityImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, any>> {
  const results = await Promise.allSettled(
    policies.map((policy, i) => analyzeSingleSecurityImpact(policy, details[i]))
  );
  const merged: Record<string, any> = {};
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      merged[result.value.id] = result.value.data;
    } else {
      const p = policies[i];
      console.error(`Security impact analysis failed for policy ${p.name}:`, result.reason);
      merged[p.id] = {
        rating: "Medium",
        description: `Contributes to organisational security posture through ${p.type} enforcement.`,
        complianceFrameworks: ["General Best Practice"],
        settings: [],
        securityImpactGroups: [],
        footerNote: "",
        riskItems: [],
        assignmentScope: "Assignment information not available.",
        overallSummary: `The "${p.name}" policy is a ${p.type} configuration for ${p.platform} with ${p.settingsCount} configured settings.`,
      };
    }
  });
  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED PER-POLICY AI CALL
// Replaces 3 separate calls (Summary + End-User Impact + Security Impact)
// with 1 call per policy. Settings context is built once and sent once.
// Post-processing (ground truth merge, known-risk overrides, rating rollup)
// is identical to the individual functions — accuracy is unchanged.
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeSinglePolicyAll(
  policy: IntunePolicyRaw,
  detail: any
): Promise<{ id: string; summary: any; endUserImpact: any; securityImpact: any }> {
  const context = buildPolicyContext([policy], [detail]);
  const gt = extractGroundTruth(detail);
  const enrichedGt = applyKnownRisks(gt);

  const systemPrompt = `You are Microsoft Security Copilot embedded in Microsoft Intune. Analyze the provided Intune policy and produce THREE separate analyses in a single JSON response: a policy summary, an end-user impact assessment, and a security impact assessment.

CRITICAL RULES (apply to ALL three analyses):
- Base your analysis ONLY on the actual setting names and values provided. NEVER invent or infer settings not listed.
- Use plain business English. Translate OMA-URI/CSP names to human-readable labels.
- Do NOT include conflict analysis in any section — that is handled separately.
- Settings marked [KNOWN-RISK:X] already have their rating determined — use that rating for securityRating and impactLevel for those settings.
- Copy settingName and settingValue EXACTLY as provided — do NOT rephrase them.

Return a single JSON object with exactly three top-level keys: "summary", "endUserImpact", "securityImpact".

═══ summary ═══
{ 
  "headline": "Single crisp sentence summarising what this policy does and why it exists.",
  "introParagraph": "2-3 sentences introducing the policy purpose, what it enforces, and why it matters. End with 'Below is a summary of the key configured settings and their values:'",
  "settingGroups": [ { "groupName": "Human-readable group label", "summary": "One sentence describing what all settings in this group are configured to and what effect that has." } ],
  "topSettings": [ { "name": "Human-readable setting name", "value": "Configured value", "impact": "One sentence explaining why this setting matters." } ],
  "overallSummary": "Closing paragraph 4-6 sentences summarising purpose, scope, setting count, strengths, and caveats.",
  "footerNote": "Single sentence noting the summary covers the most important settings.",
  "keySettings": <integer — total configured settings count>,
  "lastModified": "YYYY-MM-DD"
}
Notes: settingGroups — aim for 8-20 thematic groups. topSettings — up to 10, ranked by security/privacy/UX impact.

═══ endUserImpact ═══
{
  "severity": "Minimal|Low|Medium|High|Critical",
  "description": "1-2 sentence plain-language summary of overall user impact.",
  "settings": [ { "settingName": "exact name", "settingValue": "exact value", "impactLevel": "Minimal|Low|Medium|High|Critical", "userExperience": "What the end user will actually see or experience.", "workaround": "Workaround or null" } ],
  "keyImpactGroups": [ { "groupName": "Human-readable group label", "impact": "One sentence describing user-facing impact of all settings in this group." } ],
  "footerNote": "One sentence noting the policy configures many settings contributing to a controlled environment.",
  "riskAnalysis": { "productivity": ["bullet 1", ...], "security": ["bullet 1", ...], "configuration": ["bullet 1", ...] },
  "overallSummary": "Closing paragraph 4-6 sentences on purpose, scope, setting count, net user effect, and productivity vs security verdict."
}
Notes: settings — include EVERY setting, sorted by impactLevel descending. keyImpactGroups — aim for 5-15 groups. riskAnalysis — 2-4 bullets per category.

═══ securityImpact ═══
{
  "rating": "Low|Medium|High|Critical",
  "description": "1-2 sentence plain-language summary of overall security posture.",
  "complianceFrameworks": ["NIST SP 800-53 Rev. 5", "CIS Critical Security Controls v8", "ISO/IEC 27001"],
  "settings": [ { "settingName": "exact name", "settingValue": "exact value", "securityRating": "Critical|High|Medium|Low", "detail": "What this protects or risks in plain business terms.", "frameworks": ["NIST ..."], "recommendation": "Specific actionable recommendation." } ],
  "securityImpactGroups": [ { "groupName": "Human-readable group label", "impact": "One sentence describing the security impact of all settings in this group." } ],
  "footerNote": "One italic sentence noting this covers the most impactful settings.",
  "riskItems": [ { "name": "Short bold risk title", "text": "2-3 sentences explaining the risk in plain language a CISO can present to the board." } ],
  "overallSummary": "Board-ready closing paragraph 4-6 sentences: controls, scope, setting count, strengths, gaps, and a verdict a CISO could read aloud."
}
Notes: settings — include EVERY setting, sorted by securityRating descending. securityImpactGroups — aim for 5-12 groups. riskItems — aim for 4-7 items.

Return ONLY valid JSON. No markdown, no backticks, no preamble:
{ "summary": {...}, "endUserImpact": {...}, "securityImpact": {...} }`;

  const result = await callAI(
    systemPrompt,
    `Analyze this Intune policy:\n${context}`,
    18000
  );

  // ── Fallbacks ──
  const summaryFallback = {
    headline: `${policy.type} policy for ${policy.platform}`,
    introParagraph: `${policy.name} is a ${policy.type} policy targeting ${policy.platform} devices with ${policy.settingsCount} configured settings.`,
    settingGroups: [], topSettings: [],
    assignmentScope: buildAssignmentScope(detail),
    overallSummary: `${policy.type} policy for ${policy.platform} with ${policy.settingsCount} configured settings.`,
    overview: `${policy.type} policy for ${policy.platform} with ${policy.settingsCount} configured settings.`,
    footerNote: "", keySettings: policy.settingsCount, lastModified: policy.lastModified,
  };
  const euFallback = {
    severity: "Minimal" as const, description: `Standard ${policy.type} configuration with typical user impact.`,
    settings: gt.map(s => ({ settingName: s.settingName, settingValue: s.settingValue, impactLevel: "Minimal", userExperience: "", workaround: null, technicalName: s.settingKey })),
    keyImpactGroups: [], footerNote: "",
    riskAnalysis: { productivity: [], security: [], configuration: [] },
    assignmentScope: buildAssignmentScope(detail),
    overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings.`,
  };
  const secFallback = {
    rating: "Medium" as const, description: `Contributes to organisational security posture through ${policy.type} enforcement.`,
    complianceFrameworks: ["General Best Practice"],
    settings: gt.map(s => ({ settingName: s.settingName, settingValue: s.settingValue, securityRating: "Low", detail: "", frameworks: [], recommendation: "" })),
    securityImpactGroups: [], footerNote: "", riskItems: [],
    assignmentScope: buildAssignmentScope(detail),
    overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings that contributes to organisational security.`,
  };

  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") throw new Error("Non-object response");

    const raw = parsed.summary && parsed.endUserImpact && parsed.securityImpact
      ? parsed
      : (() => { throw new Error("Missing top-level keys in combined response"); })();

    // ── Post-process summary ──
    const sum = raw.summary || {};
    if (!sum.overview) sum.overview = sum.overallSummary || "";
    sum.keySettings = detail?.settingsCount ?? policy.settingsCount;
    sum.lastModified = policy.lastModified;
    sum.assignmentScope = buildAssignmentScope(detail);

    // ── Post-process endUserImpact ──
    const eu = raw.endUserImpact || {};
    if (gt.length > 0 && Array.isArray(eu.settings)) {
      eu.settings = mergeGroundTruth(eu.settings, gt, "settingName", "settingValue");
    }
    if (Array.isArray(eu.settings)) {
      eu.settings = eu.settings.map((s: any, idx: number) => {
        const known = enrichedGt[idx]?.knownRating;
        return known ? { ...s, impactLevel: known } : s;
      });
    }
    eu.severity = calculatePolicyRating(eu.settings || [], "impactLevel");
    eu.assignmentScope = buildAssignmentScope(detail);

    // ── Post-process securityImpact ──
    const sec = raw.securityImpact || {};
    if (gt.length > 0 && Array.isArray(sec.settings)) {
      sec.settings = mergeGroundTruth(sec.settings, gt, "settingName", "settingValue");
    }
    if (Array.isArray(sec.settings)) {
      sec.settings = sec.settings.map((s: any, idx: number) => {
        const known = enrichedGt[idx]?.knownRating;
        return known ? { ...s, securityRating: known } : s;
      });
    }
    sec.rating = calculatePolicyRating(sec.settings || [], "securityRating");
    sec.assignmentScope = buildAssignmentScope(detail);
    sec.complianceFrameworks = aggregateComplianceFrameworks(
      (sec.settings || []).map((s: any) => ({ settingName: s.settingName })),
      policy.platform
    );

    return { id: policy.id, summary: sum, endUserImpact: eu, securityImpact: sec };
  } catch (e) {
    console.error(`Combined analysis failed for policy ${policy.name}:`, e, "Raw:", result.substring(0, 300));
    return { id: policy.id, summary: summaryFallback, endUserImpact: euFallback, securityImpact: secFallback };
  }
}

export async function analyzePoliciesAll(
  policies: IntunePolicyRaw[],
  details: any[]
): Promise<{ summaries: Record<string, any>; endUserImpacts: Record<string, any>; securityImpacts: Record<string, any> }> {
  const results = await Promise.allSettled(
    policies.map((policy, i) => analyzeSinglePolicyAll(policy, details[i]))
  );

  const summaries: Record<string, any> = {};
  const endUserImpacts: Record<string, any> = {};
  const securityImpacts: Record<string, any> = {};

  results.forEach((result, i) => {
    const p = policies[i];
    if (result.status === "fulfilled") {
      summaries[result.value.id] = result.value.summary;
      endUserImpacts[result.value.id] = result.value.endUserImpact;
      securityImpacts[result.value.id] = result.value.securityImpact;
    } else {
      console.error(`Combined analysis failed for policy ${p.name}:`, result.reason);
      summaries[p.id] = { overview: `${p.type} policy for ${p.platform} with ${p.settingsCount} configured settings.`, keySettings: p.settingsCount, lastModified: p.lastModified };
      endUserImpacts[p.id] = { severity: "Minimal", description: "", settings: [], keyImpactGroups: [], riskAnalysis: { productivity: [], security: [], configuration: [] }, assignmentScope: "", overallSummary: "" };
      securityImpacts[p.id] = { rating: "Medium", description: "", settings: [], securityImpactGroups: [], riskItems: [], complianceFrameworks: [], assignmentScope: "", overallSummary: "" };
    }
  });

  return { summaries, endUserImpacts, securityImpacts };
}

export async function analyzeAssignments(policies: IntunePolicyRaw[], details: any[], groupResolver: (groupId: string) => Promise<any>): Promise<Record<string, { included: any[]; excluded: any[]; filters: any[] }>> {
  const result: Record<string, any> = {};

  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    const detail = details[i];
    const included: any[] = [];
    const excluded: any[] = [];
    const filters: any[] = [];

    if (detail?.assignments) {
      for (const assignment of detail.assignments) {
        const target = assignment.target;
        if (!target) continue;

        const targetType = target["@odata.type"] || "";
        const groupId = target.groupId;

        if (targetType.includes("allDevices") || targetType.includes("allLicensedUsers")) {
          included.push({
            id: targetType.includes("allDevices") ? "all-devices" : "all-users",
            name: targetType.includes("allDevices") ? "All Devices" : "All Users",
            type: "All devices/users",
            memberCount: 0,
          });
        } else if (targetType.includes("exclusion") && groupId) {
          const groupInfo = await groupResolver(groupId);
          excluded.push(groupInfo);
        } else if (groupId) {
          const groupInfo = await groupResolver(groupId);
          included.push(groupInfo);
        }

        if (target.deviceAndAppManagementAssignmentFilterId) {
          filters.push({
            name: target._resolvedFilterName || target.deviceAndAppManagementAssignmentFilterId,
            rule: target._resolvedFilterRule || "",
            mode: target.deviceAndAppManagementAssignmentFilterType === "include" ? "Include" : "Exclude",
          });
        }
      }
    }

    result[policy.id] = { included, excluded, filters };
  }

  return result;
}

export async function analyzeConflicts(policies: IntunePolicyRaw[], details: any[]): Promise<{ type: string; severity: string; policies: string[]; detail: string; recommendation: string; conflictingSettings?: string; assignmentOverlap?: string; impactAssessment?: string; resolutionSteps?: string }[]> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune policy conflict expert similar to Microsoft Security Copilot. Provide a thorough conflict analysis for the provided policies.

CRITICAL RULES:
- A single policy CANNOT conflict with itself. Conflicts require AT LEAST TWO DIFFERENT policies.
- Only compare policies on the SAME platform. A Windows policy can NEVER conflict with an Android or iOS policy.
- Only compare policies of the SAME source type (e.g., two Settings Catalog policies, or two Configuration Profiles). Different policy types rarely conflict.
- If only ONE policy is provided for a given platform/type, return an empty array [] for that group - there is nothing to compare against.
- Base your analysis ONLY on the actual settings and values provided. Do NOT fabricate conflicts.

Analyze the provided policies for:
1. Direct setting conflicts (same setting configured with different values across TWO OR MORE policies of the same platform and type)
2. Overlapping assignment scopes (same platform, same type, targeting the same groups/users)
3. Redundant configurations (duplicate settings across policies of the same platform and type)
4. Filter conflicts (assignment filters that may cause unexpected behavior)

For each conflict found, provide these structured fields:
- type: "Direct Conflict"|"Potential Overlap"|"Redundant"|"Filter Conflict"
- severity: "Info"|"Warning"|"Critical"
- policies: Array of policy names with GUIDs, e.g. ["V5-IMS-BP-U-Policy Name (guid-here)", "V5-IMS-BP-U-Other Policy (guid-here)"]
- detail: Brief description of the conflict
- conflictingSettings: Detailed paragraph identifying the exact settings that conflict, their configured values in each policy, and what the default behavior is. Reference actual setting names and values. If the conflict is about overlapping scope rather than settings, describe which settings overlap.
- assignmentOverlap: Describe which groups and users are affected by both conflicting policies. Include group names, member counts, and assignment filters. Explain how the overlap causes the conflict to manifest for end users.
- impactAssessment: Explain the real-world impact of this conflict on end users and devices. Consider: which setting value "wins" in Intune conflict resolution, what happens to affected users/devices, potential security gaps, performance implications, or user experience issues.
- resolutionSteps: Provide specific, actionable steps to resolve the conflict. Include which policy to modify, which settings to change, or how to adjust assignments/filters to eliminate the overlap.
- recommendation: Brief 1-2 sentence recommendation (kept for backward compatibility).

Be specific and detailed. Reference actual setting names, group names, filter names, and values. Do not be generic or vague. Write as if you are Microsoft Security Copilot analyzing conflicts.
IMPORTANT: Always refer to policies by their display NAME followed by the GUID in parentheses. Never use the GUID alone.

Return ONLY valid JSON array:
[
  { "type": "...", "severity": "...", "policies": [...], "detail": "...", "conflictingSettings": "...", "assignmentOverlap": "...", "impactAssessment": "...", "resolutionSteps": "...", "recommendation": "..." }
]
Return an empty array [] if no conflicts found.`,
    `Check these policies for conflicts:\n${context}`,
    12000
  );

  try {
    const parsed = extractJSON(result);
    if (!Array.isArray(parsed)) {
      console.error("Conflicts AI returned non-array:", typeof parsed);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse conflicts AI response:", e, "Raw:", result.substring(0, 500));
    return [];
  }
}

export async function analyzeRecommendations(policies: IntunePolicyRaw[], details: any[]): Promise<{ type: string; title: string; detail: string }[]> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune best practices advisor. Analyze the provided policies and generate specific, actionable recommendations.

CRITICAL RULES:
- Every recommendation must reference specific policy names, setting names, or values from the data.
- Do NOT give generic advice. Each recommendation must be tied to something concrete in the provided policies.
- Focus on what can be improved in the Intune admin center right now.

Generate recommendations for:
1. Security hardening - specific settings that should be enabled/changed and why
2. Policy consolidation - if policies overlap or could be merged, explain exactly which ones and how
3. Assignment optimization - specific assignment/filter changes to improve targeting
4. Compliance alignment - specific settings that would help meet compliance frameworks

IMPORTANT: Always refer to policies by their display NAME followed by the GUID in parentheses. Never use the GUID alone without the name.

Return ONLY valid JSON array:
[
  { "type": "Security|Optimization|Best Practice|Compliance", "title": "Short actionable title", "detail": "Specific recommendation referencing actual policy names, settings, and values. Include what to change and where in the Intune portal." }
]`,
    `Generate recommendations for these policies:\n${context}`,
    8000
  );

  try {
    const parsed = extractJSON(result);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Empty or invalid recommendations array");
    }
    return parsed;
  } catch (e) {
    console.error("Failed to parse recommendations AI response:", e, "Raw:", result.substring(0, 500));
    const policyNames = policies.map(p => `"${p.name}"`).join(", ");
    return [
      { type: "Optimization", title: "Review policy overlap", detail: `Review ${policyNames} for overlapping settings. Policies with nearly identical configurations can often be consolidated into a single policy to simplify management. Compare settings side-by-side in the Intune admin center under Devices > Configuration.` },
      { type: "Best Practice", title: "Verify assignment scope", detail: `Confirm that the assignment groups and filters for ${policyNames} target the intended devices and users. Use the Assignments tab in each policy to verify group membership and filter rules match your deployment rings.` },
    ];
  }
}

function getIntunePortalUrl(policy: IntunePolicyRaw): string {
  return generateIntuneUrl({
    id: policy.id,
    name: policy.name,
    source: policy.rawData?._source || "",
    platform: policy.platform || "Unknown",
    odataType: policy.rawData?.["@odata.type"] || "",
    templateId: policy.rawData?.templateReference?.templateId || policy.rawData?.templateId || "",
  });
}

function getSettingValue(setting: any): string {
  if (setting._rawValue) return setting._rawValue;
  if (setting._settingFriendlyValue) return setting._settingFriendlyValue;
  if (setting.settingInstance) {
    if (setting.settingInstance.choiceSettingValue) {
      const val = setting.settingInstance.choiceSettingValue.value || "";
      return val.replace(/^.*~/, "").replace(/_/g, " ");
    }
    if (setting.settingInstance.simpleSettingValue) {
      return String(setting.settingInstance.simpleSettingValue.value || "");
    }
    if (setting.settingInstance.simpleSettingCollectionValue) {
      const items = setting.settingInstance.simpleSettingCollectionValue;
      if (Array.isArray(items)) {
        return items.map((item: any) => String(item.value || item)).join(", ");
      }
    }
    if (setting.settingInstance.groupSettingCollectionValue) {
      const collection = setting.settingInstance.groupSettingCollectionValue;
      if (Array.isArray(collection) && collection.length > 0) {
        const summaries = collection.slice(0, 5).map((group: any, idx: number) => {
          if (group.children && Array.isArray(group.children)) {
            const childValues = group.children.slice(0, 5).map((child: any) => {
              const childName = child.settingDefinitionId?.replace(/^.*~/, "").replace(/_/g, " ") || "";
              const childVal = child.choiceSettingValue?.value?.replace(/^.*~/, "").replace(/_/g, " ")
                || child.simpleSettingValue?.value
                || "Configured";
              return `${childName}: ${childVal}`;
            }).join("; ");
            return `[${idx + 1}] ${childValues}`;
          }
          return `[${idx + 1}] Configured`;
        });
        return `${collection.length} rule(s): ${summaries.join(" | ")}`;
      }
      return `Collection (${collection.length || 0} items)`;
    }
  }
  return "Configured";
}

function getSettingDefinitionId(setting: any): string {
  return setting.settingInstance?.settingDefinitionId || "";
}

export function detectSettingConflicts(policies: IntunePolicyRaw[], details: any[]): { conflicts: SettingConflict[]; allSettings: SettingComparison[] } {
  const settingMap = new Map<string, { policyIdx: number; setting: any; friendlyName: string; value: string }[]>();

  console.log(`detectSettingConflicts: Processing ${policies.length} policies`);
  for (let i = 0; i < policies.length; i++) {
    const detail = details[i];
    if (!detail) {
      console.log(`  Policy ${i} (${policies[i]?.name}): no detail data`);
      continue;
    }

    const source = policies[i].rawData?._source || "unknown";
    const platform = policies[i].platform || "Unknown";
    const hasSettings = detail.settings && Array.isArray(detail.settings);
    const settingsCount = hasSettings ? detail.settings.length : 0;
    console.log(`  Policy ${i} (${policies[i]?.name}): source=${source}, platform=${platform}, settings=${settingsCount}`);

    if (detail.settings && Array.isArray(detail.settings)) {
      for (const setting of detail.settings) {
        const defId = getSettingDefinitionId(setting);
        if (!defId) continue;

        const scopedKey = `${platform}||${source}||${defId}`;
        const rawName = setting._settingFriendlyName || formatSettingIdToName(defId);
        const friendlyName = cleanFriendlyName(rawName);
        const value = getSettingValue(setting);

        if (!settingMap.has(scopedKey)) {
          settingMap.set(scopedKey, []);
        }
        settingMap.get(scopedKey)!.push({ policyIdx: i, setting, friendlyName, value });
      }
    }

  }

  console.log(`  Total unique settings tracked: ${settingMap.size}`);

  const conflicts: SettingConflict[] = [];
  const allSettings: SettingComparison[] = [];

  function normalizeValue(v: string): string {
    let lower = v.toLowerCase().trim();
    lower = lower.replace(/^.*~/, "").replace(/_/g, " ").trim();
    if (lower === "true" || lower === "enabled" || lower === "allow" || lower === "yes" || lower === "1") return "true";
    if (lower === "false" || lower === "disabled" || lower === "block" || lower === "no" || lower === "not configured" || lower === "notconfigured" || lower === "0") return "false";
    return lower;
  }

  settingMap.forEach((entries, scopedKey) => {
    const parts = scopedKey.split("||");
    const defId = parts.length === 3 ? parts[2] : scopedKey;

    const uniquePolicyIds = new Set(entries.map(e => policies[e.policyIdx].id));
    if (uniquePolicyIds.size < 2) {
      const policyEntries = entries.map((e: { policyIdx: number; value: string }) => ({
        policyId: policies[e.policyIdx].id,
        policyName: policies[e.policyIdx].name,
        value: e.value,
        intuneUrl: getIntunePortalUrl(policies[e.policyIdx]),
      }));
      allSettings.push({
        settingName: entries[0].friendlyName,
        settingDefinitionId: defId,
        isConflict: false,
        policyValues: policyEntries,
      });
      return;
    }

    const deduped = new Map<string, typeof entries[0]>();
    for (const entry of entries) {
      const pid = policies[entry.policyIdx].id;
      if (!deduped.has(pid)) {
        deduped.set(pid, entry);
      }
    }
    const dedupedEntries = Array.from(deduped.values());

    const policyEntries = dedupedEntries.map((e) => ({
      policyId: policies[e.policyIdx].id,
      policyName: policies[e.policyIdx].name,
      value: e.value,
      intuneUrl: getIntunePortalUrl(policies[e.policyIdx]),
    }));

    const uniqueValues = new Set(dedupedEntries.map((e) => normalizeValue(e.value)));
    const isConflict = uniqueValues.size > 1;

    if (isConflict) {
      conflicts.push({
        settingName: entries[0].friendlyName,
        settingDefinitionId: defId,
        sourcePolicies: policyEntries,
      });
    }

    allSettings.push({
      settingName: entries[0].friendlyName,
      settingDefinitionId: defId,
      isConflict,
      policyValues: policyEntries,
    });
  });

  allSettings.sort((a, b) => {
    if (a.isConflict && !b.isConflict) return -1;
    if (!a.isConflict && b.isConflict) return 1;
    return a.settingName.localeCompare(b.settingName);
  });

  return { conflicts, allSettings };
}
