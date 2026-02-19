# 🔧 Customization Guide

How to extend and customize the Policy Intelligence Agent for your specific needs.

---

## Editing the Agent

### Quick Edits (No re-upload needed)

1. Go to **Build** → **My agents** in Security Copilot
2. Click on your agent to open the editor
3. Make changes in the form view or toggle **View code** for YAML editing
4. Click **Publish** to deploy changes immediately

### Full YAML Re-upload

1. Edit the `agent-manifest.yaml` file locally
2. Go to **Build** → **Upload a YAML**
3. Upload the updated file
4. Publish

---

## Modifying Instructions

The **Instructions** field in the orchestrator skill is the most powerful customization lever. It controls how the agent reasons, what it prioritizes, and how it formats output.

### Example: Add Your Company's Policy Naming Convention

Add to the Instructions section:

```
# Company-Specific Context
Our policy naming convention is: V{version}-{IMS/EMS}-BP-{platform}-{description}
Example: V5.1-IMS-BP-U-Windows Defender Account protection
When listing policies, group them by the version prefix and highlight any
policies that don't follow the naming convention.
```

### Example: Prioritize Specific Compliance Frameworks

```
# Compliance Priority
Our organization is primarily subject to ISO 27001 and NIS2 requirements.
When performing compliance mapping, always check these frameworks first
and flag any critical gaps as high-priority action items.
```

### Example: Custom Severity Definitions

```
# Severity Definitions
Use our organization's severity scale:
- P1 (Critical): Policy gap that could lead to data breach or compliance violation
- P2 (High): Security weakness that should be addressed within 1 sprint
- P3 (Medium): Optimization opportunity for next quarterly review
- P4 (Low): Nice-to-have improvement, no timeline required
```

---

## Adding New Child Skills

### Adding a GPT Skill

GPT skills are prompt templates that guide the agent. Add to the `SkillGroups` section:

```yaml
  - Format: GPT
    Skills:
      - Name: YourNewSkill
        DisplayName: Your New Skill Name
        Description: What this skill does
        Inputs:
          - Name: InputParameter
            Description: What this parameter expects
            Required: true
        Settings:
          Template: |
            <|im_start|>system
            You are an expert in [domain]. Given the input, perform [task].
            Format the output as [format].
            <|im_end|>
            <|im_start|>user
            {{InputParameter}}
            <|im_end|>
```

Then add the skill name to the orchestrator's `ChildSkills` list:

```yaml
ChildSkills:
  - ListIntunePolicies
  - AnalyzePolicyBatch
  - GenerateComplianceMapping
  - GenerateReport
  - YourNewSkill          # Add here
```

### Skill Ideas

| Skill Name | Purpose |
|-----------|---------|
| `BaselineComparison` | Compare policies against Microsoft Security Baselines |
| `ChangeImpactAnalysis` | Predict impact of proposed setting changes |
| `PolicyDocumentationGenerator` | Auto-generate runbook docs for each policy |
| `CostOptimization` | Analyze licensing implications of policy settings |
| `DeviceReadinessCheck` | Assess if target devices meet policy requirements |

---

## Integrating Your Existing Plugins

### Adding the Intune Policy Conflict Analyzer

If you have a custom plugin already deployed (like the Policy Conflict Analyzer), you can integrate it:

1. Add the plugin's skillset to `RequiredSkillsets`:

```yaml
RequiredSkillsets:
  - IntuneStuff.PolicyIntelligenceAgent
  - Microsoft.Intune
  - IntuneStuff.PolicyConflictAnalyzer    # Your existing plugin
```

2. Reference its skills in `ChildSkills`:

```yaml
ChildSkills:
  - ListIntunePolicies
  - AnalyzePolicyBatch
  - GenerateComplianceMapping
  - GenerateReport
  - DetectPolicyConflicts    # Skill from your plugin
```

3. Update the Instructions to reference the new capability:

```
When checking for conflicts, use the PolicyConflictAnalyzer skill for
deep conflict detection in addition to the built-in conflict analysis.
```

---

## Adding Starter Prompts

Starter prompts appear when the user first opens "Chat with agent". Add under `SuggestedPrompts` with `IsStarterAgent: true`:

```yaml
- Prompt: Analyze all endpoint security policies and check for conflicts
  Title: Endpoint Security Audit
  Personas:
    - 3    # ITAdmin
  IsStarterAgent: true
```

### Persona IDs

| ID | Persona |
|----|---------|
| 0 | CISO |
| 1 | SOC Analyst |
| 2 | Threat Intel Analyst |
| 3 | IT Admin |
| 4 | Identity Admin |
| 5 | Data Security Admin |
| 6 | Cloud Admin |

---

## Adding Follow-Up Prompt Suggestions

Follow-up prompts appear after a response. Add under `SuggestedPrompts` WITHOUT `IsStarterAgent`:

```yaml
- Prompt: Show me which of these policies have the broadest assignment scope
- Prompt: Which policies were modified in the last 30 days?
- Prompt: Generate an executive report of the analysis
```

These are used as templates — Security Copilot dynamically generates and ranks suggestions based on session context.

---

## Adding Triggered Automation

To run the agent on a schedule (e.g., weekly policy audit):

```yaml
Triggers:
  - Name: WeeklyPolicyAudit
    DefaultPollPeriodSeconds: 604800    # 7 days = 604800 seconds
    FetchSkill: IntuneStuff.PolicyIntelligenceAgent.ListIntunePolicies
    ProcessSkill: IntuneStuff.PolicyIntelligenceAgent.AnalyzePolicyBatch
```

The **FetchSkill** retrieves data, then the **ProcessSkill** analyzes it.

**Note:** Triggered automation consumes SCUs each time it runs. A weekly trigger analyzing 10 policies could consume ~30-40 SCUs per run.

---

## Connecting to Logic Apps

For sending reports via email or Teams, use the Security Copilot Logic Apps connector:

1. Create a Logic App in Azure
2. Add the **Security Copilot** connector
3. Use "Submit a Security Copilot prompt" action
4. Reference your agent in the prompt
5. Add a "Send email" or "Post to Teams" action with the result

Example Logic App flow:
```
Recurrence (weekly)
  → Security Copilot: "Run Policy Intelligence Agent - generate executive report for all Windows policies"
  → Parse response
  → Send email to security-team@company.com
```

---

## Changing the Agent Scope

### Tenant-wide (one instance for all)

```yaml
AgentSingleInstanceConstraint: Tenant
```

### Workspace-scoped (per workspace)

```yaml
AgentSingleInstanceConstraint: Workspace
```

### No restriction (multiple instances)

```yaml
AgentSingleInstanceConstraint: None
```
