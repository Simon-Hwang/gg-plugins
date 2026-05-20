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

test('Claude plugin manifest opts out of bundled MCP auto-loading', () => {
  const plugin = readJson('plugins/gg/plugin.json');

  assert.deepEqual(
    plugin.mcpServers,
    {},
    'Claude plugin installs should not auto-enable bundled MCP servers',
  );
});

test('MCP template includes Context7 for documentation lookup', () => {
  const mcpConfig = readJson('plugins/gg/mcp-configs/mcp-servers.json');

  assert.ok(mcpConfig.mcpServers, 'MCP template should include mcpServers');
  assert.deepEqual(
    mcpConfig.mcpServers.context7,
    {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp@2.2.5'],
      description: 'Live public documentation lookup for docs-lookup and documentation-lookup.',
    },
  );
});
