'use strict';

const fs   = require('fs');
const path = require('path');

// ── Utilities ────────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Recursively copy a directory tree.
 * Existing files are overwritten; directory structure is created as needed.
 */
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }
  ensureDir(destDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcEntry  = path.join(srcDir, entry.name);
    const destEntry = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcEntry, destEntry);
    } else if (entry.isFile()) {
      ensureDir(path.dirname(destEntry));
      fs.copyFileSync(srcEntry, destEntry);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch);
  const merged = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    merged[k] = isPlainObject(v) && isPlainObject(merged[k])
      ? deepMerge(merged[k], v)
      : structuredClone(v);
  }
  return merged;
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

// ── Settings.json hook merger ─────────────────────────────────────────────────

/**
 * Reads the GG hooks/hooks.json and merges its "hooks" block into
 * ~/.claude/settings.json.  Existing non-GG hooks are preserved.
 * GG hook entries are replaced by id so repeated installs do not duplicate
 * plugin-managed default hooks or skill dispatchers.
 */
function mergeHooksIntoSettings(hooksJsonPath, settingsJsonPath) {
  if (!fs.existsSync(hooksJsonPath)) {
    throw new Error(`hooks.json not found at: ${hooksJsonPath}`);
  }

  const hooksConfig   = readJson(hooksJsonPath);
  const incomingHooks = hooksConfig.hooks || {};

  // Substitute ${CLAUDE_PLUGIN_ROOT} with the actual install destination so hooks
  // work even without the environment variable being set.
  const installRoot  = path.dirname(path.dirname(settingsJsonPath)); // ~/.claude
  const pluginRoot   = path.join(installRoot, 'plugins', 'gg');
  const resolvedHooks = JSON.parse(
    JSON.stringify(incomingHooks).replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot)
  );

  // Load existing settings (create if absent)
  const existing = fs.existsSync(settingsJsonPath) ? readJson(settingsJsonPath) : {};
  const existingHooks = existing.hooks || {};

  // Merge per-event: keep non-GG entries, replace GG entries by known ids.
  const incomingHookIds = new Set(
    Object.values(resolvedHooks)
      .flat()
      .map(entry => String(entry.id || ''))
      .filter(Boolean)
  );
  const mergedHooks  = {};

  // Collect all event keys from both sides
  const allEvents = new Set([
    ...Object.keys(existingHooks),
    ...Object.keys(resolvedHooks),
  ]);

  for (const event of allEvents) {
    const existingEntries = (existingHooks[event] || []).filter(
      entry => !incomingHookIds.has(String(entry.id || ''))
    );
    const incomingEntries = resolvedHooks[event] || [];
    mergedHooks[event] = [...existingEntries, ...incomingEntries];
  }

  const merged = deepMerge(existing, { hooks: mergedHooks });
  writeJson(settingsJsonPath, merged);
}

// ── Apply plan ───────────────────────────────────────────────────────────────

/**
 * Execute all operations from a resolved install plan.
 *
 * @param {object} plan  - Result from resolveInstallPlan()
 * @param {object} opts
 * @param {boolean} [opts.dryRun=false]  - Print operations without writing files
 * @param {boolean} [opts.verbose=false] - Print each file copied
 * @returns {{ applied: boolean, operationCount: number, warnings: string[] }}
 */
function applyInstallPlan(plan, opts = {}) {
  const { dryRun = false, verbose = false } = opts;
  const warnings = [];
  let operationCount = 0;

  for (const op of plan.operations) {
    if (!fs.existsSync(op.srcAbs)) {
      warnings.push(`[SKIP] Source not found: ${op.srcRelPath}`);
      continue;
    }

    if (op.kind === 'copy-dir') {
      if (verbose || dryRun) {
        console.log(`  copy  ${op.srcRelPath}  →  ${shortenHome(op.destAbs)}`);
      }
      if (!dryRun) {
        copyDir(op.srcAbs, op.destAbs);
      }
      operationCount++;
    } else if (op.kind === 'patch-settings-hooks') {
      const hooksJsonPath   = path.join(op.srcAbs, 'hooks.json');
      const settingsJsonPath = path.join(plan.installRoot, 'settings.json');

      if (!fs.existsSync(hooksJsonPath)) {
        warnings.push(`[SKIP] hooks.json not found in ${op.srcRelPath}`);
        continue;
      }

      if (verbose || dryRun) {
        console.log(`  merge hooks  →  ${shortenHome(settingsJsonPath)}`);
      }
      if (!dryRun) {
        mergeHooksIntoSettings(hooksJsonPath, settingsJsonPath);
      }
      operationCount++;
    }
  }

  // Write install state
  if (!dryRun) {
    writeInstallState(plan);
  }

  return { applied: !dryRun, operationCount, warnings };
}

// ── Install state ─────────────────────────────────────────────────────────────

function writeInstallState(plan) {
  const state = {
    schemaVersion: 'gg.install.v1',
    installedAt:   new Date().toISOString(),
    target: 'claude',
    installRoot:   plan.installRoot,
    profileId:     plan.profileId,
    selectedModules: plan.selectedModuleIds,
    includedComponents: plan.includedComponentIds,
    excludedComponents: plan.excludedComponentIds,
  };
  writeJson(plan.installStatePath, state);
}

function readInstallState(installStatePath) {
  if (!fs.existsSync(installStatePath)) return null;
  return readJson(installStatePath);
}

// ── Pretty print ──────────────────────────────────────────────────────────────

function shortenHome(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return home ? p.replace(home, '~') : p;
}

module.exports = {
  applyInstallPlan,
  readInstallState,
  copyDir,
  mergeHooksIntoSettings,
};
