async function graphGet(token: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error (${res.status}): ${error}`);
  }

  return res.json();
}

async function graphGetAll(token: string, url: string): Promise<any[]> {
  let results: any[] = [];
  let nextLink: string | null = url;

  while (nextLink) {
    const data = await graphGet(token, nextLink);
    results = results.concat(data.value || []);
    nextLink = data["@odata.nextLink"] || null;
  }

  return results;
}

function getPlatformFromOdataType(policy: any): string {
  const platforms = policy.platforms || "";
  if (platforms.includes("windows")) return "Windows";
  if (platforms.includes("iOS") || platforms.includes("iphone") || platforms.includes("ipad")) return "iOS/iPadOS";
  if (platforms.includes("macOS") || platforms.includes("mac")) return "macOS";
  if (platforms.includes("android")) return "Android Enterprise";

  const name = (policy.displayName || policy.name || "").toLowerCase();
  if (name.includes("windows") || name.includes("win")) return "Windows";
  if (name.includes("ios") || name.includes("iphone") || name.includes("ipad")) return "iOS/iPadOS";
  if (name.includes("macos") || name.includes("mac")) return "macOS";
  if (name.includes("android")) return "Android Enterprise";

  return "Windows";
}

function getPolicyType(policy: any, source: string): string {
  if (source === "deviceConfigurations") return "Configuration Profile";
  if (source === "deviceCompliancePolicies") return "Compliance Policy";
  if (source === "intents") return "Endpoint Security";
  if (source === "configurationPolicies") return "Settings Catalog";
  if (source === "managedAppPolicies" || source === "mdmWindowsInformationProtectionPolicies") return "App Protection";
  if (source === "windowsAutopilotDeploymentProfiles") return "Autopilot Profile";
  return "Configuration Profile";
}

export interface IntunePolicyRaw {
  id: string;
  name: string;
  type: string;
  platform: string;
  lastModified: string;
  settingsCount: number;
  description?: string;
  rawData?: any;
}

export async function fetchAllPolicies(token: string): Promise<IntunePolicyRaw[]> {
  const baseUrl = "https://graph.microsoft.com/beta/deviceManagement";

  const endpoints = [
    { url: `${baseUrl}/deviceConfigurations`, source: "deviceConfigurations" },
    { url: `${baseUrl}/deviceCompliancePolicies`, source: "deviceCompliancePolicies" },
    { url: `${baseUrl}/intents`, source: "intents" },
    { url: `${baseUrl}/configurationPolicies`, source: "configurationPolicies" },
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (ep) => {
      try {
        const items = await graphGetAll(token, ep.url);
        return items.map((item: any) => ({
          ...item,
          _source: ep.source,
        }));
      } catch {
        return [];
      }
    })
  );

  const allPolicies: IntunePolicyRaw[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        const lastModified = item.lastModifiedDateTime || item.createdDateTime || new Date().toISOString();
        allPolicies.push({
          id: item.id,
          name: item.displayName || item.name || "Unnamed Policy",
          type: getPolicyType(item, item._source),
          platform: getPlatformFromOdataType(item),
          lastModified: new Date(lastModified).toISOString().split("T")[0],
          settingsCount: item.settingCount || item.settingsCount || 0,
          description: item.description || "",
          rawData: item,
        });
      }
    }
  }

  allPolicies.sort((a, b) => a.name.localeCompare(b.name));
  return allPolicies;
}

export async function fetchPolicyDetails(token: string, policyId: string, policies: IntunePolicyRaw[]): Promise<any> {
  const policy = policies.find(p => p.id === policyId);
  if (!policy) return null;

  const baseUrl = "https://graph.microsoft.com/beta/deviceManagement";
  let details: any = { ...policy.rawData, _policyMeta: policy };

  try {
    const source = policy.rawData?._source;
    if (source === "configurationPolicies") {
      const settings = await graphGetAll(token, `${baseUrl}/configurationPolicies('${policyId}')/settings`);
      details.settings = settings;
      details.settingsCount = settings.length;
    }
  } catch {}

  try {
    let assignmentsUrl = "";
    const source = policy.rawData?._source;
    if (source === "deviceConfigurations") {
      assignmentsUrl = `${baseUrl}/deviceConfigurations('${policyId}')/assignments`;
    } else if (source === "deviceCompliancePolicies") {
      assignmentsUrl = `${baseUrl}/deviceCompliancePolicies('${policyId}')/assignments`;
    } else if (source === "configurationPolicies") {
      assignmentsUrl = `${baseUrl}/configurationPolicies('${policyId}')/assignments`;
    } else if (source === "intents") {
      assignmentsUrl = `${baseUrl}/intents('${policyId}')/assignments`;
    }

    if (assignmentsUrl) {
      const assignments = await graphGetAll(token, assignmentsUrl);
      details.assignments = assignments;
    }
  } catch {}

  return details;
}

export async function fetchAssignmentFilterDetails(token: string, filterId: string): Promise<any> {
  try {
    const data = await graphGet(token, `https://graph.microsoft.com/beta/deviceManagement/assignmentFilters('${filterId}')?$select=displayName,rule,platform`);
    return {
      name: data.displayName || filterId,
      rule: data.rule || "",
      platform: data.platform || "",
    };
  } catch {
    return {
      name: filterId,
      rule: "",
      platform: "",
    };
  }
}

export async function fetchGroupDetails(token: string, groupId: string): Promise<any> {
  try {
    const data = await graphGet(token, `https://graph.microsoft.com/v1.0/groups/${groupId}?$select=displayName,membershipRule,groupTypes&$count=true`);
    let memberCount = 0;
    try {
      const members = await graphGet(token, `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$count`);
      memberCount = typeof members === "number" ? members : 0;
    } catch {
      memberCount = 0;
    }
    return {
      name: data.displayName || groupId,
      type: data.groupTypes?.includes("DynamicMembership") ? "Dynamic Group" : "Entra ID Group",
      memberCount,
    };
  } catch {
    return {
      name: groupId,
      type: "Entra ID Group",
      memberCount: 0,
    };
  }
}
