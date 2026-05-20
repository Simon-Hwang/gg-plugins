#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CATEGORIES = [
  'Tool Coverage',
  'Context Efficiency',
  'Quality Gates',
  'Memory Persistence',
  'Eval Coverage',
  'Security Guardrails',
  'Cost Efficiency',
];

const RUBRIC_VERSION = 'gg-2026-05-18';
const VALID_SCOPES = ['repo', 'hooks', 'skills', 'commands', 'agents'];
const VALID_FORMATS = ['text', 'json'];

function normalizeScope(scope) {
  const value = String(scope || 'repo').toLowerCase();
  if (!VALID_SCOPES.includes(value)) {
    throw new Error(`Invalid scope: ${scope}. Use ${VALID_SCOPES.join(', ')}.`);
  }
  return value;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    scope: 'repo',
    format: 'text',
    help: false,
    root: path.resolve(process.env.AUDIT_ROOT || process.cwd()),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--format') {
      parsed.format = String(args[index + 1] || '').toLowerCase();
      index += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length).toLowerCase();
      continue;
    }

    if (arg === '--scope') {
      parsed.scope = normalizeScope(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--scope=')) {
      parsed.scope = normalizeScope(arg.slice('--scope='.length));
      continue;
    }

    if (arg === '--root') {
      parsed.root = path.resolve(args[index + 1] || process.cwd());
      index += 1;
      continue;
    }

    if (arg.startsWith('--root=')) {
      parsed.root = path.resolve(arg.slice('--root='.length));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    parsed.scope = normalizeScope(arg);
  }

  if (!VALID_FORMATS.includes(parsed.format)) {
    throw new Error(`Invalid format: ${parsed.format}. Use text or json.`);
  }

  return parsed;
}

function fileExists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function safeRead(rootDir, relativePath) {
  try {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  } catch (_error) {
    return '';
  }
}

function safeParseJson(text) {
  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function countFiles(rootDir, relativeDir, extension) {
  const dirPath = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const stack = [dirPath];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (!extension || entry.name.endsWith(extension)) {
        count += 1;
      }
    }
  }
  return count;
}

function hasFileWithExtension(rootDir, relativeDir, extensions) {
  const dirPath = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  const allowed = Array.isArray(extensions) ? extensions : [extensions];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git'].includes(entry.name)) {
          stack.push(nextPath);
        }
        continue;
      }
      if (allowed.some(extension => entry.name.endsWith(extension))) {
        return true;
      }
    }
  }
  return false;
}

function yamlListContains(text, sectionName, value) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (/^\S/.test(line) && line.endsWith(':')) {
      inSection = line.replace(':', '').trim() === sectionName;
      continue;
    }
    if (inSection && line.trim() === `- ${value}`) {
      return true;
    }
  }
  return false;
}

function readJsonFile(rootDir, relativePath) {
  return safeParseJson(safeRead(rootDir, relativePath));
}

function detectTargetMode(rootDir) {
  const packageJson = readJsonFile(rootDir, 'package.json');
  if (
    packageJson?.name === 'gg-plugins' &&
    fileExists(rootDir, 'plugins/gg/plugin.json') &&
    fileExists(rootDir, 'plugins/gg/agent.yaml')
  ) {
    return 'gg-plugin';
  }

  if (
    fileExists(rootDir, 'plugin.json') &&
    fileExists(rootDir, 'agent.yaml') &&
    fileExists(rootDir, 'commands') &&
    fileExists(rootDir, 'skills')
  ) {
    return 'gg-plugin';
  }

  return 'consumer-project';
}

const GG_PLUGIN_KEY_PATTERNS = [
  /^gg@/i,
  /^gg-marketplace@/i,
  /^gg-plugins@/i,
];

const GG_PLUGIN_DIRS = [
  'gg',
  'gg@gg',
  'gg-marketplace',
  'gg@gg-marketplace',
  'gg-plugins',
];

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function findPluginJsonUnder(installRoot) {
  const pluginJson = path.join(installRoot, 'plugin.json');
  if (fs.existsSync(pluginJson)) {
    return pluginJson;
  }

  const claudePluginJson = path.join(installRoot, '.claude-plugin', 'plugin.json');
  return fs.existsSync(claudePluginJson) ? claudePluginJson : null;
}

