import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const requiredFiles = [
  'server.js',
  'package.json',
  '.env.example',
  'public/storyteller-v2.html',
  'public/player-v2.html',
  'modules/ScriptCatalog.js',
  'modules/ProjectEnv.js',
  'modules/mvp/RuleAutomation.js',
  'data/knowledge/role-token-alias-registry.json',
  'data/runtime/official/normalized/official-roles.json',
  'data/runtime/official/normalized/official-nightsheet.json',
  'data/runtime/scripts/normalized/trouble-brewing-import.json',
  'data/runtime/scripts/normalized/bad-moon-rising-import.json',
  'data/runtime/scripts/normalized/sects-and-violets-import.json',
  'data/runtime/scripts/normalized/catfishing-import.json'
];

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function requestJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += String(chunk); });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout: ${url}`)));
    req.on('error', reject);
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await requestJson(`${baseUrl}/healthz`, 2500);
      if (response.statusCode === 200 && response.body?.status === 'ok') return response;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server health check timed out: ${baseUrl}/healthz`);
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
}

const missing = requiredFiles.filter((file) => !exists(file));
if (missing.length > 0) {
  console.error(`PUBLIC_PREFLIGHT_NO_GO missing files: ${missing.join(', ')}`);
  process.exit(1);
}

const syntaxFiles = [
  'server.js',
  'modules/ScriptCatalog.js',
  'modules/ProjectEnv.js',
  'modules/mvp/RuleAutomation.js'
];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 15000
  });
  if (result.status !== 0 || result.error) {
    console.error(`PUBLIC_PREFLIGHT_NO_GO syntax failed: ${file}`);
    if (result.stderr) console.error(result.stderr.trim());
    if (result.error) console.error(result.error.message);
    process.exit(1);
  }
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});

try {
  await waitForHealth(baseUrl, child);
  console.log('PUBLIC_PREFLIGHT_GO');
  console.log(`Storyteller=${baseUrl}/storyteller-v2.html`);
  console.log(`Player=${baseUrl}/player-v2.html`);
} finally {
  stopServer(child);
}
