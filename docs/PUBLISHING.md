# 🏪 Publishing to Microsoft Security Store

Guide for publishing the Policy Intelligence Agent to the Microsoft Security Store, making it available to all Security Copilot customers.

---

## Overview

The Microsoft Security Store is the marketplace where partners can publish Security Copilot agents. Once published and certified, your agent can appear:

- In the **Security Store** within Security Copilot (standalone)
- On the **Agents page** in the Intune admin center (embedded, after validation)
- Alongside Microsoft-built agents like Change Review Agent and Policy Configuration Agent

---

## Prerequisites

| Requirement | How to Get It |
|-------------|---------------|
| **Partner Center account** | [Create at partner.microsoft.com](https://partner.microsoft.com) |
| **MAICPP enrollment** | Microsoft AI Cloud Partner Program — enroll via Partner Center |
| **MPN ID** | Assigned when you enroll in MAICPP |
| **Tested agent** | Must be fully tested in your own tenant first |

---

## Step 1: Prepare Your Agent Package

Create a `.zip` file with the following structure:

```
IntunePolicyIntelligenceAgent.zip
├── agent-manifest.yaml
└── metadata.json (optional)
```

If using metadata.json:

```json
{
  "version": "1.0.0",
  "publisher": "IntuneStuff",
  "product": "Microsoft Intune",
  "description": "Comprehensive Intune policy analysis agent"
}
```

**Important for Mac users:** Avoid hidden system files in the zip. Use:
```bash
zip -r IntunePolicyIntelligenceAgent.zip . -x ".*" -x "__MACOSX"
```

---

## Step 2: Create a SaaS Offer in Partner Center

1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard)
2. Navigate to **Commercial Marketplace** → **Overview** → **New offer**
3. Select **Software as a Service (SaaS)** as the offer type
4. Fill in the basic offer details:
   - **Offer alias**: Intune Policy Intelligence Agent
   - **Offer ID**: intune-policy-intelligence-agent

---

## Step 3: Configure Offer Setup

1. In **Offer Setup**, check the box: **"This solution integrates with Microsoft Security services"**
2. This reveals the **Microsoft Security services** menu item on the left
3. Click **Microsoft Security services**
4. Select **Security Copilot agent** as the deployable solution type
5. Under **Integrated Microsoft Security Products**, select **Microsoft Intune**

This is what ensures your agent appears filtered under Intune in the Security Store and is eligible for the Intune admin center Agents page.

---

## Step 4: Configure the Listing

### Offer Listing Details

| Field | Value |
|-------|-------|
| **Agent name** | Policy Intelligence Agent |
| **Search results summary** | Comprehensive Intune policy analysis with multi-policy summarization, impact assessment, conflict detection, and compliance mapping. |
| **Publisher** | IntuneStuff |

**Note:** Agent names must be under 30 characters to avoid truncation. "Policy Intelligence Agent" = 27 characters ✓

### Description

Include these sections (comma-separated as per Microsoft guidelines):

**Agent tasks:**
Summarize Intune policies, Assess end-user impact, Evaluate security posture, Report assignments and filters, Detect cross-policy conflicts, Map compliance frameworks, Generate exportable reports, Provide optimization recommendations

**Input:**
Policy names or IDs, Policy type filter, Platform filter, Analysis dimensions, Report format preference

**Output:**
Policy summaries with configured settings, End-user impact assessment with severity ratings, Security impact analysis with compliance framework mapping, Complete assignment tables with filters, Conflict and overlap detection results, Actionable recommendations, Formatted reports (Executive/Technical/Audit)

### Links

- Add a link to your marketing/product page on **intunestuff.com**
- This page should link back to the Security Store listing
- Include installation instructions and documentation links

### Screenshots

Include screenshots showing:
1. The agent starter prompts screen
2. A multi-policy analysis result
3. The assignments and filters view
4. The compliance framework mapping output
5. A generated report

---

## Step 5: Configure Pricing

**For a free agent:**
- Select contract pricing (subscription)
- Set price to **$0 USD**
- This is required — even free agents need a price set

**For a paid agent:**
- Choose per-user or flat-rate pricing
- Set monthly or annual billing
- Define minimum and maximum user limits if needed
- Microsoft manages billing and provisioning

---

## Step 6: Upload the Agent Package

1. Go to the **Technical configuration** section
2. Upload your `.zip` package containing the agent manifest
3. Verify the upload was successful

---

## Step 7: Submit for Certification

Before submitting, verify your agent meets all certification requirements:

### Certification Checklist

- [ ] **Multi-step planning** — Agent generates a multi-step plan using orchestrator + child skills (not a single-prompt LLM wrapper — wrappers are rejected)
- [ ] **Successful deployment** — Agent deploys, sets up, and runs without errors
- [ ] **Platform capabilities** — Uses Security Copilot agent platform appropriately
- [ ] **Responsible AI** — Complies with Microsoft RAI standards, no instructions that deviate from stated purpose
- [ ] **Agent name** — Under 30 characters
- [ ] **Marketing page** — Product page on intunestuff.com with link back to Security Store
- [ ] **Description accuracy** — Agent workflow in listing matches actual behavior
- [ ] **Product integration** — Correctly integrated with Microsoft Intune

### Submit

1. Go to **Review and publish** in Partner Center
2. Add any **Notes for certification** (e.g., test environment details if needed)
3. Click **Publish**
4. Microsoft will review the submission (automated + manual review)

---

## Step 8: Post-Publication

Once certified and published:

1. The agent appears in the **Microsoft Security Store**
2. Customers can find it by filtering on **Microsoft Intune**
3. When an Intune admin installs it, it appears on their **Agents** page
4. The admin clicks **Set up** to configure it for their workspace
5. Team members can then **Chat with agent**

### Appearing in the Intune Admin Center

For the agent to appear on the Agents page alongside Microsoft-built agents:

1. Must be published to Security Store ✓
2. Must have selected Microsoft Intune as integrated product ✓
3. Must pass Microsoft's additional validation for portal embedding
4. Customer admin must install and set up the agent

---

## Updating Your Published Agent

1. Go to Partner Center → your offer
2. Upload an updated `.zip` package with the new YAML
3. Increment the version number (semantic versioning: X.Y.Z)
4. Submit for re-certification
5. Agents are automatically updated to the latest version for all customers

---

## Resources

- [Security Store documentation](https://learn.microsoft.com/en-us/security/store/plan-your-publication-for-security-store)
- [Publishing agents process](https://learn.microsoft.com/en-us/security/store/publish-a-security-copilot-agent-or-analytics-solution-in-security-store)
- [Certification requirements](https://learn.microsoft.com/en-us/security/store/security-store-certification)
- [Agent development overview](https://learn.microsoft.com/en-us/copilot/security/developer/custom-agent-overview)
- [Partner Center](https://partner.microsoft.com/dashboard)
