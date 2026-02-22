async function graphGet(token: string, url: string, extraHeaders?: Record<string, string>): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error (${res.status}): ${error}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  const num = parseInt(text, 10);
  return isNaN(num) ? text : num;
}

async function graphGetAll(token: string, url: string): Promise<any[]> {
  let results: any[] = [];
  let nextLink: string | null = url;
  let pageCount = 0;

  while (nextLink) {
    const data = await graphGet(token, nextLink);
    const pageItems = data.value || [];
    results = results.concat(pageItems);
    pageCount++;
    nextLink = data["@odata.nextLink"] || null;
  }

  if (pageCount > 1) {
    console.log(`[graphGetAll] Fetched ${results.length} items across ${pageCount} pages from ${url.split("?")[0]}`);
  }

  return results;
}

function toPascalCaseSettingName(fullKey: string): string {
  return fullKey.split('.').map(part => {
    const cleaned = part.replace(/\[(\d+)\]/g, '[$1]');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }).join(' > ');
}

function cleanSettingDefinitionId(defId: string): string {
  let name = defId.replace(/^.*~/, "");
  name = name.replace(/^(device_vendor_msft_|user_vendor_msft_|vendor_msft_)/i, "");
  const parts = name.split("_").filter(Boolean);
  if (parts.length <= 2) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }
  const meaningful = parts.slice(-3);
  return meaningful.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" > ");
}

function getPlatformFromOdataType(policy: any): string {
  const platforms = (policy.platforms || "").toLowerCase();
  if (platforms.includes("windows")) return "Windows";
  if (platforms.includes("ios")) return "iOS/iPadOS";
  if (platforms.includes("macos")) return "macOS";
  if (platforms.includes("android")) return "Android Enterprise";
  if (platforms.includes("linux")) return "Linux";

  const odataType = (policy["@odata.type"] || "").toLowerCase();
  if (odataType.includes("windows") || odataType.includes("win32") || odataType.includes("edgehomebutton") || odataType.includes("sharedpc")) return "Windows";
  if (odataType.includes("ios") || odataType.includes("iphone") || odataType.includes("ipad")) return "iOS/iPadOS";
  if (odataType.includes("macos") || odataType.includes("osx")) return "macOS";
  if (odataType.includes("android")) return "Android Enterprise";

  const templateId = (policy.templateReference?.templateId || policy.templateId || "").toLowerCase();
  if (templateId) {
    const templateDisplay = (policy.templateReference?.templateDisplayName || "").toLowerCase();
    if (templateDisplay.includes("windows") || templateDisplay.includes("defender") || templateDisplay.includes("bitlocker") || templateDisplay.includes("firewall")) return "Windows";
    if (templateDisplay.includes("ios") || templateDisplay.includes("iphone")) return "iOS/iPadOS";
    if (templateDisplay.includes("macos")) return "macOS";
    if (templateDisplay.includes("android")) return "Android Enterprise";
    if (templateDisplay.includes("linux")) return "Linux";
  }

  const name = (policy.displayName || policy.name || "").toLowerCase();
  if (name.includes("windows") || name.includes("win10") || name.includes("win11")) return "Windows";
  if (name.includes("ios") || name.includes("iphone") || name.includes("ipad")) return "iOS/iPadOS";
  if (name.includes("macos")) return "macOS";
  if (name.includes("android")) return "Android Enterprise";
  if (name.includes("linux")) return "Linux";

  const source = policy._source || "";
  if (source === "intents") {
    const intentTemplateId = policy.templateId || "";
    if (intentTemplateId) return "Windows";
  }

  return "Unknown";
}

function getPolicyType(policy: any, source: string): string {
  if (source === "deviceConfigurations") {
    const odataType = (policy["@odata.type"] || "").toLowerCase();
    if (odataType.includes("customconfiguration") || odataType.includes("custom")) {
      return "Custom (OMA-URI)";
    }
    if (policy.omaSettings && Array.isArray(policy.omaSettings) && policy.omaSettings.length > 0) {
      return "Custom (OMA-URI)";
    }
    return "Configuration Profile";
  }
  if (source === "deviceCompliancePolicies") return "Compliance Policy";
  if (source === "intents") return "Endpoint Security";
  if (source === "configurationPolicies") return "Settings Catalog";
  if (source === "managedAppPolicies" || source === "mdmWindowsInformationProtectionPolicies") return "App Protection";
  if (source === "windowsAutopilotDeploymentProfiles") return "Autopilot Profile";
  return "Configuration Profile";
}

