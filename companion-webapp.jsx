import { useState, useEffect, useRef, useCallback } from "react";

// ── Mock Data (Replace with Graph API + Security Copilot calls) ──────────────
const MOCK_POLICIES = [
  { id: "p1", name: "Windows - BitLocker Encryption", type: "Endpoint Security", platform: "Windows", lastModified: "2025-02-14", status: "Active", settingsCount: 12 },
  { id: "p2", name: "iOS - Device Restrictions", type: "Configuration Profile", platform: "iOS/iPadOS", lastModified: "2025-02-10", status: "Active", settingsCount: 34 },
  { id: "p3", name: "Windows - Defender Antivirus", type: "Endpoint Security", platform: "Windows", lastModified: "2025-02-08", status: "Active", settingsCount: 18 },
  { id: "p4", name: "Android - Work Profile Compliance", type: "Compliance Policy", platform: "Android Enterprise", lastModified: "2025-01-28", status: "Active", settingsCount: 9 },
  { id: "p5", name: "Windows - Windows Update Ring", type: "Configuration Profile", platform: "Windows", lastModified: "2025-02-01", status: "Active", settingsCount: 15 },
  { id: "p6", name: "macOS - FileVault Encryption", type: "Endpoint Security", platform: "macOS", lastModified: "2025-01-15", status: "Active", settingsCount: 6 },
  { id: "p7", name: "Windows - Edge Browser Settings", type: "Settings Catalog", platform: "Windows", lastModified: "2025-02-12", status: "Active", settingsCount: 42 },
  { id: "p8", name: "iOS - App Protection (MAM)", type: "App Protection", platform: "iOS/iPadOS", lastModified: "2025-02-05", status: "Active", settingsCount: 21 },
  { id: "p9", name: "Windows - Firewall Rules", type: "Endpoint Security", platform: "Windows", lastModified: "2025-01-20", status: "Active", settingsCount: 8 },
  { id: "p10", name: "Android - Device Enrollment Restrictions", type: "Enrollment Policy", platform: "Android Enterprise", lastModified: "2025-02-03", status: "Active", settingsCount: 5 },
  { id: "p11", name: "Windows - Credential Guard", type: "Endpoint Security", platform: "Windows", lastModified: "2025-01-10", status: "Active", settingsCount: 4 },
  { id: "p12", name: "Windows - Attack Surface Reduction", type: "Endpoint Security", platform: "Windows", lastModified: "2025-02-15", status: "Active", settingsCount: 16 },
];

