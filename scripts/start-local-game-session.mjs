import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../modules/ProjectEnv.js').loadProjectEnv({ force: true });

const rootDir = process.cwd();
const reportDir = path.join(rootDir, 'docs', 'import-reports');
const reportPath = path.join(reportDir, 'local-game-session-start-latest.json');
const args = process.argv.slice(2);
const argSet = new Set(args);
const dryRun = argSet.has('--dry-run');
const smoke = argSet.has('--smoke') || argSet.has('--start-and-stop');
const skipPreflight = argSet.has('--skip-preflight');
const liveProvider = argSet.has('--live-provider');
const requireLiveProvider = !argSet.has('--no-require-live-provider');
const requestedPort = Number(readArgValue('--port') || process.env.PORT || 3000);

function readArgValue(name) {
  const prefix = `${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  if (!hit) return null;
  return hit.slice(prefix.length).trim() || null;
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replace(/\//g, '\\');
}

function scrub(text) {
  const secrets = [
    process.env.BOTC_AI_API_KEY,
    process.env.OPENAI_API_KEY
  ].filter(Boolean);
  let value = String(text || '');
  for (const secret of secrets) value = value.split(secret).join('[REDACTED_API_KEY]');
  return value.replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}

function tailLines(text, count = 16) {
  return scrub(text).split(/\r?\n/).filter(Boolean).slice(-count);
}

function writeReport(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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
    const request = http.get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += String(chunk);
      });
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode,
            body: JSON.parse(body)
          });
        } catch (error) {
          reject(new Error(`invalid json from ${url}: ${error.message}`));
        }
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`timeout from ${url}`));
    });
    request.on('error', reject);
  });
}

async function waitForHealth(baseUrl, child, timeoutMs = 15000) {
  const started = Date.now();
  const healthUrl = `${baseUrl}/healthz`;
  while (Date.now() - started <= timeoutMs) {
    if (child.exitCode !== null) throw new Error(`server exited before /healthz: ${child.exitCode}`);
    try {
      const response = await requestJson(healthUrl, 3000);
      if (response.statusCode === 200 && response.body?.status === 'ok') return response;
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server health timeout: ${healthUrl}`);
}

function runPreflight() {
  if (skipPreflight) {
    return {
      status: 'SKIPPED',
      command: null,
      code: null,
      stdoutTail: [],
      stderrTail: []
    };
  }
  const preflightArgs = ['scripts/preflight-game-status.mjs', '--start-server'];
  if (requireLiveProvider) preflightArgs.push('--require-live-provider');
  if (liveProvider) preflightArgs.push('--live-provider');
  const result = spawnSync(process.execPath, preflightArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: liveProvider ? 240000 : 180000,
    env: process.env,
    shell: false
  });
  return {
    status: result.status === 0 && !result.error ? 'GO' : 'NO-GO',
    command: [process.execPath, ...preflightArgs].join(' '),
    code: result.status,
    error: result.error ? scrub(result.error.message) : null,
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr)
  };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return 'already-exited';
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 1500);
  });
  return child.exitCode === null ? 'stop-timeout' : 'stopped';
}

const startedAt = new Date().toISOString();
const preflight = runPreflight();
let status = preflight.status === 'NO-GO' ? 'NO-GO' : 'GO';
let finalPort = requestedPort;
if (requestedPort === 0) finalPort = await getFreePort();
const baseUrl = `http://127.0.0.1:${finalPort}`;
const urls = {
  storyteller: `${baseUrl}/storyteller-v2.html`,
  player: `${baseUrl}/player-v2.html`,
  healthz: `${baseUrl}/healthz`
};

let server = null;
let stdout = '';
let stderr = '';
let health = null;
let stopStatus = null;
let finishedAt = null;
const failures = [];
if (preflight.status === 'NO-GO') failures.push('preflight failed');

