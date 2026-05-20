#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const { applyInstallPlan } = require('../scripts/lib/install-executor');
const { resolveInstallPlan } = require('../scripts/lib/install-manifests');

const repoRoot = path.join(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'gg');
const traceHook = path.join(pluginRoot, 'scripts', 'hooks', 'task-trace.js');
const traceInspect = path.join(pluginRoot, 'scripts', 'task-trace-inspect.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gg-task-trace-home-'));
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function runTraceHook(input, env = {}) {
  return spawnSync(process.execPath, [traceHook], {
    cwd: repoRoot,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      GG_PLUGIN_ROOT: pluginRoot,
      CLAUDE_HOOK_EVENT_NAME: env.CLAUDE_HOOK_EVENT_NAME || 'PostToolUse',
      ...env,
    },
    timeout: 15000,
  });
}

function runInspect(args = [], env = {}) {
  return spawnSync(process.execPath, [traceInspect, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      GG_PLUGIN_ROOT: pluginRoot,
      ...env,
    },
    timeout: 15000,
  });
}

test('task-trace hook records sanitized PostToolUse events as JSONL', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');
  const input = {
    session_id: 'session-a',
    tool_use_id: 'tool-a',
    cwd: '/workspace/project',
    tool_name: 'Write',
    tool_input: {
      file_path: 'src/app.js',
      content: 'const password=supersecret; const token="ghp_abcdefghijklmnopqrstuvwxyz";',
    },
    tool_output: {
      output: 'Wrote src/app.js with Authorization: Bearer abcdefghijklmnop',
    },
  };

  try {
    const result = runTraceHook(input, {
      HOME: home,
      GG_TASK_TRACE_DIR: traceDir,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), input);

    const records = readJsonl(traceFile);
    assert.equal(records.length, 1);
    assert.equal(records[0].schemaVersion, 'gg.task-trace.v1');
    assert.equal(records[0].event, 'tool_complete');
    assert.equal(records[0].session_id, 'session-a');
    assert.equal(records[0].tool_name, 'Write');
    assert.equal(records[0].tool_use_id, 'tool-a');
    assert.deepEqual(records[0].file_paths, ['src/app.js']);
    assert.equal(records[0].file_events[0].path, 'src/app.js');
    assert.equal(records[0].file_events[0].action, 'write');

    const serialized = JSON.stringify(records[0]);
    assert.doesNotMatch(serialized, /supersecret/);
    assert.doesNotMatch(serialized, /ghp_abcdefghijklmnopqrstuvwxyz/);
    assert.doesNotMatch(serialized, /Bearer abcdefghijklmnop/);
    assert.match(serialized, /\[REDACTED\]/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('task-trace hook respects GG_TASK_TRACE=off without writing trace data', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');

  try {
    const result = runTraceHook({
      session_id: 'session-disabled',
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
      tool_output: 'ok',
    }, {
      HOME: home,
      GG_TASK_TRACE_DIR: traceDir,
      GG_TASK_TRACE: 'off',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(traceFile), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('task-trace hook records user prompts with command, skill, and agent signals', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');
  const input = {
    session_id: 'session-prompt',
    cwd: '/workspace/project',
    prompt: 'Use /gg:plan, task-trace skill, and planner agent to inspect this task',
  };

  try {
    const result = runTraceHook(input, {
      HOME: home,
      GG_TASK_TRACE_DIR: traceDir,
      CLAUDE_HOOK_EVENT_NAME: 'UserPromptSubmit',
    });

    assert.equal(result.status, 0, result.stderr);
    const [record] = readJsonl(traceFile);
    assert.equal(record.event, 'user_prompt');
    assert.ok(record.task_id);
    assert.ok(record.signals.includes('command:/gg:plan'));
    assert.ok(record.signals.includes('skill:task-trace'));
    assert.ok(record.signals.includes('agent:planner'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('task-trace inspect summarizes sessions and renders markdown timelines', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(traceFile, [
    JSON.stringify({
      schemaVersion: 'gg.task-trace.v1',
      id: 'event-1',
      timestamp: '2026-05-19T00:00:00.000Z',
      event: 'user_prompt',
      session_id: 'session-report',
      task_id: 'task-1',
      input_summary: 'Implement task trace',
      signals: ['skill:task-trace'],
      file_paths: [],
      file_events: [],
    }),
    JSON.stringify({
      schemaVersion: 'gg.task-trace.v1',
      id: 'event-2',
      timestamp: '2026-05-19T00:00:01.000Z',
      event: 'tool_complete',
      session_id: 'session-report',
      task_id: 'task-1',
      tool_name: 'Write',
      input_summary: 'Write plugins/gg/scripts/hooks/task-trace.js',
      output_summary: 'ok',
      file_paths: ['plugins/gg/scripts/hooks/task-trace.js'],
      file_events: [{ path: 'plugins/gg/scripts/hooks/task-trace.js', action: 'create' }],
      signals: [],
    }),
  ].join('\n') + '\n', 'utf8');

  try {
    const summary = runInspect(['summary', '--trace-file', traceFile, '--format', 'json'], { HOME: home });
    assert.equal(summary.status, 0, summary.stderr);
    const parsed = JSON.parse(summary.stdout);
    assert.equal(parsed.schemaVersion, 'gg.task-trace.summary.v1');
    assert.equal(parsed.totalEvents, 2);
    assert.equal(parsed.sessions[0].session_id, 'session-report');
    assert.equal(parsed.sessions[0].toolCalls, 1);
    assert.deepEqual(parsed.sessions[0].signals, ['skill:task-trace']);

    const timeline = runInspect([
      'timeline',
      '--trace-file',
      traceFile,
      '--session',
      'session-report',
      '--format',
      'markdown',
    ], { HOME: home });
    assert.equal(timeline.status, 0, timeline.stderr);
    assert.match(timeline.stdout, /# Task Trace Timeline/);
    assert.match(timeline.stdout, /\| 2 \| 2026-05-19T00:00:01.000Z \| tool_complete \| Write \|/);
    assert.match(timeline.stdout, /plugins\/gg\/scripts\/hooks\/task-trace\.js/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('task-trace plugin surface is registered for skills, hooks, commands, and install modules', () => {
  const skillPath = path.join(pluginRoot, 'skills', 'task-trace', 'SKILL.md');
  const hooksPath = path.join(pluginRoot, 'skills', 'task-trace', 'hooks', 'hooks.json');
  const commandPath = path.join(pluginRoot, 'commands', 'task-trace.md');
  const agentYaml = fs.readFileSync(path.join(pluginRoot, 'agent.yaml'), 'utf8');
  const modulesJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifests', 'install-modules.json'), 'utf8'));

  assert.equal(fs.existsSync(skillPath), true, 'task-trace skill should exist');
  assert.equal(fs.existsSync(commandPath), true, 'task-trace command should exist');
  assert.match(agentYaml, /- task-trace/);

  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8')).hooks;
  const ids = new Set(Object.values(hooks).flat().map(entry => entry.id));
  assert.ok(ids.has('prompt:task-trace:record'));
  assert.ok(ids.has('post:task-trace:record'));
  assert.ok(ids.has('failure:task-trace:record'));

  const observability = modulesJson.modules.find(module => module.id === 'skills-observability');
  assert.ok(observability.paths.includes('plugins/gg/skills/task-trace'));
});

test('installed task-trace skill hook is discoverable by the GG dispatcher', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');

  try {
    const plan = resolveInstallPlan({
      repoRoot,
      homeDir: home,
      moduleIds: ['hooks-runtime', 'commands-core', 'skills-observability'],
    });
    applyInstallPlan(plan);

    const installedPluginRoot = path.join(home, '.claude', 'plugins', 'gg');
    const dispatcher = path.join(installedPluginRoot, 'scripts', 'hooks', 'skill-hook-dispatcher.js');
    const input = {
      session_id: 'installed-session',
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
      tool_output: 'ok',
    };
    const result = spawnSync(process.execPath, [dispatcher, 'PostToolUse'], {
      cwd: repoRoot,
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_PLUGIN_ROOT: installedPluginRoot,
        GG_PLUGIN_ROOT: installedPluginRoot,
        GG_TASK_TRACE_DIR: traceDir,
        GG_HOOK_PROFILE: 'standard',
      },
      timeout: 15000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), input);
    const [record] = readJsonl(traceFile);
    assert.equal(record.schemaVersion, 'gg.task-trace.v1');
    assert.equal(record.session_id, 'installed-session');
    assert.equal(record.event, 'tool_complete');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('installed task-trace records Stop events as session_end boundaries', () => {
  const home = makeTempHome();
  const traceDir = path.join(home, 'trace-dir');
  const traceFile = path.join(traceDir, 'gg-task-trace.jsonl');

  try {
    const plan = resolveInstallPlan({
      repoRoot,
      homeDir: home,
      moduleIds: ['hooks-runtime', 'commands-core', 'skills-observability'],
    });
    applyInstallPlan(plan);

    const installedPluginRoot = path.join(home, '.claude', 'plugins', 'gg');
    const dispatcher = path.join(installedPluginRoot, 'scripts', 'hooks', 'skill-hook-dispatcher.js');
    const input = {
      session_id: 'installed-stop-session',
      cwd: repoRoot,
    };
    const result = spawnSync(process.execPath, [dispatcher, 'Stop'], {
      cwd: repoRoot,
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        CLAUDE_PLUGIN_ROOT: installedPluginRoot,
        GG_PLUGIN_ROOT: installedPluginRoot,
        GG_TASK_TRACE_DIR: traceDir,
        GG_HOOK_PROFILE: 'standard',
      },
      timeout: 15000,
    });

    assert.equal(result.status, 0, result.stderr);
    const [record] = readJsonl(traceFile);
    assert.equal(record.schemaVersion, 'gg.task-trace.v1');
    assert.equal(record.session_id, 'installed-stop-session');
    assert.equal(record.event, 'session_end');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

