# Intune Policy Intelligence Agent

AI-powered web application that analyzes Microsoft Intune policies. Users sign in with their Microsoft account, select policies from their tenant, and receive AI-powered analysis across six dimensions: summaries, end-user impact, security impact, assignments & filters, conflict detection, and recommendations.

---

## Features

- **Policy Summaries** - AI-generated overviews of each policy's purpose, configured settings, and scope in clear, actionable language.
- **End-User Impact** - Assess how policies affect daily user workflows with severity ratings from Minimal to Critical, including workarounds.
- **Security Impact** - Evaluate security posture improvements with compliance framework mappings (NIST 800-53, NIST 800-171, CIS Benchmarks, ISO 27001, HIPAA, SOC 2, PCI DSS).
- **Assignments & Filters** - View included/excluded groups and assignment filters with resolved group names and member counts.
- **Conflict Detection** - Identify direct setting conflicts, overlapping scopes, and redundant configurations across selected policies.
- **Recommendations** - Get actionable recommendations for security hardening, optimization, and compliance improvements.
- **Export** - Export analysis results as HTML or plain text reports.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Express.js (Node.js), TypeScript |
| Authentication | OAuth2 Authorization Code Flow (Microsoft Identity Platform) |
| Sessions | PostgreSQL via express-session + connect-pg-simple |
| AI | OpenAI API (gpt-5-nano model) |
| Graph API | Microsoft Graph Beta API (delegated permissions) |
| Routing | wouter (client-side) |
| State Management | TanStack React Query v5 |

## Prerequisites

- **Node.js** 20 or later
- **PostgreSQL** database (for session storage)
- **Azure AD App Registration** (see [Setup Guide](SETUP.md))
- **OpenAI API key** (or compatible endpoint)

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/JoeryVandenBosch/IntunePolicyAgent.git
   cd IntunePolicyAgent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Follow the [Setup Guide](SETUP.md) to configure your Azure AD app registration and environment variables.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5000`.

## Authentication Flow

This application uses the **OAuth2 Authorization Code Flow** with the Microsoft Identity Platform:

```
User clicks "Sign in with Microsoft"
        │
        ▼
Browser redirects to Microsoft login
(login.microsoftonline.com/common/oauth2/v2.0/authorize)
        │
        ▼
User authenticates & consents to permissions
        │
        ▼
Microsoft redirects to /api/auth/callback with authorization code
        │
        ▼
Backend exchanges code for access + refresh tokens
(POST login.microsoftonline.com/common/oauth2/v2.0/token)
        │
        ▼
Tokens stored in PostgreSQL-backed server session
(never exposed to the browser)
        │
        ▼
User profile fetched from Microsoft Graph /me endpoint
        │
        ▼
User redirected to /policies (authenticated)
```

Access tokens are automatically refreshed using the refresh token when they are within 2 minutes of expiry.

## Policy Sources

The application fetches policies from four Microsoft Graph Beta API endpoints:

| Endpoint | Policy Type |
|----------|------------|
| `/deviceManagement/deviceConfigurations` | Configuration Profiles |
| `/deviceManagement/deviceCompliancePolicies` | Compliance Policies |
| `/deviceManagement/intents` | Endpoint Security |
| `/deviceManagement/configurationPolicies` | Settings Catalog |

For each policy, the application also fetches:
- **Settings** (for Settings Catalog policies)
- **Assignments** (included/excluded groups, assignment filters)
- **Group details** (display name, type, member count via Microsoft Graph v1.0)

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/login` | Redirects to Microsoft login page |
| `GET` | `/api/auth/callback` | OAuth2 callback handler (exchanges code for tokens) |
| `POST` | `/api/auth/logout` | Destroys session and signs out |
| `GET` | `/api/auth/status` | Returns authentication status and user info |

### Policies & Analysis

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/policies` | Fetches all Intune policies from tenant (requires auth) |
| `POST` | `/api/analyze` | Runs AI analysis on selected policies (requires auth) |
| `POST` | `/api/export/html` | Generates downloadable HTML report |
| `POST` | `/api/export/text` | Generates downloadable plain text report |

### Request/Response Examples

**POST /api/analyze**
```json
// Request
{ "policyIds": ["policy-id-1", "policy-id-2"] }

