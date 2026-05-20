#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'plugins', 'gg', 'scripts', 'harness-audit.js');

function runAudit(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('buildReport audits the GG plugin surface', () => {
  const { buildReport } = require(scriptPath);
  const report = buildReport('repo', { rootDir: repoRoot });

  assert.equal(report.scope, 'repo');
  assert.equal(report.target_mode, 'gg-plugin');
  assert.equal(report.deterministic, true);
  assert.equal(report.categories['Tool Coverage'].score, 10);
  assert.ok(report.checks.some(check => check.id === 'tool-command-registered'));
  assert.ok(report.max_score > 0);
  assert.ok(report.overall_score <= report.max_score);
});

test('CLI prints text report by default', () => {
  const result = runAudit();

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GG Harness Audit \(repo, gg-plugin\): \d+\/\d+/);
  assert.match(result.stdout, /Top 3 Actions:|Checks: \d+ total, 0 failing/);
});

test('CLI emits stable JSON report', () => {
  const result = runAudit(['--format', 'json']);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.rubric_version, 'gg-2026-05-18');
  assert.equal(report.scope, 'repo');
  assert.ok(Array.isArray(report.checks));
  assert.ok(Array.isArray(report.top_actions));
});

test('CLI supports scoped audits', () => {
  const result = runAudit(['commands', '--format=json']);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope, 'commands');
  assert.ok(report.checks.length > 0);
  assert.ok(report.checks.every(check => check.scopes.includes('commands')));
});

test('CLI rejects invalid scope and format', () => {
  const badScope = runAudit(['unknown']);
  assert.notEqual(badScope.status, 0);
  assert.match(badScope.stderr, /Invalid scope/);

  const badFormat = runAudit(['--format', 'xml']);
  assert.notEqual(badFormat.status, 0);
  assert.match(badFormat.stderr, /Invalid format/);
});
