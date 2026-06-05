'use strict';

const fs = require('fs');
const path = require('path');

const { readInstallState } = require('./install-executor');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function collectSourceFiles(srcDir, relativeBase = '') {
  if (!fs.existsSync(srcDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const relPath = path.join(relativeBase, entry.name);
    const absPath = path.join(srcDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absPath, relPath));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function isPathInside(childPath, parentPath) {
  const rel = path.relative(parentPath, childPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function removeEmptyDirsUpTo(startDir, stopDir, opts = {}) {
  const { dryRun = false, verbose = false, stats = null } = opts;
  let current = startDir;

  while (current && isPathInside(current, stopDir) && current !== stopDir) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) break;

    if (verbose || dryRun) {
      console.log(`  rmdir ${shortenHome(current)}`);
    }
    if (!dryRun) {
      fs.rmdirSync(current);
    }
    if (stats) stats.removedDirs++;
    current = path.dirname(current);
  }
}

function removeCopiedFiles(srcDir, destDir, opts = {}) {
  const {
    dryRun = false,
    verbose = false,
    preserveDestRoot = false,
    warnings = [],
  } = opts;
  const stats = { removedFiles: 0, removedDirs: 0, missingFiles: 0 };

  if (!fs.existsSync(srcDir)) {
    warnings.push(`[SKIP] Source not found: ${srcDir}`);
    return stats;
  }

  const sourceFiles = collectSourceFiles(srcDir);
  for (const relPath of sourceFiles) {
    const destPath = path.join(destDir, relPath);

    if (!fs.existsSync(destPath)) {
      stats.missingFiles++;
      continue;
    }

    if (verbose || dryRun) {
      console.log(`  rm    ${shortenHome(destPath)}`);
    }
    if (!dryRun) {
      fs.rmSync(destPath, { force: true });
    }
    stats.removedFiles++;

    removeEmptyDirsUpTo(path.dirname(destPath), destDir, {
      dryRun,
      verbose,
      stats,
    });
  }

  if (!preserveDestRoot && fs.existsSync(destDir) && fs.readdirSync(destDir).length === 0) {
    if (verbose || dryRun) {
      console.log(`  rmdir ${shortenHome(destDir)}`);
    }
    if (!dryRun) {
      fs.rmdirSync(destDir);
    }
    stats.removedDirs++;
  }

  return stats;
}

function hookIdsFromHooksJson(hooksJsonPath) {
  const hooksConfig = readJson(hooksJsonPath);
  const hooks = hooksConfig.hooks || {};

  return new Set(
    Object.values(hooks)
      .flat()
      .map(entry => String(entry.id || ''))
      .filter(Boolean)
  );
}

function removeHooksFromSettings(hooksJsonPath, settingsJsonPath, opts = {}) {
  const { dryRun = false, verbose = false, warnings = [] } = opts;
  const stats = { removedHooks: 0 };

  if (!fs.existsSync(hooksJsonPath)) {
    warnings.push(`[SKIP] hooks.json not found at: ${hooksJsonPath}`);
    return stats;
  }
  if (!fs.existsSync(settingsJsonPath)) {
    return stats;
  }

  const hookIds = hookIdsFromHooksJson(hooksJsonPath);
  if (hookIds.size === 0) return stats;

  const settings = readJson(settingsJsonPath);
  const existingHooks = settings.hooks || {};
  const nextHooks = {};

  for (const [event, entries] of Object.entries(existingHooks)) {
    const kept = (entries || []).filter(entry => {
      const remove = hookIds.has(String(entry.id || ''));
      if (remove) stats.removedHooks++;
      return !remove;
    });

    if (kept.length > 0) {
      nextHooks[event] = kept;
    }
  }

  if (stats.removedHooks === 0) return stats;

  if (verbose || dryRun) {
    console.log(`  remove ${stats.removedHooks} GG hook(s) from ${shortenHome(settingsJsonPath)}`);
  }

  if (!dryRun) {
    if (Object.keys(nextHooks).length > 0) {
      settings.hooks = nextHooks;
    } else {
      delete settings.hooks;
    }
    writeJson(settingsJsonPath, settings);
  }

  return stats;
}

function dedupeOperations(operations) {
  const seen = new Set();
  const deduped = [];

  for (const op of operations) {
    const key = `${op.kind}\0${op.srcAbs}\0${op.destAbs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(op);
  }

  return deduped;
}

function shouldPreserveDestRoot(op) {
  const norm = op.srcRelPath.replace(/\\/g, '/').replace(/^\.\//, '');
  return norm === 'plugins/gg/agents' || norm === 'plugins/gg/commands';
}

function removeInstallState(installStatePath, opts = {}) {
  const { dryRun = false, verbose = false } = opts;
  const stats = { removedState: false };

  if (!fs.existsSync(installStatePath)) return stats;

  if (verbose || dryRun) {
    console.log(`  rm    ${shortenHome(installStatePath)}`);
  }
  if (!dryRun) {
    fs.rmSync(installStatePath, { force: true });
    removeEmptyDirsUpTo(path.dirname(installStatePath), path.dirname(path.dirname(installStatePath)), {
      dryRun,
      verbose,
    });
  }
  stats.removedState = true;
  return stats;
}

function applyUninstallPlan(plan, opts = {}) {
  const { dryRun = false, verbose = false, removeState = true } = opts;
  const warnings = [];
  const result = {
    applied: !dryRun,
    operationCount: 0,
    removedFiles: 0,
    removedDirs: 0,
    removedHooks: 0,
    removedState: false,
    missingFiles: 0,
    warnings,
  };

  for (const op of dedupeOperations(plan.operations)) {
    if (op.kind === 'copy-dir') {
      const stats = removeCopiedFiles(op.srcAbs, op.destAbs, {
        dryRun,
        verbose,
        warnings,
        preserveDestRoot: shouldPreserveDestRoot(op),
      });
      result.removedFiles += stats.removedFiles;
      result.removedDirs += stats.removedDirs;
      result.missingFiles += stats.missingFiles;
      result.operationCount++;
    } else if (op.kind === 'patch-settings-hooks') {
      const hooksJsonPath = path.join(op.srcAbs, 'hooks.json');
      const settingsJsonPath = path.join(plan.installRoot, 'settings.json');
      const stats = removeHooksFromSettings(hooksJsonPath, settingsJsonPath, {
        dryRun,
        verbose,
        warnings,
      });
      result.removedHooks += stats.removedHooks;
      result.operationCount++;
    }
  }

  if (removeState) {
    const stats = removeInstallState(plan.installStatePath, { dryRun, verbose });
    result.removedState = stats.removedState;
  }

  return result;
}

function readDefaultInstallState(homeDir) {
  return readInstallState(path.join(homeDir, '.claude', 'gg', 'install-state.json'));
}

function shortenHome(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? p.replace(home, '~') : p;
}

module.exports = {
  applyUninstallPlan,
  collectSourceFiles,
  readDefaultInstallState,
  removeCopiedFiles,
  removeHooksFromSettings,
};
