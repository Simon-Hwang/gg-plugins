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
const script = path.join(pluginRoot, 'scripts', 'observability-readiness.js');

const { buildChecks, buildReport, parseArgs, renderText } = require(script);

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gg-obs-ready-'));
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

test('parseArgs defaults to text format and auto-root', () => {
  const args = parseArgs(['node', 'script.js']);
  assert.strictEqual(args.format, 'text');
  assert.ok(args.root, 'root should be set');
});

test('parseArgs --format json sets json', () => {
  const args = parseArgs(['node', 'script.js', '--format', 'json']);
  assert.strictEqual(args.format, 'json');
});

test('parseArgs --format=json with equals syntax', () => {
  const args = parseArgs(['node', 'script.js', '--format=json']);
  assert.strictEqual(args.format, 'json');
});

test('parseArgs --help sets help flag', () => {
  const args = parseArgs(['node', 'script.js', '--help']);
  assert.ok(args.help);
});

test('parseArgs throws on unknown argument', () => {
  assert.throws(() => parseArgs(['node', 'script.js', '--unknown']), /Unknown argument/);
});

test('parseArgs throws on invalid format', () => {
  assert.throws(() => parseArgs(['node', 'script.js', '--format', 'xml']), /Invalid format/);
});

// --- Unit: buildChecks against real plugin root ---

test('buildChecks returns 7 checks', () => {
  const checks = buildChecks(pluginRoot);
  assert.strictEqual(checks.length, 7);
});

test('buildChecks all checks have required fields', () => {
  const checks = buildChecks(pluginRoot);
  for (const check of checks) {
    assert.ok(check.id, `check missing id: ${JSON.stringify(check)}`);
    assert.ok(check.category, `check ${check.id} missing category`);
    assert.ok(typeof check.points === 'number', `check ${check.id} points not a number`);
    assert.ok(check.path, `check ${check.id} missing path`);
    assert.ok(typeof check.pass === 'boolean', `check ${check.id} pass not boolean`);
    assert.ok(check.fix, `check ${check.id} missing fix`);
  }
});

test('buildChecks passes on the real plugin root', () => {
  const checks = buildChecks(pluginRoot);
  const failing = checks.filter(c => !c.pass);
  assert.deepStrictEqual(failing, [], `failing checks: ${failing.map(c => c.id).join(', ')}`);
});

// --- Unit: buildReport ---

test('buildReport schema and structure', () => {
  const report = buildReport(pluginRoot);
  assert.strictEqual(report.schema_version, 'gg.observability-readiness.v1');
  assert.ok(typeof report.overall_score === 'number');
  assert.ok(typeof report.max_score === 'number');
  assert.ok(typeof report.ready === 'boolean');
  assert.ok(Array.isArray(report.checks));
  assert.ok(Array.isArray(report.top_actions));
  assert.ok(typeof report.categories === 'object');
});

test('buildReport is ready on real plugin root', () => {
  const report = buildReport(pluginRoot);
  assert.ok(report.ready, `not ready, top_actions: ${JSON.stringify(report.top_actions)}`);
  assert.strictEqual(report.overall_score, report.max_score);
});

test('buildReport returns not-ready when files are missing', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir);
  assert.ok(!report.ready);
  assert.ok(report.overall_score < report.max_score);
  assert.ok(report.top_actions.length > 0);
  cleanupTempDir(tmpDir);
});

test('buildReport top_actions sorted by points descending', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir);
  for (let i = 1; i < report.top_actions.length; i++) {
    const prevCheck = report.checks.find(c => c.id === report.top_actions[i - 1].id);
    const currCheck = report.checks.find(c => c.id === report.top_actions[i].id);
    if (prevCheck && currCheck) {
      assert.ok(prevCheck.points >= currCheck.points, 'top_actions should be sorted by points desc');
    }
  }
  cleanupTempDir(tmpDir);
});

// --- Unit: renderText ---

test('renderText includes score and ready status', () => {
  const report = buildReport(pluginRoot);
  const text = renderText(report);
  assert.ok(text.includes('Readiness:'), 'should include Readiness label');
  assert.ok(text.includes('Ready:'), 'should include Ready label');
  assert.ok(text.includes('PASS') || text.includes('FAIL'), 'should include check results');
});

test('renderText shows top actions when failing', () => {
  const tmpDir = makeTempDir();
  const report = buildReport(tmpDir);
  const text = renderText(report);
  assert.ok(text.includes('Top Actions:'), 'should show top actions for failing report');
  cleanupTempDir(tmpDir);
});

// --- Integration: script CLI ---

test('script --help exits 0 and prints usage', () => {
  const result = runScript(['--help']);
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
});

test('script text format exits 0 on real plugin root', () => {
  const result = runScript([], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('Readiness:'));
  assert.ok(result.stdout.includes('Ready: yes'));
});

test('script json format outputs valid JSON', () => {
  const result = runScript(['--format', 'json'], { CLAUDE_PLUGIN_ROOT: pluginRoot });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.schema_version, 'gg.observability-readiness.v1');
  assert.ok(typeof parsed.ready === 'boolean');
});

test('script exits 0 even when not ready (readiness is informational, not blocking)', () => {
  const tmpDir = makeTempDir();
  const result = runScript(['--root', tmpDir]);
  // observability-ready is a gate tool — it exits 0 regardless, Claude decides what to do
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('Ready: no'));
  cleanupTempDir(tmpDir);
});

test('script --root overrides auto-detection', () => {
  const tmpDir = makeTempDir();
  const result = runScript(['--root', tmpDir, '--format', 'json']);
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(!parsed.ready, 'empty dir should not be ready');
  cleanupTempDir(tmpDir);
});
