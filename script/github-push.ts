import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";

const OWNER = "JoeryVandenBosch";
const REPO = "IntunePolicyAgent";
const BRANCH = "main";

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
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=github",
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
  "replit.md",
  ".replit.workflow",
  ".replit.deployment",
  "package-lock.json",
  ".breakpoints",
  "tmp",
  "attached_assets",
  "script",
  "references",
  "client/replit_integrations",
  "server/replit_integrations",
  "shared/models",
  "server/vite.ts",
  "drizzle.config.ts",
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

async function pushToGitHub() {
  console.log("Getting GitHub access token...");
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });

  const workDir = "/home/runner/workspace";
  const files = getAllFiles(workDir);
  console.log(`Found ${files.length} files to push`);

  let currentCommitSha: string | undefined;
  let currentTreeSha: string | undefined;

  try {
    const { data: ref } = await octokit.git.getRef({
      owner: OWNER,
      repo: REPO,
      ref: `heads/${BRANCH}`,
    });
    currentCommitSha = ref.object.sha;

    const { data: commit } = await octokit.git.getCommit({
      owner: OWNER,
      repo: REPO,
      commit_sha: currentCommitSha,
    });
    currentTreeSha = commit.tree.sha;
    console.log(`Existing branch found, current commit: ${currentCommitSha.slice(0, 7)}`);
  } catch (e: any) {
    if (e.status === 404) {
      console.log("Repository or branch not found, will create initial commit");
    } else {
      throw e;
    }
  }

  console.log("Creating blobs...");
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

    if (treeItems.length % 20 === 0) {
      console.log(`  ${treeItems.length}/${files.length} blobs created...`);
    }
  }

  console.log(`All ${treeItems.length} blobs created. Creating tree...`);

  const { data: tree } = await octokit.git.createTree({
    owner: OWNER,
    repo: REPO,
    tree: treeItems,
  });

  console.log("Creating commit...");
  const commitParams: any = {
    owner: OWNER,
    repo: REPO,
    message: "Sync from Replit: " + new Date().toISOString(),
    tree: tree.sha,
    parents: currentCommitSha ? [currentCommitSha] : [],
  };

  const { data: newCommit } = await octokit.git.createCommit(commitParams);

  console.log(`Updating ref to ${newCommit.sha.slice(0, 7)}...`);
  try {
    await octokit.git.updateRef({
      owner: OWNER,
      repo: REPO,
      ref: `heads/${BRANCH}`,
      sha: newCommit.sha,
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

  console.log(`Successfully pushed ${files.length} files to ${OWNER}/${REPO}@${BRANCH}`);
}

pushToGitHub().catch((err) => {
  console.error("Push failed:", err.message);
  process.exit(1);
});