// Response
{
  "summaries": { "policy-id-1": { "overview": "...", "keySettings": 5, "lastModified": "2026-01-15" } },
  "endUserImpact": { "policy-id-1": { "severity": "Low", "description": "...", "workarounds": "..." } },
  "securityImpact": { "policy-id-1": { "rating": "High", "description": "...", "complianceFrameworks": ["NIST 800-53", "CIS"] } },
  "assignments": { "policy-id-1": { "included": [...], "excluded": [...], "filters": [...] } },
  "conflicts": [{ "type": "Direct Conflict", "severity": "Warning", "policies": [...], "detail": "...", "recommendation": "..." }],
  "recommendations": [{ "type": "Security", "title": "...", "detail": "..." }]
}
```

## Project Structure

```
├── client/
│   ├── index.html                 # HTML entry point
│   └── src/
│       ├── App.tsx                # Root component with auth-gated routing
│       ├── main.tsx               # React entry point
│       ├── index.css              # Global styles (dark theme)
│       ├── lib/
│       │   ├── auth-context.tsx   # React context for OAuth2 auth state
│       │   ├── queryClient.ts     # TanStack Query client configuration
│       │   └── utils.ts           # Utility functions (cn)
│       └── pages/
│           ├── login.tsx          # Landing page with "Sign in with Microsoft"
│           ├── policy-list.tsx    # Policy listing (search, filter, select)
│           ├── analysis.tsx       # Tabbed analysis results (6 tabs)
│           └── not-found.tsx      # 404 page
├── server/
│   ├── index.ts                   # Express server entry point
│   ├── auth.ts                    # OAuth2 flow (login, callback, logout, token refresh)
│   ├── routes.ts                  # API routes (policies, analyze, export)
│   ├── graph-client.ts            # Microsoft Graph API client
│   ├── ai-analyzer.ts             # OpenAI-powered analysis functions
│   ├── storage.ts                 # Storage interface
│   ├── vite.ts                    # Vite dev server integration
│   └── static.ts                  # Static file serving (production)
├── shared/
│   └── schema.ts                  # TypeScript types (policies, analysis results)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── SETUP.md                       # Detailed setup guide
└── README.md
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_CLIENT_ID` | Yes | Azure AD app registration client (application) ID |
| `AZURE_CLIENT_SECRET` | Yes | Azure AD app registration client secret value |
| `SESSION_SECRET` | Yes | Random string for signing session cookies (min 32 characters recommended) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/dbname`) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes | OpenAI API key (or compatible provider) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | Custom OpenAI-compatible API base URL (defaults to OpenAI) |
| `APP_DOMAIN` | No | Custom domain for redirect URI (e.g., `myapp.example.com`) |
| `PORT` | No | Server port (defaults to 5000) |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (Express + Vite HMR) |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Push database schema changes |

## Security

- **No tenant data storage** - All policy data is fetched live from Microsoft Graph API. No tenant data is persisted on the server.
- **Server-side token storage** - OAuth2 access and refresh tokens are stored exclusively in PostgreSQL-backed server sessions. They are never sent to the browser.
- **CSRF protection** - OAuth2 state parameter is validated on callback to prevent cross-site request forgery.
- **httpOnly cookies** - Session cookies are httpOnly and secure (HTTPS only), preventing JavaScript access.
- **Read-only permissions** - Only read permissions are requested. The application makes no changes to tenant configuration.
- **Automatic token refresh** - Access tokens are refreshed automatically before expiry, minimizing re-authentication prompts.

## Required Azure AD Permissions

All permissions are **delegated** (act on behalf of the signed-in user):

| Permission | Purpose |
|-----------|---------|
| `DeviceManagementConfiguration.Read.All` | Read Intune device configuration policies and settings |
| `DeviceManagementManagedDevices.Read.All` | Read Intune managed device information |
| `Group.Read.All` | Resolve group names and member counts for assignments |
| `Directory.Read.All` | Read directory data (organization info) |
| `offline_access` | Obtain refresh tokens for automatic token renewal |
| `openid` | Sign in users (OpenID Connect) |
| `profile` | Read user's display name |
| `email` | Read user's email address |

## License

MIT