function countPolicySettings(item: any, source: string): number {
  if (source === "configurationPolicies") {
    return item.settingCount || 0;
  }
  if (source === "intents") {
    return item.settingCount || 0;
  }
  if (source === "deviceConfigurations") {
    if (item.omaSettings && Array.isArray(item.omaSettings)) {
      return item.omaSettings.length;
    }
    const odataType = (item["@odata.type"] || "").toLowerCase();
    const skipKeys = new Set(["id", "displayName", "description", "createdDateTime", "lastModifiedDateTime", "version", "roleScopeTagIds", "@odata.type", "_source", "assignments", "isAssigned", "supportsScopeTags", "deviceManagementApplicabilityRuleOsEdition", "deviceManagementApplicabilityRuleOsVersion", "deviceManagementApplicabilityRuleDeviceMode"]);
    let count = 0;
    for (const [key, value] of Object.entries(item)) {
      if (skipKeys.has(key) || key.startsWith("@") || key.startsWith("_")) continue;
      if (value === null || value === undefined) continue;
      count++;
    }
    if (count === 0 && odataType.includes("custom")) {
      return -1;
    }
    return count;
  }
  if (source === "deviceCompliancePolicies") {
    const skipKeys = new Set(["id", "displayName", "description", "createdDateTime", "lastModifiedDateTime", "version", "roleScopeTagIds", "@odata.type", "_source", "assignments", "isAssigned", "supportsScopeTags", "scheduledActionsForRule"]);
    let count = 0;
    for (const [key, value] of Object.entries(item)) {
      if (skipKeys.has(key) || key.startsWith("@") || key.startsWith("_")) continue;
      if (value === null || value === undefined) continue;
      count++;
    }
    return count;
  }
  return 0;
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

export { cleanSettingDefinitionId };

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
        console.log(`[fetchAllPolicies] ${ep.source}: fetched ${items.length} policies`);
        return items.map((item: any) => ({
          ...item,
          _source: ep.source,
        }));
      } catch (err: any) {
        console.error(`[fetchAllPolicies] ${ep.source} FAILED: ${err?.message}`);
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
          settingsCount: countPolicySettings(item, item._source),
          description: item.description || "",
          rawData: item,
        });
      }
    }
  }

  console.log(`[fetchAllPolicies] Total: ${allPolicies.length} policies across all endpoints`);
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
      console.log(`  Fetched ${settings.length} settings from Settings Catalog for "${policy.name}"`);
    } else if (source === "intents") {
      const allIntentSettings: any[] = [];
      try {
        const categories = await graphGetAll(token, `${baseUrl}/intents('${policyId}')/categories`);
        for (const category of categories) {
          try {
            const catSettings = await graphGetAll(token, `${baseUrl}/intents('${policyId}')/categories('${category.id}')/settings`);
            for (const setting of catSettings) {
              const defId = setting.definitionId || setting.id || "";
              const displayName = setting.displayName || defId.replace(/^.*_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c: string) => c.toUpperCase());
              let value = "Configured";
              if (setting.value !== undefined && setting.value !== null) {
                value = String(setting.value);
              } else if (setting.valueJson) {
                try {
                  const parsed = JSON.parse(setting.valueJson);
                  value = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
                } catch { value = setting.valueJson; }
              }
              allIntentSettings.push({
                _settingFriendlyName: displayName,
                _settingFriendlyValue: value,
                settingInstance: { settingDefinitionId: defId },
                _category: category.displayName || category.id,
              });
            }
          } catch (catErr: any) {
            console.warn(`Failed to fetch settings for intent category ${category.id}:`, catErr?.message);
          }
        }
      } catch (intentErr: any) {
        console.warn(`Failed to fetch intent categories for ${policyId}:`, intentErr?.message);
      }
      if (allIntentSettings.length === 0) {
        try {
          const directSettings = await graphGetAll(token, `${baseUrl}/intents('${policyId}')/settings`);
          for (const setting of directSettings) {
            const defId = setting.definitionId || setting.id || "";
            const displayName = setting.displayName || defId.replace(/^.*_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c: string) => c.toUpperCase());
            let value = "Configured";
            if (setting.value !== undefined && setting.value !== null) {
              value = String(setting.value);
            } else if (setting.valueJson) {
              try {
                const parsed = JSON.parse(setting.valueJson);
                value = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
              } catch { value = setting.valueJson; }
            }
            allIntentSettings.push({
              _settingFriendlyName: displayName,
              _settingFriendlyValue: value,
              settingInstance: { settingDefinitionId: defId },
            });
          }
        } catch (directErr: any) {
          console.warn(`Failed to fetch direct intent settings for ${policyId}:`, directErr?.message);
        }
      }
      details.settings = allIntentSettings;
      details.settingsCount = allIntentSettings.length;
      console.log(`  Fetched ${allIntentSettings.length} settings from Endpoint Security intent for "${policy.name}"`);
    } else if (source === "deviceConfigurations" || source === "deviceCompliancePolicies") {
      const skipKeys = new Set(["id", "displayName", "description", "createdDateTime", "lastModifiedDateTime", "version", "roleScopeTagIds", "@odata.type", "_source", "_policyMeta", "assignments", "settings", "settingsCount", "isAssigned", "supportsScopeTags", "deviceManagementApplicabilityRuleOsEdition", "deviceManagementApplicabilityRuleOsVersion", "deviceManagementApplicabilityRuleDeviceMode", "omaSettings"]);
      const extractedSettings: any[] = [];

      // Always re-fetch the individual policy to get the full property set.
      // The list endpoint often returns only basic properties, especially for
      // Android/iOS configuration profiles which need the individual fetch.
      let omaSettings = details.omaSettings;
      if (source === "deviceConfigurations") {
        try {
          const fullPolicy = await graphGet(token, `${baseUrl}/deviceConfigurations('${policyId}')`);
          omaSettings = fullPolicy.omaSettings || omaSettings;
          // Merge full policy properties into details so flattenSettings has complete data
          for (const [key, value] of Object.entries(fullPolicy)) {
            if (key === "omaSettings" || key === "assignments") continue;
            if (value !== null && value !== undefined) {
              details[key] = value;
            }
          }
          console.log(`  Re-fetched full policy for "${policy.name}" (${details["@odata.type"] || "unknown type"})`);
        } catch (fetchErr: any) {
          console.warn(`  Failed to re-fetch individual policy for "${policy.name}": ${fetchErr?.message}`);
        }
      }

      if (omaSettings && Array.isArray(omaSettings) && omaSettings.length > 0) {
        for (const oma of omaSettings) {
          const omaName = oma.displayName || oma["@odata.type"] || "OMA-URI Setting";
          const omaUri = oma.omaUri || "";
          let omaValue = "Configured";
          if (oma.value !== undefined && oma.value !== null) {
            omaValue = String(oma.value);
          } else if (oma.fileName) {
            omaValue = `File: ${oma.fileName}`;
          }
          const omaType = oma["@odata.type"] || "";
          let dataType = "String";
          if (omaType.includes("Integer")) dataType = "Integer";
          else if (omaType.includes("Boolean")) dataType = "Boolean";
          else if (omaType.includes("Base64")) dataType = "Base64";
          else if (omaType.includes("Xml")) dataType = "XML";
          else if (omaType.includes("DateTime")) dataType = "DateTime";
          else if (omaType.includes("FloatingPoint")) dataType = "Float";

          const displayValue = omaValue.length > 200 ? omaValue.substring(0, 200) + "..." : omaValue;
          extractedSettings.push({
            _settingFriendlyName: `${omaName} (${dataType})`,
            _settingFriendlyValue: displayValue,
            _rawValue: omaValue,
            _omaUri: omaUri,
            settingInstance: { settingDefinitionId: `omaUri:${omaUri}` },
          });
        }
      } else {
        const flattenSettings = (obj: any, prefix: string, depth: number = 0): void => {
          if (depth > 5) return;
          for (const [key, value] of Object.entries(obj)) {
            if (skipKeys.has(key) || key.startsWith("@") || key.startsWith("_")) continue;
            if (value === null || value === undefined) continue;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (Array.isArray(value)) {
              if (value.length > 0 && typeof value[0] === "object") {
                value.forEach((item: any, idx: number) => {
                  if (typeof item === "object" && item !== null) {
                    flattenSettings(item, `${fullKey}[${idx}]`, depth + 1);
                  }
                });
              } else {
                const friendlyName = toPascalCaseSettingName(fullKey);
                extractedSettings.push({
                  _settingFriendlyName: friendlyName,
                  _settingFriendlyValue: value.join(", "),
                  settingInstance: { settingDefinitionId: `${source}/${fullKey}` },
                });
              }
            } else if (typeof value === "object") {
              flattenSettings(value, fullKey, depth + 1);
            } else {
              const friendlyName = toPascalCaseSettingName(fullKey);
              extractedSettings.push({
                _settingFriendlyName: friendlyName,
                _settingFriendlyValue: String(value),
                settingInstance: { settingDefinitionId: `${source}/${fullKey}` },
              });
            }
          }
        };

        flattenSettings(details, "", 0);
      }
      details.settings = extractedSettings;
      details.settingsCount = extractedSettings.length;
      console.log(`  Extracted ${extractedSettings.length} settings from ${source} for "${policy.name}"`);
    }
  } catch (settingsErr: any) {
    console.error(`Failed to fetch settings for policy "${policy.name}" (${policyId}):`, settingsErr?.message);
  }

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
  } catch (assignErr: any) {
    console.error(`Failed to fetch assignments for policy "${policy.name}" (${policyId}):`, assignErr?.message);
  }

  return details;
}

