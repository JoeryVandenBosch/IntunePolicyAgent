/**
 * Shared utility for generating correct Intune admin center deep links.
 * Consolidated into one function to avoid frontend/backend URL drift.
 *
 * URL patterns (as of Feb 2026):
 * 1. PolicySummaryBlade       → Settings Catalog, Endpoint Security (intents)
 * 2. PolicySummaryReportBlade → deviceConfigurations, deviceCompliancePolicies
 * 3. PolicyInstanceMenuBlade  → App Protection policies
 * 4. InventoryPolicySummary   → Properties Catalog / Device Inventory
 */

const BASE = "https://intune.microsoft.com";

/**
 * Map of OData type substrings → policyType number for PolicySummaryReportBlade.
 * These are internal Intune IDs used in the URL hash.
 */
const ODATA_TO_POLICY_TYPE: Record<string, number> = {
  // Windows
  "windows10customconfiguration": 74,
  "windows10generalconfiguration": 79,
  "windows10endpointprotectionconfiguration": 77,
  "windowsidentityprotectionconfiguration": 78,
  "windowsgrouppolicyconfiguration": 71,
  "windows10teamgeneralconfiguration": 79,
  "sharedpcconfiguration": 79,
  "windowsdefenderadvancedthreatprotectionconfiguration": 77,
  "windows10vpnconfiguration": 74,
  "windowswificonfiguration": 74,
  "windowswifienterpriseeapconfiguration": 74,
  "windows10importedpfxcertificateprofile": 74,
  "windows10paborifxcertificateprofile": 74,
  "windows10trustedcertificateprofile": 74,
  "windowscertificateprofilebase": 74,
  "windowsupdateforbusinessconfiguration": 74,
  "editionupgradeconfiguration": 74,
  "windowshealthmonitoringconfiguration": 74,
  "windowskioskconfiguration": 74,
  "windowsdomainjoinconfiguration": 74,
  "windowsdeliveryoptimizationconfiguration": 74,
  "windowsphone81customconfiguration": 74,
  // iOS/iPadOS
  "iosgeneraldeviceconfiguration": 54,
  "ioscustomconfiguration": 54,
  "iosdevicefeaturesconfiguration": 54,
  "iosvpnconfiguration": 54,
  "ioswificonfiguration": 54,
  "iosenterprisewificonfiguration": 54,
  "ioscertificateprofile": 54,
  "iostrustedcertificateprofile": 54,
  "iosscepCertificateProfile": 54,
  "iospkcscertificateprofile": 54,
  "iosupdateconfiguration": 54,
  "ioseaboriserialdeviceconfiguration": 54,
  "ioseduhiconfiguration": 54,
  // Android
  "androidgeneraldeviceconfiguration": 13,
  "androidcustomconfiguration": 13,
  "androiddeviceownergeneraldeviceconfiguration": 13,
  "androidworkprofilegeneraldeviceconfiguration": 13,
  "androiddeviceownerenterprisewideconfiguration": 13,
  "androidworkprofilecustomconfiguration": 13,
  "androiddeviceownercertificateprofile": 13,
  "androidworkprofilevpnconfiguration": 13,
  "androidworkprofilewificonfiguration": 13,
  "androiddeviceownervpnconfiguration": 13,
  "androiddeviceownerwificonfiguration": 13,
  "androiddeviceownertrustedcertificateprofile": 13,
  "androidforworkcustomconfiguration": 13,
  "androidforworkgeneraldeviceconfiguration": 13,
  "androidforworkvpnconfiguration": 13,
  "androidforworkwificonfiguration": 13,
  // macOS
  "macosgeneraldeviceconfiguration": 5,
  "macoscustomconfiguration": 5,
  "macosdevicefeaturesconfiguration": 5,
  "macosvpnconfiguration": 5,
  "macoswificonfiguration": 5,
  "macosenterprisewificonfiguration": 5,
  "macossoftwareupdateconfiguration": 5,
  "macoscertificateprofile": 5,
  "macosendpointprotectionconfiguration": 5,
  "macosextensionsconfiguration": 5,
  "macoscustomappconfiguration": 5,
};

/**
 * Platform-based fallback policyType when OData type is not in the map.
 */
const PLATFORM_FALLBACK_POLICY_TYPE: Record<string, number> = {
  "Windows": 74,
  "iOS/iPadOS": 54,
  "iOS": 54,
  "Android Enterprise": 13,
  "Android": 13,
  "macOS": 5,
  "Linux": 74,
};

/**
 * Map platform names to the Intune URL platformName parameter.
 */
const PLATFORM_URL_NAME: Record<string, string> = {
  "Windows": "windows10",
  "iOS/iPadOS": "iOS",
  "iOS": "iOS",
  "Android Enterprise": "android",
  "Android": "android",
  "macOS": "macOS",
  "Linux": "linux",
};

