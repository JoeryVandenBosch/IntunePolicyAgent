# 📋 Setup Guide — Intune Policy Intelligence Agent

Step-by-step instructions to deploy the agent to your Security Copilot tenant.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Security Copilot access** | You need Contributor or Owner role |
| **Intune plugin** | Must be enabled in Security Copilot (Sources → Manage plugins) |
| **Intune RBAC** | Users running the agent need appropriate Intune permissions |
| **SCU capacity** | Agent consumes SCUs like any Security Copilot feature |

---

## Step 1: Verify Your Environment

1. Go to [securitycopilot.microsoft.com](https://securitycopilot.microsoft.com)
2. Confirm you can sign in and have **Contributor** or **Owner** role
3. Go to **Sources** → **Manage plugins**
4. Verify the **Microsoft Intune** plugin is toggled **ON**
5. If it's not enabled, toggle it on — this is the plugin that powers all Intune skills

> **Tip:** If you can already use "Summarize with Copilot" on policies in the Intune admin center, your environment is ready.

---

## Step 2: Download the Agent Manifest

Download `agent-manifest.yaml` from this repository. This single YAML file contains the complete agent definition:

- Agent identity and metadata
- Orchestrator skill with comprehensive instructions
- 4 child skills (List, Analyze, Compliance Map, Report)
- Starter prompts and suggested follow-ups
- Required plugin references

---

## Step 3: Upload to Security Copilot

1. In Security Copilot, click the **hamburger menu** (☰) in the top-left
2. Navigate to **Build**
3. Select **Upload a YAML**
4. Choose the visibility scope:
   - **Just me** — Only you can see and use the agent (good for initial testing)
   - **Anyone in this workspace** — All workspace members can use it (for team deployment)
5. Click **Upload** and select your `agent-manifest.yaml` file

After upload, the agent builder will parse and display the components:

- **Details**: Name ("Policy Intelligence Agent"), description, publisher ("IntuneStuff")
- **Tools**: 4 child skills listed
- **Triggers**: Default trigger configured
- **PromptSkill**: Configured for interactive chat experience

6. Review the components — toggle **View code** to verify the YAML if needed
7. Click **Publish**
8. You should see an "Agent published" confirmation message

---

## Step 4: Find Your Agent

1. Navigate to **Agents** from the Security Copilot left menu
2. Your "Policy Intelligence Agent" should appear in the library
3. It will show:
   - **Custom** badge (since it's not a Microsoft-built agent)
   - **IntuneStuff** as publisher
   - The description you defined
4. Click **Set up** on the agent card to configure the instance
5. Verify the required plugins are enabled

---

## Step 5: First Test — Chat with Agent

1. On the agent card, click **Chat with agent**
2. You'll see **4 starter prompts**:

| Starter Prompt | What It Does |
|---------------|-------------|
| **Browse Policies** | Lists all Intune policies in your tenant |
| **Full Windows Policy Analysis** | Comprehensive multi-dimensional analysis |
| **Compliance & Assignments** | Focus on assignments and filters |
| **Conflict Detection** | Cross-policy conflict checking |

3. Start with **"Browse Policies"** — this verifies the agent can communicate with your Intune tenant
4. If that works, try **"Full Windows Policy Analysis"** — this is the comprehensive flow

---

## Step 6: Verify Execution

After each agent response, check the execution details:

1. Click the **Agent view** button (top-right of the response, or the expand arrow)
2. This shows:
   - Which skills were invoked
   - The execution order
   - How many steps were completed
   - Time taken
   - The raw output from each skill

This is your debugging view. If something isn't working right, the agent view tells you exactly where the chain broke.

---

## Step 7: Test Follow-Up Prompts

After the initial analysis, the agent suggests follow-up prompts like:

- "Now show me the end-user impact for these policies"
- "What is the security impact of these policies?"
- "Show me all assignments and filters"
- "Check these policies for conflicts"
- "Which compliance frameworks do these policies satisfy?"
- "Generate a full report for these policies"

Test several of these to verify the agent maintains context across the conversation.

---

## Troubleshooting

### Agent doesn't appear in the library

- Verify you completed the publish step
- Check that you selected the right scope (workspace vs. just me)
- Refresh the Agents page

### Skills not being invoked

- Go to **Sources** → **Manage plugins** and verify Microsoft Intune is ON
- Check the Agent view for error messages
- The `RequiredSkillsets` in the YAML must match the actual plugin names. If `Microsoft.Intune` doesn't resolve, search in the tool catalog to find the exact name

### Agent returns generic responses

- The orchestrator may be answering from general knowledge instead of invoking Intune skills
- Check the Agent view to confirm skill invocations
- Try being more specific in your prompt: include policy names or IDs
- Refine the Instructions section if needed

### "Tool not enabled" errors

- Some follow-up prompt suggestions may reference skills that aren't enabled
- Go to Sources → Manage plugins and enable any missing plugins
- This is a known limitation noted in the Microsoft docs

### Permission errors

- The agent respects your Intune RBAC permissions
- If you can't see certain policies, your Intune role or scope tags may be limiting access
- Verify with the same query in the Intune admin center

---

## Step 8: Share with Your Team

Once you're satisfied with the agent's output:

1. If you published to workspace, other Security Copilot users can find it under **Agents**
2. They click **Set up** to configure their instance
3. Then **Chat with agent** to start using it
4. Each user needs:
   - Security Copilot access (at least Analyst role to run agents)
   - Appropriate Intune RBAC permissions

---

## Updating the Agent

To update the agent after making changes to the YAML:

1. Go to **Build** → **My agents**
2. Find your agent
3. Click to edit
4. Either:
   - Edit directly in the form/code editor
   - Re-upload an updated YAML file
5. Click **Publish** to deploy the changes

Changes take effect immediately for all users.

---

## Next Steps

- [Customize the agent →](CUSTOMIZATION.md)
- [Publish to Security Store →](PUBLISHING.md)
- [Architecture details →](ARCHITECTURE.md)