const generateMockAnalysis = (policies) => {
  const summaries = {};
  const endUserImpact = {};
  const securityImpact = {};
  const assignments = {};
  const conflicts = [];
  const recommendations = [];

  policies.forEach((p) => {
    summaries[p.id] = {
      overview: `This ${p.type} policy targets ${p.platform} devices and configures ${p.settingsCount} settings. ` +
        (p.name.includes("BitLocker") ? "It enforces full-disk encryption using BitLocker with XTS-AES 256-bit encryption on operating system drives and fixed data drives. Recovery keys are backed up to Entra ID automatically." :
        p.name.includes("Defender") ? "It configures Microsoft Defender Antivirus with real-time protection, cloud-delivered protection, and automatic sample submission. PUA protection is set to block mode." :
        p.name.includes("Device Restrictions") ? "It restricts camera usage in managed apps, blocks screen capture, enforces managed pasteboard, and requires app store password for downloads." :
        p.name.includes("Compliance") ? "It enforces minimum OS version (Android 13), requires device encryption, blocks rooted devices, and sets a 72-hour compliance grace period." :
        p.name.includes("Update Ring") ? "It configures a staged Windows Update deployment with a 7-day deferral for quality updates and 14-day deferral for feature updates. Active hours are set 7AM-7PM." :
        p.name.includes("FileVault") ? "It enforces FileVault encryption on macOS devices with institutional recovery key escrow to Intune. Users receive a prompt at next logout." :
        p.name.includes("Edge") ? "It configures Microsoft Edge with mandatory security settings, sync policies, homepage and new tab customization, and extension management." :
        p.name.includes("App Protection") ? "It enforces app-level data protection including cut/copy/paste restrictions, requiring PIN for access, and blocking backup to unmanaged locations." :
        p.name.includes("Firewall") ? "It enables Windows Firewall for all network profiles (Domain, Private, Public) and configures inbound blocking with logging enabled." :
        p.name.includes("Enrollment") ? "It restricts device enrollment to corporate-owned Android Enterprise devices with a maximum of 5 devices per user." :
        p.name.includes("Credential Guard") ? "It enables Windows Credential Guard with UEFI lock to protect domain credentials from pass-the-hash and pass-the-ticket attacks." :
        "It configures Attack Surface Reduction rules including blocking Office macros from creating child processes, blocking credential stealing from LSASS, and blocking untrusted processes from USB."),
      keySettings: p.settingsCount,
      lastModified: p.lastModified
    };

    endUserImpact[p.id] = {
      severity: p.name.includes("Restrictions") || p.name.includes("ASR") || p.name.includes("Attack") ? "Medium" : p.name.includes("Compliance") ? "Low" : "Minimal",
      description: p.name.includes("BitLocker") ? "Users may experience a one-time encryption process that can take 1-2 hours. No ongoing impact once encrypted. Recovery key is automatically backed up." :
        p.name.includes("Defender") ? "Minimal end-user impact. Real-time scanning may cause brief delays when opening files. Cloud protection requires internet connectivity." :
        p.name.includes("Device Restrictions") ? "Users cannot use the camera in managed apps, cannot take screenshots, and must enter App Store password for each download. Copy/paste between managed and unmanaged apps is restricted." :
        p.name.includes("Compliance") ? "Users must keep their device updated to Android 13+. Non-compliant devices receive email notification and lose access to corporate resources after 72 hours." :
        p.name.includes("Update Ring") ? "Users will see update notifications and must restart within the configured deadline. Active hours (7AM-7PM) prevent forced restarts during work time." :
        p.name.includes("Edge") ? "Users will have a pre-configured Edge browser. Some settings cannot be changed by the user. Extensions are limited to the approved list." :
        p.name.includes("App Protection") ? "Users must set a PIN to access protected apps. Copy/paste to personal apps is blocked. Company data cannot be backed up to personal cloud storage." :
        "Standard security configuration with minimal disruption to daily workflows. Users may see initial setup prompts.",
      workarounds: "Users can contact IT helpdesk for any issues related to this policy."
    };

    securityImpact[p.id] = {
      rating: p.name.includes("BitLocker") || p.name.includes("Credential") || p.name.includes("Attack") ? "High" : p.name.includes("Firewall") || p.name.includes("Defender") ? "High" : "Medium",
      description: p.name.includes("BitLocker") ? "Protects data at rest. If a device is lost or stolen, data remains encrypted and inaccessible without proper authentication. Meets most compliance frameworks (NIST, ISO 27001, HIPAA)." :
        p.name.includes("Defender") ? "Provides real-time threat protection against malware, ransomware, and zero-day exploits. Cloud-delivered protection ensures latest threat intelligence is applied." :
        p.name.includes("Compliance") ? "Ensures devices meet minimum security standards. Non-compliant devices are blocked from corporate resources via Conditional Access integration." :
        p.name.includes("Credential Guard") ? "Prevents credential theft attacks (pass-the-hash, pass-the-ticket). Critical for environments targeted by advanced persistent threats." :
        p.name.includes("Attack") ? "Blocks common attack vectors used by ransomware and malware. Reduces the attack surface significantly by preventing exploitation of Office macros and script-based attacks." :
        p.name.includes("Firewall") ? "Network-level protection blocking unauthorized inbound connections. Logging enables security monitoring and incident investigation." :
        "Contributes to the overall security posture by enforcing organizational standards on managed devices.",
      complianceFrameworks: p.name.includes("BitLocker") || p.name.includes("Credential") ? ["NIST 800-171", "ISO 27001", "HIPAA", "SOC 2"] :
        p.name.includes("Defender") || p.name.includes("Firewall") ? ["NIST 800-53", "CIS Benchmarks", "PCI DSS"] :
        ["General Best Practice"]
    };

    const groupNames = ["All Corporate Devices", "IT Department", "Finance Department", "Engineering", "Remote Workers", "Executives", "All Users"];
    const filterNames = ["Corporate-owned devices only", "Windows 11 23H2+", "Enrolled > 7 days", "Non-BYOD devices"];
    const assignedGroups = groupNames.slice(0, 1 + Math.floor(Math.random() * 3));
    const excludedGroups = Math.random() > 0.6 ? [groupNames[Math.floor(Math.random() * groupNames.length)]] : [];
    const filters = Math.random() > 0.4 ? [{ name: filterNames[Math.floor(Math.random() * filterNames.length)], mode: Math.random() > 0.5 ? "Include" : "Exclude" }] : [];

    assignments[p.id] = {
      included: assignedGroups.map(g => ({ name: g, type: g.includes("All") ? "All devices/users" : "Entra ID Group", memberCount: Math.floor(Math.random() * 500) + 50 })),
      excluded: excludedGroups.map(g => ({ name: g, type: "Entra ID Group", memberCount: Math.floor(Math.random() * 100) + 10 })),
      filters: filters
    };
  });

  // Generate conflicts if multiple Windows security policies selected
  const winSecPolicies = policies.filter(p => p.platform === "Windows" && p.type === "Endpoint Security");
  if (winSecPolicies.length >= 2) {
    conflicts.push({
      type: "Potential Overlap",
      severity: "Info",
      policies: winSecPolicies.slice(0, 2).map(p => p.name),
      detail: "Multiple Endpoint Security policies target the same platform. Verify no conflicting settings exist between these policies.",
      recommendation: "Review settings overlap using the Intune Policy Conflict Analyzer."
    });
  }

  // Generate recommendations
  const unassignedLike = policies.filter(p => assignments[p.id].included.length === 1 && assignments[p.id].included[0].name.includes("All"));
  if (unassignedLike.length > 0) {
    recommendations.push({
      type: "Assignment Scope",
      icon: "🎯",
      title: "Consider targeted assignments",
      detail: `${unassignedLike.length} ${unassignedLike.length === 1 ? 'policy is' : 'policies are'} assigned to "All" groups. Consider scoping to specific groups for better control and staged rollout.`
    });
  }
  recommendations.push(
    { type: "Best Practice", icon: "🔄", title: "Enable policy versioning", detail: "Set up change tracking for these policies to maintain an audit trail of configuration changes." },
    { type: "Optimization", icon: "⚡", title: "Merge similar policies", detail: "Consider consolidating policies of the same type and platform to reduce management overhead and conflict potential." },
    { type: "Security", icon: "🛡️", title: "Add Conditional Access pairing", detail: "Pair compliance policies with Conditional Access for automated enforcement of non-compliant device blocking." }
  );

  return { summaries, endUserImpact, securityImpact, assignments, conflicts, recommendations };
};

