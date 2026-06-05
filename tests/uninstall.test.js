#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { resolveInstallPlan } = require('../scripts/lib/install-manifests');
const { applyInstallPlan } = require('../scripts/lib/install-executor');
const {
  applyUninstallPlan,
  removeHooksFromSettings,
} = require('../scripts/lib/uninstall-executor');

const repoRoot = path.join(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'gg');

test('uninstall removes install.sh profile output while preserving user hooks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-uninstall-'));
  const homeDir = path.join(tmpDir, 'home');

  try {
    const plan = resolveInstallPlan({
      repoRoot,
      profileId: 'go',
      homeDir,
    });
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          { id: 'custom:user-hook', matcher: '*', hooks: [{ type: 'command', command: 'keep' }] },
        ],
      },
    }, null, 2));

    applyInstallPlan(plan);
    assert.ok(fs.existsSync(path.join(homeDir, '.claude', 'skills', 'gg', 'golang-patterns', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(homeDir, '.claude', 'commands', 'plan.md')));
    assert.ok(fs.existsSync(path.join(homeDir, '.claude', 'gg', 'install-state.json')));

    const result = applyUninstallPlan(plan);
    assert.ok(result.removedFiles > 0);
    assert.ok(result.removedHooks > 0);
    assert.equal(result.removedState, true);

    assert.equal(fs.existsSync(path.join(homeDir, '.claude', 'skills', 'gg', 'golang-patterns', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(homeDir, '.claude', 'commands', 'plan.md')), false);
    assert.equal(fs.existsSync(path.join(homeDir, '.claude', 'gg', 'install-state.json')), false);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(settings.hooks.PreToolUse, [
      { id: 'custom:user-hook', matcher: '*', hooks: [{ type: 'command', command: 'keep' }] },
    ]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('uninstall leaves non-GG files in shared command and agent directories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-uninstall-shared-'));
  const homeDir = path.join(tmpDir, 'home');

  try {
    const plan = resolveInstallPlan({
      repoRoot,
      profileId: 'minimal',
      homeDir,
    });
    const commandPath = path.join(homeDir, '.claude', 'commands', 'custom.md');
    const agentPath = path.join(homeDir, '.claude', 'agents', 'custom-agent.md');

    fs.mkdirSync(path.dirname(commandPath), { recursive: true });
    fs.writeFileSync(commandPath, 'custom command\n');
    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, 'custom agent\n');

    applyInstallPlan(plan);
    applyUninstallPlan(plan);

    assert.equal(fs.readFileSync(commandPath, 'utf8'), 'custom command\n');
    assert.equal(fs.readFileSync(agentPath, 'utf8'), 'custom agent\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hook remover deletes only GG-managed hook ids', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-uninstall-hooks-'));
  const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
  const hooksJsonPath = path.join(pluginRoot, 'hooks', 'hooks.json');

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          { id: 'pre:config-protection', matcher: '*', hooks: [{ type: 'command', command: 'remove' }] },
          { id: 'custom:user-hook', matcher: '*', hooks: [{ type: 'command', command: 'keep' }] },
        ],
      },
    }, null, 2));

    const result = removeHooksFromSettings(hooksJsonPath, settingsPath);
    assert.equal(result.removedHooks, 1);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(settings.hooks.PreToolUse, [
      { id: 'custom:user-hook', matcher: '*', hooks: [{ type: 'command', command: 'keep' }] },
    ]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