if (status === 'GO' && dryRun) {
  finishedAt = new Date().toISOString();
  writeReport({
    status,
    generatedAt: finishedAt,
    startedAt,
    command: `node scripts/start-local-game-session.mjs${args.length ? ` ${args.join(' ')}` : ''}`,
    mode: 'dry-run',
    preflight,
    server: {
      started: false,
      port: finalPort,
      urls,
      health,
      stopStatus
    },
    failures
  });
  console.log('Local game session dry-run GO');
  console.log(`Storyteller URL: ${urls.storyteller}`);
  console.log(`Player URL: ${urls.player}`);
  console.log(`Report: ${relative(reportPath)}`);
  process.exit(0);
}

if (status === 'GO') {
  server = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(finalPort) },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => {
    const text = String(chunk);
    stdout += text;
    process.stdout.write(text);
  });
  server.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderr += text;
    process.stderr.write(text);
  });
  try {
    health = await waitForHealth(baseUrl, server);
  } catch (error) {
    status = 'NO-GO';
    failures.push(error.message);
  }
}

if (status !== 'GO' || smoke) {
  stopStatus = await stopServer(server);
  finishedAt = new Date().toISOString();
  writeReport({
    status,
    generatedAt: finishedAt,
    startedAt,
    command: `node scripts/start-local-game-session.mjs${args.length ? ` ${args.join(' ')}` : ''}`,
    mode: smoke ? 'smoke' : 'failed-start',
    preflight,
    server: {
      started: Boolean(server),
      port: finalPort,
      pid: server?.pid || null,
      urls,
      health,
      stopStatus,
      stdoutTail: tailLines(stdout),
      stderrTail: tailLines(stderr)
    },
    failures
  });
  console.log(`Local game session ${status}`);
  console.log(`Storyteller URL: ${urls.storyteller}`);
  console.log(`Player URL: ${urls.player}`);
  console.log(`Report: ${relative(reportPath)}`);
  if (status !== 'GO') process.exit(1);
  process.exit(0);
}

writeReport({
  status: 'RUNNING',
  generatedAt: new Date().toISOString(),
  startedAt,
  command: `node scripts/start-local-game-session.mjs${args.length ? ` ${args.join(' ')}` : ''}`,
  mode: 'foreground-server',
  preflight,
  server: {
    started: true,
    port: finalPort,
    pid: server?.pid || null,
    urls,
    health,
    stopStatus: null,
    stdoutTail: tailLines(stdout),
    stderrTail: tailLines(stderr)
  },
  failures
});

console.log('Local game session RUNNING');
console.log(`Storyteller URL: ${urls.storyteller}`);
console.log(`Player URL: ${urls.player}`);
console.log('Press Ctrl+C to stop.');
console.log(`Report: ${relative(reportPath)}`);

const stopAndExit = async () => {
  stopStatus = await stopServer(server);
  writeReport({
    status: 'STOPPED',
    generatedAt: new Date().toISOString(),
    startedAt,
    command: `node scripts/start-local-game-session.mjs${args.length ? ` ${args.join(' ')}` : ''}`,
    mode: 'foreground-server',
    preflight,
    server: {
      started: true,
      port: finalPort,
      pid: server?.pid || null,
      urls,
      health,
      stopStatus,
      stdoutTail: tailLines(stdout),
      stderrTail: tailLines(stderr)
    },
    failures
  });
  process.exit(0);
};

process.once('SIGINT', stopAndExit);
process.once('SIGTERM', stopAndExit);
server.once('exit', (code) => {
  writeReport({
    status: code === 0 ? 'STOPPED' : 'NO-GO',
    generatedAt: new Date().toISOString(),
    startedAt,
    command: `node scripts/start-local-game-session.mjs${args.length ? ` ${args.join(' ')}` : ''}`,
    mode: 'foreground-server',
    preflight,
    server: {
      started: true,
      port: finalPort,
      pid: server?.pid || null,
      urls,
      health,
      stopStatus: `exited:${code}`,
      stdoutTail: tailLines(stdout),
      stderrTail: tailLines(stderr)
    },
    failures: code === 0 ? failures : [...failures, `server exited with ${code}`]
  });
  process.exit(code || 0);
});
