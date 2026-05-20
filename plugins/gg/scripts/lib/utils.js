'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function getHomeDir() {
  const explicit = process.env.HOME || process.env.USERPROFILE;
  return explicit && explicit.trim() ? path.resolve(explicit) : os.homedir();
}

function getClaudeDir() {
  return path.join(getHomeDir(), '.claude');
}

function getSessionsDir() {
  return path.join(getClaudeDir(), 'session-data');
}

function getTempDir() {
  return os.tmpdir();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getDateTimeString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function getTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function findFiles(dir, pattern) {
  const results = [];
  if (!dir || !fs.existsSync(dir)) {
    return results;
  }

  const regex = new RegExp(`^${String(pattern || '*')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')}$`);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !regex.test(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (_error) {
      continue;
    }
    results.push({ path: fullPath, mtime: stat.mtimeMs });
  }

  return results.sort((a, b) => b.mtime - a.mtime);
}

async function readStdinJson(options = {}) {
  const { timeoutMs = 5000, maxSize = 1024 * 1024 } = options;

  return new Promise(resolve => {
    let raw = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch (_error) {
        resolve({});
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (raw.length < maxSize) {
        raw += chunk.slice(0, maxSize - raw.length);
      }
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return null;
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function appendFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf8');
}

function commandExists(command) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(String(command || ''))) {
    return false;
  }
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [command], { stdio: 'ignore', windowsHide: true }).status === 0;
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

module.exports = {
  getHomeDir,
  getClaudeDir,
  getSessionsDir,
  getTempDir,
  ensureDir,
  getDateTimeString,
  getTimeString,
  findFiles,
  readStdinJson,
  readFile,
  writeFile,
  appendFile,
  commandExists,
  log,
};
