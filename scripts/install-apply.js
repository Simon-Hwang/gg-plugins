#!/usr/bin/env node
'use strict';

/**
 * GG Plugin selective installer.
 *
 * Usage:
 *   ./install.sh --profile <name>  [--with <component>]... [--without <component>]... [--dry-run] [--verbose]
 *   ./install.sh --modules <id,id,...>  [--with <component>]... [--without <component>]...
 *   ./install.sh --skills <skill-id[,skill-id,...]>
 *   ./install.sh --list-profiles
 *   ./install.sh --list-modules
 *   ./install.sh --list-components [--family <family>]
 */

const os   = require('os');
const path = require('path');

const {
  REPO_ROOT,
  resolveInstallPlan,
  listProfiles,
  listModules,
  listComponents,
} = require('./lib/install-manifests');

const { applyInstallPlan, readInstallState } = require('./lib/install-executor');

// ── Help text ────────────────────────────────────────────────────────────────

const HELP = `
GG Plugin installer — installs selected components into ~/.claude/

Target: Claude Code (always)

Usage:
  install.sh --profile <name>   Install a preset profile
  install.sh --modules <ids>    Install specific module IDs (comma-separated)
  install.sh --skills <ids>     Install individual skills by directory name
  install.sh --list-profiles    List available profiles
  install.sh --list-modules     List available modules
  install.sh --list-components  List available components (--family to filter)

Options:
  --with <component>     Add a component to the selection (repeatable)
  --without <component>  Remove a component from the selection (repeatable)
  --dry-run              Preview without writing files
  --verbose              Show each file operation
  --json                 Emit machine-readable JSON
  --home <dir>           Override home directory (default: ${os.homedir()})
  --help                 Show this help

Available profiles:
  minimal     Core rules, agents, commands, workflow skills (no hooks)
  core        minimal + default guard hooks and hook dispatcher
  go          Core + Go rules/skills + security
  python      Core + Python rules/skills + security
  full        Everything

Component families:  baseline | lang | capability | skill

Examples:
  install.sh --profile python
  install.sh --profile core --with lang:go --with capability:database
  install.sh --profile full --without capability:learning --without capability:extended
  install.sh --skills continuous-learning-v2,autonomous-loops
  install.sh --profile python --dry-run
`;

// ── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    help: false,
    listProfiles: false,
    listModules: false,
    listComponents: false,
    family: null,
    profileId: null,
    moduleIds: [],
    skillIds: [],
    withComponents: [],
    withoutComponents: [],
    dryRun: false,
    verbose: false,
    json: false,
    homeDir: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--help': case '-h':
        parsed.help = true; break;
      case '--list-profiles':
        parsed.listProfiles = true; break;
      case '--list-modules':
        parsed.listModules = true; break;
      case '--list-components':
        parsed.listComponents = true; break;
      case '--dry-run':
        parsed.dryRun = true; break;
      case '--verbose': case '-v':
        parsed.verbose = true; break;
      case '--json':
        parsed.json = true; break;
      case '--profile':
        parsed.profileId = args[++i]; break;
      case '--modules':
        parsed.moduleIds = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--skills':
        parsed.skillIds = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--with':
        parsed.withComponents.push(args[++i]); break;
      case '--without':
        parsed.withoutComponents.push(args[++i]); break;
      case '--family':
        parsed.family = args[++i]; break;
      case '--home':
        parsed.homeDir = args[++i]; break;
      default:
        // Allow bare profile names as positional arg for convenience
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

// ── Formatters ───────────────────────────────────────────────────────────────

function shortenHome(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? p.replace(home, '~') : p;
}

function printProfiles(profiles, asJson) {
  if (asJson) { console.log(JSON.stringify(profiles, null, 2)); return; }
  console.log('\nAvailable profiles:\n');
  for (const p of profiles) {
    console.log(`  ${p.id.padEnd(14)} (${p.moduleCount} modules)`);
    console.log(`    ${p.description}`);
    console.log(`    modules: ${p.modules.join(', ')}`);
    console.log();
  }
}

