#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MANIFEST_RELATIVE_PATH = path.join('hooks', 'hooks.json');
const RUNNER_RELATIVE_PATH = path.join('scripts', 'hooks', 'run-with-flags.js');

function readStdinRaw() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_error) {
    return '';
  }
}

function getPluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT && process.env.CLAUDE_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.CLAUDE_PLUGIN_ROOT.trim());
  }
  if (process.env.GG_PLUGIN_ROOT && process.env.GG_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.GG_PLUGIN_ROOT.trim());
  }
  return path.resolve(__dirname, '..', '..');
}

function isWithinRoot(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(root + path.sep);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    process.stderr.write(`[Hook] Failed to read skill hook manifest ${filePath}: ${error.message}\n`);
    return null;
  }
}

function listSkillRoots(pluginRoot) {
  const roots = [path.join(pluginRoot, 'skills')];
  const normalized = path.resolve(pluginRoot);
  const parent = path.basename(normalized);
  const grandParent = path.basename(path.dirname(normalized));

  if (parent === 'gg' && grandParent === 'plugins') {
    roots.push(path.join(path.dirname(path.dirname(normalized)), 'skills', 'gg'));
  }

  return [...new Set(roots.map(root => path.resolve(root)))];
}

function listSkillHookManifests(pluginRoot) {
  const manifests = [];
  const seen = new Set();

  for (const skillsRoot of listSkillRoots(pluginRoot)) {
    if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
      continue;
    }

    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = path.join(skillsRoot, entry.name, MANIFEST_RELATIVE_PATH);
      const key = path.resolve(manifestPath);
      if (seen.has(key) || !fs.existsSync(manifestPath)) {
        continue;
      }
      seen.add(key);
      manifests.push({
        skillId: entry.name,
        manifestPath
      });
    }
  }

  return manifests;
}

function parseHookPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function getToolName(payload) {
  return String(payload.tool_name || payload.tool || '').trim();
}

function matcherAllows(matcher, eventName, payload) {
  if (!matcher || matcher === '*') {
    return true;
  }

  if (typeof matcher !== 'string') {
    return true;
  }

  const toolName = getToolName(payload);
  if (!toolName && eventName.includes('ToolUse')) {
    return false;
  }

  return matcher
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => part === '*' || part === toolName);
}

function normalizeHookEntry(entry, skillId) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = String(entry.id || '').trim();
  const script = String(entry.script || entry.command || '').trim();
  if (!id || !script) {
    process.stderr.write(`[Hook] Skipping invalid hook entry in skill ${skillId}; id and script are required\n`);
    return null;
  }

  return {
    id,
    script,
    matcher: entry.matcher || '*',
    profiles: entry.profiles || 'standard,strict',
    timeout: Number.isFinite(Number(entry.timeout)) ? Number(entry.timeout) : 30,
    skillId
  };
}

function collectHookEntries(pluginRoot, eventName, payload) {
  const entries = [];

  for (const { skillId, manifestPath } of listSkillHookManifests(pluginRoot)) {
    const manifest = readJson(manifestPath);
    const eventEntries = manifest?.hooks?.[eventName];
    if (!Array.isArray(eventEntries)) {
      continue;
    }

    for (const rawEntry of eventEntries) {
      const entry = normalizeHookEntry(rawEntry, skillId);
      if (entry && matcherAllows(entry.matcher, eventName, payload)) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

function runHook(pluginRoot, raw, entry) {
  const runner = path.join(pluginRoot, RUNNER_RELATIVE_PATH);
  const scriptPath = path.resolve(pluginRoot, entry.script);

  if (!fs.existsSync(runner)) {
    return {
      raw,
      exitCode: 0,
      stderr: `[Hook] run-with-flags.js not found; skipping ${entry.id}\n`
    };
  }

  if (!isWithinRoot(pluginRoot, scriptPath)) {
    return {
      raw,
      exitCode: 0,
      stderr: `[Hook] Path traversal rejected for ${entry.id}: ${entry.script}\n`
    };
  }

  if (!fs.existsSync(scriptPath)) {
    return {
      raw,
      exitCode: 0,
      stderr: `[Hook] Script not found for ${entry.id}: ${entry.script}\n`
    };
  }

  const result = spawnSync(
    process.execPath,
    [runner, entry.id, entry.script, entry.profiles],
    {
      input: raw,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        GG_PLUGIN_ROOT: pluginRoot
      },
      cwd: process.cwd(),
      timeout: Math.max(0, entry.timeout * 1000),
      windowsHide: true
    }
  );

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const exitCode = Number.isInteger(result.status) ? result.status : 0;

  let failure = '';
  if (result.error || result.signal || result.status === null) {
    const reason = result.error
      ? result.error.message
      : result.signal
        ? `terminated by signal ${result.signal}`
        : 'missing exit status';
    failure = `[Hook] Skill hook ${entry.id} failed: ${reason}\n`;
  }

  return {
    raw: stdout || raw,
    exitCode,
    stderr: `${stderr}${failure}`
  };
}

function main() {
  const eventName = String(process.argv[2] || '').trim();
  const raw = readStdinRaw();

  if (!eventName) {
    process.stdout.write(raw);
    return;
  }

  const pluginRoot = getPluginRoot();
  const payload = parseHookPayload(raw);
  const entries = collectHookEntries(pluginRoot, eventName, payload);

  let currentRaw = raw;
  for (const entry of entries) {
    const result = runHook(pluginRoot, currentRaw, entry);
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    currentRaw = result.raw;
    if (result.exitCode !== 0) {
      process.stdout.write(currentRaw);
      process.exit(result.exitCode);
    }
  }

  process.stdout.write(currentRaw);
}

main();
