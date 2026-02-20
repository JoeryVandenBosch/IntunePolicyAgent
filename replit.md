# Intune Policy Intelligence Agent

## Overview
AI-powered web application that analyzes Microsoft Intune policies. Users sign in with their Microsoft account via OAuth2 authorization code flow, select policies, and receive AI-powered analysis including summaries, end-user impact, security impact, assignments & filters, conflict detection, and recommendations.

## Architecture
- **Frontend**: React + TypeScript + Vite, dark-themed UI with shadcn/ui, wouter routing
- **Backend**: Express.js with PostgreSQL-backed sessions (express-session + connect-pg-simple)
- **AI**: OpenAI via Replit AI Integrations (gpt-5-nano model for cost efficiency)
- **Graph API**: Microsoft Graph Beta API for Intune policy retrieval (delegated permissions)
- **Database**: PostgreSQL for session storage only (no user data persistence)

## Key Files
- `shared/schema.ts` - TypeScript types for policies, analysis results
- `client/src/lib/auth-context.tsx` - React context for OAuth2 authentication state
- `client/src/pages/login.tsx` - Landing page with "Sign in with Microsoft" button
- `client/src/pages/policy-list.tsx` - Policy listing with search, filter, checkbox selection
- `client/src/pages/analysis.tsx` - Tabbed analysis results (6 tabs)
- `server/auth.ts` - OAuth2 authorization code flow (login, callback, logout, status, token refresh)
- `server/routes.ts` - Express routes (policies, analyze, export)
- `server/graph-client.ts` - Microsoft Graph API client for Intune policies
- `server/ai-analyzer.ts` - OpenAI-powered policy analysis functions

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

## GitHub Repository
JoeryVandenBosch/IntunePolicyAgent

## User Preferences
- Dark theme matching specific color scheme (background: 222 22% 6%)
- Cost-effective: uses gpt-5-nano model
- Multi-tenant: OAuth2 sign-in, no manual credential entry
- Pattern: follows AdminTemplateConverter auth flow

## Recent Changes
- 2026-02-20: Replaced manual credential entry with OAuth2 authorization code flow
- 2026-02-20: Added PostgreSQL session storage (connect-pg-simple)
- 2026-02-20: Updated landing page with "Sign in with Microsoft" CTA
- 2026-02-20: Removed client credentials flow from graph-client (now uses delegated tokens)
- 2026-02-20: Added user display name in header, auth error handling on login page
