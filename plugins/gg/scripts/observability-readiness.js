#!/usr/bin/env node
'use strict';

/**
 * GG observability readiness gate.
 *
 * Deterministic pre-flight check: verifies that the GG observability surface
 * (task-trace, harness-audit, eval-harness, hook runtime) is properly installed
 * and intact. Useful before shipping, promoting instincts, or starting
 * autonomous loops where traceability matters.
 *
 * Usage:
 *   node scripts/observability-readiness.js [--format text|json] [--root <dir>]
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'gg.observability-readiness.v1';
const RUBRIC_VERSION = 'gg-2026-05-21';

function usage() {
  console.log([
    'Usage: node scripts/observability-readiness.js [--format <text|json>] [--root <dir>]',
    '',
    'Deterministic GG observability readiness gate.',
    '',
    'Options:',
    '  --format <text|json>  Output format (default: text)',
    '  --root <dir>          Plugin root to inspect (default: auto-detected)',
    '  --help, -h            Show this help'
  ].join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    format: 'text',
    help: false,
    root: resolveDefaultRoot()
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--format') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--format requires a value');
      parsed.format = value.toLowerCase();
      index += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      parsed.format = arg.slice('--format='.length).toLowerCase();
      continue;
    }

    if (arg === '--root') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--root requires a value');
      parsed.root = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--root=')) {
      parsed.root = path.resolve(arg.slice('--root='.length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['text', 'json'].includes(parsed.format)) {
    throw new Error(`Invalid format: ${parsed.format}. Use text or json.`);
  }

  return parsed;
}

function resolveDefaultRoot() {
  // Prefer explicit env vars, then fall back to the directory two levels up from
  // this script (plugins/gg/ when run from the source repo) or cwd.
  if (process.env.CLAUDE_PLUGIN_ROOT && process.env.CLAUDE_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.CLAUDE_PLUGIN_ROOT);
  }
  if (process.env.GG_PLUGIN_ROOT && process.env.GG_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.GG_PLUGIN_ROOT);
  }
  // When run from source: __dirname is plugins/gg/scripts, so go up two levels
  const fromScript = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(fromScript, 'hooks', 'hooks.json'))) {
    return fromScript;
  }
  return process.cwd();
}

function fileExists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function readText(rootDir, relativePath) {
  try {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function includesAll(text, needles) {
  return needles.every(needle => text.includes(needle));
}

function safeParseJson(text) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildChecks(rootDir) {
  const taskTraceHook = readText(rootDir, 'scripts/hooks/task-trace.js');
  const taskTraceInspect = readText(rootDir, 'scripts/task-trace-inspect.js');
  const harnessAudit = readText(rootDir, 'scripts/harness-audit.js');
  const evalHarness = readText(rootDir, 'skills/eval-harness/SKILL.md');
  const hooksJson = readText(rootDir, 'hooks/hooks.json');

  return [
    {
      id: 'task-trace-hook',
      category: 'Task Tracing',
      points: 2,
      path: 'scripts/hooks/task-trace.js',
      description: 'task-trace hook captures tool events to gg.task-trace.v1 JSONL',
      pass: fileExists(rootDir, 'scripts/hooks/task-trace.js')
        && includesAll(taskTraceHook, ['gg.task-trace.v1', 'buildTraceRecord']),
      fix: 'Install skills-observability module: it includes the task-trace hook and skill.'
    },
    {
      id: 'task-trace-inspect',
      category: 'Task Tracing',
      points: 2,
      path: 'scripts/task-trace-inspect.js',
      description: 'task-trace inspect script provides summary and timeline queries',
      pass: fileExists(rootDir, 'scripts/task-trace-inspect.js')
        && includesAll(taskTraceInspect, ['summary', 'timeline', 'gg.task-trace']),
      fix: 'Verify scripts/task-trace-inspect.js is present in the plugin install.'
    },
    {
      id: 'harness-audit-script',
      category: 'Harness Baseline',
      points: 2,
      path: 'scripts/harness-audit.js',
      description: 'harness-audit script emits deterministic scored reports',
      pass: fileExists(rootDir, 'scripts/harness-audit.js')
        && includesAll(harnessAudit, ['buildReport', 'overall_score']),
      fix: 'Verify scripts/harness-audit.js is present in the plugin install.'
    },
    {
      id: 'eval-harness-skill',
      category: 'Eval Coverage',
      points: 2,
      path: 'skills/eval-harness/SKILL.md',
      description: 'eval-harness skill provides pass@k evaluation framework',
      pass: fileExists(rootDir, 'skills/eval-harness/SKILL.md')
        && evalHarness.includes('pass@'),
      fix: 'Install skills-observability module to get the eval-harness skill.'
    },
    {
      id: 'enterprise-agent-ops-skill',
      category: 'Eval Coverage',
      points: 1,
      path: 'skills/enterprise-agent-ops/SKILL.md',
      description: 'enterprise-agent-ops skill provides long-running agent observability SOP',
      pass: fileExists(rootDir, 'skills/enterprise-agent-ops/SKILL.md'),
      fix: 'Install skills-observability module to get the enterprise-agent-ops skill.'
    },
    {
      id: 'hook-runtime',
      category: 'Hook Runtime',
      points: 2,
      path: 'hooks/hooks.json',
      description: 'hook runtime is present and parses as valid JSON',
      pass: fileExists(rootDir, 'hooks/hooks.json')
        && fileExists(rootDir, 'scripts/hooks/skill-hook-dispatcher.js')
        && safeParseJson(hooksJson) !== null,
      fix: 'Ensure hooks-runtime module is installed and hooks/hooks.json is valid.'
    },
    {
      id: 'task-trace-command',
      category: 'Hook Runtime',
      points: 1,
      path: 'commands/task-trace.md',
      description: 'task-trace slash command is available for session inspection',
      pass: fileExists(rootDir, 'commands/task-trace.md'),
      fix: 'Verify commands/task-trace.md is present in the plugin install.'
    }
  ];
}

function buildReport(rootDir) {
  const checks = buildChecks(rootDir);
  const categories = {};

  for (const check of checks) {
    if (!categories[check.category]) {
      categories[check.category] = { score: 0, max_score: 0, passed: 0, total: 0 };
    }
    categories[check.category].max_score += check.points;
    categories[check.category].total += 1;
    if (check.pass) {
      categories[check.category].score += check.points;
      categories[check.category].passed += 1;
    }
  }

  const overallScore = checks.filter(c => c.pass).reduce((sum, c) => sum + c.points, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.points, 0);
  const failing = checks.filter(c => !c.pass);

  return {
    schema_version: SCHEMA_VERSION,
    rubric_version: RUBRIC_VERSION,
    deterministic: true,
    root_dir: rootDir,
    overall_score: overallScore,
    max_score: maxScore,
    ready: overallScore === maxScore,
    categories,
    checks,
    top_actions: failing
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map(c => ({ id: c.id, path: c.path, fix: c.fix }))
  };
}

function renderText(report) {
  const lines = [
    `GG Observability Readiness: ${report.overall_score}/${report.max_score}`,
    `Ready: ${report.ready ? 'yes' : 'no'}`,
    `Root: ${report.root_dir}`,
    '',
    'Categories:'
  ];

  for (const [name, cat] of Object.entries(report.categories)) {
    lines.push(`  ${name}: ${cat.score}/${cat.max_score} (${cat.passed}/${cat.total} checks)`);
  }

  lines.push('', 'Checks:');
  for (const check of report.checks) {
    lines.push(`  ${check.pass ? 'PASS' : 'FAIL'} [${check.points}pt] ${check.id}: ${check.description}`);
  }

  if (report.top_actions.length > 0) {
    lines.push('', 'Top Actions:');
    for (const action of report.top_actions) {
      lines.push(`  - ${action.path}: ${action.fix}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    usage();
    return;
  }

  const report = buildReport(args.root);

  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(renderText(report));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildChecks,
  buildReport,
  parseArgs,
  renderText,
  resolveDefaultRoot,
};
