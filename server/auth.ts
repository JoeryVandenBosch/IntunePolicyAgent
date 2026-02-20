import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { log } from "./index";

declare module "express-session" {
  interface SessionData {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    tenantId?: string;
    userDisplayName?: string;
    userEmail?: string;
    oauthState?: string;
    policies?: import("./graph-client").IntunePolicyRaw[];
  }
}

const SCOPES = [
  "DeviceManagementConfiguration.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "Group.Read.All",
  "Directory.Read.All",
  "offline_access",
  "openid",
  "profile",
  "email",
].join(" ");

function getAuthority(): string {
  return "https://login.microsoftonline.com/common";
}

function getRedirectUri(): string {
  if (process.env.APP_DOMAIN) {
    return `https://${process.env.APP_DOMAIN}/api/auth/callback`;
  }
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/api/auth/callback`;
}

export function setupSession(app: Express): void {
  const PgSession = connectPgSimple(session);

  app.set("trust proxy", 1);

  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        tableName: "user_sessions",
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        secure: process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEV_DOMAIN,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/login", (req: Request, res: Response) => {
    const clientId = process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "Azure Client ID not configured" });
    }

    const redirectUri = getRedirectUri();
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    req.session.oauthState = state;
    req.session.save((err) => {
      if (err) {
        log(`Failed to save session state: ${err.message}`, "auth");
      }

      const authUrl = new URL(`${getAuthority()}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "consent");

      log(`Auth redirect to Microsoft login (redirect_uri: ${redirectUri})`, "auth");
      res.redirect(authUrl.toString());
    });
  });

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      log(`Auth callback error: ${error} - ${error_description}`, "auth");
      return res.redirect(`/?auth_error=${encodeURIComponent(String(error_description || error))}`);
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/?auth_error=no_code");
    }

    const expectedState = req.session.oauthState;
    if (!state || !expectedState || state !== expectedState) {
      log("OAuth state mismatch - possible CSRF attack", "auth");
      return res.redirect("/?auth_error=state_mismatch");
    }
    delete req.session.oauthState;

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect("/?auth_error=missing_config");
    }

    try {
      const redirectUri = getRedirectUri();
      const tokenUrl = `${getAuthority()}/oauth2/v2.0/token`;

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES,
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        log(`Token exchange failed: ${errorText}`, "auth");
        return res.redirect("/?auth_error=token_exchange_failed");
      }

      const tokenData = await tokenResponse.json();

      req.session.accessToken = tokenData.access_token;
      req.session.refreshToken = tokenData.refresh_token;
      req.session.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

      try {
        const meResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          req.session.userDisplayName = meData.displayName;
          req.session.userEmail = meData.userPrincipalName || meData.mail;
        }
      } catch {
        log("Could not fetch user profile", "auth");
      }

      try {
        const orgResponse = await fetch("https://graph.microsoft.com/v1.0/organization", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          const org = orgData.value?.[0];
          req.session.tenantId = org?.id;
        }
      } catch {
        log("Could not fetch organization info", "auth");
      }

      log(`User authenticated: ${req.session.userEmail || "unknown"}`, "auth");
      res.redirect("/policies");
    } catch (err: any) {
      log(`Auth callback error: ${err.message}`, "auth");
      res.redirect("/?auth_error=unexpected_error");
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        log(`Session destroy error: ${err.message}`, "auth");
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/status", (req: Request, res: Response) => {
    if (req.session.accessToken) {
      res.json({
        authenticated: true,
        user: {
          displayName: req.session.userDisplayName,
          email: req.session.userEmail,
        },
        tenantId: req.session.tenantId,
      });
    } else {
      res.json({ authenticated: false });
    }
  });
}

export async function refreshTokenIfNeeded(req: Request): Promise<string> {
  if (!req.session.accessToken) {
    throw new Error("Not authenticated");
  }

  if (req.session.tokenExpiresAt && req.session.tokenExpiresAt < Date.now() + 120000) {
    if (req.session.refreshToken) {
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      if (clientId && clientSecret) {
        try {
          const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: req.session.refreshToken,
            grant_type: "refresh_token",
            scope: SCOPES,
          });

          const response = await fetch(
            `${getAuthority()}/oauth2/v2.0/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            }
          );

          if (response.ok) {
            const data = await response.json();
            req.session.accessToken = data.access_token;
            req.session.refreshToken = data.refresh_token || req.session.refreshToken;
            req.session.tokenExpiresAt = Date.now() + data.expires_in * 1000;
            log("Token refreshed successfully", "auth");
          } else {
            log("Token refresh failed, user must re-authenticate", "auth");
            throw new Error("Token refresh failed");
          }
        } catch (err: any) {
          log(`Token refresh error: ${err.message}`, "auth");
          throw new Error("Token refresh failed");
        }
      }
    }
  }

  return req.session.accessToken!;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.accessToken) {
    res.status(401).json({ message: "Not authenticated. Please sign in." });
    return;
  }
  next();
}
