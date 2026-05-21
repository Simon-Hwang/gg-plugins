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
const hookScript = path.join(pluginRoot, 'scripts', 'hooks', 'mcp-health-check.js');

const {
  extractMcpTarget,
  extractMcpTargetFromRaw,
  detectFailureCode,
  isEnabled,
  loadState,
  markHealthy,
  markUnhealthy,
} = require(hookScript);

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gg-mcp-health-'));
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_HOOK_EVENT_NAME: 'PreToolUse', ...env },
    timeout: 15000,
  });
}

// --- Unit tests ---

test('extractMcpTarget returns null for non-MCP tool names', () => {
  assert.strictEqual(extractMcpTarget({ tool_name: 'Bash' }), null);
  assert.strictEqual(extractMcpTarget({ tool_name: 'Write' }), null);
  assert.strictEqual(extractMcpTarget({ tool_name: '' }), null);
});

test('extractMcpTarget parses mcp__<server>__<tool> format', () => {
  const result = extractMcpTarget({ tool_name: 'mcp__github__create_issue' });
  assert.strictEqual(result.server, 'github');
  assert.strictEqual(result.tool, 'create_issue');
});

test('extractMcpTarget handles multi-segment tool names', () => {
  const result = extractMcpTarget({ tool_name: 'mcp__context7__get__docs' });
  assert.strictEqual(result.server, 'context7');
  assert.strictEqual(result.tool, 'get__docs');
});

test('extractMcpTarget returns null for mcp__ without server', () => {
  assert.strictEqual(extractMcpTarget({ tool_name: 'mcp__' }), null);
});

test('extractMcpTarget uses explicit server field', () => {
  const result = extractMcpTarget({ tool_name: 'some_tool', server: 'myserver', tool: 'myop' });
  assert.strictEqual(result.server, 'myserver');
  assert.strictEqual(result.tool, 'myop');
});

test('extractMcpTargetFromRaw extracts from raw JSON string', () => {
  const raw = JSON.stringify({ tool_name: 'mcp__github__list_repos' });
  const result = extractMcpTargetFromRaw(raw);
  assert.strictEqual(result.server, 'github');
  assert.strictEqual(result.tool, 'list_repos');
});

test('extractMcpTargetFromRaw returns null for non-MCP raw', () => {
  const raw = JSON.stringify({ tool_name: 'Bash', command: 'ls' });
  assert.strictEqual(extractMcpTargetFromRaw(raw), null);
});

test('detectFailureCode identifies 401 pattern', () => {
  assert.strictEqual(detectFailureCode('Error: 401 unauthorized'), 401);
  assert.strictEqual(detectFailureCode('authentication failed'), 401);
});

test('detectFailureCode identifies transport errors', () => {
  assert.strictEqual(detectFailureCode('ECONNREFUSED 127.0.0.1:3000'), 'transport');
  assert.strictEqual(detectFailureCode('connection timed out'), 'transport');
  assert.strictEqual(detectFailureCode('socket hang up'), 'transport');
});

test('detectFailureCode returns null for benign output', () => {
  assert.strictEqual(detectFailureCode('Successfully created issue'), null);
  assert.strictEqual(detectFailureCode(''), null);
});

test('detectFailureCode identifies 503 pattern', () => {
  assert.strictEqual(detectFailureCode('503 service unavailable'), 503);
  assert.strictEqual(detectFailureCode('temporarily unavailable'), 503);
});

test('isEnabled returns true by default', () => {
  const origEnv = process.env.GG_MCP_HEALTH;
  delete process.env.GG_MCP_HEALTH;
  assert.ok(isEnabled());
  if (origEnv !== undefined) process.env.GG_MCP_HEALTH = origEnv;
});

test('isEnabled returns false when GG_MCP_HEALTH=off', () => {
  const origEnv = process.env.GG_MCP_HEALTH;
  process.env.GG_MCP_HEALTH = 'off';
  assert.ok(!isEnabled());
  if (origEnv !== undefined) process.env.GG_MCP_HEALTH = origEnv;
  else delete process.env.GG_MCP_HEALTH;
});

test('loadState returns default structure for missing file', () => {
  const state = loadState('/nonexistent/path/state.json');
  assert.deepStrictEqual(state, { version: 1, servers: {} });
});

test('markHealthy sets correct fields', () => {
  const state = { version: 1, servers: {} };
  const now = Date.now();
  markHealthy(state, 'github', now);
  assert.strictEqual(state.servers.github.status, 'healthy');
  assert.strictEqual(state.servers.github.failureCount, 0);
  assert.ok(state.servers.github.expiresAt > now);
});

test('markUnhealthy sets backoff and increments failureCount', () => {
  const state = { version: 1, servers: {} };
  const now = Date.now();
  markUnhealthy(state, 'github', now, 'transport', 'ECONNREFUSED');
  assert.strictEqual(state.servers.github.status, 'unhealthy');
  assert.strictEqual(state.servers.github.failureCount, 1);
  assert.ok(state.servers.github.nextRetryAt > now);
  assert.strictEqual(state.servers.github.lastError, 'ECONNREFUSED');
});

