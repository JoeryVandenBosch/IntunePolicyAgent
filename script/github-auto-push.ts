import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const OWNER = "JoeryVandenBosch";
const REPO = "IntunePolicyAgent";
const BRANCH = "main";
const CHECK_INTERVAL_MS = 60_000;

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=github",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("GitHub not connected");
  }
  return accessToken;
}

const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".cache",
  ".config",
  ".local",
  ".upm",
  "generated",
  ".replit",
  "replit.nix",
  ".replit.workflow",
  ".replit.deployment",
  "package-lock.json",
  ".breakpoints",
  "tmp",
  "attached_assets",
  "script/github-push.ts",
  "script/github-auto-push.ts",
  "references",
];

function shouldInclude(filePath: string): boolean {
  const rel = filePath.startsWith("./") ? filePath.slice(2) : filePath;
  for (const pattern of IGNORE_PATTERNS) {
    if (rel === pattern || rel.startsWith(pattern + "/")) return false;
  }
  if (rel.endsWith(".log")) return false;
  return true;
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (!shouldInclude(relPath)) continue;
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

function isBinary(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip"].includes(ext);
}

function computeSnapshot(workDir: string, files: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    const fullPath = path.join(workDir, file);
    const stat = fs.statSync(fullPath);
    hash.update(file + ":" + stat.mtimeMs + ":" + stat.size);
  }
  return hash.digest("hex");
}

let lastSnapshot = "";

async function pushIfChanged() {
  const workDir = "/home/runner/workspace";
  const files = getAllFiles(workDir);
  const snapshot = computeSnapshot(workDir, files);

  if (snapshot === lastSnapshot) {
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] Changes detected, pushing ${files.length} files...`);

  try {
    const token = await getAccessToken();
    const octokit = new Octokit({ auth: token });

    let currentCommitSha: string | undefined;
    try {
      const { data: ref } = await octokit.git.getRef({
        owner: OWNER,
        repo: REPO,
        ref: `heads/${BRANCH}`,
      });
      currentCommitSha = ref.object.sha;
    } catch {}

    const treeItems: any[] = [];
    for (const file of files) {
      const fullPath = path.join(workDir, file);
      const binary = isBinary(file);
      let content: string;
      let encoding: "utf-8" | "base64";

      if (binary) {
        content = fs.readFileSync(fullPath).toString("base64");
        encoding = "base64";
      } else {
        content = fs.readFileSync(fullPath, "utf-8");
        encoding = "utf-8";
      }

      const { data: blob } = await octokit.git.createBlob({
        owner: OWNER,
        repo: REPO,
        content,
        encoding,
      });

      treeItems.push({
        path: file,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      });
    }

    const { data: tree } = await octokit.git.createTree({
      owner: OWNER,
      repo: REPO,
      tree: treeItems,
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner: OWNER,
      repo: REPO,
      message: "Auto-sync from Replit: " + new Date().toISOString(),
      tree: tree.sha,
      parents: currentCommitSha ? [currentCommitSha] : [],
    });

    try {
      await octokit.git.updateRef({
        owner: OWNER,
        repo: REPO,
        ref: `heads/${BRANCH}`,
        sha: newCommit.sha,
        force: true,
      });
    } catch (e: any) {
      if (e.status === 422) {
        await octokit.git.createRef({
          owner: OWNER,
          repo: REPO,
          ref: `refs/heads/${BRANCH}`,
          sha: newCommit.sha,
        });
      } else {
        throw e;
      }
    }

    lastSnapshot = snapshot;
    console.log(`[${new Date().toLocaleTimeString()}] Pushed successfully (${newCommit.sha.slice(0, 7)})`);
  } catch (err: any) {
    console.error(`[${new Date().toLocaleTimeString()}] Push failed: ${err.message}`);
  }
}

async function main() {
  console.log(`GitHub auto-push started. Checking for changes every ${CHECK_INTERVAL_MS / 1000}s...`);
  console.log(`Target: ${OWNER}/${REPO}@${BRANCH}`);

  const workDir = "/home/runner/workspace";
  const files = getAllFiles(workDir);
  lastSnapshot = computeSnapshot(workDir, files);
  console.log(`Initial snapshot captured (${files.length} files)`);

  setInterval(async () => {
    try {
      await pushIfChanged();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  }, CHECK_INTERVAL_MS);
}

main();
