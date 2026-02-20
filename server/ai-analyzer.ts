import OpenAI from "openai";
import type { IntunePolicyRaw } from "./graph-client";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function callAI(systemPrompt: string, userPrompt: string, maxTokens: number = 4096): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content || "";
}

function formatSettingsForContext(settings: any[]): string {
  return settings.map((s, idx) => {
    const name = s._settingFriendlyName || s.settingInstance?.settingDefinitionId || `Setting ${idx + 1}`;
    const value = s._settingFriendlyValue || "Configured";
    return `  - ${name}: ${value}`;
  }).join("\n");
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
      settingsInfo = `\nConfigured Settings (${detail.settings.length} total):\n${formatSettingsForContext(detail.settings.slice(0, 50))}`;
    }
    let assignmentInfo = "";
    if (detail?.assignments) {
      assignmentInfo = `\nAssignments:\n${formatAssignmentsForContext(detail.assignments)}`;
    }
    return `
## Policy: ${p.name}
- ID: ${p.id}
- Type: ${p.type}
- Platform: ${p.platform}
- Last Modified: ${p.lastModified}
- Settings Count: ${p.settingsCount}
- Description: ${p.description || "N/A"}
${settingsInfo}
${assignmentInfo}
`;
  }).join("\n---\n");
}

export async function analyzePolicySummaries(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { overview: string; keySettings: number; lastModified: string }>> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune policy expert similar to Microsoft Security Copilot. Analyze the provided policies and generate a comprehensive, detailed JSON object with summaries.

For each policy, provide:
- overview: A thorough multi-paragraph summary structured as follows:
  1. Start with what the policy configures and its purpose. Explain what the setting does when enabled vs disabled/not configured, and how it deviates from the default behavior.
  2. "Key Configured Settings:" - List each configured setting with its value, explain what each setting does, and note whether it deviates from the default. Be specific about what the setting controls.
  3. "Most Important Setting:" - Identify the most impactful setting and explain WHY it is important, including implications for storage, performance, security, or user experience.
  4. "Assignment Scope Summary:" - Describe which groups are included/excluded, how many members each group has if known, and describe any assignment filters applied (what devices they target or exclude).
  5. "Overall Summary:" - A final paragraph tying everything together: the policy's purpose, its scope, how many settings are configured, and the overall impact.
  End with: "This summary covers N configured setting(s) for this policy."

- keySettings: number of settings configured
- lastModified: the last modified date

Be detailed and specific. Do not be generic or vague. Reference actual setting names and values from the policy data. Explain the real-world impact of each configuration choice.

Return ONLY valid JSON in this format:
{
  "policyId": { "overview": "...", "keySettings": N, "lastModified": "YYYY-MM-DD" }
}`,
    `Analyze these Intune policies:\n${context}`,
    8192
  );

  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const fallback: Record<string, any> = {};
    policies.forEach(p => {
      fallback[p.id] = { overview: `${p.type} policy for ${p.platform} with ${p.settingsCount} configured settings.`, keySettings: p.settingsCount, lastModified: p.lastModified };
    });
    return fallback;
  }
}

export async function analyzeEndUserImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { severity: string; description: string; workarounds?: string }>> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune policy expert focusing on end-user experience impact.
For each policy, assess how it affects end-users daily workflow.
Severity levels: Minimal, Low, Medium, High, Critical

Return ONLY valid JSON:
{
  "policyId": { "severity": "Minimal|Low|Medium|High|Critical", "description": "Detailed impact description", "workarounds": "Any workarounds or tips" }
}`,
    `Analyze end-user impact for these policies:\n${context}`
  );

  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const fallback: Record<string, any> = {};
    policies.forEach(p => {
      fallback[p.id] = { severity: "Minimal", description: `Standard ${p.type} configuration with typical user impact.`, workarounds: "Contact IT for assistance." };
    });
    return fallback;
  }
}

export async function analyzeSecurityImpact(policies: IntunePolicyRaw[], details: any[]): Promise<Record<string, { rating: string; description: string; complianceFrameworks: string[] }>> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune security expert.
For each policy, assess the security posture improvements.
Rating levels: Low, Medium, High, Critical
Include relevant compliance frameworks: NIST 800-53, NIST 800-171, CIS Benchmarks, ISO 27001, HIPAA, SOC 2, PCI DSS, etc.

Return ONLY valid JSON:
{
  "policyId": { "rating": "Low|Medium|High|Critical", "description": "Security impact description", "complianceFrameworks": ["NIST 800-53", ...] }
}`,
    `Analyze security impact for these policies:\n${context}`
  );

  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const fallback: Record<string, any> = {};
    policies.forEach(p => {
      fallback[p.id] = { rating: "Medium", description: `Contributes to organizational security posture through ${p.type} enforcement.`, complianceFrameworks: ["General Best Practice"] };
    });
    return fallback;
  }
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

export async function analyzeConflicts(policies: IntunePolicyRaw[], details: any[]): Promise<{ type: string; severity: string; policies: string[]; detail: string; recommendation: string }[]> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune policy conflict expert.
Analyze the provided policies for:
1. Direct setting conflicts (same setting, different values)
2. Overlapping scopes (same platform, same type)
3. Redundant configurations

Return ONLY valid JSON array:
[
  { "type": "Direct Conflict|Potential Overlap|Redundant", "severity": "Info|Warning|Critical", "policies": ["policy1", "policy2"], "detail": "Description", "recommendation": "What to do" }
]
Return an empty array [] if no conflicts found.`,
    `Check these policies for conflicts:\n${context}`
  );

  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

export async function analyzeRecommendations(policies: IntunePolicyRaw[], details: any[]): Promise<{ type: string; title: string; detail: string }[]> {
  const context = buildPolicyContext(policies, details);

  const result = await callAI(
    `You are a Microsoft Intune best practices advisor.
Based on the provided policies, generate actionable recommendations for:
1. Security hardening
2. Policy optimization/consolidation
3. Assignment best practices
4. Compliance improvements

Return ONLY valid JSON array:
[
  { "type": "Security|Optimization|Best Practice|Compliance", "title": "Short title", "detail": "Detailed recommendation" }
]`,
    `Generate recommendations for these policies:\n${context}`
  );

  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [
      { type: "Best Practice", title: "Enable policy versioning", detail: "Set up change tracking for these policies to maintain an audit trail." },
    ];
  }
}