// ── Icons ────────────────────────────────────────────────────────────────────
const Icons = {
  Shield: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Mail: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Play: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Alert: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  Filter: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Sparkle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  ChevronDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Refresh: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
};

// ── Platform badge colors ───────────────────────────────────────────────────
const platformColors = {
  "Windows": { bg: "#0e3d6b", text: "#4fc3f7", border: "#1565a7" },
  "iOS/iPadOS": { bg: "#3d1e5c", text: "#ce93d8", border: "#6a1b9a" },
  "Android Enterprise": { bg: "#1b3a1e", text: "#81c784", border: "#2e7d32" },
  "macOS": { bg: "#2c2c2c", text: "#bdbdbd", border: "#555" },
};

const severityColors = {
  "High": { bg: "#1a3a1a", text: "#66bb6a", dot: "#43a047" },
  "Medium": { bg: "#3a3520", text: "#ffb74d", dot: "#f9a825" },
  "Low": { bg: "#1a2a3a", text: "#4fc3f7", dot: "#039be5" },
  "Minimal": { bg: "#1a2a3a", text: "#4fc3f7", dot: "#039be5" },
  "Info": { bg: "#1a2a3a", text: "#4fc3f7", dot: "#039be5" },
};

// ── Main App ─────────────────────────────────────────────────────────────────
export default function IntunePolicyAgent() {
  const [policies, setPolicies] = useState(MOCK_POLICIES);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [phase, setPhase] = useState("select"); // select | analyzing | results
  const [analysisProgress, setAnalysisProgress] = useState({ step: 0, total: 6, label: "" });
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [expandedPolicies, setExpandedPolicies] = useState(new Set());
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [copiedSection, setCopiedSection] = useState(null);
  const progressRef = useRef(null);

  const types = ["All", ...new Set(policies.map(p => p.type))];
  const platforms = ["All", ...new Set(policies.map(p => p.platform))];

  const filtered = policies.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "All" || p.type === typeFilter;
    const matchPlatform = platformFilter === "All" || p.platform === platformFilter;
    return matchSearch && matchType && matchPlatform;
  });

  const togglePolicy = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  const toggleExpanded = (id) => {
    setExpandedPolicies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runAnalysis = async () => {
    setPhase("analyzing");
    const selectedPolicies = policies.filter(p => selected.has(p.id));
    const steps = [
      "Fetching policy configurations via Graph API...",
      "Querying Security Copilot for policy summaries...",
      "Analyzing end-user impact...",
      "Evaluating security posture...",
      "Retrieving assignments and filters...",
      "Running conflict detection and generating recommendations..."
    ];

    for (let i = 0; i < steps.length; i++) {
      setAnalysisProgress({ step: i + 1, total: steps.length, label: steps[i] });
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    }

    const mockResults = generateMockAnalysis(selectedPolicies);
    setResults({ ...mockResults, policies: selectedPolicies });
    setPhase("results");
    setActiveTab("summary");
    setExpandedPolicies(new Set(selectedPolicies.length <= 3 ? selectedPolicies.map(p => p.id) : []));
  };

  const resetAgent = () => {
    setPhase("select");
    setResults(null);
    setSelected(new Set());
    setAnalysisProgress({ step: 0, total: 6, label: "" });
  };

  const copyToClipboard = (text, section) => {
    navigator.clipboard?.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const generateExportText = () => {
    if (!results) return "";
    let text = "═══════════════════════════════════════════════════\n";
    text += "  INTUNE POLICY INTELLIGENCE REPORT\n";
    text += `  Generated: ${new Date().toLocaleString()}\n`;
    text += `  Policies analyzed: ${results.policies.length}\n`;
    text += "═══════════════════════════════════════════════════\n\n";

    results.policies.forEach(p => {
      text += `━━━ ${p.name} ━━━\n`;
      text += `Type: ${p.type} | Platform: ${p.platform}\n\n`;
      text += `📋 SUMMARY\n${results.summaries[p.id].overview}\n\n`;
      text += `👤 END-USER IMPACT (${results.endUserImpact[p.id].severity})\n${results.endUserImpact[p.id].description}\n\n`;
      text += `🛡️ SECURITY IMPACT (${results.securityImpact[p.id].rating})\n${results.securityImpact[p.id].description}\n`;
      if (results.securityImpact[p.id].complianceFrameworks.length > 0) {
        text += `Compliance: ${results.securityImpact[p.id].complianceFrameworks.join(", ")}\n`;
      }
      text += `\n📌 ASSIGNMENTS\n`;
      text += `Included: ${results.assignments[p.id].included.map(g => `${g.name} (${g.memberCount} members)`).join(", ")}\n`;
      if (results.assignments[p.id].excluded.length > 0) {
        text += `Excluded: ${results.assignments[p.id].excluded.map(g => g.name).join(", ")}\n`;
      }
      if (results.assignments[p.id].filters.length > 0) {
        text += `Filters: ${results.assignments[p.id].filters.map(f => `${f.name} (${f.mode})`).join(", ")}\n`;
      }
      text += "\n\n";
    });

    if (results.conflicts.length > 0) {
      text += "⚠️ CONFLICTS & WARNINGS\n";
      results.conflicts.forEach(c => {
        text += `• ${c.type}: ${c.detail}\n  Policies: ${c.policies.join(" ↔ ")}\n`;
      });
      text += "\n";
    }

    text += "💡 RECOMMENDATIONS\n";
    results.recommendations.forEach(r => {
      text += `${r.icon} ${r.title}\n  ${r.detail}\n\n`;
    });

    return text;
  };

  const generateHtmlExport = () => {
    if (!results) return "";
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Intune Policy Report</title>
    <style>
      body{font-family:Segoe UI,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1a2e;background:#f8f9fc}
      h1{color:#0d2137;border-bottom:3px solid #0078d4;padding-bottom:12px}
      h2{color:#0d2137;margin-top:32px;padding:8px 12px;background:#e8f0fe;border-left:4px solid #0078d4;border-radius:0 6px 6px 0}
      h3{color:#333;margin-top:20px}
      .meta{color:#666;font-size:13px;margin-bottom:24px}
      .policy-card{background:#fff;border:1px solid #dde;border-radius:8px;padding:20px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
      .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;margin-right:6px}
      .severity-high{background:#e8f5e9;color:#2e7d32}.severity-medium{background:#fff3e0;color:#e65100}.severity-low{background:#e3f2fd;color:#0277bd}
      .assignment-table{width:100%;border-collapse:collapse;margin:8px 0}
      .assignment-table th,.assignment-table td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;font-size:13px}
      .assignment-table th{background:#f5f6fa;font-weight:600;color:#555}
      .filter-badge{background:#f0e6ff;color:#6a1b9a;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
      .conflict{background:#fff8e1;border-left:4px solid #f9a825;padding:12px 16px;border-radius:0 6px 6px 0;margin:8px 0}
      .recommendation{background:#f1f8e9;border-left:4px solid #66bb6a;padding:12px 16px;border-radius:0 6px 6px 0;margin:8px 0}
      .frameworks{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
      .framework-badge{background:#e8eaf6;color:#283593;padding:2px 8px;border-radius:10px;font-size:11px}
    </style></head><body>
    <h1>🛡️ Intune Policy Intelligence Report</h1>
    <div class="meta">Generated: ${new Date().toLocaleString()} • Policies analyzed: ${results.policies.length}</div>`;

    results.policies.forEach(p => {
      const pc = platformColors[p.platform] || { bg: "#eee", text: "#333" };
      html += `<div class="policy-card">
        <h2 style="margin-top:0">${p.name}</h2>
        <span class="badge" style="background:${pc.bg};color:${pc.text}">${p.platform}</span>
        <span class="badge" style="background:#e8f0fe;color:#0d47a1">${p.type}</span>
        <span class="badge" style="background:#f5f5f5;color:#666">${p.settingsCount} settings</span>

        <h3>📋 Summary</h3><p>${results.summaries[p.id].overview}</p>

        <h3>👤 End-User Impact</h3>
        <span class="badge severity-${results.endUserImpact[p.id].severity.toLowerCase()}">${results.endUserImpact[p.id].severity}</span>
        <p>${results.endUserImpact[p.id].description}</p>

        <h3>🛡️ Security Impact</h3>
        <span class="badge severity-${results.securityImpact[p.id].rating.toLowerCase()}">${results.securityImpact[p.id].rating}</span>
        <p>${results.securityImpact[p.id].description}</p>
        <div class="frameworks">${results.securityImpact[p.id].complianceFrameworks.map(f => `<span class="framework-badge">${f}</span>`).join('')}</div>

        <h3>📌 Assignments</h3>
        <table class="assignment-table">
          <tr><th>Group</th><th>Type</th><th>Scope</th><th>Members</th></tr>
          ${results.assignments[p.id].included.map(g => `<tr><td>${g.name}</td><td>${g.type}</td><td>Included</td><td>${g.memberCount}</td></tr>`).join('')}
          ${results.assignments[p.id].excluded.map(g => `<tr><td>${g.name}</td><td>${g.type}</td><td style="color:#c62828">Excluded</td><td>${g.memberCount}</td></tr>`).join('')}
        </table>
        ${results.assignments[p.id].filters.length > 0 ? `<p>Filters: ${results.assignments[p.id].filters.map(f => `<span class="filter-badge">${f.name} (${f.mode})</span>`).join(' ')}</p>` : ''}
      </div>`;
    });

    if (results.conflicts.length > 0) {
      html += `<h2>⚠️ Conflicts & Warnings</h2>`;
      results.conflicts.forEach(c => {
        html += `<div class="conflict"><strong>${c.type}</strong><br>${c.detail}<br><em>Policies: ${c.policies.join(" ↔ ")}</em></div>`;
      });
    }

    html += `<h2>💡 Recommendations</h2>`;
    results.recommendations.forEach(r => {
      html += `<div class="recommendation"><strong>${r.icon} ${r.title}</strong><br>${r.detail}</div>`;
    });

    html += `</body></html>`;
    return html;
  };

  const exportReport = (format) => {
    if (format === "html") {
      const blob = new Blob([generateHtmlExport()], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intune-policy-report-${new Date().toISOString().split('T')[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([generateExportText()], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intune-policy-report-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #070b14 0%, #0d1b2a 40%, #0a1628 100%)",
      color: "#c8d6e5",
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(20px)",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 38, height: 38,
            background: "linear-gradient(135deg, #0078d4, #00b4d8)",
            borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,120,212,0.35)",
          }}>
            <Icons.Shield />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#e8f0fe", letterSpacing: "-0.3px" }}>
              Intune Policy Intelligence Agent
            </div>
            <div style={{ fontSize: 11, color: "#5a7a9a", letterSpacing: "0.5px" }}>
              POWERED BY SECURITY COPILOT
            </div>
          </div>
        </div>
        {phase === "results" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => exportReport("html")} style={headerBtnStyle}>
              <Icons.Download /> Export HTML
            </button>
            <button onClick={() => exportReport("text")} style={headerBtnStyle}>
              <Icons.Download /> Export Text
            </button>
            <button onClick={() => setEmailDialogOpen(true)} style={{...headerBtnStyle, background: "rgba(0,120,212,0.2)", borderColor: "rgba(0,120,212,0.4)"}}>
              <Icons.Mail /> Email Report
            </button>
            <button onClick={resetAgent} style={{...headerBtnStyle, background: "rgba(255,255,255,0.05)"}}>
              <Icons.Refresh /> New Analysis
            </button>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px 60px" }}>

        {/* ── Phase: SELECT ────────────────────────────────────────────── */}
        {phase === "select" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#e8f0fe", margin: "0 0 6px" }}>
                Select policies to analyze
              </h2>
              <p style={{ fontSize: 13, color: "#5a7a9a", margin: 0 }}>
                Choose one or more Intune policies. The agent will query Security Copilot to summarize each policy,
                assess end-user and security impact, retrieve assignments with filters, and detect potential conflicts.
              </p>
            </div>

            {/* Filters bar */}
            <div style={{
              display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
            }}>
              <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4a6a8a" }}>
                  <Icons.Search />
                </span>
                <input
                  type="text"
                  placeholder="Search policies..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 12px 10px 38px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8, color: "#c8d6e5", fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={selectStyle}
              >
                {types.map(t => <option key={t} value={t}>{t === "All" ? "All Types" : t}</option>)}
              </select>
              <select
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
                style={selectStyle}
              >
                {platforms.map(p => <option key={p} value={p}>{p === "All" ? "All Platforms" : p}</option>)}
              </select>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "#5a7a9a" }}>
                {selected.size} of {filtered.length} selected
              </span>
            </div>

            {/* Policy table */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 160px 130px 100px 80px",
                padding: "10px 16px",
                background: "rgba(0,0,0,0.3)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11, fontWeight: 600, color: "#5a7a9a",
                textTransform: "uppercase", letterSpacing: "0.6px",
                alignItems: "center",
              }}>
                <div>
                  <label style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      style={{ display: "none" }}
                    />
                    <div style={{
                      width: 18, height: 18, borderRadius: 4,
                      border: `2px solid ${selected.size === filtered.length && filtered.length > 0 ? "#0078d4" : "rgba(255,255,255,0.15)"}`,
                      background: selected.size === filtered.length && filtered.length > 0 ? "#0078d4" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {selected.size === filtered.length && filtered.length > 0 && <Icons.Check />}
                    </div>
                  </label>
                </div>
                <div>Policy Name</div>
                <div>Type</div>
                <div>Platform</div>
                <div>Modified</div>
                <div style={{ textAlign: "center" }}>Settings</div>
              </div>

              {/* Table rows */}
              {filtered.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => togglePolicy(p.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 160px 130px 100px 80px",
                    padding: "12px 16px",
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                    cursor: "pointer",
                    alignItems: "center",
                    background: selected.has(p.id) ? "rgba(0,120,212,0.08)" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { if (!selected.has(p.id)) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                  onMouseLeave={e => { if (!selected.has(p.id)) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4,
                      border: `2px solid ${selected.has(p.id) ? "#0078d4" : "rgba(255,255,255,0.12)"}`,
                      background: selected.has(p.id) ? "#0078d4" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {selected.has(p.id) && <Icons.Check />}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#e0ecf5" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#6a8aaa" }}>{p.type}</div>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      padding: "2px 10px", borderRadius: 10,
                      background: (platformColors[p.platform] || {}).bg || "#222",
                      color: (platformColors[p.platform] || {}).text || "#aaa",
                      border: `1px solid ${(platformColors[p.platform] || {}).border || "#444"}`,
                    }}>
                      {p.platform}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#5a7a9a" }}>{p.lastModified}</div>
                  <div style={{ textAlign: "center", fontSize: 12, color: "#6a8aaa" }}>{p.settingsCount}</div>
                </div>
              ))}
            </div>

            {/* Submit button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, gap: 12 }}>
              <button
                onClick={runAnalysis}
                disabled={selected.size === 0}
                style={{
                  padding: "12px 28px",
                  background: selected.size > 0
                    ? "linear-gradient(135deg, #0078d4, #00b4d8)"
                    : "rgba(255,255,255,0.05)",
                  color: selected.size > 0 ? "#fff" : "#555",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14, fontWeight: 600,
                  cursor: selected.size > 0 ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: selected.size > 0 ? "0 4px 16px rgba(0,120,212,0.3)" : "none",
                  transition: "all 0.2s",
                }}
              >
                <Icons.Sparkle />
                Analyze {selected.size} {selected.size === 1 ? "Policy" : "Policies"}
              </button>
            </div>
          </>
        )}

        {/* ── Phase: ANALYZING ──────────────────────────────────────────── */}
        {phase === "analyzing" && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "60vh", gap: 32,
          }}>
            <div style={{
              width: 64, height: 64,
              background: "linear-gradient(135deg, #0078d4, #00b4d8)",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 24px rgba(0,120,212,0.35)",
              animation: "pulse 2s infinite",
            }}>
              <Icons.Sparkle />
            </div>
            <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e8f0fe", marginBottom: 8 }}>
                Security Copilot is analyzing your policies
              </div>
              <div style={{ fontSize: 13, color: "#5a7a9a" }}>
                {analysisProgress.label}
              </div>
            </div>

            <div style={{ width: 400, maxWidth: "90%" }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  background: "linear-gradient(90deg, #0078d4, #00b4d8)",
                  width: `${(analysisProgress.step / analysisProgress.total) * 100}%`,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "#4a6a8a", textAlign: "center", marginTop: 8 }}>
                Step {analysisProgress.step} of {analysisProgress.total}
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: RESULTS ──────────────────────────────────────────── */}
        {phase === "results" && results && (
          <>
            {/* Stats bar */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12, marginBottom: 24,
            }}>
              {[
                { label: "Policies Analyzed", value: results.policies.length, color: "#0078d4" },
                { label: "Total Settings", value: results.policies.reduce((s, p) => s + p.settingsCount, 0), color: "#00b4d8" },
                { label: "Conflicts Found", value: results.conflicts.length, color: results.conflicts.length > 0 ? "#f9a825" : "#43a047" },
                { label: "Recommendations", value: results.recommendations.length, color: "#7c4dff" },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10, padding: "16px 20px",
                }}>
                  <div style={{ fontSize: 11, color: "#5a7a9a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 4 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{
              display: "flex", gap: 2,
              background: "rgba(0,0,0,0.3)",
              borderRadius: "10px 10px 0 0",
              padding: "4px 4px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              {[
                { id: "summary", label: "Summary", icon: "📋" },
                { id: "enduser", label: "End-User Impact", icon: "👤" },
                { id: "security", label: "Security Impact", icon: "🛡️" },
                { id: "assignments", label: "Assignments & Filters", icon: "📌" },
                { id: "conflicts", label: `Conflicts (${results.conflicts.length})`, icon: "⚠️" },
                { id: "recommendations", label: "Recommendations", icon: "💡" },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "10px 18px",
                    background: activeTab === tab.id ? "rgba(255,255,255,0.04)" : "transparent",
                    border: "none",
                    borderBottom: activeTab === tab.id ? "2px solid #0078d4" : "2px solid transparent",
                    color: activeTab === tab.id ? "#e8f0fe" : "#5a7a9a",
                    fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer",
                    borderRadius: "6px 6px 0 0",
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: "none",
              borderRadius: "0 0 12px 12px",
              padding: 24,
            }}>
              {/* Summary tab */}
              {activeTab === "summary" && results.policies.map(p => (
                <PolicySection key={p.id} policy={p} expanded={expandedPolicies.has(p.id)} toggle={() => toggleExpanded(p.id)}>
                  <p style={{ lineHeight: 1.7, color: "#b0c4de", margin: 0 }}>
                    {results.summaries[p.id].overview}
                  </p>
                  <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                    <MiniStat label="Settings" value={results.summaries[p.id].keySettings} />
                    <MiniStat label="Last Modified" value={p.lastModified} />
                    <MiniStat label="Platform" value={p.platform} />
                  </div>
                </PolicySection>
              ))}

              {/* End-user Impact tab */}
              {activeTab === "enduser" && results.policies.map(p => (
                <PolicySection key={p.id} policy={p} expanded={expandedPolicies.has(p.id)} toggle={() => toggleExpanded(p.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <SeverityBadge level={results.endUserImpact[p.id].severity} />
                    <span style={{ fontSize: 12, color: "#6a8aaa" }}>impact level</span>
                  </div>
                  <p style={{ lineHeight: 1.7, color: "#b0c4de", margin: 0 }}>
                    {results.endUserImpact[p.id].description}
                  </p>
                </PolicySection>
              ))}

              {/* Security Impact tab */}
              {activeTab === "security" && results.policies.map(p => (
                <PolicySection key={p.id} policy={p} expanded={expandedPolicies.has(p.id)} toggle={() => toggleExpanded(p.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <SeverityBadge level={results.securityImpact[p.id].rating} />
                    <span style={{ fontSize: 12, color: "#6a8aaa" }}>security value</span>
                  </div>
                  <p style={{ lineHeight: 1.7, color: "#b0c4de", margin: 0 }}>
                    {results.securityImpact[p.id].description}
                  </p>
                  {results.securityImpact[p.id].complianceFrameworks.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      <span style={{ fontSize: 11, color: "#5a7a9a", marginRight: 4, lineHeight: "22px" }}>Compliance:</span>
                      {results.securityImpact[p.id].complianceFrameworks.map(f => (
                        <span key={f} style={{
                          fontSize: 11, fontWeight: 600,
                          padding: "2px 10px", borderRadius: 10,
                          background: "rgba(0,120,212,0.12)", color: "#4fc3f7",
                          border: "1px solid rgba(0,120,212,0.2)",
                        }}>{f}</span>
                      ))}
                    </div>
                  )}
                </PolicySection>
              ))}

              {/* Assignments tab */}
              {activeTab === "assignments" && results.policies.map(p => (
                <PolicySection key={p.id} policy={p} expanded={expandedPolicies.has(p.id)} toggle={() => toggleExpanded(p.id)}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#4fc3f7", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icons.Users /> Included Groups
                    </div>
                    {results.assignments[p.id].included.map((g, i) => (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 6,
                        background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                      }}>
                        <div>
                          <span style={{ fontSize: 13, color: "#d0e0f0" }}>{g.name}</span>
                          <span style={{ fontSize: 11, color: "#5a7a9a", marginLeft: 8 }}>{g.type}</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#6a8aaa" }}>{g.memberCount} members</span>
                      </div>
                    ))}
                  </div>

                  {results.assignments[p.id].excluded.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#ef5350", marginBottom: 8 }}>
                        ✕ Excluded Groups
                      </div>
                      {results.assignments[p.id].excluded.map((g, i) => (
                        <div key={i} style={{
                          padding: "8px 12px", borderRadius: 6,
                          background: "rgba(239,83,80,0.05)",
                          border: "1px solid rgba(239,83,80,0.1)",
                        }}>
                          <span style={{ fontSize: 13, color: "#ef9a9a" }}>{g.name}</span>
                          <span style={{ fontSize: 11, color: "#5a7a9a", marginLeft: 8 }}>{g.type}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {results.assignments[p.id].filters.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#ce93d8", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icons.Filter /> Assignment Filters
                      </div>
                      {results.assignments[p.id].filters.map((f, i) => (
                        <div key={i} style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "6px 14px", borderRadius: 8,
                          background: "rgba(206,147,216,0.08)",
                          border: "1px solid rgba(206,147,216,0.15)",
                        }}>
                          <span style={{ fontSize: 13, color: "#ce93d8" }}>{f.name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 4,
                            background: f.mode === "Include" ? "rgba(76,175,80,0.15)" : "rgba(239,83,80,0.15)",
                            color: f.mode === "Include" ? "#81c784" : "#ef5350",
                          }}>{f.mode}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {results.assignments[p.id].filters.length === 0 && results.assignments[p.id].excluded.length === 0 && (
                    <div style={{ fontSize: 12, color: "#5a7a9a", fontStyle: "italic", marginTop: 4 }}>
                      No exclusions or filters configured for this policy.
                    </div>
                  )}
                </PolicySection>
              ))}

              {/* Conflicts tab */}
              {activeTab === "conflicts" && (
                <>
                  {results.conflicts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 0" }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#66bb6a" }}>No conflicts detected</div>
                      <div style={{ fontSize: 13, color: "#5a7a9a", marginTop: 4 }}>
                        The selected policies have no overlapping or conflicting settings.
                      </div>
                    </div>
                  ) : (
                    results.conflicts.map((c, i) => (
                      <div key={i} style={{
                        padding: 16, borderRadius: 10, marginBottom: 12,
                        background: "rgba(249,168,37,0.06)",
                        border: "1px solid rgba(249,168,37,0.15)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <Icons.Alert />
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#ffb74d" }}>{c.type}</span>
                          <SeverityBadge level={c.severity} />
                        </div>
                        <p style={{ fontSize: 13, color: "#b0c4de", lineHeight: 1.6, margin: "0 0 8px" }}>
                          {c.detail}
                        </p>
                        <div style={{ fontSize: 12, color: "#6a8aaa" }}>
                          Policies: {c.policies.join(" ↔ ")}
                        </div>
                        {c.recommendation && (
                          <div style={{
                            marginTop: 10, padding: "8px 12px", borderRadius: 6,
                            background: "rgba(0,120,212,0.08)",
                            fontSize: 12, color: "#4fc3f7",
                          }}>
                            💡 {c.recommendation}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}

              {/* Recommendations tab */}
              {activeTab === "recommendations" && results.recommendations.map((r, i) => (
                <div key={i} style={{
                  padding: 16, borderRadius: 10, marginBottom: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  transition: "border-color 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{r.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e0ecf5" }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: "#4a6a8a", textTransform: "uppercase", letterSpacing: "0.3px" }}>{r.type}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: "#8aa0b8", lineHeight: 1.6, margin: 0, paddingLeft: 30 }}>
                    {r.detail}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Email Dialog ──────────────────────────────────────────────────── */}
      {emailDialogOpen && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200,
        }}
          onClick={() => setEmailDialogOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#111827",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: 28,
              width: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", color: "#e8f0fe", fontSize: 16 }}>Email Report</h3>
            <p style={{ fontSize: 12, color: "#5a7a9a", margin: "0 0 20px" }}>
              Send the full analysis report as a formatted HTML email.
            </p>
            <input
              type="email"
              placeholder="recipient@company.com"
              value={emailAddress}
              onChange={e => setEmailAddress(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "#e0ecf5", fontSize: 13,
                outline: "none", marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEmailDialogOpen(false)} style={{
                padding: "8px 18px", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                color: "#8aa0b8", fontSize: 13, cursor: "pointer",
              }}>Cancel</button>
              <button
                onClick={() => {
                  alert(`Report would be sent to ${emailAddress} via Graph API (Mail.Send permission required)`);
                  setEmailDialogOpen(false);
                  setEmailAddress("");
                }}
                style={{
                  padding: "8px 18px",
                  background: "linear-gradient(135deg, #0078d4, #00b4d8)",
                  border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                Send Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function PolicySection({ policy, expanded, toggle, children }) {
  return (
    <div style={{
      marginBottom: 10,
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 8,
      overflow: "hidden",
      background: expanded ? "rgba(255,255,255,0.01)" : "transparent",
    }}>
      <div
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s",
            display: "inline-flex",
          }}>
            <Icons.ChevronDown />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e0ecf5" }}>{policy.name}</span>
          <span style={{
            fontSize: 11, padding: "1px 8px", borderRadius: 8,
            background: (platformColors[policy.platform] || {}).bg || "#222",
            color: (platformColors[policy.platform] || {}).text || "#aaa",
            border: `1px solid ${(platformColors[policy.platform] || {}).border || "#444"}`,
          }}>{policy.platform}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "4px 16px 16px 42px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ level }) {
  const c = severityColors[level] || severityColors.Info;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
      background: c.bg, color: c.text,
      border: `1px solid ${c.dot}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {level}
    </span>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 6,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 10, color: "#4a6a8a", textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#b0c4de", marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────
const headerBtnStyle = {
  padding: "7px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#b0c4de",
  fontSize: 12, fontWeight: 500,
  cursor: "pointer",
  display: "flex", alignItems: "center", gap: 6,
  transition: "all 0.15s",
};

const selectStyle = {
  padding: "10px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  color: "#c8d6e5",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};
