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
const script = path.join(pluginRoot, 'scripts', 'doctor.js');

const { buildReport, parseArgs } = require(script);

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gg-doctor-'));
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runScript(args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10000,
  });
}

// --- Unit: parseArgs ---

test('parseArgs defaults to text format and empty component list', () => {
  const args = parseArgs(['node', 'script.js']);
  assert.strictEqual(args.format, 'text');
  assert.deepStrictEqual(args.components, []);
});

test('parseArgs --component accumulates values', () => {
  const args = parseArgs(['node', 'script.js', '--component', 'hooks-runtime', '--component', 'commands-core']);
  assert.deepStrictEqual(args.components, ['hooks-runtime', 'commands-core']);
});

test('parseArgs --format json', () => {
  const args = parseArgs(['node', 'script.js', '--format', 'json']);
  assert.strictEqual(args.format, 'json');
});

test('parseArgs --help sets help flag', () => {
  const args = parseArgs(['node', 'script.js', '--help']);
  assert.ok(args.help);
});

test('parseArgs throws on unknown argument', () => {
  assert.throws(() => parseArgs(['node', 'script.js', '--bad']), /Unknown argument/);
});

// --- Unit: buildReport on real plugin root ---

test('buildReport schema_version is set', () => {
  const report = buildReport(pluginRoot);
  assert.strictEqual(report.schema_version, 'gg.doctor.v1');
});

test('buildReport summary has correct shape', () => {
  const report = buildReport(pluginRoot);
  assert.ok(typeof report.summary.checkedCount === 'number');
  assert.ok(typeof report.summary.okCount === 'number');
  assert.ok(typeof report.summary.warningCount === 'number');
  assert.ok(typeof report.summary.errorCount === 'number');
  assert.strictEqual(
    report.summary.okCount + report.summary.warningCount + report.summary.errorCount,
    report.summary.checkedCount
  );
});

test('buildReport all core components pass on real plugin root', () => {
  const report = buildReport(pluginRoot, ['hooks-runtime', 'commands-core', 'skills-workflow', 'agents-core']);
  const errors = report.results.filter(r => r.status === 'error');
  assert.deepStrictEqual(errors, [], `error components: ${errors.map(r => r.component).join(', ')}`);
});

test('buildReport result entries have component, status, issues', () => {
  const report = buildReport(pluginRoot);
  for (const result of report.results) {
    assert.ok(result.component, 'missing component');
    assert.ok(['ok', 'warning', 'error'].includes(result.status), `invalid status: ${result.status}`);
    assert.ok(Array.isArray(result.issues), 'issues should be array');
  }
});

test('buildReport single component filter', () => {
  const report = buildReport(pluginRoot, ['hooks-runtime']);
  assert.strictEqual(report.results.length, 1);
  assert.strictEqual(report.results[0].component, 'hooks-runtime');
});

test('buildReport errors on missing required files', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir, ['hooks-runtime']);
  assert.strictEqual(report.results[0].status, 'error');
  assert.ok(report.results[0].issues.some(i => i.severity === 'error'));
  cleanupTempDir(tmpDir);
});

test('buildReport issue entries have code, message, severity', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir, ['hooks-runtime']);
  for (const issue of report.results[0].issues) {
    assert.ok(issue.code, 'issue missing code');
    assert.ok(issue.message, 'issue missing message');
    assert.ok(['error', 'warning'].includes(issue.severity), `invalid severity: ${issue.severity}`);
  }
  cleanupTempDir(tmpDir);
});

test('buildReport detects invalid hooks.json', () => {
  const tmpDir = makeTempDir();
  fs.mkdirSync(path.join(tmpDir, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'hooks', 'hooks.json'), 'not-json{{{');

  const report = buildReport(tmpDir, ['hooks-runtime']);
  const jsonIssue = report.results[0].issues.find(i => i.code === 'invalid-json');
  assert.ok(jsonIssue, 'should detect invalid JSON');
  assert.strictEqual(jsonIssue.severity, 'error');
  cleanupTempDir(tmpDir);
});

test('buildReport skills-observability issues are warnings not errors', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir, ['skills-observability']);
  for (const issue of report.results[0].issues) {
    assert.strictEqual(issue.severity, 'warning', `skills-observability issues should be warnings: ${issue.code}`);
  }
  cleanupTempDir(tmpDir);
});

// --- Integration: CLI ---

test('script --help exits 0 and prints usage', () => {
  const result = runScript(['--help']);
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
  assert.ok(result.stdout.includes('--component'));
});

test('script exits 0 on healthy plugin root', () => {
  const result = runScript([], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.strictEqual(result.status, 0, `unexpected exit 1: ${result.stdout}${result.stderr}`);
});

test('script exits 1 when errors or warnings found', () => {
  const tmpDir = makeTempDir();
  const result = runScript(['--root', tmpDir, '--component', 'hooks-runtime']);
  assert.strictEqual(result.status, 1, 'empty dir should exit 1');
  assert.ok(result.stdout.includes('ERROR') || result.stdout.includes('WARNING'));
  cleanupTempDir(tmpDir);
});

test('script json format outputs valid JSON', () => {
  const result = runScript(['--format', 'json'], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.schema_version, 'gg.doctor.v1');
  assert.ok(Array.isArray(parsed.results));
});

test('script --component filter restricts output', () => {
  const result = runScript(['--component', 'hooks-runtime', '--format', 'json'], {
    CLAUDE_PLUGIN_ROOT: pluginRoot
  });
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.results.length, 1);
  assert.strictEqual(parsed.results[0].component, 'hooks-runtime');
});

test('script text output includes Summary line', () => {
  const result = runScript([], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.ok(result.stdout.includes('Summary:'), 'should include Summary');
  assert.ok(result.stdout.includes('checked='), 'should include checked count');
});

test('script root_dir in json output', () => {
  const result = runScript(['--format', 'json'], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.root_dir, 'root_dir should be set in JSON output');
});
