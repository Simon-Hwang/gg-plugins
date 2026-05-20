#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'gg');
const runner = path.join(pluginRoot, 'scripts', 'hooks', 'run-with-flags.js');

function runHook(hookId, script, input, env = {}) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  return spawnSync(process.execPath, [runner, hookId, script, 'standard,strict'], {
    cwd: repoRoot,
    input: raw,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      GG_PLUGIN_ROOT: pluginRoot,
      GG_HOOK_PROFILE: 'standard',
      ...env,
    },
    timeout: 15000,
  });
}

test('hooks.json registers GG default guard hooks', () => {
  const hooksJson = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
  const allEntries = Object.values(hooksJson.hooks).flat();
  const ids = new Set(allEntries.map(entry => entry.id));

  assert.ok(ids.has('pre:edit-write:suggest-compact'));
  assert.ok(ids.has('pre:config-protection'));
  assert.ok(ids.has('pre:edit-write:gateguard-fact-force'));
  assert.ok(ids.has('pre:compact'));
  assert.ok(ids.has('post:quality-gate'));
});

test('strategic-compact skill is installed with workflow skills', () => {
  const modulesJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifests', 'install-modules.json'), 'utf8'));
  const workflowModule = modulesJson.modules.find(module => module.id === 'skills-workflow');

  assert.ok(workflowModule, 'skills-workflow module should exist');
  assert.ok(
    workflowModule.paths.includes('plugins/gg/skills/strategic-compact'),
    'skills-workflow should include strategic-compact',
  );
  assert.ok(
    fs.existsSync(path.join(pluginRoot, 'skills', 'strategic-compact', 'SKILL.md')),
    'strategic-compact skill should exist',
  );
});

test('config-protection blocks protected formatter config edits', () => {
  const result = runHook(
    'pre:config-protection',
    'scripts/hooks/config-protection.js',
    {
      tool_name: 'Write',
      tool_input: { file_path: 'biome.json', content: '{}' },
    },
  );

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /BLOCKED: Modifying biome\.json is not allowed/);
  assert.equal(result.stdout, '');
});

test('suggest-compact emits a GG compact hint at the configured threshold', () => {
  const sessionId = `gg-compact-${Date.now()}`;
  const counterFile = path.join(os.tmpdir(), `gg-tool-count-${sessionId}`);
  try {
    const first = runHook(
      'pre:edit-write:suggest-compact',
      'scripts/hooks/suggest-compact.js',
      { session_id: sessionId, tool_name: 'Edit', tool_input: { file_path: 'a.js' } },
      { GG_COMPACT_THRESHOLD: '2' },
    );
    assert.equal(first.status, 0, first.stderr);

    const second = runHook(
      'pre:edit-write:suggest-compact',
      'scripts/hooks/suggest-compact.js',
      { session_id: sessionId, tool_name: 'Edit', tool_input: { file_path: 'a.js' } },
      { GG_COMPACT_THRESHOLD: '2' },
    );
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /\[StrategicCompact\].*2 tool calls reached/);
  } finally {
    fs.rmSync(counterFile, { force: true });
  }
});

test('gateguard denies first edit and respects GG_GATEGUARD=off', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-gateguard-'));
  const input = {
    session_id: 'gg-gateguard-session',
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/app.js', old_string: 'old', new_string: 'new' },
  };

  try {
    const denied = runHook(
      'pre:edit-write:gateguard-fact-force',
      'scripts/hooks/gateguard-fact-force.js',
      input,
      { GATEGUARD_STATE_DIR: stateDir },
    );
    assert.equal(denied.status, 0, denied.stderr);
    const output = JSON.parse(denied.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /Fact-Forcing Gate/);

    const disabled = runHook(
      'pre:edit-write:gateguard-fact-force',
      'scripts/hooks/gateguard-fact-force.js',
      input,
      { GATEGUARD_STATE_DIR: stateDir, GG_GATEGUARD: 'off' },
    );
    assert.equal(disabled.status, 0, disabled.stderr);
    assert.deepEqual(JSON.parse(disabled.stdout), input);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('quality-gate no-ops cleanly when no formatter toolchain is present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-quality-gate-'));
  const target = path.join(tmpDir, 'index.js');
  fs.writeFileSync(target, 'const value = 1;\n', 'utf8');

  try {
    const input = {
      tool_name: 'Write',
      tool_input: { file_path: target, content: 'const value = 1;\n' },
    };
    const result = runHook('post:quality-gate', 'scripts/hooks/quality-gate.js', input);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), input);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('install hook merger replaces GG-managed default hook ids', () => {
  const { mergeHooksIntoSettings } = require('../scripts/lib/install-executor');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-hook-merge-'));
  const hooksJsonPath = path.join(pluginRoot, 'hooks', 'hooks.json');
  const settingsPath = path.join(tmpDir, '.claude', 'settings.json');

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          { id: 'pre:config-protection', matcher: '*', hooks: [{ type: 'command', command: 'old' }] },
          { id: 'custom:user-hook', matcher: '*', hooks: [{ type: 'command', command: 'keep' }] },
        ],
      },
    }, null, 2));

    mergeHooksIntoSettings(hooksJsonPath, settingsPath);
    const merged = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const preToolIds = merged.hooks.PreToolUse.map(entry => entry.id);

    assert.equal(preToolIds.filter(id => id === 'pre:config-protection').length, 1);
    assert.ok(preToolIds.includes('custom:user-hook'));
    assert.ok(preToolIds.includes('pre:edit-write:suggest-compact'));
    assert.ok(preToolIds.includes('pre:edit-write:gateguard-fact-force'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
