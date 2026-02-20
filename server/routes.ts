import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupSession, registerAuthRoutes, requireAuth, refreshTokenIfNeeded } from "./auth";
import { fetchAllPolicies, fetchPolicyDetails, fetchGroupDetails, fetchAssignmentFilterDetails, fetchSettingDefinitionDisplayName } from "./graph-client";
import { analyzePolicySummaries, analyzeEndUserImpact, analyzeSecurityImpact, analyzeAssignments, analyzeConflicts, analyzeRecommendations } from "./ai-analyzer";
import type { IntunePolicyRaw } from "./graph-client";

async function getAccessToken(req: Request): Promise<string> {
  return refreshTokenIfNeeded(req);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupSession(app);
  registerAuthRoutes(app);

  app.get("/api/policies", requireAuth, async (req: any, res) => {
    try {
      const token = await getAccessToken(req);
      const policies = await fetchAllPolicies(token);
      req.session.policies = policies;
      res.json(policies.map((p: IntunePolicyRaw) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        platform: p.platform,
        lastModified: p.lastModified,
        settingsCount: p.settingsCount,
        description: p.description,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch policies" });
    }
  });

  app.post("/api/analyze", requireAuth, async (req: any, res) => {
    try {
      const { policyIds } = req.body;
      if (!policyIds || !Array.isArray(policyIds) || policyIds.length === 0) {
        return res.status(400).json({ message: "No policies selected" });
      }

      const token = await getAccessToken(req);
      const allPolicies: IntunePolicyRaw[] = req.session.policies || [];

      const selectedPolicies = allPolicies.filter(p => policyIds.includes(p.id));
      if (selectedPolicies.length === 0) {
        return res.status(404).json({ message: "Selected policies not found. Try refreshing the policy list." });
      }

      const details = await Promise.all(
        selectedPolicies.map(p => fetchPolicyDetails(token, p.id, allPolicies))
      );

      const groupCache = new Map<string, any>();
      const groupResolver = async (groupId: string) => {
        if (groupCache.has(groupId)) return groupCache.get(groupId);
        const info = await fetchGroupDetails(token, groupId);
        groupCache.set(groupId, info);
        return info;
      };

      const filterCache = new Map<string, any>();
      const filterResolver = async (filterId: string) => {
        if (filterCache.has(filterId)) return filterCache.get(filterId);
        const info = await fetchAssignmentFilterDetails(token, filterId);
        filterCache.set(filterId, info);
        return info;
      };

      const enrichedDetails = await Promise.all(details.map(async (detail) => {
        if (!detail) return detail;
        const enriched = { ...detail };

        if (enriched.assignments) {
          enriched.assignments = await Promise.all(
            enriched.assignments.map(async (assignment: any) => {
              const enrichedAssignment = { ...assignment };
              const target = assignment.target;
              if (!target) return enrichedAssignment;

              if (target.groupId) {
                const groupInfo = await groupResolver(target.groupId);
                enrichedAssignment.target = {
                  ...target,
                  _resolvedGroupName: groupInfo.name,
                  _resolvedGroupType: groupInfo.type,
                  _resolvedMemberCount: groupInfo.memberCount,
                };
              }

              if (target.deviceAndAppManagementAssignmentFilterId) {
                const filterInfo = await filterResolver(target.deviceAndAppManagementAssignmentFilterId);
                enrichedAssignment.target = {
                  ...enrichedAssignment.target,
                  _resolvedFilterName: filterInfo.name,
                  _resolvedFilterRule: filterInfo.rule,
                };
              }

              return enrichedAssignment;
            })
          );
        }

        const settingDefCache = new Map<string, { displayName: string; description: string }>();
        if (enriched.settings) {
          enriched.settings = await Promise.all(
            enriched.settings.map(async (setting: any) => {
              const cleaned = { ...setting };
              if (cleaned.settingInstance) {
                const defId = cleaned.settingInstance.settingDefinitionId || "";

                if (defId) {
                  let defInfo = settingDefCache.get(defId);
                  if (!defInfo) {
                    defInfo = await fetchSettingDefinitionDisplayName(token, defId);
                    settingDefCache.set(defId, defInfo);
                  }
                  cleaned._settingFriendlyName = defInfo.displayName !== defId ? defInfo.displayName : defId.replace(/^.*~/, "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                }

                if (cleaned.settingInstance.choiceSettingValue) {
                  const choiceValue = cleaned.settingInstance.choiceSettingValue.value || "";
                  if (choiceValue.includes("_1")) {
                    cleaned._settingFriendlyValue = "Enabled";
                  } else if (choiceValue.includes("_0")) {
                    cleaned._settingFriendlyValue = "Disabled";
                  } else {
                    cleaned._settingFriendlyValue = choiceValue.replace(/^.*~/, "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                  }
                }
                if (cleaned.settingInstance.simpleSettingValue) {
                  cleaned._settingFriendlyValue = String(cleaned.settingInstance.simpleSettingValue.value || "");
                }
              }
              return cleaned;
            })
          );
        }

        return enriched;
      }));

      const [summaries, endUserImpact, securityImpact, assignments, conflicts, recommendations] = await Promise.all([
        analyzePolicySummaries(selectedPolicies, enrichedDetails),
        analyzeEndUserImpact(selectedPolicies, enrichedDetails),
        analyzeSecurityImpact(selectedPolicies, enrichedDetails),
        analyzeAssignments(selectedPolicies, enrichedDetails, groupResolver),
        analyzeConflicts(selectedPolicies, enrichedDetails),
        analyzeRecommendations(selectedPolicies, enrichedDetails),
      ]);

      res.json({
        summaries,
        endUserImpact,
        securityImpact,
        assignments,
        conflicts,
        recommendations,
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ message: error.message || "Analysis failed" });
    }
  });

  app.post("/api/export/html", async (req, res) => {
    try {
      const { policies, analysis } = req.body;
      if (!policies || !analysis) {
        return res.status(400).json({ message: "Missing data" });
      }

      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Intune Policy Analysis Report</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { color: #58a6ff; border-bottom: 1px solid #21262d; padding-bottom: 1rem; }
    h2 { color: #c9d1d9; margin-top: 2rem; }
    h3 { color: #8b949e; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1.5rem 0; }
    .stat { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1rem; }
    .stat-label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #58a6ff; }
    .section { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; }
    .badge-minimal { background: rgba(52, 211, 153, 0.2); color: #6ee7b7; }
    .badge-low { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .badge-medium { background: rgba(251, 146, 60, 0.2); color: #fb923c; }
    .badge-high { background: rgba(248, 113, 113, 0.2); color: #f87171; }
    .conflict { border-left: 3px solid #f97316; }
    .recommendation { border-left: 3px solid #eab308; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
    td { padding: 0.5rem; border-bottom: 1px solid #21262d; }
    .generated { text-align: center; color: #8b949e; font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #21262d; }
  </style>
</head>
<body>
  <h1>Intune Policy Analysis Report</h1>
  <p style="color: #8b949e;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>

  <div class="stats">
    <div class="stat"><div class="stat-label">Policies Analyzed</div><div class="stat-value">${policies.length}</div></div>
    <div class="stat"><div class="stat-label">Total Settings</div><div class="stat-value">${policies.reduce((s: number, p: any) => s + (p.settingsCount || 0), 0)}</div></div>
    <div class="stat"><div class="stat-label">Conflicts Found</div><div class="stat-value">${analysis.conflicts?.length || 0}</div></div>
    <div class="stat"><div class="stat-label">Recommendations</div><div class="stat-value">${analysis.recommendations?.length || 0}</div></div>
  </div>`;

      html += `<h2>Policy Summaries</h2>`;
      for (const p of policies) {
        const summary = analysis.summaries?.[p.id];
        html += `<div class="section"><h3>${p.name} <span class="badge">${p.platform}</span></h3><p>${summary?.overview || "No summary available."}</p></div>`;
      }

      html += `<h2>End-User Impact</h2>`;
      for (const p of policies) {
        const impact = analysis.endUserImpact?.[p.id];
        if (impact) {
          html += `<div class="section"><h3>${p.name}</h3><span class="badge badge-${(impact.severity || "minimal").toLowerCase()}">${impact.severity}</span><p>${impact.description}</p></div>`;
        }
      }

      html += `<h2>Security Impact</h2>`;
      for (const p of policies) {
        const impact = analysis.securityImpact?.[p.id];
        if (impact) {
          html += `<div class="section"><h3>${p.name}</h3><span class="badge badge-${(impact.rating || "medium").toLowerCase()}">${impact.rating}</span><p>${impact.description}</p>`;
          if (impact.complianceFrameworks?.length) {
            html += `<p style="color: #8b949e; font-size: 0.85rem;">Frameworks: ${impact.complianceFrameworks.join(", ")}</p>`;
          }
          html += `</div>`;
        }
      }

      if (analysis.conflicts?.length > 0) {
        html += `<h2>Conflicts</h2>`;
        for (const c of analysis.conflicts) {
          html += `<div class="section conflict"><h3>${c.type} <span class="badge badge-medium">${c.severity}</span></h3><p>${c.detail}</p><p style="color: #8b949e;">Policies: ${c.policies.join(" / ")}</p></div>`;
        }
      }

      if (analysis.recommendations?.length > 0) {
        html += `<h2>Recommendations</h2>`;
        for (const r of analysis.recommendations) {
          html += `<div class="section recommendation"><h3>${r.title} <span class="badge">${r.type}</span></h3><p>${r.detail}</p></div>`;
        }
      }

      html += `<div class="generated">Report generated by Intune Policy Intelligence Agent</div></body></html>`;

      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", "attachment; filename=intune-analysis.html");
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/export/text", async (req, res) => {
    try {
      const { policies, analysis } = req.body;
      if (!policies || !analysis) {
        return res.status(400).json({ message: "Missing data" });
      }

      let text = `INTUNE POLICY ANALYSIS REPORT\n${"=".repeat(50)}\nGenerated: ${new Date().toLocaleString()}\n\n`;
      text += `Policies Analyzed: ${policies.length}\n`;
      text += `Total Settings: ${policies.reduce((s: number, p: any) => s + (p.settingsCount || 0), 0)}\n`;
      text += `Conflicts Found: ${analysis.conflicts?.length || 0}\n`;
      text += `Recommendations: ${analysis.recommendations?.length || 0}\n\n`;

      text += `SUMMARIES\n${"-".repeat(40)}\n`;
      for (const p of policies) {
        const summary = analysis.summaries?.[p.id];
        text += `\n${p.name} [${p.platform}]\n${summary?.overview || "No summary available."}\n`;
      }

      text += `\n\nEND-USER IMPACT\n${"-".repeat(40)}\n`;
      for (const p of policies) {
        const impact = analysis.endUserImpact?.[p.id];
        if (impact) {
          text += `\n${p.name} - ${impact.severity} Impact\n${impact.description}\n`;
        }
      }

      text += `\n\nSECURITY IMPACT\n${"-".repeat(40)}\n`;
      for (const p of policies) {
        const impact = analysis.securityImpact?.[p.id];
        if (impact) {
          text += `\n${p.name} - ${impact.rating} Rating\n${impact.description}\nFrameworks: ${impact.complianceFrameworks?.join(", ") || "N/A"}\n`;
        }
      }

      if (analysis.conflicts?.length > 0) {
        text += `\n\nCONFLICTS\n${"-".repeat(40)}\n`;
        for (const c of analysis.conflicts) {
          text += `\n[${c.severity}] ${c.type}\n${c.detail}\nPolicies: ${c.policies.join(" / ")}\n`;
        }
      }

      if (analysis.recommendations?.length > 0) {
        text += `\n\nRECOMMENDATIONS\n${"-".repeat(40)}\n`;
        for (const r of analysis.recommendations) {
          text += `\n[${r.type}] ${r.title}\n${r.detail}\n`;
        }
      }

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", "attachment; filename=intune-analysis.txt");
      res.send(text);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
