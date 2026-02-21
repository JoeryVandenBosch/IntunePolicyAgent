# Intune Policy Intelligence Agent

## Overview
AI-powered web application that analyzes Microsoft Intune policies. Users sign in with their Microsoft account via OAuth2 authorization code flow, select policies, and receive AI-powered analysis including summaries, end-user impact, security impact, assignments & filters, conflict detection, and recommendations.

## Architecture
- **Frontend**: React + TypeScript + Vite, dark-themed UI with shadcn/ui, wouter routing
- **Backend**: Express.js with PostgreSQL-backed sessions (express-session + connect-pg-simple)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-nano model for cost efficiency)
- **Graph API**: Microsoft Graph Beta API for Intune policy retrieval (delegated permissions)
- **Database**: PostgreSQL for session storage and analytics tracking

## Key Files
- `shared/schema.ts` - Drizzle schema (analytics_events table) + TypeScript types
- `client/src/lib/auth-context.tsx` - React context for OAuth2 authentication state
- `client/src/lib/theme-context.tsx` - Theme provider (light/dark toggle, localStorage persistence)
- `client/src/pages/login.tsx` - Landing page with "Sign in with Microsoft" button
- `client/src/pages/policy-list.tsx` - Policy listing with search, filter, checkbox selection
- `client/src/pages/analysis.tsx` - Tabbed analysis results (6 tabs) + export buttons
- `client/src/pages/analytics.dashboard.tsx` - Analytics dashboard with usage stats and charts
- `client/src/components/pdf-branding-dialog.tsx` - PDF export settings dialog (4 tabs: Branding, Appearance, Page Options, Output)
- `server/index.ts` - Express server entry point (50MB JSON body limit for exports)
- `server/auth.ts` - OAuth2 authorization code flow (login, callback, logout, status, token refresh)
- `server/routes.ts` - Express routes (policies, analyze, export/html, export/csv, export/pdf, analytics)
- `server/graph-client.ts` - Microsoft Graph API client for Intune policies
- `server/ai-analyzer.ts` - OpenAI-powered policy analysis functions
- `server/analytics.ts` - Analytics event tracking and summary queries
- `server/db.ts` - Drizzle ORM database connection (Neon serverless)

## Auth Flow (OAuth2 Authorization Code Flow)
1. User clicks "Sign in with Microsoft" → redirects to Microsoft login
2. Microsoft redirects back to /api/auth/callback with authorization code
3. Backend exchanges code for access + refresh tokens
4. Tokens stored in PostgreSQL-backed session (never in client)
5. Access token refreshed automatically when near expiry using refresh token
6. User profile fetched from Microsoft Graph /me endpoint

## Required Azure AD App Registration
- Multi-tenant app registration (accounts in any organizational directory)
- Redirect URI: https://{domain}/api/auth/callback
- Required delegated permissions: DeviceManagementConfiguration.Read.All, DeviceManagementManagedDevices.Read.All, Group.Read.All, Directory.Read.All, offline_access, openid, profile, email

## Environment Variables
- AZURE_CLIENT_ID - Azure AD app registration client ID
- AZURE_CLIENT_SECRET - Azure AD app registration client secret
- SESSION_SECRET - Express session secret
- DATABASE_URL - PostgreSQL connection string (auto-provided by Replit)
- ANALYTICS_ADMIN_KEY - Admin key for analytics dashboard access

## GitHub Repository
JoeryVandenBosch/IntunePolicyAgent

## User Preferences
- Dark theme matching specific color scheme (background: 222 22% 6%)
- Cost-effective: uses gpt-5-nano model
- Multi-tenant: OAuth2 sign-in, no manual credential entry
- Pattern: follows AdminTemplateConverter auth flow

## Supported Policy Types & APIs
- **configurationPolicies** (Settings Catalog) → `/settings` endpoint for granular setting extraction
- **deviceConfigurations** (Configuration Profiles) → Recursive property flattening from policy object (Windows, iOS, macOS, Android @odata.type detection)
- **deviceCompliancePolicies** (Compliance Policies) → Recursive property flattening from policy object
- **intents** (Endpoint Security: Antivirus, Firewall, ASR, Disk Encryption, etc.) → `/categories/{id}/settings` endpoint for setting extraction
- Platform detection: `platforms` field → `@odata.type` → `templateReference` → policy name → fallback to "Unknown"
- Supported platforms: Windows, iOS/iPadOS, macOS, Android Enterprise, Linux

