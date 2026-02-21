import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error('X_REPLIT_TOKEN not found');
  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json()).then(data => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

const OWNER = 'JoeryVandenBosch';
const REPO = 'IntunePolicyAgent';
const BRANCH = 'main';
const ROOT = '/home/runner/workspace';

const IGNORE = new Set([
  'node_modules', 'dist', '.DS_Store', 'server/public', '.git',
  '.cache', '.config', '.local', '.upm', '.replit', 'generated-icon.png',
  'attached_assets', '.replit.nix', '.breakpoints', '.gitignore',
  'server/replit_integrations', 'references', 'snippets'
]);

function shouldIgnore(relPath: string): boolean {
  const parts = relPath.split('/');
  for (const ig of IGNORE) {
    if (parts[0] === ig || relPath.startsWith(ig + '/') || relPath === ig) return true;
  }
  if (relPath.endsWith('.tar.gz')) return true;
  if (relPath.startsWith('vite.config.ts.')) return true;
  return false;
}

function collectFiles(dir: string, base: string = ''): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + entry.name : entry.name;
    if (shouldIgnore(rel)) continue;
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

async function main() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });

  console.log('Collecting project files...');
  const files = collectFiles(ROOT);
  console.log(`Found ${files.length} files to push`);

  // Get the current commit SHA
  const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: `heads/${BRANCH}` });
  const latestCommitSha = ref.object.sha;
  console.log(`Current HEAD: ${latestCommitSha}`);

  // Get the tree of the current commit
  const { data: currentCommit } = await octokit.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: latestCommitSha });

  // Create blobs for all files
  const treeItems: any[] = [];
  for (const filePath of files) {
    const fullPath = path.join(ROOT, filePath);
    const content = fs.readFileSync(fullPath);
    
    // Check if binary
    const isBinary = content.some((byte: number) => byte === 0);
    
    let blobSha: string;
    if (isBinary) {
      const { data: blob } = await octokit.git.createBlob({
        owner: OWNER, repo: REPO,
        content: content.toString('base64'),
        encoding: 'base64',
      });
      blobSha = blob.sha;
    } else {
      const { data: blob } = await octokit.git.createBlob({
        owner: OWNER, repo: REPO,
        content: content.toString('utf-8'),
        encoding: 'utf-8',
      });
      blobSha = blob.sha;
    }
    
    treeItems.push({
      path: filePath,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blobSha,
    });
    process.stdout.write('.');
  }
  console.log('\nAll blobs created');

  // Create tree
  const { data: newTree } = await octokit.git.createTree({
    owner: OWNER, repo: REPO,
    tree: treeItems,
    base_tree: undefined, // full replacement tree
  });
  console.log(`New tree: ${newTree.sha}`);

  // Create commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner: OWNER, repo: REPO,
    message: 'Update all project files - PDF export branding, export fixes, body limit increase, docs update\n\n- PDF export dialog with 4 tabs (Branding, Appearance, Page Options, Output)\n- Separate Save Settings and Generate PDF buttons with localStorage persistence\n- Fixed HTML/CSV/PDF export downloads (use fetch instead of apiRequest)\n- Increased Express JSON body limit to 50MB for large export payloads\n- Removed Text export (kept HTML, CSV, PDF)\n- Default PDF title: Intune Intelligence Report\n- Updated README.md, SETUP.md, replit.md with latest changes',
    tree: newTree.sha,
    parents: [latestCommitSha],
  });
  console.log(`New commit: ${newCommit.sha}`);

  // Update branch ref
  await octokit.git.updateRef({
    owner: OWNER, repo: REPO,
    ref: `heads/${BRANCH}`,
    sha: newCommit.sha,
  });
  console.log(`Pushed to ${OWNER}/${REPO}@${BRANCH} successfully!`);
}

main().catch(err => { console.error('Push failed:', err.message); process.exit(1); });