/**
 * Map of compliance policy OData types → policyType number.
 */
const COMPLIANCE_ODATA_TO_POLICY_TYPE: Record<string, number> = {
  "windows10compliancepolicy": 6,
  "ioscompliancepolicy": 31,
  "androidcompliancepolicy": 10,
  "androiddeviceownercompliancepolicy": 10,
  "androidworkprofilecompliancepolicy": 10,
  "macoscompliancepolicy": 9,
  "defaultdevicecompliancepolicy": 6,
};

const COMPLIANCE_PLATFORM_FALLBACK: Record<string, number> = {
  "Windows": 6,
  "iOS/iPadOS": 31,
  "iOS": 31,
  "Android Enterprise": 10,
  "Android": 10,
  "macOS": 9,
};

export interface IntuneUrlParams {
  id: string;
  name: string;
  source: string;          // "configurationPolicies" | "deviceConfigurations" | "deviceCompliancePolicies" | "intents" | ...
  platform: string;        // "Windows" | "iOS/iPadOS" | "Android Enterprise" | "macOS" | ...
  odataType?: string;      // e.g. "#microsoft.graph.windows10GeneralConfiguration"
  templateId?: string;     // For intents (endpoint security) - the template GUID
}

/**
 * Generate the correct Intune admin center URL for any policy type.
 */
export function getIntunePortalUrl(params: IntuneUrlParams): string {
  const { id, name, source, platform, odataType, templateId } = params;
  const encodedName = encodeURIComponent(name || "");
  const platformUrlName = PLATFORM_URL_NAME[platform] || "windows10";

  // 1. Settings Catalog → PolicySummaryBlade (no template)
  if (source === "configurationPolicies") {
    return `${BASE}/#view/Microsoft_Intune_Workflows/PolicySummaryBlade/policyId/${id}/isAssigned~/true/technology/mdm/templateId//platformName/${platformUrlName}`;
  }

  // 2. Endpoint Security / Intents → PolicySummaryBlade (with template)
  if (source === "intents") {
    const tplId = templateId || "";
    const tplSuffix = tplId ? `${tplId}_1` : "";
    return `${BASE}/#view/Microsoft_Intune_Workflows/PolicySummaryBlade/policyId/${id}/isAssigned~/true/technology/mdm/templateId/${tplSuffix}/platformName/${platformUrlName}`;
  }

  // 3. Device Configurations → PolicySummaryReportBlade with correct policyType
  if (source === "deviceConfigurations") {
    const cleanOdataType = (odataType || "")
      .replace("#microsoft.graph.", "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    
    let policyType = PLATFORM_FALLBACK_POLICY_TYPE[platform] || 74;
    for (const [key, value] of Object.entries(ODATA_TO_POLICY_TYPE)) {
      if (cleanOdataType.includes(key) || key.includes(cleanOdataType)) {
        policyType = value;
        break;
      }
    }

    return `${BASE}/#view/Microsoft_Intune_DeviceSettings/PolicySummaryReportBlade/policyId/${id}/policyName/${encodedName}/policyJourneyState~/0/policyType~/${policyType}/isAssigned~/true`;
  }

  // 4. Compliance Policies → PolicySummaryReportBlade with compliance policyType
  if (source === "deviceCompliancePolicies") {
    const cleanOdataType = (odataType || "")
      .replace("#microsoft.graph.", "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    
    let policyType = COMPLIANCE_PLATFORM_FALLBACK[platform] || 6;
    for (const [key, value] of Object.entries(COMPLIANCE_ODATA_TO_POLICY_TYPE)) {
      if (cleanOdataType.includes(key) || key.includes(cleanOdataType)) {
        policyType = value;
        break;
      }
    }

    return `${BASE}/#view/Microsoft_Intune_DeviceSettings/PolicySummaryReportBlade/policyId/${id}/policyName/${encodedName}/policyJourneyState~/0/policyType~/${policyType}/isAssigned~/true`;
  }

  // 5. App Protection Policies → PolicyInstanceMenuBlade
  if (source === "managedAppPolicies" || source === "mdmWindowsInformationProtectionPolicies") {
    const cleanOdata = (odataType || "").toLowerCase();
    let prefix = "T_";
    if (cleanOdata.includes("windows")) prefix = "I_";
    const odataEncoded = encodeURIComponent(odataType || "#microsoft.graph.managedAppProtection");
    return `${BASE}/#view/Microsoft_Intune/PolicyInstanceMenuBlade/~/0/policyId/${prefix}${id}/policyOdataType/${odataEncoded}/policyName/${encodedName}`;
  }

  // 6. Fallback → generic configuration page
  return `${BASE}/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration`;
}