test('markUnhealthy doubles backoff on repeated failures', () => {
  const state = { version: 1, servers: {} };
  const now = Date.now();
  markUnhealthy(state, 'github', now, 'transport', 'first fail');
  const firstRetry = state.servers.github.nextRetryAt;
  markUnhealthy(state, 'github', now, 'transport', 'second fail');
  const secondRetry = state.servers.github.nextRetryAt;
  assert.ok(secondRetry > firstRetry, 'backoff should increase on repeated failures');
});

// --- Integration tests ---

test('hook passes through non-MCP tool calls unchanged', () => {
  const input = { tool_name: 'Bash', tool_input: { command: 'ls' } };
  const result = runHook(input);
  assert.strictEqual(result.status, 0, `unexpected exit code: ${result.stderr}`);
  assert.deepStrictEqual(JSON.parse(result.stdout), input);
});

test('hook exits 0 when GG_MCP_HEALTH=off', () => {
  const input = { tool_name: 'mcp__github__list_repos' };
  const result = runHook(input, { GG_MCP_HEALTH: 'off' });
  assert.strictEqual(result.status, 0);
});

test('hook reads state file path from GG_MCP_HEALTH_STATE_PATH', () => {
  const tmpDir = makeTempDir();
  const statePath = path.join(tmpDir, 'test-state.json');

  // Pre-populate with healthy state that has not expired
  const state = {
    version: 1,
    servers: {
      testserver: {
        status: 'healthy',
        checkedAt: Date.now(),
        expiresAt: Date.now() + 60 * 1000,
        failureCount: 0,
        lastError: null,
        lastFailureCode: null,
        nextRetryAt: Date.now()
      }
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(state));

  const input = { tool_name: 'mcp__testserver__some_op' };
  const result = runHook(input, {
    GG_MCP_HEALTH_STATE_PATH: statePath,
    GG_MCP_HEALTH: 'on'
  });

  // Cached healthy server should pass through without probing
  assert.strictEqual(result.status, 0, `unexpected exit: ${result.stderr}`);
  cleanupTempDir(tmpDir);
});

test('hook blocks unhealthy server that is still in backoff (fail-closed)', () => {
  const tmpDir = makeTempDir();
  const statePath = path.join(tmpDir, 'state.json');

  const state = {
    version: 1,
    servers: {
      badserver: {
        status: 'unhealthy',
        checkedAt: Date.now(),
        expiresAt: Date.now(),
        failureCount: 2,
        lastError: 'ECONNREFUSED',
        lastFailureCode: 'transport',
        nextRetryAt: Date.now() + 60 * 1000
      }
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(state));

  const input = { tool_name: 'mcp__badserver__query' };
  const result = runHook(input, {
    GG_MCP_HEALTH_STATE_PATH: statePath,
    GG_MCP_HEALTH: 'on'
  });

  assert.strictEqual(result.status, 2, 'unhealthy backoff server should be blocked (exit 2)');
  cleanupTempDir(tmpDir);
});

test('hook allows unhealthy server in fail-open mode', () => {
  const tmpDir = makeTempDir();
  const statePath = path.join(tmpDir, 'state.json');

  const state = {
    version: 1,
    servers: {
      badserver: {
        status: 'unhealthy',
        checkedAt: Date.now(),
        expiresAt: Date.now(),
        failureCount: 1,
        lastError: 'timeout',
        lastFailureCode: null,
        nextRetryAt: Date.now() + 30 * 1000
      }
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(state));

  const input = { tool_name: 'mcp__badserver__query' };
  const result = runHook(input, {
    GG_MCP_HEALTH_STATE_PATH: statePath,
    GG_MCP_HEALTH: 'on',
    GG_MCP_HEALTH_FAIL_OPEN: '1'
  });

  assert.strictEqual(result.status, 0, 'fail-open should allow blocked server');
  cleanupTempDir(tmpDir);
});

test('hook handles PostToolUseFailure and marks server unhealthy', () => {
  const tmpDir = makeTempDir();
  const statePath = path.join(tmpDir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ version: 1, servers: {} }));

  const input = {
    tool_name: 'mcp__flaky__read',
    tool_output: { output: 'Error: ECONNREFUSED 127.0.0.1:9999' }
  };

  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_HOOK_EVENT_NAME: 'PostToolUseFailure',
      GG_MCP_HEALTH_STATE_PATH: statePath,
      GG_MCP_HEALTH: 'on'
    },
    timeout: 10000,
  });

  assert.strictEqual(result.status, 0, `PostToolUseFailure should exit 0: ${result.stderr}`);

  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(saved.servers.flaky?.status, 'unhealthy');
  cleanupTempDir(tmpDir);
});

test('hook plugin surface: exports expected functions', () => {
  assert.strictEqual(typeof extractMcpTarget, 'function');
  assert.strictEqual(typeof detectFailureCode, 'function');
  assert.strictEqual(typeof isEnabled, 'function');
  assert.strictEqual(typeof loadState, 'function');
  assert.strictEqual(typeof markHealthy, 'function');
  assert.strictEqual(typeof markUnhealthy, 'function');
});
