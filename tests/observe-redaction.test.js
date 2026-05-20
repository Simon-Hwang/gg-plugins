#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');
const observeHook = path.join(repoRoot, 'plugins/gg/skills/continuous-learning-v2/hooks/observe.sh');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readObservationText(homunculusDir) {
  const projectsDir = path.join(homunculusDir, 'projects');
  const projectIds = fs.readdirSync(projectsDir);
  assert.equal(projectIds.length, 1, 'expected one project observation directory');

  const observationPath = path.join(projectsDir, projectIds[0], 'observations.jsonl');
  return fs.readFileSync(observationPath, 'utf8');
}

test('continuous-learning observation redacts common standalone secret formats', () => {
  const homunculusDir = makeTempDir('gg-observe-home-');
  const projectDir = makeTempDir('gg-observe-project-');
  const payload = {
    cwd: projectDir,
    session_id: 'redaction-test-session',
    tool_name: 'Read',
    tool_response: [
      'github_pat_11AAABBBBCCCCDDDD111122223333444455556666',
      'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
      'xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx',
      'AKIAIOSFODNN7EXAMPLE',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      '-----BEGIN OPENSSH PRIVATE KEY----- abcdef -----END OPENSSH PRIVATE KEY-----',
    ].join('\n'),
  };

  const result = spawnSync('bash', [observeHook, 'post'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLV2_HOMUNCULUS_DIR: homunculusDir,
      CLV2_CONFIG: path.join(repoRoot, 'plugins/gg/skills/continuous-learning-v2/config.json'),
      CLAUDE_CODE_ENTRYPOINT: 'cli',
    },
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const observationText = readObservationText(homunculusDir);

  assert.doesNotMatch(observationText, /github_pat_11AAABBBB/);
  assert.doesNotMatch(observationText, /sk-ant-api03-/);
  assert.doesNotMatch(observationText, /xoxb-123456789012/);
  assert.doesNotMatch(observationText, /AKIAIOSFODNN7EXAMPLE/);
  assert.doesNotMatch(observationText, /eyJhbGciOiJIUzI1NiJ9/);
  assert.doesNotMatch(observationText, /BEGIN OPENSSH PRIVATE KEY/);
  assert.match(observationText, /\[REDACTED\]/);
});
