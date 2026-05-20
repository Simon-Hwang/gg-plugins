#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

test('catalog does not expose FastAPI or Django capabilities', () => {
  const installComponents = read('manifests/install-components.json');
  const installModules = read('manifests/install-modules.json');
  const installProfiles = read('manifests/install-profiles.json');
  const agentYaml = read('plugins/gg/agent.yaml');

  for (const text of [installComponents, installModules, installProfiles, agentYaml]) {
    assert.doesNotMatch(text, /fastapi|django|FastAPI|Django|DRF|skills-fastapi|skills-django/);
  }

  const modules = readJson('manifests/install-modules.json').modules;
  assert.equal(modules.some(module => module.id === 'skills-fastapi'), false);
  assert.equal(modules.some(module => module.id === 'skills-django'), false);

  const components = readJson('manifests/install-components.json').components;
  assert.equal(components.some(component => component.id === 'framework:fastapi'), false);
  assert.equal(components.some(component => component.id === 'framework:django'), false);
});

test('FastAPI and Django implementation files are removed', () => {
  const removedPaths = [
    'plugins/gg/skills/fastapi-patterns',
    'plugins/gg/skills/django-patterns',
    'plugins/gg/skills/django-security',
    'plugins/gg/skills/django-tdd',
    'plugins/gg/skills/django-verification',
    'plugins/gg/agents/fastapi-reviewer.md',
    'plugins/gg/commands/fastapi-review.md',
    'plugins/gg/rules/python/fastapi.md',
  ];

  for (const relativePath of removedPaths) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), false, relativePath);
  }
});