export async function fetchSettingDefinitionDisplayName(token: string, definitionId: string): Promise<{ displayName: string; description: string }> {
  try {
    const encoded = encodeURIComponent(definitionId);
    const data = await graphGet(token, `https://graph.microsoft.com/beta/deviceManagement/configurationSettings('${encoded}')?$select=displayName,description`);
    return {
      displayName: data.displayName || definitionId,
      description: data.description || "",
    };
  } catch {
    return {
      displayName: definitionId,
      description: "",
    };
  }
}

export async function fetchChoiceOptionDisplayName(token: string, definitionId: string, choiceValue: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(definitionId);
    const data = await graphGet(token, `https://graph.microsoft.com/beta/deviceManagement/configurationSettings('${encoded}')`);
    if (data.options) {
      const option = data.options.find((o: any) => o.itemId === choiceValue);
      if (option?.displayName) return option.displayName;
    }
    return choiceValue;
  } catch {
    return choiceValue;
  }
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
    const data = await graphGet(token, `https://graph.microsoft.com/v1.0/groups/${groupId}?$select=displayName,membershipRule,groupTypes`);
    let memberCount = 0;
    try {
      const countHeaders = { ConsistencyLevel: "eventual" };
      const count = await graphGet(token, `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$count`, countHeaders);
      memberCount = typeof count === "number" ? count : 0;
    } catch {
      memberCount = 0;
    }
    return {
      id: groupId,
      name: data.displayName || groupId,
      type: data.groupTypes?.includes("DynamicMembership") ? "Dynamic Group" : "Entra ID Group",
      memberCount,
    };
  } catch {
    return {
      id: groupId,
      name: groupId,
      type: "Entra ID Group",
      memberCount: 0,
    };
  }
}

export async function fetchGroupMembers(token: string, groupId: string): Promise<any[]> {
  try {
    const members = await graphGet(token, `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=displayName,userPrincipalName,id,deviceId,operatingSystem&$top=100`);
    return (members.value || []).map((m: any) => ({
      id: m.id,
      displayName: m.displayName || "Unknown",
      type: m["@odata.type"]?.includes("device") ? "device" : "user",
      upn: m.userPrincipalName || null,
      os: m.operatingSystem || null,
    }));
  } catch {
    return [];
  }
}