function findPluginInstallFromManifest(installedPluginsPaths) {
  for (const installedPath of installedPluginsPaths) {
    if (!fs.existsSync(installedPath)) {
      continue;
    }

    const manifest = safeParseJson(fs.readFileSync(installedPath, 'utf8'));
    if (!manifest?.plugins) {
      continue;
    }

    for (const [key, value] of Object.entries(manifest.plugins)) {
      if (!GG_PLUGIN_KEY_PATTERNS.some(pattern => pattern.test(key))) {
        continue;
      }

      const entries = Array.isArray(value) ? value : [];
      for (const entry of entries) {
        if (!entry?.installPath) {
          continue;
        }

        const installRoot = path.isAbsolute(entry.installPath)
          ? entry.installPath
          : path.resolve(path.dirname(installedPath), entry.installPath);
        const hit = findPluginJsonUnder(installRoot);
        if (hit) {
          return hit;
        }
      }
    }
  }

  return null;
}

function findPluginInstall(rootDir) {
  const homeDirs = uniquePaths([process.env.HOME, process.env.USERPROFILE, os.homedir()]);
  const pluginRoots = uniquePaths([
    path.join(rootDir, '.claude', 'plugins'),
    ...homeDirs.map(homeDir => path.join(homeDir, '.claude', 'plugins')),
  ]);
  const installedPluginsPaths = uniquePaths([
    path.join(rootDir, '.claude', 'plugins', 'installed_plugins.json'),
    ...homeDirs.map(homeDir => path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')),
  ]);

  const manifestHit = findPluginInstallFromManifest(installedPluginsPaths);
  if (manifestHit) {
    return manifestHit;
  }

  for (const pluginsDir of pluginRoots) {
    for (const pluginDir of GG_PLUGIN_DIRS) {
      const hit = findPluginJsonUnder(path.join(pluginsDir, pluginDir));
      if (hit) {
        return hit;
      }
    }
  }

  return null;
}

function getPluginRoot(rootDir) {
  return fileExists(rootDir, 'plugins/gg/plugin.json') ? 'plugins/gg' : '.';
}

function pluginPath(rootDir, relativePath) {
  return path.posix.join(getPluginRoot(rootDir), relativePath);
}

function getRepoChecks(rootDir) {
  const pluginJson = readJsonFile(rootDir, pluginPath(rootDir, 'plugin.json')) || {};
  const packageJson = readJsonFile(rootDir, 'package.json') || {};
  const agentYaml = safeRead(rootDir, pluginPath(rootDir, 'agent.yaml'));
  const commandsRef = safeRead(rootDir, pluginPath(rootDir, 'gg-commands-reference.md'));
  const readme = safeRead(rootDir, pluginPath(rootDir, 'README.md'));
  const hooksJson = safeRead(rootDir, pluginPath(rootDir, 'hooks/hooks.json'));
  const modulesManifest = safeRead(rootDir, 'manifests/install-modules.json');
  const componentsManifest = safeRead(rootDir, 'manifests/install-components.json');

  return [
    {
      id: 'tool-plugin-manifest',
      category: 'Tool Coverage',
      points: 2,
      scopes: ['repo'],
      path: pluginPath(rootDir, 'plugin.json'),
      description: 'GG plugin manifest declares command and skill surfaces',
      pass: Array.isArray(pluginJson.commands) && Array.isArray(pluginJson.skills),
      fix: 'Restore plugins/gg/plugin.json with commands and skills arrays.',
    },
    {
      id: 'tool-command-count',
      category: 'Tool Coverage',
      points: 2,
      scopes: ['repo', 'commands'],
      path: pluginPath(rootDir, 'commands/'),
      description: 'At least 25 GG slash commands exist',
      pass: countFiles(rootDir, pluginPath(rootDir, 'commands'), '.md') >= 25,
      fix: 'Restore missing GG command prompts under plugins/gg/commands/.',
    },
    {
      id: 'tool-command-registered',
      category: 'Tool Coverage',
      points: 2,
      scopes: ['repo', 'commands'],
      path: pluginPath(rootDir, 'agent.yaml'),
      description: 'harness-audit command exists and is registered',
      pass: fileExists(rootDir, pluginPath(rootDir, 'commands/harness-audit.md')) &&
        yamlListContains(agentYaml, 'commands', 'harness-audit'),
      fix: 'Add commands/harness-audit.md and register harness-audit in agent.yaml.',
    },
    {
      id: 'tool-audit-engine',
      category: 'Tool Coverage',
      points: 2,
      scopes: ['repo', 'commands'],
      path: pluginPath(rootDir, 'scripts/harness-audit.js'),
      description: 'Deterministic harness audit engine exists',
      pass: fileExists(rootDir, pluginPath(rootDir, 'scripts/harness-audit.js')),
      fix: 'Add plugins/gg/scripts/harness-audit.js as the source of truth for /gg:harness-audit.',
    },
    {
      id: 'tool-agent-skill-depth',
      category: 'Tool Coverage',
      points: 2,
      scopes: ['repo', 'agents', 'skills'],
      path: pluginPath(rootDir, 'agents/'),
      description: 'GG carries a broad baseline of agents and skills',
      pass: countFiles(rootDir, pluginPath(rootDir, 'agents'), '.md') >= 20 &&
        countFiles(rootDir, pluginPath(rootDir, 'skills'), 'SKILL.md') >= 40,
      fix: 'Restore baseline agents and skills under plugins/gg/.',
    },
    {
      id: 'context-guide-surface',
      category: 'Context Efficiency',
      points: 3,
      scopes: ['repo', 'commands', 'skills'],
      path: pluginPath(rootDir, 'skills/gg-guide/SKILL.md'),
      description: 'Guide surfaces exist for command and skill discovery',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/gg-guide/SKILL.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'commands/gg-guide.md')),
      fix: 'Restore gg-guide skill and command for live plugin navigation.',
    },
    {
      id: 'context-repo-instructions',
      category: 'Context Efficiency',
      points: 3,
      scopes: ['repo'],
      path: pluginPath(rootDir, 'CLAUDE.md'),
      description: 'Plugin-local CLAUDE.md and AGENTS.md instructions exist',
      pass: fileExists(rootDir, pluginPath(rootDir, 'CLAUDE.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'AGENTS.md')),
      fix: 'Add plugin-local CLAUDE.md and AGENTS.md for contributor guidance.',
    },
    {
      id: 'context-budget-skill',
      category: 'Context Efficiency',
      points: 2,
      scopes: ['repo', 'skills'],
      path: pluginPath(rootDir, 'skills/context-budget/SKILL.md'),
      description: 'Context budget audit skill exists',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/context-budget/SKILL.md')),
      fix: 'Restore context-budget skill for token-overhead audits.',
    },
    {
      id: 'context-command-doc',
      category: 'Context Efficiency',
      points: 2,
      scopes: ['repo', 'commands'],
      path: pluginPath(rootDir, 'gg-commands-reference.md'),
      description: 'Command reference documents harness-audit',
      pass: commandsRef.includes('/gg:harness-audit'),
      fix: 'Document /gg:harness-audit in gg-commands-reference.md.',
    },
    {
      id: 'quality-audit-tests',
      category: 'Quality Gates',
      points: 3,
      scopes: ['repo'],
      path: 'tests/harness-audit.test.js',
      description: 'Harness audit behavior has tests',
      pass: fileExists(rootDir, 'tests/harness-audit.test.js'),
      fix: 'Add tests/harness-audit.test.js covering text, JSON, scope, and errors.',
    },
    {
      id: 'quality-node-runtime',
      category: 'Quality Gates',
      points: 2,
      scopes: ['repo'],
      path: 'package.json',
      description: 'Package declares a supported Node runtime',
      pass: String(packageJson.engines?.node || '').includes('>=18'),
      fix: 'Declare engines.node >=18 in package.json.',
    },
    {
      id: 'quality-verification-loop',
      category: 'Quality Gates',
      points: 3,
      scopes: ['repo', 'skills', 'commands'],
      path: pluginPath(rootDir, 'skills/verification-loop/SKILL.md'),
      description: 'Verification skill and quality gate command exist',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/verification-loop/SKILL.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'commands/quality-gate.md')),
      fix: 'Restore verification-loop skill and quality-gate command.',
    },
    {
      id: 'quality-test-script',
      category: 'Quality Gates',
      points: 2,
      scopes: ['repo'],
      path: 'package.json',
      description: 'Package test script runs checked-in node tests',
      pass: typeof packageJson.scripts?.test === 'string' &&
        packageJson.scripts.test.includes('node --test') &&
        packageJson.scripts.test.includes('tests/*.test.js'),
      fix: 'Add a package.json test script that runs node --test tests/*.test.js.',
    },
    {
      id: 'quality-default-hook',
      category: 'Quality Gates',
      points: 2,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'Post-edit quality gate hook is registered and packaged',
      pass: hooksJson.includes('post:quality-gate') &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/quality-gate.js')),
      fix: 'Restore the post:quality-gate default hook and script.',
    },
    {
      id: 'memory-learning-skill',
      category: 'Memory Persistence',
      points: 4,
      scopes: ['repo', 'skills'],
      path: pluginPath(rootDir, 'skills/continuous-learning-v2/SKILL.md'),
      description: 'Continuous learning skill exists for durable observations',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/continuous-learning-v2/SKILL.md')),
      fix: 'Restore continuous-learning-v2 skill.',
    },
    {
      id: 'memory-hook-dispatcher',
      category: 'Memory Persistence',
      points: 3,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'Hook dispatcher and hook config exist',
      pass: fileExists(rootDir, pluginPath(rootDir, 'hooks/hooks.json')) &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/skill-hook-dispatcher.js')),
      fix: 'Restore hooks/hooks.json and scripts/hooks/skill-hook-dispatcher.js.',
    },
    {
      id: 'memory-hook-events',
      category: 'Memory Persistence',
      points: 3,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'Hook config includes lifecycle events',
      pass: hooksJson.includes('SessionStart') && hooksJson.includes('SessionEnd'),
      fix: 'Add SessionStart and SessionEnd hook dispatch entries.',
    },
    {
      id: 'memory-default-compact-hooks',
      category: 'Memory Persistence',
      points: 2,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'Default compaction hooks are registered and packaged',
      pass: hooksJson.includes('pre:edit-write:suggest-compact') &&
        hooksJson.includes('pre:compact') &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/suggest-compact.js')) &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/pre-compact.js')),
      fix: 'Restore suggest-compact and PreCompact default hooks.',
    },
    {
      id: 'eval-skill',
      category: 'Eval Coverage',
      points: 3,
      scopes: ['repo', 'skills'],
      path: pluginPath(rootDir, 'skills/eval-harness/SKILL.md'),
      description: 'Eval harness skill exists',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/eval-harness/SKILL.md')),
      fix: 'Restore eval-harness skill for behavior quality gates.',
    },
    {
      id: 'eval-checkpoint',
      category: 'Eval Coverage',
      points: 3,
      scopes: ['repo', 'commands', 'skills'],
      path: pluginPath(rootDir, 'commands/checkpoint.md'),
      description: 'Checkpoint command pairs with verification-loop',
      pass: fileExists(rootDir, pluginPath(rootDir, 'commands/checkpoint.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'skills/verification-loop/SKILL.md')),
      fix: 'Restore checkpoint command and verification-loop skill.',
    },
    {
      id: 'eval-observability-module',
      category: 'Eval Coverage',
      points: 2,
      scopes: ['repo', 'skills'],
      path: 'manifests/install-modules.json',
      description: 'Optional observability/eval module is installable',
      pass: modulesManifest.includes('skills-observability') &&
        componentsManifest.includes('capability:observability'),
      fix: 'Expose skills-observability via install manifests.',
    },
    {
      id: 'eval-test-presence',
      category: 'Eval Coverage',
      points: 2,
      scopes: ['repo'],
      path: 'tests/',
      description: 'At least one checked-in test file exists',
      pass: countFiles(rootDir, 'tests', '.test.js') >= 1,
      fix: 'Add checked-in tests for deterministic plugin behavior.',
    },
    {
      id: 'security-scan-surface',
      category: 'Security Guardrails',
      points: 3,
      scopes: ['repo', 'commands', 'skills'],
      path: pluginPath(rootDir, 'commands/security-scan.md'),
      description: 'Security scan command and skill exist',
      pass: fileExists(rootDir, pluginPath(rootDir, 'commands/security-scan.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'skills/security-scan/SKILL.md')),
      fix: 'Restore security-scan command and skill.',
    },
    {
      id: 'security-reviewer',
      category: 'Security Guardrails',
      points: 3,
      scopes: ['repo', 'agents', 'skills'],
      path: pluginPath(rootDir, 'agents/security-reviewer.md'),
      description: 'Security reviewer agent and skill exist',
      pass: fileExists(rootDir, pluginPath(rootDir, 'agents/security-reviewer.md')) &&
        fileExists(rootDir, pluginPath(rootDir, 'skills/security-review/SKILL.md')),
      fix: 'Restore security-reviewer agent and security-review skill.',
    },
    {
      id: 'security-rules',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo'],
      path: pluginPath(rootDir, 'rules/common/security.md'),
      description: 'Common security rule pack exists',
      pass: fileExists(rootDir, pluginPath(rootDir, 'rules/common/security.md')),
      fix: 'Restore common security rules.',
    },
    {
      id: 'security-hook-guardrail',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'PreToolUse hook dispatch surface exists',
      pass: hooksJson.includes('PreToolUse'),
      fix: 'Add PreToolUse hook dispatch entry.',
    },
    {
      id: 'security-default-guard-hooks',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo', 'hooks'],
      path: pluginPath(rootDir, 'hooks/hooks.json'),
      description: 'Default config protection and GateGuard hooks are registered and packaged',
      pass: hooksJson.includes('pre:config-protection') &&
        hooksJson.includes('pre:edit-write:gateguard-fact-force') &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/config-protection.js')) &&
        fileExists(rootDir, pluginPath(rootDir, 'scripts/hooks/gateguard-fact-force.js')),
      fix: 'Restore config-protection and gateguard-fact-force default hooks.',
    },
    {
      id: 'cost-context-budget',
      category: 'Cost Efficiency',
      points: 4,
      scopes: ['repo', 'skills'],
      path: pluginPath(rootDir, 'skills/context-budget/SKILL.md'),
      description: 'Context budget skill supports token overhead audits',
      pass: fileExists(rootDir, pluginPath(rootDir, 'skills/context-budget/SKILL.md')),
      fix: 'Restore context-budget skill.',
    },
    {
      id: 'cost-performance-rule',
      category: 'Cost Efficiency',
      points: 3,
      scopes: ['repo'],
      path: pluginPath(rootDir, 'rules/common/performance.md'),
      description: 'Performance rules include efficiency guidance',
      pass: fileExists(rootDir, pluginPath(rootDir, 'rules/common/performance.md')),
      fix: 'Restore common performance rules.',
    },
    {
      id: 'cost-install-profiles',
      category: 'Cost Efficiency',
      points: 3,
      scopes: ['repo'],
      path: 'manifests/install-profiles.json',
      description: 'Install profiles support low-context installs',
      pass: safeRead(rootDir, 'manifests/install-profiles.json').includes('"minimal"') &&
        safeRead(rootDir, 'manifests/install-profiles.json').includes('"full"'),
      fix: 'Restore minimal and full install profiles.',
    },
  ];
}

function getConsumerChecks(rootDir) {
  const packageJson = readJsonFile(rootDir, 'package.json') || {};
  const gitignore = safeRead(rootDir, '.gitignore');
  const settings = safeRead(rootDir, '.claude/settings.json');
  const pluginInstall = findPluginInstall(rootDir);

  return [
    {
      id: 'consumer-plugin-install',
      category: 'Tool Coverage',
      points: 4,
      scopes: ['repo'],
      path: '~/.claude/plugins/gg',
      description: 'GG plugin is installed for the active user or project',
      pass: Boolean(pluginInstall),
      fix: 'Install the GG plugin before auditing project-specific harness quality.',
    },
    {
      id: 'consumer-project-overrides',
      category: 'Tool Coverage',
      points: 3,
      scopes: ['repo', 'hooks', 'skills', 'commands', 'agents'],
      path: '.claude/',
      description: 'Project-specific Claude/GG overrides exist when needed',
      pass: fileExists(rootDir, '.claude/settings.json') ||
        fileExists(rootDir, '.claude/hooks.json') ||
        countFiles(rootDir, '.claude/commands', '.md') > 0 ||
        countFiles(rootDir, '.claude/skills', 'SKILL.md') > 0 ||
        countFiles(rootDir, '.claude/agents', '.md') > 0,
      fix: 'Add project-local .claude configuration only where this repo needs overrides.',
    },
    {
      id: 'consumer-instructions',
      category: 'Context Efficiency',
      points: 3,
      scopes: ['repo'],
      path: 'AGENTS.md',
      description: 'Project exposes agent instructions',
      pass: fileExists(rootDir, 'AGENTS.md') || fileExists(rootDir, 'CLAUDE.md') ||
        fileExists(rootDir, '.claude/CLAUDE.md'),
      fix: 'Add AGENTS.md or CLAUDE.md with project-specific instructions.',
    },
    {
      id: 'consumer-test-suite',
      category: 'Quality Gates',
      points: 4,
      scopes: ['repo'],
      path: 'tests/',
      description: 'Project has an automated test entrypoint',
      pass: typeof packageJson.scripts?.test === 'string' ||
        countFiles(rootDir, 'tests', '.test.js') > 0 ||
        hasFileWithExtension(rootDir, '.', ['.spec.js', '.spec.ts', '.test.ts', '_test.go']),
      fix: 'Add a test script or checked-in tests so GG recommendations can be verified.',
    },
    {
      id: 'consumer-ci',
      category: 'Quality Gates',
      points: 3,
      scopes: ['repo'],
      path: '.github/workflows/',
      description: 'Project has CI workflows',
      pass: hasFileWithExtension(rootDir, '.github/workflows', ['.yml', '.yaml']),
      fix: 'Add a CI workflow for tests and quality gates.',
    },
    {
      id: 'consumer-memory',
      category: 'Memory Persistence',
      points: 3,
      scopes: ['repo'],
      path: '.claude/memory.md',
      description: 'Project has durable memory or ADR notes',
      pass: fileExists(rootDir, '.claude/memory.md') || countFiles(rootDir, 'docs/adr', '.md') > 0,
      fix: 'Add .claude/memory.md or ADRs under docs/adr/ for durable project knowledge.',
    },
    {
      id: 'consumer-evals',
      category: 'Eval Coverage',
      points: 2,
      scopes: ['repo'],
      path: 'evals/',
      description: 'Project has evals or multiple focused tests',
      pass: countFiles(rootDir, 'evals', null) > 0 || countFiles(rootDir, 'tests', '.test.js') >= 3,
      fix: 'Add eval fixtures or focused tests for critical flows.',
    },
    {
      id: 'consumer-security-policy',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo'],
      path: 'SECURITY.md',
      description: 'Project declares security policy or dependency scanning',
      pass: fileExists(rootDir, 'SECURITY.md') || fileExists(rootDir, '.github/dependabot.yml') ||
        fileExists(rootDir, '.github/codeql.yml'),
      fix: 'Add SECURITY.md or dependency/code scanning configuration.',
    },
    {
      id: 'consumer-secret-hygiene',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo'],
      path: '.gitignore',
      description: 'Project ignores common secret env files',
      pass: gitignore.includes('.env'),
      fix: 'Ignore .env-style files in .gitignore.',
    },
    {
      id: 'consumer-hook-guardrails',
      category: 'Security Guardrails',
      points: 2,
      scopes: ['repo', 'hooks'],
      path: '.claude/settings.json',
      description: 'Project-local settings reference prompt/tool guardrails',
      pass: settings.includes('PreToolUse') || settings.includes('UserPromptSubmit') ||
        fileExists(rootDir, '.claude/hooks.json'),
      fix: 'Add project-local hook settings if this repo needs prompt/tool guardrails.',
    },
    {
      id: 'consumer-cost-controls',
      category: 'Cost Efficiency',
      points: 2,
      scopes: ['repo'],
      path: '.claude/settings.json',
      description: 'Project records local tool/model configuration',
      pass: fileExists(rootDir, '.mcp.json') || fileExists(rootDir, '.claude/settings.json') ||
        fileExists(rootDir, '.claude/settings.local.json'),
      fix: 'Add explicit project-local Claude or MCP configuration where needed.',
    },
  ];
}

function summarizeCategoryScores(checks) {
  const scores = {};
  for (const category of CATEGORIES) {
    const inCategory = checks.filter(check => check.category === category);
    const max = inCategory.reduce((sum, check) => sum + check.points, 0);
    const earned = inCategory
      .filter(check => check.pass)
      .reduce((sum, check) => sum + check.points, 0);

    scores[category] = {
      score: max === 0 ? 0 : Math.round((earned / max) * 10),
      earned,
      max,
    };
  }

  return scores;
}

function buildReport(scope = 'repo', options = {}) {
  const normalizedScope = normalizeScope(scope);
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const targetMode = options.targetMode || detectTargetMode(rootDir);
  const checks = (targetMode === 'gg-plugin' ? getRepoChecks(rootDir) : getConsumerChecks(rootDir))
    .filter(check => check.scopes.includes(normalizedScope));
  const categories = summarizeCategoryScores(checks);
  const maxScore = checks.reduce((sum, check) => sum + check.points, 0);
  const overallScore = checks
    .filter(check => check.pass)
    .reduce((sum, check) => sum + check.points, 0);
  const failedChecks = checks.filter(check => !check.pass);
  const topActions = failedChecks
    .slice()
    .sort((left, right) => right.points - left.points)
    .slice(0, 3)
    .map(check => ({
      action: check.fix,
      path: check.path,
      category: check.category,
      points: check.points,
    }));

  return {
    scope: normalizedScope,
    root_dir: rootDir,
    target_mode: targetMode,
    deterministic: true,
    rubric_version: RUBRIC_VERSION,
    overall_score: overallScore,
    max_score: maxScore,
    categories,
    checks: checks.map(check => ({
      id: check.id,
      category: check.category,
      points: check.points,
      scopes: check.scopes,
      path: check.path,
      description: check.description,
      pass: check.pass,
    })),
    top_actions: topActions,
  };
}

function printText(report) {
  console.log(`GG Harness Audit (${report.scope}, ${report.target_mode}): ${report.overall_score}/${report.max_score}`);
  console.log(`Root: ${report.root_dir}`);
  console.log(`Rubric: ${report.rubric_version}`);
  console.log('');

  for (const category of CATEGORIES) {
    const data = report.categories[category];
    if (!data || data.max === 0) {
      continue;
    }
    console.log(`- ${category}: ${data.score}/10 (${data.earned}/${data.max} pts)`);
  }

  const failed = report.checks.filter(check => !check.pass);
  console.log('');
  console.log(`Checks: ${report.checks.length} total, ${failed.length} failing`);

  if (failed.length > 0) {
    console.log('');
    console.log('Top 3 Actions:');
    report.top_actions.forEach((action, index) => {
      console.log(`${index + 1}) [${action.category}] ${action.action} (${action.path})`);
    });
  }
}

function showHelp(exitCode = 0) {
  console.log(`Usage: node plugins/gg/scripts/harness-audit.js [scope] [--scope <repo|hooks|skills|commands|agents>] [--format <text|json>] [--root <path>]

Deterministic GG harness audit based on explicit file and rule checks.
Audits the current working directory by default and auto-detects GG plugin repo mode vs consumer-project mode.`);
  process.exit(exitCode);
}

function main() {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      showHelp(0);
      return;
    }

    const report = buildReport(args.scope, { rootDir: args.root });
    if (args.format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReport,
  parseArgs,
  findPluginInstall,
  detectTargetMode,
};
