#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

test('full profile includes every install module', () => {
  const modules = readJson('manifests/install-modules.json').modules.map(module => module.id).sort();
  const full = readJson('manifests/install-profiles.json').profiles.full.modules.slice().sort();

  assert.deepEqual(full, modules);
});

test('RAG capability component exposes the RAG module', () => {
  const components = readJson('manifests/install-components.json').components;
  const rag = components.find(component => component.id === 'capability:rag');

  assert.ok(rag, 'capability:rag component should exist');
  assert.deepEqual(rag.modules, ['skills-rag']);
});
