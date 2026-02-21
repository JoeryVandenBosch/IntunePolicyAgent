import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupSession, registerAuthRoutes, requireAuth, refreshTokenIfNeeded } from "./auth";
import { fetchAllPolicies, fetchPolicyDetails, fetchGroupDetails, fetchGroupMembers, fetchAssignmentFilterDetails, fetchSettingDefinitionDisplayName, cleanSettingDefinitionId } from "./graph-client";
import { analyzePolicySummaries, analyzeEndUserImpact, analyzeSecurityImpact, analyzeAssignments, analyzeConflicts, analyzeRecommendations, detectSettingConflicts } from "./ai-analyzer";
import { trackEvent, getAnalyticsSummary } from "./analytics";
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
        source: p.rawData?._source || "",
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch policies" });
    }
  });

  app.get("/api/groups/:groupId/members", requireAuth, async (req: any, res) => {
    try {
      const token = await getAccessToken(req);
      const { groupId } = req.params;
      const members = await fetchGroupMembers(token, groupId);
      res.json({ members });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch group members" });
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
                  cleaned._settingFriendlyName = defInfo.displayName !== defId ? defInfo.displayName : cleanSettingDefinitionId(defId);
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

      const uniquePlatforms = Array.from(new Set(selectedPolicies.map(p => p.platform)));
      const uniqueTypes = Array.from(new Set(selectedPolicies.map(p => p.type)));
      for (const platform of uniquePlatforms) {
        const platformPolicies = selectedPolicies.filter(p => p.platform === platform);
        for (const pType of Array.from(new Set(platformPolicies.map(p => p.type)))) {
          trackEvent({
            eventType: "analysis",
            tenantId: req.session.tenantId,
            userEmail: req.session.userEmail,
            policyCount: platformPolicies.filter(p => p.type === pType).length,
            policyTypes: pType,
            platforms: platform,
          });
        }
      }

      let conflictPolicies = selectedPolicies;
      let conflictDetails = enrichedDetails;

      const selectedIds = new Set(selectedPolicies.map(p => p.id));
      const relatedPolicies = allPolicies.filter(p => {
        if (selectedIds.has(p.id)) return false;
        return selectedPolicies.some(sp => {
          const spSource = sp.rawData?._source;
          const pSource = p.rawData?._source;
          if (spSource !== pSource) return false;
          if (sp.platform !== p.platform) return false;
          return true;
        });
      });
      console.log(`Found ${relatedPolicies.length} related policies in tenant for conflict comparison`);

      if (relatedPolicies.length > 0) {
        const maxRelated = 20;
        const relatedSubset = relatedPolicies.slice(0, maxRelated);
        console.log(`Fetching ${relatedSubset.length} related policies for cross-tenant conflict detection`);
        const relatedDetails = await Promise.all(
          relatedSubset.map(p => fetchPolicyDetails(token, p.id, allPolicies))
        );
        const relatedEnrichedDetails = await Promise.all(relatedDetails.map(async (detail) => {
          if (!detail?.settings) return detail;
          const enriched = { ...detail };
          const settingDefCache = new Map<string, { displayName: string; description: string }>();
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
                  cleaned._settingFriendlyName = defInfo.displayName !== defId ? defInfo.displayName : cleanSettingDefinitionId(defId);
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
          return enriched;
        }));
        conflictPolicies = [...selectedPolicies, ...relatedSubset];
        conflictDetails = [...enrichedDetails, ...relatedEnrichedDetails];
      }

      const { conflicts: settingConflicts, allSettings } = detectSettingConflicts(conflictPolicies, conflictDetails);
      console.log(`Detected ${settingConflicts.length} setting-level conflicts, ${allSettings.length} total settings across ${conflictPolicies.length} policies (${selectedPolicies.length} selected + ${conflictPolicies.length - selectedPolicies.length} related)`);

      const [summaries, endUserImpact, securityImpact, assignments, conflicts, recommendations] = await Promise.all([
        analyzePolicySummaries(selectedPolicies, enrichedDetails),
        analyzeEndUserImpact(selectedPolicies, enrichedDetails),
        analyzeSecurityImpact(selectedPolicies, enrichedDetails),
        analyzeAssignments(selectedPolicies, enrichedDetails, groupResolver),
        analyzeConflicts(conflictPolicies, conflictDetails),
        analyzeRecommendations(selectedPolicies, enrichedDetails),
      ]);

      for (const policy of selectedPolicies) {
        const assign = assignments[policy.id];
        if (!assign) continue;
        const scopeParts: string[] = [];
        if (assign.included.length > 0) {
          scopeParts.push("Included groups: " + assign.included.map((g: any) => `"${g.name}" (${g.type}, ${g.memberCount} members)`).join(", "));
        }
        if (assign.excluded.length > 0) {
          scopeParts.push("Excluded groups: " + assign.excluded.map((g: any) => `"${g.name}" (${g.type}, ${g.memberCount} members)`).join(", "));
        }
        if (assign.filters.length > 0) {
          scopeParts.push("Filters: " + assign.filters.map((f: any) => `"${f.name}" (${f.mode})`).join(", "));
        }
        const resolvedScope = scopeParts.length > 0 ? scopeParts.join(". ") + "." : null;

        if (endUserImpact[policy.id] && !endUserImpact[policy.id].assignmentScope && resolvedScope) {
          endUserImpact[policy.id].assignmentScope = resolvedScope;
        }
        if (securityImpact[policy.id] && !securityImpact[policy.id].assignmentScope && resolvedScope) {
          (securityImpact[policy.id] as any).assignmentScope = resolvedScope;
        }
      }

      res.json({
        summaries,
        endUserImpact,
        securityImpact,
        assignments,
        settingConflicts,
        allSettings,
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
          html += `<div class="section"><h3>${p.name} (${p.id})</h3><span class="badge badge-${(impact.severity || "minimal").toLowerCase()}">${impact.severity}</span>`;
          if (impact.policySettingsAndImpact) html += `<h4>Policy Settings and Impact:</h4><p>${impact.policySettingsAndImpact}</p>`;
          if (impact.assignmentScope) html += `<h4>Assignment Scope:</h4><p>${impact.assignmentScope}</p>`;
          if (impact.riskAnalysis) html += `<h4>Risk Analysis:</h4><p>${impact.riskAnalysis}</p>`;
          if (impact.conflictAnalysis) html += `<h4>Conflict Analysis:</h4><p>${impact.conflictAnalysis}</p>`;
          if (impact.overallSummary) html += `<h4>Overall Summary:</h4><p>${impact.overallSummary}</p>`;
          if (!impact.policySettingsAndImpact) html += `<p>${impact.description}</p>`;
          html += `</div>`;
        }
      }

      html += `<h2>Security Impact</h2>`;
      for (const p of policies) {
        const impact = analysis.securityImpact?.[p.id];
        if (impact) {
          html += `<div class="section"><h3>${p.name} (${p.id})</h3><span class="badge badge-${(impact.rating || "medium").toLowerCase()}">${impact.rating}</span>`;
          if (impact.policySettingsAndSecurityImpact) html += `<h4>Policy Settings and Security Impact:</h4><p>${impact.policySettingsAndSecurityImpact}</p>`;
          if (impact.assignmentScope) html += `<h4>Assignment Scope:</h4><p>${impact.assignmentScope}</p>`;
          if (impact.riskAnalysis) html += `<h4>Risk Analysis:</h4><p>${impact.riskAnalysis}</p>`;
          if (impact.conflictAnalysis) html += `<h4>Conflict Analysis:</h4><p>${impact.conflictAnalysis}</p>`;
          if (impact.overallSummary) html += `<h4>Overall Summary:</h4><p>${impact.overallSummary}</p>`;
          if (!impact.policySettingsAndSecurityImpact) html += `<p>${impact.description}</p>`;
          if (impact.complianceFrameworks?.length) {
            html += `<p style="color: #8b949e; font-size: 0.85rem;">Frameworks: ${impact.complianceFrameworks.join(", ")}</p>`;
          }
          html += `</div>`;
        }
      }

      if (analysis.settingConflicts?.length > 0) {
        html += `<h2>Setting-Level Conflicts</h2>`;
        for (const sc of analysis.settingConflicts) {
          html += `<div class="section conflict"><h3>${sc.settingName} <span class="badge badge-medium">Conflict</span></h3>`;
          html += `<p style="color: #8b949e; font-size: 0.85rem;">${sc.settingDefinitionId}</p>`;
          html += `<table style="width:100%;border-collapse:collapse;margin-top:8px;"><tr style="border-bottom:1px solid #333;"><th style="text-align:left;padding:4px 8px;color:#8b949e;">Policy</th><th style="text-align:left;padding:4px 8px;color:#8b949e;">Value</th></tr>`;
          for (const sp of sc.sourcePolicies) {
            html += `<tr style="border-bottom:1px solid #222;"><td style="padding:4px 8px;"><a href="${sp.intuneUrl}" target="_blank" style="color:#58a6ff;">${sp.policyName}</a></td><td style="padding:4px 8px;">${sp.value}</td></tr>`;
          }
          html += `</table></div>`;
        }
      }

      if (analysis.conflicts?.length > 0) {
        html += `<h2>AI Conflict Analysis</h2>`;
        for (const c of analysis.conflicts) {
          html += `<div class="section conflict"><h3>${c.type} <span class="badge badge-medium">${c.severity}</span></h3>`;
          html += `<p>${c.detail}</p>`;
          html += `<p style="color: #8b949e;">Policies: ${c.policies.join(" / ")}</p>`;
          if (c.conflictingSettings) html += `<h4>Conflicting Settings:</h4><p>${c.conflictingSettings}</p>`;
          if (c.assignmentOverlap) html += `<h4>Assignment Overlap:</h4><p>${c.assignmentOverlap}</p>`;
          if (c.impactAssessment) html += `<h4>Impact Assessment:</h4><p>${c.impactAssessment}</p>`;
          if (c.resolutionSteps) html += `<h4>Resolution Steps:</h4><p>${c.resolutionSteps}</p>`;
          html += `</div>`;
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
          text += `\n${p.name} (${p.id}) - ${impact.severity} Impact\n`;
          if (impact.policySettingsAndImpact) text += `\nPolicy Settings and Impact:\n${impact.policySettingsAndImpact}\n`;
          if (impact.assignmentScope) text += `\nAssignment Scope:\n${impact.assignmentScope}\n`;
          if (impact.riskAnalysis) text += `\nRisk Analysis:\n${impact.riskAnalysis}\n`;
          if (impact.conflictAnalysis) text += `\nConflict Analysis:\n${impact.conflictAnalysis}\n`;
          if (impact.overallSummary) text += `\nOverall Summary:\n${impact.overallSummary}\n`;
          if (!impact.policySettingsAndImpact) text += `${impact.description}\n`;
        }
      }

      text += `\n\nSECURITY IMPACT\n${"-".repeat(40)}\n`;
      for (const p of policies) {
        const impact = analysis.securityImpact?.[p.id];
        if (impact) {
          text += `\n${p.name} (${p.id}) - ${impact.rating} Rating\n`;
          if (impact.policySettingsAndSecurityImpact) text += `\nPolicy Settings and Security Impact:\n${impact.policySettingsAndSecurityImpact}\n`;
          if (impact.assignmentScope) text += `\nAssignment Scope:\n${impact.assignmentScope}\n`;
          if (impact.riskAnalysis) text += `\nRisk Analysis:\n${impact.riskAnalysis}\n`;
          if (impact.conflictAnalysis) text += `\nConflict Analysis:\n${impact.conflictAnalysis}\n`;
          if (impact.overallSummary) text += `\nOverall Summary:\n${impact.overallSummary}\n`;
          if (!impact.policySettingsAndSecurityImpact) text += `${impact.description}\n`;
          text += `Frameworks: ${impact.complianceFrameworks?.join(", ") || "N/A"}\n`;
        }
      }

      if (analysis.settingConflicts?.length > 0) {
        text += `\n\nSETTING-LEVEL CONFLICTS\n${"-".repeat(40)}\n`;
        for (const sc of analysis.settingConflicts) {
          text += `\n${sc.settingName} [CONFLICT]\n${sc.settingDefinitionId}\n`;
          for (const sp of sc.sourcePolicies) {
            text += `  - ${sp.policyName}: ${sp.value}\n    Intune: ${sp.intuneUrl}\n`;
          }
        }
      }

      if (analysis.conflicts?.length > 0) {
        text += `\n\nAI CONFLICT ANALYSIS\n${"-".repeat(40)}\n`;
        for (const c of analysis.conflicts) {
          text += `\n[${c.severity}] ${c.type}\n${c.detail}\nPolicies: ${c.policies.join(" / ")}\n`;
          if (c.conflictingSettings) text += `\nConflicting Settings:\n${c.conflictingSettings}\n`;
          if (c.assignmentOverlap) text += `\nAssignment Overlap:\n${c.assignmentOverlap}\n`;
          if (c.impactAssessment) text += `\nImpact Assessment:\n${c.impactAssessment}\n`;
          if (c.resolutionSteps) text += `\nResolution Steps:\n${c.resolutionSteps}\n`;
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

  app.get("/api/analytics", requireAuth, async (req: any, res) => {
    try {
      const summary = await getAnalyticsSummary();
      res.json(summary);
    } catch (error: any) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch analytics" });
    }
  });

  return httpServer;
}
