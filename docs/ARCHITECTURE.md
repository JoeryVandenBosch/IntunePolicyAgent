# 🏗️ Architecture

Technical architecture and design decisions for the Policy Intelligence Agent.

---

## Design Philosophy

**Leverage, don't rebuild.** The agent is built entirely on top of existing Security Copilot capabilities. It adds orchestration and intelligence without requiring a custom backend, API endpoints, or separate infrastructure.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Copilot Platform                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           Policy Intelligence Agent                        │  │
│  │           (agent-manifest.yaml)                            │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │         PolicyIntelligenceOrchestrator              │  │  │
│  │  │         (Format: Agent)                              │  │  │
│  │  │                                                     │  │  │
│  │  │  • Interfaces: InteractiveAgent                     │  │  │
│  │  │  • Input: UserRequest                               │  │  │
│  │  │  • Instructions: Multi-step analysis workflow        │  │  │
│  │  │  • Orchestrator: DefaultAgentOrchestrator           │  │  │
│  │  └────────────────────┬────────────────────────────────┘  │  │
│  │                       │                                    │  │
│  │         ┌─────────────┼─────────────────────┐              │  │
│  │         ▼             ▼             ▼       ▼              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ List     │  │ Analyze  │  │ Compli-  │  │ Generate │  │  │
│  │  │ Policies │  │ Batch    │  │ ance Map │  │ Report   │  │  │
│  │  │ (GPT)    │  │ (GPT)    │  │ (GPT)    │  │ (GPT)    │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │              Microsoft.Intune Plugin                       │  │
│  │              (Built-in, managed by Microsoft)              │  │
│  │                                                           │  │
│  │  Skills available:                                        │  │
│  │  • Describe Intune policy                                 │  │
│  │    - ConflictAnalysisRequired: true/false                 │  │
│  │    - RiskAssessRequired: true/false                       │  │
│  │  • Get device configuration policies                      │  │
│  │  • Get compliance policies                                │  │
│  │  • Get endpoint security policies                         │  │
│  │  • Get policy assignments                                 │  │
│  │  • Compare device configurations                          │  │
│  │  • Get device configuration error details                 │  │
│  │  • Check if policies contain specific settings            │  │
│  │  • Explore Intune data (natural language queries)          │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                      │
│                    Microsoft Graph API                           │
│                    (Tenant-specific data)                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Orchestrator Skill (Format: Agent)

The orchestrator is the brain of the agent. It:

1. **Receives** the user's natural language request
2. **Plans** which skills to invoke and in what order
3. **Executes** the plan by calling child skills and built-in Intune skills
4. **Synthesizes** results into a coherent, multi-dimensional response
5. **Suggests** follow-up prompts for continued analysis

The orchestrator uses `DefaultAgentOrchestrator`, which is Security Copilot's built-in orchestration engine. It uses the **Instructions** to guide its reasoning and planning.

### Child Skills (Format: GPT)

GPT-format skills are prompt templates. They don't execute code — they provide structured guidance for the LLM to follow when performing specific sub-tasks.

| Skill | Purpose | When Invoked |
|-------|---------|-------------|
| `ListIntunePolicies` | Formats policy lists with filters | User asks to browse or list policies |
| `AnalyzePolicyBatch` | Structures multi-policy analysis output | User selects policies for analysis |
| `GenerateComplianceMapping` | Maps settings to framework controls | User asks about compliance |
| `GenerateReport` | Formats results into report format | User asks for a report |

### Built-in Microsoft.Intune Plugin

This is the key component. The agent calls the same skills that power the embedded Copilot experience in Intune. The most important skill is:

**"Describe Intune policy"** with parameters:
- `Policy`: The policy ID (GUID)
- `ConflictAnalysisRequired`: `true` — enables conflict detection
- `RiskAssessRequired`: `true` — enables risk/impact assessment

This skill returns:
- All configured settings with values and defaults
- Assignment scope (groups, member counts, filters)
- Risk analysis (security risks, user productivity risks, device risks)
- Conflict analysis (related policies, overlap assessment)
- Summary and recommendations

---

## Data Flow

### Interactive Chat Flow

```
User types prompt
       │
       ▼
Orchestrator receives UserRequest
       │
       ▼
Plan step 1: Identify what the user wants
       │
       ├─ List policies? → Invoke Intune skills to query policies
       │                    → Format with ListIntunePolicies template
       │
       ├─ Analyze specific policies? → For each policy:
       │     → Invoke "Describe Intune policy" (Conflict=true, Risk=true)
       │     → Extract summary, impact, assignments, conflicts
       │     → Structure with AnalyzePolicyBatch template
       │     → Perform cross-policy analysis
       │
       ├─ Compliance mapping? → Use analysis results
       │     → Apply GenerateComplianceMapping template
       │     → Map settings to framework controls
       │
       └─ Generate report? → Compile all results
             → Apply GenerateReport template
             → Format for target audience
       │
       ▼
Response displayed to user
       │
       ▼
Suggested follow-up prompts generated
```

### Trigger-Based Flow (Automated)

```
Timer fires (DefaultPollPeriodSeconds)
       │
       ▼
FetchSkill runs → Retrieves policy list
       │
       ▼
ProcessSkill runs → Analyzes policies
       │
       ▼
Results stored in agent session
```

---

## Security Model

### Authentication & Authorization

- The agent runs within Security Copilot's security context
- It inherits the **signed-in user's permissions**
- Intune RBAC roles and scope tags are enforced
- The agent cannot access policies the user doesn't have permission to see

### Data Handling

- All data stays within the Security Copilot platform
- No data is sent to external services
- Policy details are processed by the LLM within Microsoft's security boundary
- Session data follows Security Copilot's data retention policies

---

## SCU Consumption Model

Security Copilot charges SCUs for each skill invocation and LLM reasoning step.

### Consumption Breakdown

| Operation | Approximate SCUs | Notes |
|-----------|-----------------|-------|
| Orchestrator reasoning | ~0.5 per step | Planning and synthesis |
| Describe Intune policy | ~2-3 per policy | With both flags enabled |
| GPT skill invocation | ~0.5-1 per call | Template processing |
| Natural language query | ~1 per query | Explore Intune data |

### Optimization Tips

1. **Be specific** — "Analyze policy V5.1-IMS-BP-U-Windows Defender" costs less than "Analyze all Windows policies"
2. **Batch wisely** — Analyzing 5 policies in one request is more efficient than 5 separate requests (shared orchestration overhead)
3. **Use filters** — Filter by type or platform to reduce the scope
4. **Cache mentally** — If you've already analyzed policies in a session, ask follow-up questions instead of re-analyzing

---

## Comparison with Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **This Agent** | No backend needed, leverages existing Intune skills, interactive chat, publishable to Store | Consumes SCUs, depends on Security Copilot platform |
| **Custom Web App** (companion-webapp.jsx) | No SCU cost, custom UI, independent of Security Copilot | Needs backend (Azure Functions), Graph API auth, separate LLM costs |
| **Promptbook** | Simpler, reusable prompt sequence | No interactivity, no branching logic, no multi-step reasoning |
| **Logic Apps + Copilot Connector** | Scheduled automation, email/Teams integration | Less interactive, harder to iterate on prompts |

The agent approach is ideal for interactive analysis. The web app approach is ideal for customers without Security Copilot. Both can coexist as complementary offerings.
