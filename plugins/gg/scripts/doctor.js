#!/usr/bin/env node
'use strict';

/**
 * GG plugin install health check.
 *
 * Inspects the plugin root and reports missing or corrupted files per
 * component. Useful after upgrades, partial installs, or when GG
 * commands behave unexpectedly.
 *
 * Usage:
 *   node scripts/doctor.js [--component <id>] [--format text|json] [--root <dir>]
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'gg.doctor.v1';

// Key files checked per component. Each entry:
//   { id, path, component, severity: 'error'|'warning' }
const FILE_CHECKS = [
  // hooks-runtime
  { id: 'hook-bootstrap',       path: 'scripts/hooks/plugin-hook-bootstrap.js', component: 'hooks-runtime',      severity: 'error'   },
  { id: 'hook-dispatcher',      path: 'scripts/hooks/skill-hook-dispatcher.js',  component: 'hooks-runtime',      severity: 'error'   },
  { id: 'hooks-json',           path: 'hooks/hooks.json',                        component: 'hooks-runtime',      severity: 'error'   },
  { id: 'run-with-flags',       path: 'scripts/hooks/run-with-flags.js',         component: 'hooks-runtime',      severity: 'error'   },
  { id: 'quality-gate-hook',    path: 'scripts/hooks/quality-gate.js',           component: 'hooks-runtime',      severity: 'warning' },
  // commands-core
  { id: 'plan-command',         path: 'commands/plan.md',                        component: 'commands-core',      severity: 'error'   },
  { id: 'ship-command',         path: 'commands/ship.md',                        component: 'commands-core',      severity: 'error'   },
  { id: 'harness-audit-script', path: 'scripts/harness-audit.js',               component: 'commands-core',      severity: 'error'   },
  { id: 'harness-audit-cmd',    path: 'commands/harness-audit.md',              component: 'commands-core',      severity: 'error'   },
  { id: 'diagnose-command',     path: 'commands/diagnose.md',                   component: 'commands-core',      severity: 'warning' },
  // skills-workflow
  { id: 'using-gg-skill',       path: 'skills/using-gg/SKILL.md',               component: 'skills-workflow',    severity: 'error'   },
  { id: 'tdd-workflow-skill',   path: 'skills/tdd-workflow/SKILL.md',            component: 'skills-workflow',    severity: 'error'   },
  { id: 'verification-skill',   path: 'skills/verification-loop/SKILL.md',       component: 'skills-workflow',    severity: 'error'   },
  { id: 'context-budget-skill', path: 'skills/context-budget/SKILL.md',         component: 'skills-workflow',    severity: 'warning' },
  // agents-core
  { id: 'planner-agent',        path: 'agents/planner.md',                      component: 'agents-core',        severity: 'error'   },
  { id: 'architect-agent',      path: 'agents/architect.md',                    component: 'agents-core',        severity: 'error'   },
  { id: 'code-reviewer-agent',  path: 'agents/code-reviewer.md',               component: 'agents-core',        severity: 'warning' },
  // skills-observability (optional — warnings only)
  { id: 'task-trace-hook',      path: 'scripts/hooks/task-trace.js',            component: 'skills-observability', severity: 'warning' },
  { id: 'task-trace-inspect',   path: 'scripts/task-trace-inspect.js',          component: 'skills-observability', severity: 'warning' },
  { id: 'eval-harness-skill',   path: 'skills/eval-harness/SKILL.md',           component: 'skills-observability', severity: 'warning' },
];

// Extra structural checks beyond file presence
function runStructuralChecks(rootDir) {
  const issues = [];

  // hooks/hooks.json must be valid JSON
  const hooksJsonPath = path.join(rootDir, 'hooks', 'hooks.json');
  if (fs.existsSync(hooksJsonPath)) {
    try {
      JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    } catch (error) {
      issues.push({
        component: 'hooks-runtime',
        id: 'hooks-json-parse',
        code: 'invalid-json',
        message: `hooks/hooks.json is not valid JSON: ${error.message}`,
        severity: 'error'
      });
    }
  }

  return issues;
}

function resolveDefaultRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT && process.env.CLAUDE_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.CLAUDE_PLUGIN_ROOT);
  }
  if (process.env.GG_PLUGIN_ROOT && process.env.GG_PLUGIN_ROOT.trim()) {
    return path.resolve(process.env.GG_PLUGIN_ROOT);
  }
  const fromScript = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(fromScript, 'hooks', 'hooks.json'))) {
    return fromScript;
  }
  return process.cwd();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    components: [],
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

    if (arg === '--component') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--component requires a value');
      parsed.components.push(value);
      index += 1;
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

function buildReport(rootDir, filterComponents = []) {
  const allComponents = [...new Set(FILE_CHECKS.map(c => c.component))];
  const components = filterComponents.length > 0 ? filterComponents : allComponents;

  const results = [];
  const structuralIssues = runStructuralChecks(rootDir);

  for (const componentId of components) {
    const checks = FILE_CHECKS.filter(c => c.component === componentId);
    const issues = structuralIssues
      .filter(i => i.component === componentId)
      .map(i => ({ code: i.code, message: i.message, severity: i.severity }));

    for (const check of checks) {
      if (!fs.existsSync(path.join(rootDir, check.path))) {
        issues.push({
          code: 'missing-file',
          message: `${check.path} not found`,
          severity: check.severity
        });
      }
    }

    const hasError = issues.some(i => i.severity === 'error');
    const hasWarning = issues.some(i => i.severity === 'warning');
    const status = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

    results.push({ component: componentId, status, issues });
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return {
    schema_version: SCHEMA_VERSION,
    root_dir: rootDir,
    results,
    summary: {
      checkedCount: results.length,
      okCount,
      warningCount,
      errorCount
    }
  };
}

function statusLabel(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warning') return 'WARNING';
  if (status === 'error') return 'ERROR';
  return status.toUpperCase();
}

function printHuman(report) {
  if (report.results.length === 0) {
    console.log('No components found to check.');
    return;
  }

  console.log(`Doctor report (root: ${report.root_dir}):\n`);

  for (const result of report.results) {
    console.log(`Component: ${result.component}`);
    console.log(`  Status: ${statusLabel(result.status)}`);

    if (result.issues.length === 0) {
      console.log('  Issues: none');
    } else {
      for (const issue of result.issues) {
        console.log(`  - [${issue.severity}] ${issue.code}: ${issue.message}`);
      }
    }
    console.log('');
  }

  const { checkedCount, okCount, warningCount, errorCount } = report.summary;
  console.log(`Summary: checked=${checkedCount}, ok=${okCount}, warnings=${warningCount}, errors=${errorCount}`);
}

function usage() {
  console.log([
    'Usage: node scripts/doctor.js [--component <id>] [--format text|json] [--root <dir>]',
    '',
    'Inspect GG plugin install health.',
    '',
    'Options:',
    '  --component <id>      Check only this component (repeatable)',
    '  --format <text|json>  Output format (default: text)',
    '  --root <dir>          Plugin root (default: auto-detected)',
    '  --help, -h            Show this help',
    '',
    'Components: hooks-runtime, commands-core, skills-workflow, agents-core, skills-observability'
  ].join('\n'));
}

function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    usage();
    return;
  }

  const report = buildReport(options.root, options.components);
  const hasIssues = report.summary.errorCount > 0 || report.summary.warningCount > 0;

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exitCode = hasIssues ? 1 : 0;
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
  buildReport,
  parseArgs,
  resolveDefaultRoot,
};
