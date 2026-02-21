import OpenAI from "openai";
import type { IntunePolicyRaw } from "./graph-client";
import type { SettingConflict, SettingComparison } from "@shared/schema";

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

function buildPolicyContext(policies: IntunePolicyRaw[], details: any[]): string {
  return policies.map((p, i) => {
    const detail = details[i];
    let settingsInfo = "";
    if (detail?.settings) {
      const totalSettings = detail.settings.length;
      const maxDisplay = 80;
      const displayedSettings = detail.settings.slice(0, maxDisplay);
      settingsInfo = `\nConfigured Settings (${totalSettings} total${totalSettings > maxDisplay ? `, showing first ${maxDisplay} of ${totalSettings}` : ""}):\n${formatSettingsForContext(displayedSettings)}`;
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

async function analyzeSinglePolicySummary(policy: IntunePolicyRaw, detail: any): Promise<{ id: string; data: { overview: string; keySettings: number; lastModified: string } }> {
  const context = buildPolicyContext([policy], [detail]);

  const result = await callAI(
    `You are a Microsoft Intune policy expert similar to Microsoft Security Copilot. Analyze the provided policy and generate a factual, data-driven summary.

CRITICAL RULES:
- Base your summary ONLY on the actual setting names and values provided in the data. Do NOT infer, assume, or fabricate settings that are not listed.
- If two policies have identical settings except for one, their summaries should be nearly identical except for that one difference.
- List each configured setting exactly as it appears in the data with its exact value.
- Do NOT add speculative commentary about settings not present in the data.

Provide:
- overview: A structured summary with these sections:
  1. Policy name (with GUID), type, platform, and stated purpose/description.
  2. "Configured Settings:" - List each configured setting using this exact format, one per line:
     SettingName: value — what it controls
     Use the EXACT setting name as it appears in the "Configured Settings" data below. Copy the name character-for-character — do NOT rename, rephrase, add spaces, remove spaces, or add source prefixes. Only discuss settings actually listed in the data.
  3. "Assignment Scope:" - Which groups are targeted (include/exclude), member counts, and any assignment filters with their rules.
  4. "Summary:" - A factual closing: how many settings are configured, the policy's scope, and the overall configuration approach.
  End with: "This summary covers N configured setting(s) for this policy."

- keySettings: number of settings configured
- lastModified: the last modified date

IMPORTANT: Always refer to the policy by its display NAME followed by the GUID in parentheses. Never use the GUID alone without the name.

Return ONLY valid JSON in this format:
{ "overview": "...", "keySettings": N, "lastModified": "YYYY-MM-DD" }`,
    `Analyze this Intune policy:\n${context}`,
    12000
  );

  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response for summary");
    }
    if (parsed.overview) {
      return { id: policy.id, data: parsed };
    }
    const firstValue = Object.values(parsed)[0] as any;
    if (firstValue?.overview) {
      return { id: policy.id, data: firstValue };
    }
    throw new Error("Unexpected response structure");
  } catch (e) {
    console.error(`Failed to parse summary for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return { id: policy.id, data: { overview: `${policy.type} policy for ${policy.platform} with ${policy.settingsCount} configured settings.`, keySettings: policy.settingsCount, lastModified: policy.lastModified } };
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
    `You are a Microsoft Intune policy expert similar to Microsoft Security Copilot. Write a clear, executive-friendly end-user impact analysis for this policy. Your audience is C-level management and non-technical stakeholders who need to understand what this policy means for their employees' daily work.

CRITICAL RULES:
- Base your analysis ONLY on the actual setting names and values provided in the data. Do NOT infer or fabricate settings not listed.
- Write in clear, flowing paragraphs — NOT bullet points or lists. Use plain business English that a non-technical executive can understand.
- Explain the real-world effect on employees, not the technical setting name. For example, instead of "RequireWorkProfilePassword: Required", write "employees will be required to set a separate password to access their work apps."
- Be specific about what users will experience, what changes in their daily workflow, and what restrictions they will notice.

Provide these structured fields:
- severity: "Minimal"|"Low"|"Medium"|"High"|"Critical" - overall impact severity on end users
- policySettingsAndImpact: You MUST use EXACTLY this line format for EVERY setting, one setting per line, separated by newlines:
  SettingName: value — end-user impact description
  Use the EXACT setting name as it appears in the "Configured Settings" data below. Copy the name character-for-character — do NOT rename, rephrase, add spaces, remove spaces, or add source prefixes. Each line must start with the setting name, then colon, then the configured value, then " — " (space-dash-space), then the impact description. This format must be identical regardless of OS platform (Windows, iOS, macOS, Android, Linux).
- assignmentScope: A clear paragraph explaining who is affected. Name the specific groups, how many members, and any filters. If the policy is not assigned, state clearly: "This policy is not currently assigned to any users or devices, so it has no active impact."
- riskAnalysis: Write 3-5 sentences as a flowing paragraph (not a list). Explain what real-world risks this policy introduces for end users. Consider: Will employees be locked out of features they use daily? Could they lose access to data? Are there settings that could frustrate users or slow down their workflow? Are there gaps where important protections are missing? Write like a senior IT consultant briefing a CTO — concrete, specific, and referencing actual settings and their values.
- overallSummary: Write a comprehensive closing paragraph (4-6 sentences) that summarizes the policy's purpose, its scope of impact, the number of configured settings, and the net effect on end users. Mention whether the policy is currently assigned and actively impacting users. End with a clear assessment of whether this policy is well-balanced for user productivity vs. security. Write as a consultant summarizing findings for leadership.
- description: Brief 1-2 sentence summary of end-user impact.

Do NOT include any conflict analysis - conflicts are handled separately.

IMPORTANT: Always refer to the policy by its display NAME followed by the GUID in parentheses. Never use the GUID alone without the name.

Return ONLY valid JSON:
{ "severity": "...", "description": "...", "policySettingsAndImpact": "SettingName1: value1 — impact1\nSettingName2: value2 — impact2\n...", "assignmentScope": "...", "riskAnalysis": "...", "overallSummary": "..." }`,
    `Analyze end-user impact for this policy:\n${context}`,
    12000
  );

  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response");
    }
    if (parsed.severity) {
      return { id: policy.id, data: parsed };
    }
    const firstValue = Object.values(parsed)[0] as any;
    if (firstValue?.severity) {
      return { id: policy.id, data: firstValue };
    }
    throw new Error("Unexpected response structure");
  } catch (e) {
    console.error(`Failed to parse end-user impact for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return { id: policy.id, data: { severity: "Minimal", description: `Standard ${policy.type} configuration with typical user impact.`, policySettingsAndImpact: `This policy configures ${policy.type} settings for ${policy.platform}.`, assignmentScope: "Assignment information not available.", riskAnalysis: "Risk analysis not available.", overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings.` } };
  }
}

export async function analyzeEndUserImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { severity: string; description: string; workarounds?: string; policySettingsAndImpact?: string; assignmentScope?: string; riskAnalysis?: string; overallSummary?: string }>> {
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
    `You are a Microsoft Intune security expert similar to Microsoft Security Copilot. Write a clear, executive-friendly security impact analysis for this policy. Your audience is C-level management, CISOs, and non-technical stakeholders who need to understand what this policy means for their organization's security posture.

CRITICAL RULES:
- Base your analysis ONLY on the actual setting names and values provided in the data. Do NOT infer or fabricate settings not listed.
- Write in clear, flowing paragraphs — NOT bullet points or lists. Use plain business English that a CISO or CTO can present to their board.
- Explain security impact in business terms: "This protects company data by..." rather than "This setting enables DLP policy..."
- Be specific about what is protected, what gaps remain, and what the real-world consequences are.

Provide these structured fields:
- rating: "Low"|"Medium"|"High"|"Critical" - overall security impact rating
- policySettingsAndSecurityImpact: You MUST use EXACTLY this line format for EVERY setting, one setting per line, separated by newlines:
  SettingName: value — security impact description
  Use the EXACT setting name as it appears in the "Configured Settings" data below. Copy the name character-for-character — do NOT rename, rephrase, add spaces, remove spaces, or add source prefixes. Each line must start with the setting name, then colon, then the configured value, then " — " (space-dash-space), then the security impact description. This format must be identical regardless of OS platform (Windows, iOS, macOS, Android, Linux).
- assignmentScope: A clear paragraph explaining which users and devices are protected by this policy. Name the specific groups, how many members, and any filters. If the policy is not assigned, state clearly: "This policy is not currently assigned to any users or devices, so it provides no active security protection."
- riskAnalysis: Write 3-5 sentences as a flowing paragraph (not a list). Explain what security measures this policy enforces and what gaps remain. Consider: Does it adequately protect corporate data? Are there settings that are too permissive (e.g., allowing copy/paste between work and personal)? Are strong authentication mechanisms enforced? What could an attacker exploit if these are the only protections in place? Are there industry best practices not being followed? Write like a senior security consultant briefing a CISO — concrete, referencing actual settings and their configured values.
- overallSummary: Write a comprehensive closing paragraph (4-6 sentences) that a CISO could read aloud in a board meeting. Summarize the policy's security controls, its assignment scope, the number of configured settings, what it protects well, and where gaps exist. Mention whether the policy is currently active. End with a clear verdict on the overall security posture this policy provides. Reference specific settings to support your assessment.
- description: Brief 1-2 sentence security impact summary.
- complianceFrameworks: Array of relevant frameworks (NIST 800-53, CIS Benchmarks, ISO 27001, etc.)

Do NOT include any conflict analysis - conflicts are handled separately.

IMPORTANT: Always refer to the policy by its display NAME followed by the GUID in parentheses. Never use the GUID alone without the name.

Return ONLY valid JSON:
{ "rating": "...", "description": "...", "complianceFrameworks": [...], "policySettingsAndSecurityImpact": "SettingName1: value1 — security impact1\nSettingName2: value2 — security impact2\n...", "assignmentScope": "...", "riskAnalysis": "...", "overallSummary": "..." }`,
    `Analyze security impact for this policy:\n${context}`,
    12000
  );

  try {
    const parsed = extractJSON(result);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned non-object response for security impact");
    }
    if (parsed.rating) {
      return { id: policy.id, data: parsed };
    }
    const firstValue = Object.values(parsed)[0] as any;
    if (firstValue?.rating) {
      return { id: policy.id, data: firstValue };
    }
    throw new Error("Unexpected response structure");
  } catch (e) {
    console.error(`Failed to parse security impact for policy ${policy.name}:`, e, "Raw:", result.substring(0, 500));
    return { id: policy.id, data: { rating: "Medium", description: `Contributes to organizational security posture through ${policy.type} enforcement.`, complianceFrameworks: ["General Best Practice"], policySettingsAndSecurityImpact: `This policy configures ${policy.type} settings for ${policy.platform} with security implications.`, assignmentScope: "Assignment information not available.", riskAnalysis: "Risk analysis not available.", overallSummary: `The "${policy.name}" policy is a ${policy.type} configuration for ${policy.platform} with ${policy.settingsCount} configured settings that contributes to organizational security.` } };
  }
}

export async function analyzeSecurityImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { rating: string; description: string; complianceFrameworks: string[]; policySettingsAndSecurityImpact?: string; assignmentScope?: string; riskAnalysis?: string; overallSummary?: string }>> {
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
      merged[p.id] = { rating: "Medium", description: `Contributes to organizational security posture through ${p.type} enforcement.`, complianceFrameworks: ["General Best Practice"], policySettingsAndSecurityImpact: `This policy configures ${p.type} settings for ${p.platform} with security implications.`, assignmentScope: "Assignment information not available.", riskAnalysis: "Risk analysis not available.", overallSummary: `The "${p.name}" policy is a ${p.type} configuration for ${p.platform} with ${p.settingsCount} configured settings that contributes to organizational security.` };
    }
  });
  return merged;
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
  const source = policy.rawData?._source || "";
  const id = policy.id;
  if (source === "configurationPolicies") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/SettingsCatalogProfiles/policyId/${id}/policyType~/%7B%22PolicyType%22%3A2%7D`;
  } else if (source === "deviceConfigurations") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesConfigurationMenu/configurationId/${id}/policyType~/0`;
  } else if (source === "deviceCompliancePolicies") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/policyId/${id}`;
  } else if (source === "intents") {
    return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesConfigurationMenu/configurationId/${id}/policyType~/0`;
  }
  return `https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesConfigurationMenu/overview`;
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
