# 🛡️ Intune Policy Intelligence Agent

> A Microsoft Security Copilot agent for comprehensive Intune policy analysis — summarization, end-user impact, security posture, assignments & filters, conflict detection, and compliance framework mapping.

**Publisher:** IntuneStuff — Joery Van den Bosch  
**Product:** Microsoft Intune  
**Type:** Interactive Security Copilot Agent (Chat with Agent)  
**Website:** [intunestuff.com](https://intunestuff.com)

---

## 🎯 What This Agent Does

The Policy Intelligence Agent performs **autonomous, multi-dimensional analysis** of your Intune policies by chaining the built-in Intune skills already present in Security Copilot. No separate backend or API keys required.

| Dimension | Description |
|-----------|-------------|
| 📋 **Policy Summary** | Full breakdown of configured settings, values vs. defaults, and policy purpose |
| 👤 **End-User Impact** | How the policy affects daily user experience, restrictions, and friction points |
| 🛡️ **Security Impact** | Security controls enforced, threat vectors mitigated, risk assessment |
| 📌 **Assignments & Filters** | All included/excluded groups, member counts, and assignment filters with modes |
| ⚠️ **Conflict Detection** | Cross-policy conflicts, overlapping settings, redundant configurations |
| 📊 **Compliance Mapping** | Maps settings to NIST, CIS, ISO 27001, HIPAA, SOC 2, PCI DSS controls |
| 💡 **Recommendations** | Actionable suggestions for optimization, consolidation, and hardening |

### How It Differs from the Embedded Experience

The embedded Copilot experience in Intune works on **one policy at a time**. This agent:

- Analyzes **multiple policies in a single session**
- Performs **cross-policy conflict and overlap analysis**
- Generates **comprehensive reports** for management, auditors, or security teams
- Adds **compliance framework mapping** the embedded experience doesn't provide
- Provides **optimization recommendations** across your entire policy set
- Runs as an **interactive chat** with follow-up questions and drill-down capabilities

---

## 📁 Repository Structure

```
IntunePolicyAgent/
├── agent-manifest.yaml          # The Security Copilot agent definition (upload this)
├── companion-webapp.jsx         # React webapp prototype (future development)
├── README.md                    # This file
├── LICENSE
├── docs/
│   ├── SETUP.md                 # Step-by-step deployment guide
│   ├── PUBLISHING.md            # Security Store publishing guide
│   ├── CUSTOMIZATION.md         # How to extend and customize the agent
│   └── ARCHITECTURE.md          # Technical architecture details
└── .gitignore
```

---

## 🚀 Quick Start

### Prerequisites

- Security Copilot access with **Contributor** or **Owner** role
- **Microsoft Intune plugin** enabled in Security Copilot
- Intune RBAC permissions for the policies you want to analyze

### Deploy in 3 Steps

1. **Download** `agent-manifest.yaml` from this repo
2. In Security Copilot, go to **Build** → **Upload a YAML** → select the file
3. Click **Publish** → go to **Agents** → **Chat with agent**

👉 **[Full setup guide →](docs/SETUP.md)**

---

## 🏗️ Architecture

The agent leverages the **existing Microsoft.Intune plugin** built into Security Copilot — the same one powering the "Summarize with Copilot" embedded experience in the Intune admin center. No custom backend needed.

```
┌──────────────────────────────────────────────────────┐
│              Security Copilot Platform                │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │     Policy Intelligence Agent (this YAML)      │  │
│  │                                                │  │
│  │  Orchestrator ──→ Child Skills (GPT)           │  │
│  │      │              • ListIntunePolicies        │  │
│  │      │              • AnalyzePolicyBatch         │  │
│  │      │              • ComplianceMapping          │  │
│  │      │              • ReportGenerator            │  │
│  │      │                                          │  │
│  └──────┼──────────────────────────────────────────┘  │
│         │                                            │
│  ┌──────▼──────────────────────────────────────────┐  │
│  │      Built-in Microsoft.Intune Plugin           │  │
│  │      • Describe Intune policy                   │  │
│  │      • Get policies, assignments, filters       │  │
│  │      • Conflict analysis                        │  │
│  └──────┬──────────────────────────────────────────┘  │
│         │                                            │
│    Microsoft Graph API (your tenant data)             │
└──────────────────────────────────────────────────────┘
```

👉 **[Full architecture details →](docs/ARCHITECTURE.md)**

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP.md) | Step-by-step deployment to your tenant |
| [Publishing Guide](docs/PUBLISHING.md) | How to publish to Microsoft Security Store |
| [Customization Guide](docs/CUSTOMIZATION.md) | Extend the agent with your own skills |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture and design decisions |

---

## 💡 Companion Web App (Future)

The `companion-webapp.jsx` file contains a React prototype for a standalone web application version of this agent. Unlike the Security Copilot agent, the webapp would use **Graph API + your own LLM** (no SCU consumption), making it accessible to organizations without Security Copilot licensing.

**Status:** Prototype / Future development

---

## ⚡ SCU Consumption

The agent is optimized to minimize SCU usage by only enabling analysis flags when needed.

| Action | Est. SCUs | Notes |
|--------|-----------|-------|
| List policies | ~1 | Just queries, no per-policy analysis |
| Describe single policy (summary only) | ~1-2 | Both flags off |
| Describe single policy (with conflict + risk flags) | ~2-3 | Full analysis |
| Full analysis of 5 policies | ~10-15 | Flags only when requested |
| Full analysis of 10 policies | ~20-30 | Flags only when requested |
| Compliance mapping | ~1-2 | Reuses existing analysis data |
| Report generation | ~1-2 | Synthesizes already-fetched data |

**Optimization tips:**
- Ask for specific dimensions (e.g. "just show assignments") instead of full analysis
- The agent reuses data from earlier in the conversation — ask follow-up questions instead of re-analyzing
- Conflict and risk flags are only enabled when you specifically ask for them

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for additional analysis dimensions, compliance frameworks, or optimizations:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## 📬 Contact

- **Website:** [intunestuff.com](https://intunestuff.com)
- **GitHub:** [@JoeryVandenBosch](https://github.com/JoeryVandenBosch)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built by Joery Van den Bosch / IntuneStuff for the Microsoft Intune community*