## Conflict Detection Rules
- Conflicts require AT LEAST TWO different policies on the SAME platform AND same source type
- Settings are scoped by `${platform}||${source}||${defId}` to prevent cross-OS false positives
- Related policies are auto-fetched from tenant (same platform + same source, max 20)
- Per-policy deduplication prevents self-conflicts

## Export Functionality
- **HTML** - Standalone HTML report with dark theme, collapsible sections, search bar, table of contents, IntuneStuff branding
- **CSV** - Spreadsheet-compatible policy summary data (one row per policy)
- **PDF** - Full branding customization via 4-tab dialog (Branding, Appearance, Page Options, Output):
  - Organization details, logo upload with placement options (cover/header/both)
  - Color presets (Corporate, Modern, Minimal) + custom color pickers
  - Font family and size controls (heading/body)
  - Cover page, headers/footers, watermark with opacity slider
  - Table of contents, analytics overview, classification level
  - Three detail levels: Full Report, Condensed, Executive Summary
  - Settings saved to localStorage for persistence between sessions
  - Default report title: "Intune Intelligence Report"
- Express JSON body limit set to 50MB to handle large multi-policy export payloads

## Recent Changes
- 2026-02-21: Increased Express JSON body limit to 50MB for large export payloads (fixes PayloadTooLargeError)
- 2026-02-21: PDF dialog renamed tabs: Branding, Appearance, Page Options, Output (differentiated from intunedocumentation.com)
- 2026-02-21: PDF dialog now has separate "Save Settings" (localStorage) and "Generate PDF" buttons
- 2026-02-21: PDF settings persist to localStorage between sessions
- 2026-02-21: Default PDF document title changed to "Intune Intelligence Report"
- 2026-02-21: Fixed HTML/CSV/PDF export downloads (was using apiRequest which consumed response body before blob extraction)
- 2026-02-21: Export buttons: HTML, CSV, PDF (Text export removed)
- 2026-02-21: PDF export with comprehensive branding dialog (logo, colors, typography, cover page, watermark, metadata)
- 2026-02-21: Stop Analyzing button with AbortController to cancel in-flight analysis requests
- 2026-02-21: Analytics dashboard protected with ANALYTICS_ADMIN_KEY (server-side session-based authorization)
- 2026-02-21: Redesigned HTML export with collapsible per-policy sections, search bar, table of contents, IntuneStuff branding
- 2026-02-21: Added CSV export endpoint (policy-level summary data in spreadsheet format)
- 2026-02-21: Fixed settings count showing 0 for deviceConfigurations, deviceCompliancePolicies
- 2026-02-21: Custom OMA-URI policies detected from @odata.type and shown as "Custom (OMA-URI)" type
- 2026-02-21: OMA-URI settings extraction with name, OMA-URI path, value, data type
- 2026-02-21: Fixed false positive conflicts - platform+source scoping, cleanFriendlyName consistency
- 2026-02-21: Platform detection via @odata.type, templateReference, and policy name (multi-layer fallback)
- 2026-02-21: Added Linux as supported platform, changed fallback platform to "Unknown"
- 2026-02-21: Settings extraction for Endpoint Security (intents) via categories/settings API
- 2026-02-21: Improved groupSettingCollectionValue and simpleSettingCollectionValue extraction
- 2026-02-21: Increased settings display limit from 50 to 80 for richer AI context
- 2026-02-21: Setting names standardized to PascalCase, Settings Catalog uses cleanSettingDefinitionId
- 2026-02-21: AI prompts enforce strict per-setting line format for consistent display across all OS platforms
- 2026-02-21: Light/dark theme toggle with ThemeProvider (localStorage persistence, dark default)
- 2026-02-21: Changed "Powered by AI" to "Powered by IntuneStuff" across all pages
- 2026-02-21: Sticky search/filter bar on policy list page
- 2026-02-20: Redesigned analytics dashboard with global admin view (4 tabs: Overview, Tenants, Users, Activity Log)
- 2026-02-20: Cross-tenant conflict detection with data-driven setting-level comparison
- 2026-02-20: Per-policy AI analysis with parallel calls and resilient fallbacks
- 2026-02-20: Enhanced Security Impact and End-User Impact with Security Copilot-style structured output
- 2026-02-20: Robust JSON extraction for AI responses (handles truncation, markdown wrapping)
- 2026-02-20: OAuth2 authorization code flow replacing manual credential entry
- 2026-02-20: PostgreSQL session storage, IntuneStuff favicon/logo
