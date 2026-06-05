#!/usr/bin/env node
'use strict';

/**
 * GG Plugin selective installer cleanup.
 *
 * Usage:
 *   ./uninstall.sh                 Remove the modules recorded by ~/.claude/gg/install-state.json
 *   ./uninstall.sh --profile <name> Remove a known profile
 *   ./uninstall.sh --modules <ids>  Remove specific module IDs
 *   ./uninstall.sh --skills <ids>   Remove individual skills by directory name
 *   ./uninstall.sh --all            Remove every installable module
 */

const os = require('os');
const path = require('path');

const {
  REPO_ROOT,
  loadManifests,
  resolveInstallPlan,
} = require('./lib/install-manifests');
const {
  applyUninstallPlan,
  readDefaultInstallState,
} = require('./lib/uninstall-executor');

const HELP = `
GG Plugin uninstaller — removes files created by install.sh from ~/.claude/

Target: Claude Code selective installer output

Usage:
  uninstall.sh                    Remove modules recorded in install-state.json
  uninstall.sh --profile <name>   Remove a preset profile
  uninstall.sh --modules <ids>    Remove specific module IDs (comma-separated)
  uninstall.sh --skills <ids>     Remove individual skills by directory name
  uninstall.sh --all              Remove every installable GG module

Options:
  --dry-run       Preview without writing files
  --verbose       Show each file operation
  --json          Emit machine-readable JSON
  --home <dir>    Override home directory (default: ${os.homedir()})
  --keep-state    Leave ~/.claude/gg/install-state.json in place
  --help          Show this help

Examples:
  uninstall.sh --dry-run
  uninstall.sh
  uninstall.sh --profile go
  uninstall.sh --all
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    help: false,
    profileId: null,
    moduleIds: [],
    skillIds: [],
    all: false,
    dryRun: false,
    verbose: false,
    json: false,
    homeDir: null,
    keepState: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--help': case '-h':
        parsed.help = true; break;
      case '--profile':
        parsed.profileId = args[++i]; break;
      case '--modules':
        parsed.moduleIds = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--skills':
        parsed.skillIds = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--all':
        parsed.all = true; break;
      case '--dry-run':
        parsed.dryRun = true; break;
      case '--verbose': case '-v':
        parsed.verbose = true; break;
      case '--json':
        parsed.json = true; break;
      case '--home':
        parsed.homeDir = args[++i]; break;
      case '--keep-state':
        parsed.keepState = true; break;
      default:
        if (!arg.startsWith('--') && !parsed.profileId) {
          parsed.profileId = arg;
        } else {
          console.error(`Unknown argument: ${arg}`);
          process.exit(1);
        }
    }
    i++;
  }

  return parsed;
}

function shortenHome(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? p.replace(home, '~') : p;
}

function resolveUninstallPlan(args) {
  const homeDir = args.homeDir || os.homedir();
  const hasExplicitSelection = Boolean(
    args.profileId ||
    args.moduleIds.length > 0 ||
    args.skillIds.length > 0 ||
    args.all
  );

  if (args.all) {
    const manifests = loadManifests(REPO_ROOT);
    return resolveInstallPlan({
      repoRoot: REPO_ROOT,
      moduleIds: manifests.modules.filter(module => !module.synthetic).map(module => module.id),
      homeDir,
    });
  }

  if (hasExplicitSelection) {
    return resolveInstallPlan({
      repoRoot: REPO_ROOT,
      profileId: args.profileId,
      moduleIds: args.moduleIds,
      skillIds: args.skillIds,
      homeDir,
    });
  }

  const state = readDefaultInstallState(homeDir);
  if (!state || !Array.isArray(state.selectedModules) || state.selectedModules.length === 0) {
    throw new Error(
      'No install state found at ~/.claude/gg/install-state.json. Use --profile, --modules, --skills, or --all.'
    );
  }

  return resolveInstallPlan({
    repoRoot: REPO_ROOT,
    moduleIds: state.selectedModules,
    homeDir,
  });
}

function printPlan(plan, dryRun) {
  const verb = dryRun ? 'Dry-run uninstall plan' : 'Applying uninstall plan';
  console.log(`\n${verb}:`);
  console.log(`  Target:   ${plan.target}  (${shortenHome(plan.installRoot)})`);
  console.log(`  Modules:  ${plan.selectedModuleIds.join(', ')}`);
  console.log();
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  let plan;
  try {
    plan = resolveUninstallPlan(args);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    console.error('Run with --help for usage.\n');
    process.exit(1);
  }

  if (args.json && args.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      target: plan.target,
      installRoot: plan.installRoot,
      selectedModuleIds: plan.selectedModuleIds,
      operationCount: plan.operations.length,
    }, null, 2));
    process.exit(0);
  }

  printPlan(plan, args.dryRun);

  let result;
  try {
    result = applyUninstallPlan(plan, {
      dryRun: args.dryRun,
      verbose: args.verbose || args.dryRun,
      removeState: !args.keepState,
    });
  } catch (err) {
    console.error(`\nUninstall failed: ${err.message}\n`);
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const w of result.warnings) console.log(`  ${w}`);
    console.log();
  }

  if (args.dryRun) {
    console.log(`Dry run complete. ${result.operationCount} cleanup operation(s) would run.`);
    console.log(`  Files: ${result.removedFiles}, hooks: ${result.removedHooks}, missing files: ${result.missingFiles}\n`);
  } else {
    console.log(`✓ GG install.sh output removed from ${shortenHome(plan.installRoot)}`);
    console.log(`  Files removed: ${result.removedFiles}`);
    console.log(`  Directories removed: ${result.removedDirs}`);
    console.log(`  Hooks removed from settings.json: ${result.removedHooks}`);
    console.log(`  State removed: ${result.removedState ? 'yes' : 'no'}\n`);
    console.log('Restart Claude Code so the cleaned settings and asset surface are reloaded.\n');
  }
}

main();