function printModules(modules, asJson) {
  if (asJson) { console.log(JSON.stringify(modules, null, 2)); return; }
  console.log('\nAvailable modules:\n');
  for (const m of modules) {
    const flags = [m.cost, m.stability, m.defaultInstall ? 'default' : ''].filter(Boolean).join(', ');
    console.log(`  ${m.id.padEnd(22)} [${m.kind}]  ${flags}`);
    console.log(`    ${m.description}`);
  }
}

function printComponents(components, family, asJson) {
  const filtered = family ? components.filter(c => c.family === family) : components;
  if (asJson) { console.log(JSON.stringify(filtered, null, 2)); return; }
  console.log(family ? `\nComponents (family: ${family}):\n` : '\nAvailable components:\n');
  for (const c of filtered) {
    console.log(`  ${c.id.padEnd(28)} [${c.family}]`);
    console.log(`    modules: ${c.modules.join(', ')}`);
    console.log(`    ${c.description}`);
  }
}

function printPlan(plan, dryRun) {
  const verb = dryRun ? 'Dry-run install plan' : 'Applying install plan';
  console.log(`\n${verb}:`);
  console.log(`  Profile:  ${plan.profileId || '(custom)'}`);
  console.log(`  Target:   ${plan.target}  (${shortenHome(plan.installRoot)})`);
  console.log(`  Modules:  ${plan.selectedModuleIds.join(', ')}`);
  if (plan.includedComponentIds.length) console.log(`  +with:    ${plan.includedComponentIds.join(', ')}`);
  if (plan.excludedComponentIds.length) console.log(`  -without: ${plan.excludedComponentIds.join(', ')}`);
  console.log();
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.listProfiles) {
    printProfiles(listProfiles(REPO_ROOT), args.json);
    process.exit(0);
  }

  if (args.listModules) {
    printModules(listModules(REPO_ROOT), args.json);
    process.exit(0);
  }

  if (args.listComponents) {
    printComponents(listComponents(REPO_ROOT), args.family, args.json);
    process.exit(0);
  }

  // Resolve plan
  let plan;
  try {
    plan = resolveInstallPlan({
      repoRoot:            REPO_ROOT,
      profileId:           args.profileId,
      moduleIds:           args.moduleIds,
      skillIds:            args.skillIds,
      includeComponentIds: args.withComponents,
      excludeComponentIds: args.withoutComponents,
      homeDir:             args.homeDir || undefined,
    });
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
      profileId: plan.profileId,
      selectedModuleIds: plan.selectedModuleIds,
      operationCount: plan.operations.length,
    }, null, 2));
    process.exit(0);
  }

  printPlan(plan, args.dryRun);

  // Apply
  let result;
  try {
    result = applyInstallPlan(plan, { dryRun: args.dryRun, verbose: args.verbose || args.dryRun });
  } catch (err) {
    console.error(`\nInstall failed: ${err.message}\n`);
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const w of result.warnings) console.log(`  ${w}`);
    console.log();
  }

  if (args.dryRun) {
    console.log(`Dry run complete. ${result.operationCount} operation(s) would run.\n`);
  } else {
    console.log(`✓ GG installed to ${shortenHome(plan.installRoot)}`);
    console.log(`  ${result.operationCount} operation(s) applied.`);
    console.log(`  State: ${shortenHome(plan.installStatePath)}`);
    if (plan.selectedModuleIds.includes('hooks-runtime')) {
      console.log('\n  Hook dispatcher registered in ~/.claude/settings.json.');
      console.log('  Restart Claude Code to activate hooks.\n');
    }
    if (plan.selectedModuleIds.includes('rules-golang') || plan.selectedModuleIds.includes('rules-python')) {
      console.log(`  Rules installed under ~/.claude/rules/gg/`);
      console.log('  Claude Code auto-loads all .md files under ~/.claude/rules/ — no extra config needed.\n');
    }
  }
}

main();
