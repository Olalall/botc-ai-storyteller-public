import fs from 'node:fs/promises';
import path from 'node:path';

const BOTC_ICONS_API_URL = 'https://api.github.com/repos/tomozbot/botc-icons/contents/PNG?ref=main';
const BOTC_ICONS_REPO_URL = 'https://github.com/tomozbot/botc-icons';
const rootDir = process.cwd();

const args = new Set(process.argv.slice(2));
const optional = args.has('--optional');
const dryRun = args.has('--dry-run');
const clean = args.has('--clean');

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const targetDir = path.resolve(
  rootDir,
  targetArg ? targetArg.slice('--target='.length) : 'public/clocktower-assets/role_icon'
);

const cssPath = path.resolve(rootDir, 'public/clocktower-assets/role_icon_board_atlas.css');

const localRoleIdAliases = {
  devilsadvocate: 'devils_advocate',
  eviltwin: 'evil_twin',
  fanggu: 'fang_gu',
  fortuneteller: 'fortune_teller',
  nodashii: 'no_dashii',
  pithag: 'pit-hag',
  scarletwoman: 'scarlet_woman',
  snakecharmer: 'snake_charmer',
  tealady: 'tea_lady',
  towncrier: 'town_crier'
};

function getFlagValue(prefix, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

const concurrency = Math.max(1, Number(getFlagValue('--concurrency=', '8')) || 8);

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'botc-ai-storyteller-icon-downloader'
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'botc-ai-storyteller-icon-downloader' }
  });
  if (!response.ok) {
    throw new Error(`icon download failed: ${response.status} ${response.statusText} ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function runPool(items, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function ensureGeneratedIconCss() {
  const css = `/* Generated fallback CSS for downloaded role icons.
 * Role icon image files are downloaded by scripts/download-botc-icons.mjs.
 * The downloaded assets are not covered by this project's MIT license.
 */
.role-glyph[class*="role-icon-"] {
  background-image: var(--role-icon, none) !important;
  background-position: center center !important;
  background-size: 86% !important;
  background-repeat: no-repeat !important;
}
`;
  await fs.mkdir(path.dirname(cssPath), { recursive: true });
  await fs.writeFile(cssPath, css, 'utf8');
}

async function main() {
  if (process.env.BOTC_SKIP_ICON_DOWNLOAD === '1') {
    log('BOTC icon download skipped because BOTC_SKIP_ICON_DOWNLOAD=1');
    return;
  }

  const listing = await fetchJson(BOTC_ICONS_API_URL);
  const pngFiles = listing
    .filter((item) => item.type === 'file' && item.name.toLowerCase().endsWith('.png') && item.download_url)
    .sort((left, right) => left.name.localeCompare(right.name));

  if (pngFiles.length === 0) {
    throw new Error(`No PNG icons found from ${BOTC_ICONS_REPO_URL}`);
  }

  const aliasCount = pngFiles.filter((item) => {
    const baseName = path.basename(item.name, '.png').toLowerCase();
    return Boolean(localRoleIdAliases[baseName]);
  }).length;

  if (dryRun) {
    log(`BOTC_ICON_DRY_RUN icons=${pngFiles.length} aliases=${aliasCount} source=${BOTC_ICONS_REPO_URL}`);
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  if (clean) {
    const existing = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(existing
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map((entry) => fs.rm(path.join(targetDir, entry.name), { force: true })));
  }
  await fs.writeFile(path.join(targetDir, '.gitkeep'), '', 'utf8');
  await ensureGeneratedIconCss();

  let downloaded = 0;
  let aliasesWritten = 0;

  await runPool(pngFiles, async (item) => {
    const baseName = path.basename(item.name, '.png').toLowerCase();
    const iconBuffer = await fetchBuffer(item.download_url);
    await fs.writeFile(path.join(targetDir, item.name), iconBuffer);
    downloaded += 1;

    const localAlias = localRoleIdAliases[baseName];
    if (localAlias && localAlias !== baseName) {
      await fs.writeFile(path.join(targetDir, `${localAlias}.png`), iconBuffer);
      aliasesWritten += 1;
    }
  });

  log(`BOTC_ICON_DOWNLOAD_OK source=${BOTC_ICONS_REPO_URL}`);
  log(`target=${path.relative(rootDir, targetDir) || '.'}`);
  log(`downloaded=${downloaded}`);
  log(`aliases=${aliasesWritten}`);
}

main().catch((error) => {
  const prefix = optional ? 'BOTC_ICON_DOWNLOAD_OPTIONAL_FAILED' : 'BOTC_ICON_DOWNLOAD_FAILED';
  console.error(`${prefix}: ${error.message}`);
  if (!optional) process.exitCode = 1;
});
