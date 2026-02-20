# Setup Guide

This guide walks through every step needed to get the Intune Policy Intelligence Agent running, from creating the Azure AD app registration to starting the application.

---

## Table of Contents

1. [Azure AD App Registration](#1-azure-ad-app-registration)
2. [Configure API Permissions](#2-configure-api-permissions)
3. [Create Client Secret](#3-create-client-secret)
4. [Configure Redirect URI](#4-configure-redirect-uri)
5. [Set Up PostgreSQL Database](#5-set-up-postgresql-database)
6. [Configure Environment Variables](#6-configure-environment-variables)
7. [Install Dependencies](#7-install-dependencies)
8. [Start the Application](#8-start-the-application)
9. [Admin Consent](#9-admin-consent)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Azure AD App Registration

The application requires an Azure AD (Entra ID) app registration to authenticate users via OAuth2.

1. Go to the [Azure Portal](https://portal.azure.com).
2. Navigate to **Microsoft Entra ID** > **App registrations** > **New registration**.
3. Fill in the registration form:
   - **Name**: `Intune Policy Intelligence Agent` (or any name you prefer)
   - **Supported account types**: Select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**
   - **Redirect URI**: Leave blank for now (we will add it in step 4)
4. Click **Register**.
5. On the app's overview page, copy the **Application (client) ID**. You will need this as `AZURE_CLIENT_ID`.

> **Why multi-tenant?** This allows users from any Microsoft 365 organization to sign in. If you only want users from your own organization, select "Accounts in this organizational directory only" and note that the authority URL in `server/auth.ts` would need to change from `/common` to your specific tenant ID.

---

## 2. Configure API Permissions

The application needs delegated permissions to read Intune policies and resolve group information on behalf of the signed-in user.

1. In your app registration, go to **API permissions** > **Add a permission**.
2. Select **Microsoft Graph** > **Delegated permissions**.
3. Search for and add each of the following permissions:

| Permission | Category | Purpose |
|-----------|----------|---------|
| `DeviceManagementConfiguration.Read.All` | Device Management | Read Intune configuration policies, compliance policies, endpoint security, and settings catalog |
| `DeviceManagementManagedDevices.Read.All` | Device Management | Read Intune managed device information |
| `Group.Read.All` | Group | Resolve group display names and member counts for policy assignments |
| `Directory.Read.All` | Directory | Read organization information (tenant details) |
| `offline_access` | OpenId | Obtain refresh tokens so users don't need to re-authenticate frequently |
| `openid` | OpenId | Sign in users via OpenID Connect |
| `profile` | OpenId | Read the signed-in user's display name |
| `email` | OpenId | Read the signed-in user's email address |

4. After adding all permissions, click **Grant admin consent for [your organization]** if you are a Global Administrator. If not, an admin will need to consent during the first sign-in (see [Admin Consent](#9-admin-consent)).

> **Note**: The `openid`, `profile`, `email`, and `offline_access` permissions may already be present by default. Verify they are listed.

---

## 3. Create Client Secret

1. In your app registration, go to **Certificates & secrets** > **Client secrets** > **New client secret**.
2. Enter a description (e.g., `Intune Policy Agent Secret`) and select an expiration period.
   - Recommended: **24 months** for production, **6 months** for development.
3. Click **Add**.
4. **Immediately copy the secret Value** (not the Secret ID). You will need this as `AZURE_CLIENT_SECRET`.

> **Important**: The secret value is only shown once. If you navigate away without copying it, you will need to create a new secret.

---

## 4. Configure Redirect URI

The redirect URI tells Microsoft where to send users after they authenticate.

1. In your app registration, go to **Authentication** > **Add a platform** > **Web**.
2. Set the **Redirect URI** based on where you are running the app:

| Environment | Redirect URI |
|------------|-------------|
| Production | `https://policyagent.intunestuff.com/api/auth/callback` |
| Local development | `http://localhost:5000/api/auth/callback` |
| Custom domain | `https://yourdomain.com/api/auth/callback` |

3. You can add multiple redirect URIs. Add both your production and local development URIs so you can test locally.
4. Under **Implicit grant and hybrid flows**, leave all checkboxes **unchecked** (we use the authorization code flow, not implicit).
5. Click **Configure**.

> **Important**: The redirect URI must match exactly what the application sends. For production, this is `https://policyagent.intunestuff.com/api/auth/callback`. For local development, it is `http://localhost:5000/api/auth/callback`.

---

## 5. Set Up PostgreSQL Database

The application uses PostgreSQL exclusively for session storage. No tenant or policy data is persisted.

1. Install PostgreSQL 14 or later.
2. Create a database:
   ```bash
   createdb intune_policy_agent
   ```
3. Note your connection string:
   ```
   postgresql://username:password@localhost:5432/intune_policy_agent
   ```

For managed PostgreSQL services (Azure Database for PostgreSQL, AWS RDS, Neon, Supabase, etc.), use the connection string provided by your service.

The application automatically creates the `user_sessions` table on first startup (via `connect-pg-simple` with `createTableIfMissing: true`). No manual table creation or migrations are needed.

---

## 6. Configure Environment Variables

Create a `.env` file in the project root (or set these in your hosting platform's environment configuration):

```env
# Required: Azure AD App Registration
AZURE_CLIENT_ID=your-application-client-id-here
AZURE_CLIENT_SECRET=your-client-secret-value-here

# Required: Session Security
SESSION_SECRET=generate-a-random-string-at-least-32-characters-long

# Required: Database
DATABASE_URL=postgresql://username:password@localhost:5432/intune_policy_agent

# Required: OpenAI API
OPENAI_API_KEY=your-openai-api-key-here

# Optional: Custom OpenAI-compatible endpoint
# OPENAI_BASE_URL=https://your-custom-endpoint.com/v1

# Optional: Custom domain (defaults to policyagent.intunestuff.com for production)
# APP_DOMAIN=policyagent.intunestuff.com

# Optional: Server port (defaults to 5000)
# PORT=5000
```

### Generating a Session Secret

Use one of these commands to generate a secure random string:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 7. Install Dependencies

```bash
npm install
```

This installs all required packages including:
- `express` - Web server
- `express-session` + `connect-pg-simple` - Session management with PostgreSQL
- `openai` - OpenAI API client
- `react`, `react-dom` - Frontend framework
- `@tanstack/react-query` - Data fetching and caching
- Various shadcn/ui component libraries

---

## 8. Start the Application

### Development

```bash
npm run dev
```

This starts both the Express backend and Vite development server with hot module replacement (HMR) on port 5000. Open `http://localhost:5000` in your browser.

### Production

```bash
npm run build
npm start
```

The build step compiles the frontend with Vite and bundles the backend with esbuild. The production server serves the compiled frontend as static files.

For production deployment, ensure:
- `NODE_ENV` is set to `production`
- `APP_DOMAIN` is set to `policyagent.intunestuff.com` (or your custom domain)
- HTTPS is configured via your reverse proxy or hosting platform
- The `DATABASE_URL` points to your production PostgreSQL instance

---

## 9. Admin Consent

When a user from an organization signs in for the first time, a **Global Administrator** of that organization must consent to the requested permissions.

### Option A: Admin Consent During Sign-In

1. A Global Administrator navigates to `https://policyagent.intunestuff.com` and clicks **Sign in with Microsoft**.
2. After authenticating, Microsoft displays the permission consent screen.
3. The admin checks **Consent on behalf of your organization** and clicks **Accept**.
4. All users in that organization can now sign in without being prompted for consent again.

### Option B: Pre-Authorize via Admin Consent URL

Construct and share this URL with a Global Administrator:

```
https://login.microsoftonline.com/common/adminconsent?client_id=YOUR_CLIENT_ID&redirect_uri=https://policyagent.intunestuff.com/api/auth/callback
```

Replace `YOUR_CLIENT_ID` with your Azure AD Application (client) ID.

### Option C: Grant Consent in Azure Portal

1. Go to **Azure Portal** > **Microsoft Entra ID** > **Enterprise applications**.
2. Find your app registration.
3. Go to **Permissions** > **Grant admin consent for [organization]**.

---

## 10. Troubleshooting

### "Azure Client ID not configured"

The `AZURE_CLIENT_ID` environment variable is not set. Add it to your `.env` file or hosting platform's environment configuration.

### "Token exchange failed" on callback

Common causes:
- **Redirect URI mismatch**: The redirect URI in your app registration does not exactly match the one the application is using. For production, it must be exactly `https://policyagent.intunestuff.com/api/auth/callback`. Check the server logs for the actual redirect URI being used.
- **Client secret expired**: Generate a new client secret in Azure Portal.
- **Client secret incorrect**: Make sure you copied the secret **Value**, not the **Secret ID**.

### "AADSTS65001: The user or administrator has not consented"

A Global Administrator needs to grant consent for the requested permissions. See [Admin Consent](#9-admin-consent) above.

### "AADSTS700016: Application not found in the directory"

The `AZURE_CLIENT_ID` does not match any app registration. Verify:
- You copied the **Application (client) ID** (not the Object ID or Directory ID).
- The app registration has not been deleted.
- If single-tenant, the user is signing in from the correct tenant.

### "AADSTS7000218: The request body must contain client_secret"

The `AZURE_CLIENT_SECRET` environment variable is not set or is empty.

### "state_mismatch" error on login page

This typically happens when:
- The session cookie was not set (check that HTTPS is properly configured in production — secure cookies require HTTPS).
- The session expired between starting the login and completing it.
- You have multiple browser tabs trying to authenticate simultaneously.

Try clearing your cookies and signing in again in a single tab.

### Session not persisting (user keeps getting logged out)

- Verify `DATABASE_URL` is correct and the PostgreSQL database is accessible.
- Check that the `user_sessions` table was created (it is auto-created on first startup).
- In production, ensure HTTPS is configured since session cookies are set with `secure: true` when `NODE_ENV=production`.
- If running behind a reverse proxy (nginx, Cloudflare, etc.), the `trust proxy` setting is already configured in the application.

### "Graph API error (403): Insufficient privileges"

The signed-in user does not have admin consent for the required permissions, or the permissions have not been granted. See [Admin Consent](#9-admin-consent).

### Policies not loading / empty list

- Verify the signed-in user has at least one of these Intune roles: Intune Administrator, Global Reader, or a custom role with device configuration read access.
- Check that the tenant has Intune policies configured.
- The application queries four policy endpoints and silently skips any that return errors. If no endpoints return data, the list will be empty.

### OpenAI analysis failing

- Verify `OPENAI_API_KEY` is set and valid.
- If using a custom endpoint, verify `OPENAI_BASE_URL` is correct.
- The application uses the `gpt-5-nano` model by default. If your API key does not have access to this model, update the model name in `server/ai-analyzer.ts`.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│              Browser (User)                         │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Login Page │  │ Policy   │  │ Analysis Page    │ │
│  │           │  │ List     │  │ (6 tabs)         │ │
│  └─────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│        │              │                 │           │
└────────┼──────────────┼─────────────────┼───────────┘
         │              │                 │
         │    policyagent.intunestuff.com  │
    ┌────▼──────────────▼─────────────────▼────┐
    │              Express.js API               │
    │  ┌────────┐  ┌──────────┐  ┌───────────┐ │
    │  │ Auth   │  │ Policies │  │ Analysis  │ │
    │  │ Module │  │ Routes   │  │ Routes    │ │
    │  └───┬────┘  └────┬─────┘  └─────┬─────┘ │
    │      │            │               │       │
    └──────┼────────────┼───────────────┼───────┘
           │            │               │
    ┌──────▼──┐  ┌──────▼──────┐  ┌─────▼──────┐
    │Microsoft│  │ Microsoft   │  │  OpenAI    │
    │Identity │  │ Graph API   │  │  API       │
    │Platform │  │ (Beta)      │  │            │
    └─────────┘  └─────────────┘  └────────────┘
           │
    ┌──────▼──────┐
    │ PostgreSQL  │
    │ (sessions)  │
    └─────────────┘
```
