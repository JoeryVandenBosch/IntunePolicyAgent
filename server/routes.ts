import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupSession, registerAuthRoutes, requireAuth, refreshTokenIfNeeded } from "./auth";
import { fetchAllPolicies, fetchPolicyDetails, fetchGroupDetails, fetchGroupMembers, fetchAssignmentFilterDetails, fetchSettingDefinitionDisplayName, cleanSettingDefinitionId } from "./graph-client";
import { analyzePolicySummaries, analyzeEndUserImpact, analyzeSecurityImpact, analyzeAssignments, analyzeConflicts, analyzeRecommendations, detectSettingConflicts } from "./ai-analyzer";
import { trackEvent, getAnalyticsSummary } from "./analytics";
import type { IntunePolicyRaw } from "./graph-client";
import PDFDocument from "pdfkit";

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
      const relatedPolicies = selectedPolicies.length >= 2 ? allPolicies.filter(p => {
        if (selectedIds.has(p.id)) return false;
        return selectedPolicies.some(sp => {
          const spSource = sp.rawData?._source;
          const pSource = p.rawData?._source;
          if (spSource !== pSource) return false;
          if (sp.platform !== p.platform) return false;
          return true;
        });
      }) : [];
      console.log(`Found ${relatedPolicies.length} related policies in tenant for conflict comparison (${selectedPolicies.length} selected)`);

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

      // Detect unassigned policies
      let unassignedCount = 0;
      for (const policy of selectedPolicies) {
        const assign = assignments[policy.id] as any;
        if (assign) {
          const isUnassigned = assign.included.length === 0 && assign.excluded.length === 0;
          assign.isUnassigned = isUnassigned;
          if (isUnassigned) unassignedCount++;
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
        unassignedCount,
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

      const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Intune Policy Analysis Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; max-width: 1000px; margin: 0 auto; padding: 2rem; }
    h1 { color: #c6835a; border-bottom: 1px solid #21262d; padding-bottom: 1rem; }
    h2 { color: #c9d1d9; margin-top: 2rem; }
    h3 { color: #e6edf3; margin: 0; }
    h4 { color: #8b949e; margin: 1rem 0 0.5rem 0; font-size: 0.9rem; }
    p { line-height: 1.6; }
    .header-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
    .search-box { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px 12px; color: #e6edf3; width: 300px; font-size: 0.9rem; }
    .search-box::placeholder { color: #484f58; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1.5rem 0; }
    .stat { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1rem; }
    .stat-label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #c6835a; }
    .toc { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0; }
    .toc-title { font-size: 0.9rem; font-weight: 600; color: #c9d1d9; margin-bottom: 0.75rem; }
    .toc a { color: #c6835a; text-decoration: none; font-size: 0.85rem; display: block; padding: 3px 0; }
    .toc a:hover { text-decoration: underline; }
    .policy-group { background: #161b22; border: 1px solid #21262d; border-radius: 8px; margin: 1rem 0; overflow: hidden; }
    .policy-group[data-hidden="true"] { display: none; }
    .policy-header { padding: 1rem 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; }
    .policy-header:hover { background: #1c2129; }
    .policy-header h3 { flex: 1; }
    .policy-chevron { transition: transform 0.2s; color: #8b949e; font-size: 1.2rem; }
    .policy-chevron.open { transform: rotate(90deg); }
    .policy-body { display: none; padding: 0 1.5rem 1.5rem; border-top: 1px solid #21262d; }
    .policy-body.open { display: block; }
    .section { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 1rem; margin: 0.75rem 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px; }
    .badge-minimal { background: rgba(52, 211, 153, 0.2); color: #6ee7b7; }
    .badge-low { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .badge-medium { background: rgba(251, 146, 60, 0.2); color: #fb923c; }
    .badge-high { background: rgba(248, 113, 113, 0.2); color: #f87171; }
    .badge-critical { background: rgba(239, 68, 68, 0.3); color: #ef4444; }
    .badge-platform { background: rgba(198, 131, 90, 0.15); color: #c6835a; }
    .conflict-section { border-left: 3px solid #f97316; }
    .recommendation-section { border-left: 3px solid #eab308; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
    th { text-align: left; padding: 6px 8px; color: #8b949e; border-bottom: 1px solid #30363d; font-size: 0.8rem; }
    td { padding: 6px 8px; border-bottom: 1px solid #21262d; font-size: 0.85rem; }
    a { color: #c6835a; }
    .no-results { text-align: center; color: #8b949e; padding: 2rem; display: none; }
    .generated { text-align: center; color: #8b949e; font-size: 0.75rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #21262d; }
    .disclaimer { text-align: center; color: #484f58; font-size: 0.65rem; margin-top: 0.5rem; }
    @media print { .search-box { display: none; } .policy-body { display: block !important; } }
  </style>
</head>
<body>
  <h1>Intune Policy Analysis Report</h1>
  <div class="header-bar">
    <p style="color: #8b949e; margin: 0;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()} &middot; ${policies.length} policies analyzed</p>
    <input type="text" class="search-box" placeholder="Search policies..." id="policySearch" oninput="filterPolicies()">
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-label">Policies Analyzed</div><div class="stat-value">${policies.length}</div></div>
    <div class="stat"><div class="stat-label">Total Settings</div><div class="stat-value">${policies.reduce((s: number, p: any) => s + (p.settingsCount || 0), 0)}</div></div>
    <div class="stat"><div class="stat-label">Conflicts Found</div><div class="stat-value">${(analysis.settingConflicts?.length || 0) + (analysis.conflicts?.length || 0)}</div></div>
    <div class="stat"><div class="stat-label">Recommendations</div><div class="stat-value">${analysis.recommendations?.length || 0}</div></div>
  </div>

  <div class="toc">
    <div class="toc-title">Table of Contents</div>
    ${policies.map((p: any, i: number) => `<a href="#policy-${i}" onclick="openPolicy(${i})">${esc(p.name)} (${esc(p.platform)})</a>`).join("")}
    ${(analysis.settingConflicts?.length || analysis.conflicts?.length) ? '<a href="#conflicts-section">Setting Conflicts</a>' : ''}
    ${analysis.recommendations?.length ? '<a href="#recommendations-section">Recommendations</a>' : ''}
  </div>

  <div id="no-results" class="no-results">No policies match your search.</div>`;

      for (let i = 0; i < policies.length; i++) {
        const p = policies[i];
        const summary = analysis.summaries?.[p.id];
        const euImpact = analysis.endUserImpact?.[p.id];
        const secImpact = analysis.securityImpact?.[p.id];

        html += `<div class="policy-group" data-policy-name="${esc(p.name).toLowerCase()}" id="policy-${i}">
  <div class="policy-header" onclick="togglePolicy(this)">
    <h3>${esc(p.name)} <span class="badge badge-platform">${esc(p.platform)}</span></h3>
    <span class="policy-chevron">&#9654;</span>
  </div>
  <div class="policy-body">`;

        html += `<div class="section"><h4>Summary</h4><p>${nl2br(summary?.overview || "No summary available.")}</p></div>`;

        if (euImpact) {
          html += `<div class="section"><h4>End-User Impact <span class="badge badge-${(euImpact.severity || "minimal").toLowerCase()}">${esc(euImpact.severity)}</span></h4>`;
          if (euImpact.policySettingsAndImpact) html += `<p><strong>Settings & Impact:</strong></p><p>${nl2br(euImpact.policySettingsAndImpact)}</p>`;
          if (euImpact.assignmentScope) html += `<p><strong>Assignment Scope:</strong></p><p>${nl2br(euImpact.assignmentScope)}</p>`;
          if (euImpact.riskAnalysis) html += `<p><strong>Risk Analysis:</strong></p><p>${nl2br(euImpact.riskAnalysis)}</p>`;
          if (euImpact.overallSummary) html += `<p><strong>Overall Summary:</strong></p><p>${nl2br(euImpact.overallSummary)}</p>`;
          if (!euImpact.policySettingsAndImpact && euImpact.description) html += `<p>${nl2br(euImpact.description)}</p>`;
          html += `</div>`;
        }

        if (secImpact) {
          html += `<div class="section"><h4>Security Impact <span class="badge badge-${(secImpact.rating || "medium").toLowerCase()}">${esc(secImpact.rating)}</span></h4>`;
          if (secImpact.policySettingsAndSecurityImpact) html += `<p><strong>Settings & Security Impact:</strong></p><p>${nl2br(secImpact.policySettingsAndSecurityImpact)}</p>`;
          if (secImpact.assignmentScope) html += `<p><strong>Assignment Scope:</strong></p><p>${nl2br(secImpact.assignmentScope)}</p>`;
          if (secImpact.riskAnalysis) html += `<p><strong>Risk Analysis:</strong></p><p>${nl2br(secImpact.riskAnalysis)}</p>`;
          if (secImpact.overallSummary) html += `<p><strong>Overall Summary:</strong></p><p>${nl2br(secImpact.overallSummary)}</p>`;
          if (!secImpact.policySettingsAndSecurityImpact && secImpact.description) html += `<p>${nl2br(secImpact.description)}</p>`;
          if (secImpact.complianceFrameworks?.length) html += `<p style="color:#8b949e;font-size:0.85rem;">Frameworks: ${esc(secImpact.complianceFrameworks.join(", "))}</p>`;
          html += `</div>`;
        }

        html += `</div></div>`;
      }

      if (analysis.settingConflicts?.length > 0 || analysis.conflicts?.length > 0) {
        html += `<div id="conflicts-section"><h2>Conflicts</h2>`;
        if (analysis.settingConflicts?.length > 0) {
          for (const sc of analysis.settingConflicts) {
            html += `<div class="section conflict-section"><h4>${esc(sc.settingName)} <span class="badge badge-medium">Conflict</span></h4>`;
            html += `<p style="color:#8b949e;font-size:0.8rem;">${esc(sc.settingDefinitionId)}</p>`;
            html += `<table><tr><th>Policy</th><th>Value</th></tr>`;
            for (const sp of sc.sourcePolicies) {
              html += `<tr><td><a href="${esc(sp.intuneUrl)}" target="_blank">${esc(sp.policyName)}</a></td><td>${esc(sp.value)}</td></tr>`;
            }
            html += `</table></div>`;
          }
        }
        if (analysis.conflicts?.length > 0) {
          for (const c of analysis.conflicts) {
            html += `<div class="section conflict-section"><h4>${esc(c.type)} <span class="badge badge-medium">${esc(c.severity)}</span></h4>`;
            html += `<p>${nl2br(c.detail)}</p><p style="color:#8b949e;">Policies: ${esc(c.policies.join(" / "))}</p>`;
            if (c.conflictingSettings) html += `<p><strong>Conflicting Settings:</strong></p><p>${nl2br(c.conflictingSettings)}</p>`;
            if (c.assignmentOverlap) html += `<p><strong>Assignment Overlap:</strong></p><p>${nl2br(c.assignmentOverlap)}</p>`;
            if (c.impactAssessment) html += `<p><strong>Impact Assessment:</strong></p><p>${nl2br(c.impactAssessment)}</p>`;
            if (c.resolutionSteps) html += `<p><strong>Resolution Steps:</strong></p><p>${nl2br(c.resolutionSteps)}</p>`;
            html += `</div>`;
          }
        }
        html += `</div>`;
      }

      if (analysis.recommendations?.length > 0) {
        html += `<div id="recommendations-section"><h2>Recommendations</h2>`;
        for (const r of analysis.recommendations) {
          html += `<div class="section recommendation-section"><h4>${esc(r.title)} <span class="badge">${esc(r.type)}</span></h4><p>${nl2br(r.detail)}</p></div>`;
        }
        html += `</div>`;
      }

      html += `<div class="generated">Report generated by Intune Policy Intelligence Agent &middot; Powered by IntuneStuff</div>`;
      html += `<div class="disclaimer">AI-generated content may be incorrect. Check it for accuracy.</div>`;

      html += `
<script>
function togglePolicy(header) {
  var body = header.nextElementSibling;
  var chevron = header.querySelector('.policy-chevron');
  body.classList.toggle('open');
  chevron.classList.toggle('open');
}
function openPolicy(idx) {
  var el = document.getElementById('policy-' + idx);
  if (el) {
    var body = el.querySelector('.policy-body');
    var chevron = el.querySelector('.policy-chevron');
    if (!body.classList.contains('open')) { body.classList.add('open'); chevron.classList.add('open'); }
    setTimeout(function() { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  }
}
function filterPolicies() {
  var q = document.getElementById('policySearch').value.toLowerCase();
  var groups = document.querySelectorAll('.policy-group');
  var visible = 0;
  groups.forEach(function(g) {
    var name = g.getAttribute('data-policy-name') || '';
    if (!q || name.indexOf(q) !== -1) { g.setAttribute('data-hidden', 'false'); visible++; }
    else { g.setAttribute('data-hidden', 'true'); }
  });
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}
</script>
</body></html>`;

      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", "attachment; filename=intune-analysis.html");
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/export/csv", async (req, res) => {
    try {
      const { policies, analysis } = req.body;
      if (!policies || !analysis) {
        return res.status(400).json({ message: "Missing data" });
      }

      const csvEsc = (s: string) => {
        if (!s) return "";
        const str = String(s).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      };

      let csv = "Policy Name,Policy ID,Platform,Type,Settings Count,End-User Impact Severity,Security Impact Rating,Summary,End-User Risk Analysis,Security Risk Analysis,Compliance Frameworks,Recommendations\n";

      for (const p of policies) {
        const summary = analysis.summaries?.[p.id];
        const euImpact = analysis.endUserImpact?.[p.id];
        const secImpact = analysis.securityImpact?.[p.id];
        const policyRecs = (analysis.recommendations || [])
          .filter((r: any) => r.detail?.includes(p.name))
          .map((r: any) => `[${r.type}] ${r.title}: ${r.detail}`)
          .join(" | ");

        csv += [
          csvEsc(p.name),
          csvEsc(p.id),
          csvEsc(p.platform),
          csvEsc(p.type),
          p.settingsCount || 0,
          csvEsc(euImpact?.severity || "N/A"),
          csvEsc(secImpact?.rating || "N/A"),
          csvEsc(summary?.overview || ""),
          csvEsc(euImpact?.riskAnalysis || euImpact?.description || ""),
          csvEsc(secImpact?.riskAnalysis || secImpact?.description || ""),
          csvEsc(secImpact?.complianceFrameworks?.join("; ") || ""),
          csvEsc(policyRecs),
        ].join(",") + "\n";
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=intune-analysis.csv");
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/export/pdf", async (req, res) => {
    try {
      const { policies, analysis, branding } = req.body;
      if (!policies || !analysis) {
        return res.status(400).json({ message: "Missing data" });
      }

      const b = {
        companyName: branding?.companyName || "",
        department: branding?.department || "",
        contactEmail: branding?.contactEmail || "",
        website: branding?.website || "",
        logoDataUrl: branding?.logoDataUrl || "",
        logoPosition: branding?.logoPosition || "cover",
        primaryColor: branding?.primaryColor || "#1a5276",
        secondaryColor: branding?.secondaryColor || "#5d6d7e",
        accentColor: branding?.accentColor || "#2980b9",
        textColor: branding?.textColor || "#2c3e50",
        fontFamily: branding?.fontFamily || "Helvetica",
        headerFontSize: branding?.headerFontSize || 14,
        bodyFontSize: branding?.bodyFontSize || 10,
        includeCoverPage: branding?.includeCoverPage !== false,
        includeHeader: branding?.includeHeader !== false,
        includeFooter: branding?.includeFooter !== false,
        addWatermark: branding?.addWatermark !== false,
        watermarkText: branding?.watermarkText || "CONFIDENTIAL",
        watermarkOpacity: (branding?.watermarkOpacity || 10) / 100,
        includeToc: branding?.includeToc !== false,
        includeAnalytics: branding?.includeAnalytics !== false,
        format: branding?.format || "condensed",
        documentTitle: branding?.documentTitle || "Intune Intelligence Report",
        author: branding?.author || "",
        classification: branding?.classification || "Internal",
      };

      const hexToRgb = (hex: string): [number, number, number] => {
        try {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const bVal = parseInt(hex.slice(5, 7), 16);
          return [r, g, bVal];
        } catch { return [0, 0, 0]; }
      };

      const primary = hexToRgb(b.primaryColor);
      const secondary = hexToRgb(b.secondaryColor);
      const accent = hexToRgb(b.accentColor);
      const textCol = hexToRgb(b.textColor);
      const lightBg: [number, number, number] = [245, 247, 250];
      const borderCol: [number, number, number] = [220, 225, 230];
      const severityColors: Record<string, [number, number, number]> = {
        High: [192, 57, 43],
        Critical: [192, 57, 43],
        Medium: [230, 126, 34],
        Low: [39, 174, 96],
        Minimal: [39, 174, 96],
      };

      const LEFT = 55;
      const RIGHT = 55;
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 65, bottom: 65, left: LEFT, right: RIGHT },
        bufferPages: true,
        info: {
          Title: b.documentTitle,
          Author: b.author || b.companyName || "IntuneStuff",
          Subject: `Intune Policy Analysis - ${policies.length} policies`,
          Creator: "Intune Policy Intelligence Agent",
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      const writePromise = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
      });

      const PW = doc.page.width;
      const PH = doc.page.height;
      const contentWidth = PW - LEFT - RIGHT;
      const totalSettings = policies.reduce((s: number, p: any) => s + (p.settingsCount || 0), 0);
      const totalConflicts = (analysis.settingConflicts?.length || 0) + (analysis.conflicts?.length || 0);
      const totalRecs = analysis.recommendations?.length || 0;
      const isExec = b.format === "executive";

      let logoImage: any = null;
      if (b.logoDataUrl && b.logoDataUrl.startsWith("data:image")) {
        try {
          const base64Data = b.logoDataUrl.split(",")[1];
          logoImage = Buffer.from(base64Data, "base64");
        } catch {}
      }

      const ensureSpace = (needed: number) => {
        if (doc.y > PH - 65 - needed) doc.addPage();
      };

      const drawHorizontalRule = (y?: number, color?: [number, number, number]) => {
        const lineY = y ?? doc.y;
        doc.moveTo(LEFT, lineY).lineTo(LEFT + contentWidth, lineY)
          .strokeColor(color || borderCol).lineWidth(0.5).stroke();
      };

      const drawFilledRect = (x: number, y: number, w: number, h: number, color: [number, number, number], radius = 0) => {
        doc.save();
        if (radius > 0) {
          doc.roundedRect(x, y, w, h, radius).fill(color);
        } else {
          doc.rect(x, y, w, h).fill(color);
        }
        doc.restore();
      };

      if (b.includeCoverPage) {
        doc.rect(0, 0, PW, 8).fill(accent);

        const coverCenterY = PH * 0.35;

        if (logoImage && (b.logoPosition === "cover" || b.logoPosition === "both")) {
          try { doc.image(logoImage, PW / 2 - 35, coverCenterY - 90, { width: 70, height: 70 }); } catch {}
        }

        const titleY = logoImage && (b.logoPosition === "cover" || b.logoPosition === "both") ? coverCenterY : coverCenterY - 20;
        doc.font("Helvetica-Bold").fontSize(28).fillColor(primary)
          .text(b.documentTitle, LEFT, titleY, { align: "center", width: contentWidth });
        doc.moveDown(0.6);

        if (b.companyName) {
          doc.font("Helvetica").fontSize(16).fillColor(secondary)
            .text(b.companyName, LEFT, doc.y, { align: "center", width: contentWidth });
          doc.moveDown(0.3);
        }
        if (b.department) {
          doc.font("Helvetica").fontSize(11).fillColor(secondary)
            .text(b.department, LEFT, doc.y, { align: "center", width: contentWidth });
          doc.moveDown(0.3);
        }

        doc.moveDown(0.8);
        const lineY = doc.y;
        const lineWidth = 120;
        doc.moveTo(PW / 2 - lineWidth / 2, lineY).lineTo(PW / 2 + lineWidth / 2, lineY)
          .strokeColor(accent).lineWidth(2).stroke();
        doc.moveDown(1.2);

        const metaStartY = doc.y;
        const metaItems = [
          `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
          `Policies Analyzed: ${policies.length}`,
          `Total Settings: ${totalSettings}`,
        ];
        if (b.classification !== "Public") metaItems.push(`Classification: ${b.classification}`);

        doc.font("Helvetica").fontSize(10).fillColor(textCol);
        for (const item of metaItems) {
          doc.text(item, LEFT, doc.y, { align: "center", width: contentWidth });
          doc.moveDown(0.3);
        }

        const bottomInfoY = PH - 100;
        const infoItems = [];
        if (b.contactEmail) infoItems.push(b.contactEmail);
        if (b.website) infoItems.push(b.website);
        if (b.author) infoItems.push(`Prepared by: ${b.author}`);
        if (infoItems.length) {
          doc.font("Helvetica").fontSize(8).fillColor(secondary)
            .text(infoItems.join("  |  "), LEFT, bottomInfoY, { align: "center", width: contentWidth });
        }

        doc.font("Helvetica").fontSize(7).fillColor([180, 180, 180])
          .text("AI-generated analysis — verify all findings for accuracy", LEFT, PH - 55, { align: "center", width: contentWidth });

        doc.rect(0, PH - 8, PW, 8).fill(accent);

        doc.addPage();
      }

      if (b.includeToc && !isExec) {
        doc.font("Helvetica-Bold").fontSize(18).fillColor(primary)
          .text("Table of Contents", LEFT, 65);
        doc.moveDown(0.6);
        drawHorizontalRule(doc.y, accent);
        doc.moveDown(0.8);

        let tocNum = 1;
        for (const p of policies) {
          const tocY = doc.y;
          doc.font("Helvetica").fontSize(10).fillColor(textCol)
            .text(`${tocNum}. ${p.name}`, LEFT, tocY, { width: contentWidth - 100 });
          doc.font("Helvetica").fontSize(9).fillColor(secondary)
            .text(p.platform, LEFT + contentWidth - 90, tocY, { width: 90, align: "right" });
          doc.y = Math.max(doc.y, tocY + 16);
          doc.moveDown(0.25);
          tocNum++;
        }
        doc.moveDown(0.4);
        if (totalConflicts > 0) {
          doc.font("Helvetica").fontSize(10).fillColor(textCol)
            .text(`${tocNum}. Conflicts (${totalConflicts})`, LEFT);
          tocNum++;
          doc.moveDown(0.25);
        }
        if (totalRecs > 0) {
          doc.font("Helvetica").fontSize(10).fillColor(textCol)
            .text(`${tocNum}. Recommendations (${totalRecs})`, LEFT);
          doc.moveDown(0.25);
        }

        doc.addPage();
      }

      if (b.includeAnalytics && !isExec) {
        doc.font("Helvetica-Bold").fontSize(18).fillColor(primary)
          .text("Analysis Overview", LEFT, 65);
        doc.moveDown(0.6);
        drawHorizontalRule(doc.y, accent);
        doc.moveDown(1);

        const statsY = doc.y;
        const cardW = (contentWidth - 30) / 4;
        const cardH = 65;
        const statLabels = ["POLICIES", "SETTINGS", "CONFLICTS", "RECOMMENDATIONS"];
        const statValues = [policies.length, totalSettings, totalConflicts, totalRecs];

        for (let i = 0; i < 4; i++) {
          const x = LEFT + i * (cardW + 10);
          drawFilledRect(x, statsY, cardW, cardH, lightBg, 4);
          doc.rect(x, statsY, cardW, cardH).strokeColor(borderCol).lineWidth(0.5).stroke();
          doc.font("Helvetica-Bold").fontSize(24).fillColor(accent)
            .text(String(statValues[i]), x, statsY + 12, { width: cardW, align: "center" });
          doc.font("Helvetica").fontSize(7).fillColor(secondary)
            .text(statLabels[i], x, statsY + 42, { width: cardW, align: "center" });
        }
        doc.y = statsY + cardH + 20;
        doc.moveDown(1);
      }

      const policyHeading = (title: string, meta: string) => {
        ensureSpace(50);
        doc.addPage();
        const bannerH = 50;
        drawFilledRect(0, 0, PW, bannerH + 15, accent);
        doc.font("Helvetica-Bold").fontSize(16).fillColor([255, 255, 255])
          .text(title, LEFT, 22, { width: contentWidth });
        doc.font("Helvetica").fontSize(8).fillColor([220, 230, 240])
          .text(meta, LEFT, 42, { width: contentWidth });
        doc.y = bannerH + 30;
      };

      const sectionHeading = (title: string) => {
        ensureSpace(40);
        doc.moveDown(0.6);
        const y = doc.y;
        drawFilledRect(LEFT, y, 3, 16, accent);
        doc.font("Helvetica-Bold").fontSize(b.headerFontSize - 2).fillColor(primary)
          .text(title, LEFT + 12, y + 1);
        doc.moveDown(0.5);
      };

      const severityBadge = (label: string, level: string) => {
        const color = severityColors[level] || secondary;
        const badgeText = `${level} ${label}`;
        const badgeWidth = doc.font("Helvetica-Bold").fontSize(8).widthOfString(badgeText) + 16;
        const x = LEFT;
        const y = doc.y;
        drawFilledRect(x, y, badgeWidth, 18, color, 3);
        doc.font("Helvetica-Bold").fontSize(8).fillColor([255, 255, 255])
          .text(badgeText, x + 8, y + 4, { lineBreak: false });
        doc.y = y + 24;
      };

      const bodyText = (text: string, indent = 0) => {
        if (!text) return;
        ensureSpace(20);
        const cleaned = text.replace(/\*\*/g, "").replace(/^- /gm, "  \u2022  ");
        doc.font("Helvetica").fontSize(b.bodyFontSize).fillColor(textCol)
          .text(cleaned, LEFT + indent, doc.y, { width: contentWidth - indent, lineGap: 3, paragraphGap: 2 });
        doc.moveDown(0.4);
      };

      const labeledSection = (label: string, text: string) => {
        if (!text) return;
        ensureSpace(30);
        doc.font("Helvetica-Bold").fontSize(b.bodyFontSize).fillColor(secondary)
          .text(label, LEFT, doc.y);
        doc.moveDown(0.15);
        bodyText(text, 0);
      };

      let policyNum = 0;
      for (const p of policies) {
        policyNum++;
        const meta = `Platform: ${p.platform}  |  Type: ${p.type || "N/A"}  |  Settings: ${p.settingsCount || 0}  |  ID: ${p.id}`;
        policyHeading(`${policyNum}. ${p.name}`, meta);

        const summary = analysis.summaries?.[p.id];
        if (summary?.overview) {
          sectionHeading("Summary");
          bodyText(summary.overview);
        }

        if (!isExec) {
          const euImpact = analysis.endUserImpact?.[p.id];
          if (euImpact) {
            sectionHeading("End-User Impact");
            if (euImpact.severity) severityBadge("impact", euImpact.severity);
            if (euImpact.policySettingsAndImpact) bodyText(euImpact.policySettingsAndImpact);
            if (euImpact.assignmentScope) labeledSection("Assignment Scope", euImpact.assignmentScope);
            if (euImpact.riskAnalysis) labeledSection("Risk Analysis", euImpact.riskAnalysis);
            if (euImpact.overallSummary) labeledSection("Overall Assessment", euImpact.overallSummary);
            if (!euImpact.policySettingsAndImpact && euImpact.description) bodyText(euImpact.description);
          }

          const secImpact = analysis.securityImpact?.[p.id];
          if (secImpact) {
            sectionHeading("Security Impact");
            if (secImpact.rating) severityBadge("risk", secImpact.rating);
            if (secImpact.policySettingsAndSecurityImpact) bodyText(secImpact.policySettingsAndSecurityImpact);
            if (secImpact.assignmentScope) labeledSection("Assignment Scope", secImpact.assignmentScope);
            if (secImpact.riskAnalysis) labeledSection("Risk Analysis", secImpact.riskAnalysis);
            if (secImpact.overallSummary) labeledSection("Overall Assessment", secImpact.overallSummary);
            if (!secImpact.policySettingsAndSecurityImpact && secImpact.description) bodyText(secImpact.description);
            if (secImpact.complianceFrameworks?.length) {
              doc.font("Helvetica").fontSize(8).fillColor(secondary)
                .text(`Compliance Frameworks: ${secImpact.complianceFrameworks.join(", ")}`, LEFT, doc.y);
              doc.moveDown(0.3);
            }
          }
        }
      }

      if (!isExec && analysis.settingConflicts?.length > 0) {
        doc.addPage();
        doc.font("Helvetica-Bold").fontSize(18).fillColor(primary)
          .text("Setting-Level Conflicts", LEFT, 65);
        doc.moveDown(0.6);
        drawHorizontalRule(doc.y, accent);
        doc.moveDown(0.8);

        for (const sc of analysis.settingConflicts) {
          ensureSpace(60);
          const cardY = doc.y;
          doc.font("Helvetica-Bold").fontSize(b.bodyFontSize + 1).fillColor(accent).text(sc.settingName, LEFT);
          doc.font("Helvetica").fontSize(7).fillColor(secondary).text(sc.settingDefinitionId, LEFT);
          doc.moveDown(0.3);

          const tableTop = doc.y;
          const colW1 = contentWidth * 0.5;
          const colW2 = contentWidth * 0.5;
          drawFilledRect(LEFT, tableTop, contentWidth, 18, [240, 240, 245]);
          doc.font("Helvetica-Bold").fontSize(8).fillColor(secondary)
            .text("Policy", LEFT + 6, tableTop + 4, { width: colW1 })
            .text("Value", LEFT + colW1 + 6, tableTop + 4, { width: colW2 });
          doc.y = tableTop + 20;

          for (const sp of sc.sourcePolicies) {
            ensureSpace(20);
            const rowY = doc.y;
            doc.font("Helvetica").fontSize(b.bodyFontSize - 1).fillColor(textCol)
              .text(sp.policyName, LEFT + 6, rowY, { width: colW1 - 12 })
              .text(String(sp.value), LEFT + colW1 + 6, rowY, { width: colW2 - 12 });
            doc.y = Math.max(doc.y, rowY + 14);
            drawHorizontalRule(doc.y, [235, 238, 242]);
            doc.moveDown(0.15);
          }
          doc.moveDown(0.6);
        }
      }

      if (!isExec && analysis.conflicts?.length > 0) {
        ensureSpace(80);
        doc.font("Helvetica-Bold").fontSize(14).fillColor(primary).text("AI Conflict Analysis", LEFT);
        doc.moveDown(0.5);
        drawHorizontalRule(doc.y, accent);
        doc.moveDown(0.6);

        for (const c of analysis.conflicts) {
          ensureSpace(50);
          severityBadge(c.type, c.severity);
          bodyText(c.detail);
          if (c.conflictingSettings) labeledSection("Conflicting Settings", c.conflictingSettings);
          if (c.resolutionSteps) labeledSection("Resolution Steps", c.resolutionSteps);
          doc.moveDown(0.3);
          drawHorizontalRule(doc.y, [235, 238, 242]);
          doc.moveDown(0.4);
        }
      }

      if (analysis.recommendations?.length > 0) {
        doc.addPage();
        doc.font("Helvetica-Bold").fontSize(18).fillColor(primary)
          .text("Recommendations", LEFT, 65);
        doc.moveDown(0.6);
        drawHorizontalRule(doc.y, accent);
        doc.moveDown(0.8);

        for (let i = 0; i < analysis.recommendations.length; i++) {
          const r = analysis.recommendations[i];
          ensureSpace(50);
          const recY = doc.y;
          const numCircleSize = 22;
          drawFilledRect(LEFT, recY, numCircleSize, numCircleSize, accent, 4);
          doc.font("Helvetica-Bold").fontSize(11).fillColor([255, 255, 255])
            .text(String(i + 1), LEFT + 1, recY + 5, { width: numCircleSize, align: "center" });
          doc.font("Helvetica-Bold").fontSize(b.bodyFontSize + 1).fillColor(primary)
            .text(r.title, LEFT + numCircleSize + 10, recY + 4, { width: contentWidth - numCircleSize - 10 });
          if (r.type) {
            doc.font("Helvetica").fontSize(8).fillColor(secondary)
              .text(`Category: ${r.type}`, LEFT + numCircleSize + 10, doc.y);
          }
          doc.moveDown(0.3);
          bodyText(r.detail);
          doc.moveDown(0.2);
          drawHorizontalRule(doc.y, [235, 238, 242]);
          doc.moveDown(0.5);
        }
      }

      const pages = doc.bufferedPageRange();
      const coverOffset = b.includeCoverPage ? 1 : 0;

      if (b.addWatermark && b.watermarkText) {
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.save();
          doc.font("Helvetica").fontSize(60).fillColor([200, 200, 200]).opacity(b.watermarkOpacity);
          const wmWidth = doc.widthOfString(b.watermarkText);
          doc.translate(PW / 2, PH / 2);
          doc.rotate(-45, { origin: [0, 0] });
          doc.text(b.watermarkText, -wmWidth / 2, -15, { lineBreak: false });
          doc.restore();
        }
      }

      if (b.includeHeader) {
        for (let i = pages.start + coverOffset; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.save();
          doc.font("Helvetica").fontSize(7.5).fillColor(secondary);
          const headerLeft = b.companyName || b.documentTitle;
          const headerRight = b.classification !== "Public" ? b.classification : "";
          doc.text(headerLeft, LEFT, 22, { width: contentWidth / 2, align: "left", lineBreak: false });
          if (headerRight) {
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(secondary)
              .text(headerRight, LEFT + contentWidth / 2, 22, { width: contentWidth / 2, align: "right", lineBreak: false });
          }
          doc.moveTo(LEFT, 38).lineTo(LEFT + contentWidth, 38).strokeColor(borderCol).lineWidth(0.5).stroke();
          doc.restore();

          if (logoImage && (b.logoPosition === "header" || b.logoPosition === "both")) {
            try { doc.image(logoImage, PW - RIGHT - 20, 14, { width: 18, height: 18 }); } catch {}
          }
        }
      }

      if (b.includeFooter) {
        for (let i = pages.start; i < pages.start + pages.count; i++) {
          doc.switchToPage(i);
          doc.save();
          const footerY = PH - 42;
          doc.moveTo(LEFT, footerY).lineTo(LEFT + contentWidth, footerY).strokeColor(borderCol).lineWidth(0.5).stroke();
          doc.font("Helvetica").fontSize(7.5).fillColor(secondary);
          const footerLeft = b.documentTitle;
          const footerRight = `Page ${i - pages.start + 1} of ${pages.count}`;
          doc.text(footerLeft, LEFT, footerY + 6, { width: contentWidth / 2, align: "left", lineBreak: false });
          doc.text(footerRight, LEFT + contentWidth / 2, footerY + 6, { width: contentWidth / 2, align: "right", lineBreak: false });
          doc.restore();
        }
      }

      doc.end();
      const pdfBuffer = await writePromise;

      const filename = (b.documentTitle || "intune-analysis").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("PDF export error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/analytics/verify", async (req: any, res) => {
    try {
      const { adminKey } = req.body;
      const validKey = process.env.ANALYTICS_ADMIN_KEY;
      if (!validKey) {
        return res.status(500).json({ message: "Admin key not configured" });
      }
      if (adminKey === validKey) {
        if (req.session) {
          req.session.analyticsAuthorized = true;
        }
        return res.json({ authorized: true });
      }
      return res.status(401).json({ message: "Invalid admin key" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/analytics/status", async (req: any, res) => {
    res.json({ authorized: !!req.session?.analyticsAuthorized });
  });

  app.get("/api/analytics", async (req: any, res) => {
    if (!req.session?.analyticsAuthorized) {
      return res.status(401).json({ message: "Unauthorized. Please provide admin key." });
    }
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
