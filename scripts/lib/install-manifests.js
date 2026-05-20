'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../..');
const INSTALL_TARGET = 'claude';

// ── Manifest loading ────────────────────────────────────────────────────────

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read ${label} at ${filePath}: ${err.message}`);
  }
}

function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(v => String(v).trim()).filter(Boolean))];
}

function loadManifests(repoRoot = REPO_ROOT) {
  const modulesPath   = path.join(repoRoot, 'manifests', 'install-modules.json');
  const profilesPath  = path.join(repoRoot, 'manifests', 'install-profiles.json');
  const componentsPath = path.join(repoRoot, 'manifests', 'install-components.json');

  for (const [p, label] of [[modulesPath, 'install-modules.json'], [profilesPath, 'install-profiles.json']]) {
    if (!fs.existsSync(p)) throw new Error(`Missing manifest: ${label} (looked at ${p})`);
  }

  const modulesData    = readJson(modulesPath, 'install-modules.json');
  const profilesData   = readJson(profilesPath, 'install-profiles.json');
  const componentsData = fs.existsSync(componentsPath)
    ? readJson(componentsPath, 'install-components.json')
    : { version: null, components: [] };

  const modules    = Array.isArray(modulesData.modules)       ? modulesData.modules.slice()       : [];
  const profiles   = profilesData && typeof profilesData.profiles === 'object' ? profilesData.profiles : {};
  const components = Array.isArray(componentsData.components) ? componentsData.components.slice() : [];

  // Auto-synthesise a skill:<name> component for every skills/ dir not already declared
  addSyntheticSkillComponents({ repoRoot, modules, components });

  const modulesById    = new Map(modules.map(m => [m.id, m]));
  const componentsById = new Map(components.map(c => [c.id, c]));

  return { repoRoot, modules, profiles, components, modulesById, componentsById };
}

function addSyntheticSkillComponents({ repoRoot, modules, components }) {
  const skillsRoot = path.join(repoRoot, 'plugins', 'gg', 'skills');
  if (!fs.existsSync(skillsRoot)) return;

  const moduleIds    = new Set(modules.map(m => m.id));
  const componentIds = new Set(components.map(c => c.id));

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillId     = entry.name;
    const componentId = `skill:${skillId}`;
    if (componentIds.has(componentId)) continue;

    const moduleId = `skill-${skillId}`;
    if (!moduleIds.has(moduleId)) {
      modules.push({
        id: moduleId,
        kind: 'skills',
        description: `Single-skill install for ${skillId}.`,
        paths: [`plugins/gg/skills/${skillId}`],
        defaultInstall: false,
        cost: 'light',
        stability: 'stable',
        synthetic: true,
      });
      moduleIds.add(moduleId);
    }
    components.push({
      id: componentId,
      family: 'skill',
      description: `Install only the ${skillId} skill.`,
      modules: [moduleId],
      synthetic: true,
    });
    componentIds.add(componentId);
  }
}

// ── Plan resolution ─────────────────────────────────────────────────────────

/**
 * Resolves an install plan from the provided options.
 *
 * @param {object} options
 * @param {string}   [options.repoRoot]           - Override repo root
 * @param {string}   [options.profileId]          - Profile name
 * @param {string[]} [options.moduleIds]          - Explicit module IDs
 * @param {string[]} [options.includeComponentIds] - Components to add
 * @param {string[]} [options.excludeComponentIds] - Components to remove
 * @param {string[]} [options.skillIds]           - Individual skill IDs (shorthand)
 * @param {string}   [options.homeDir]            - Override home directory
 * @returns {InstallPlan}
 */
function resolveInstallPlan(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const homeDir  = options.homeDir  || os.homedir();
  const manifests = loadManifests(repoRoot);

  const requestedModuleIds = [];

  // 1. Profile
  if (options.profileId) {
    const profile = manifests.profiles[options.profileId];
    if (!profile) {
      const available = Object.keys(manifests.profiles).join(', ');
      throw new Error(`Unknown profile "${options.profileId}". Available: ${available}`);
    }
    requestedModuleIds.push(...(profile.modules || []));
  }

  // 2. Explicit modules
  if (Array.isArray(options.moduleIds)) {
    requestedModuleIds.push(...options.moduleIds);
  }

  // 3. --with components
  const includeComponentIds = dedupeStrings(options.includeComponentIds || []);
  requestedModuleIds.push(...expandComponents(includeComponentIds, manifests));

  // 4. --skills shorthand → synthetic skill:<id> component
  if (Array.isArray(options.skillIds)) {
    for (const skillId of options.skillIds) {
      const componentId = `skill:${skillId}`;
      const component   = manifests.componentsById.get(componentId);
      if (!component) throw new Error(`Unknown skill: "${skillId}"`);
      requestedModuleIds.push(...component.modules);
    }
  }

  if (requestedModuleIds.length === 0) {
    throw new Error('Nothing to install. Provide --profile, --modules, --with, or --skills.');
  }

  // 5. --without components
  const excludeComponentIds  = dedupeStrings(options.excludeComponentIds || []);
  const excludedModuleIds    = new Set(expandComponents(excludeComponentIds, manifests));

  // 6. Resolve with dedup + exclusion
  const effectiveIds = dedupeStrings(requestedModuleIds).filter(id => !excludedModuleIds.has(id));
  if (effectiveIds.length === 0) {
    throw new Error('All requested modules were excluded. Check --without arguments.');
  }

  // 7. Validate all IDs exist
  for (const id of effectiveIds) {
    if (!manifests.modulesById.has(id)) throw new Error(`Unknown module: "${id}"`);
  }

  const selectedModules = effectiveIds.map(id => manifests.modulesById.get(id));

  // 8. Compute install root
  const installRoot       = path.join(homeDir, '.claude');
  const installStatePath  = path.join(installRoot, 'gg', 'install-state.json');

  // 9. Build file operations
  const operations = buildOperations({ repoRoot, installRoot, selectedModules });

  return {
    repoRoot,
    target: INSTALL_TARGET,
    installRoot,
    installStatePath,
    profileId:           options.profileId || null,
    requestedModuleIds:  effectiveIds,
    includedComponentIds: includeComponentIds,
    excludedComponentIds: excludeComponentIds,
    selectedModuleIds:   selectedModules.map(m => m.id),
    selectedModules,
    operations,
  };
}

// ── Operation builder ────────────────────────────────────────────────────────

/**
 * Maps module paths to file-copy operations.
 *
 * Routing rules (Claude Code target):
 *   plugins/gg/rules/<group>   → ~/.claude/rules/gg/<group>    (copy-dir)
 *   plugins/gg/skills/<name>   → ~/.claude/skills/gg/<name>    (copy-dir)
 *   plugins/gg/agents          → ~/.claude/agents              (copy-dir)
 *   plugins/gg/commands        → ~/.claude/commands            (copy-dir)
 *   plugins/gg/hooks           → ~/.claude/plugins/gg/hooks    (copy-dir)
 *   plugins/gg/scripts         → ~/.claude/plugins/gg/scripts  (copy-dir)
 */
function buildOperations({ repoRoot, installRoot, selectedModules }) {
  const ops = [];

  for (const module of selectedModules) {
    for (const srcRelPath of (module.paths || [])) {
      const srcAbs  = path.join(repoRoot, srcRelPath);
      const destAbs = resolveDestination(installRoot, srcRelPath);

      if (module.kind === 'hooks') {
        // Hooks module needs two distinct operation types:
        // 1. copy scripts to a stable location
        // 2. patch settings.json with hook entries
        if (srcRelPath === 'plugins/gg/hooks') {
          ops.push({ kind: 'patch-settings-hooks', moduleId: module.id, srcAbs, srcRelPath, destAbs });
        } else {
          ops.push({ kind: 'copy-dir', moduleId: module.id, srcAbs, srcRelPath, destAbs });
        }
      } else {
        ops.push({ kind: 'copy-dir', moduleId: module.id, srcAbs, srcRelPath, destAbs });
      }
    }
  }

  return ops;
}

function resolveDestination(installRoot, srcRelPath) {
  const norm = srcRelPath.replace(/\\/g, '/').replace(/^\.\//, '');

  // plugins/gg/rules/<group> → ~/.claude/rules/gg/<group>
  if (norm.startsWith('plugins/gg/rules/')) {
    const rest = norm.slice('plugins/gg/rules/'.length);
    return path.join(installRoot, 'rules', 'gg', rest);
  }

  // plugins/gg/skills/<name> → ~/.claude/skills/gg/<name>
  if (norm.startsWith('plugins/gg/skills/')) {
    const rest = norm.slice('plugins/gg/skills/'.length);
    return path.join(installRoot, 'skills', 'gg', rest);
  }

  // plugins/gg/agents → ~/.claude/agents
  if (norm === 'plugins/gg/agents') {
    return path.join(installRoot, 'agents');
  }

  // plugins/gg/commands → ~/.claude/commands
  if (norm === 'plugins/gg/commands') {
    return path.join(installRoot, 'commands');
  }

  // plugins/gg/hooks → (handled as patch-settings-hooks, dest is informational)
  if (norm === 'plugins/gg/hooks') {
    return path.join(installRoot, 'plugins', 'gg', 'hooks');
  }

  // plugins/gg/scripts → ~/.claude/plugins/gg/scripts
  if (norm === 'plugins/gg/scripts') {
    return path.join(installRoot, 'plugins', 'gg', 'scripts');
  }

  // Fallback: preserve relative path under installRoot
  return path.join(installRoot, norm);
}

function expandComponents(componentIds, manifests) {
  const moduleIds = [];
  for (const componentId of componentIds) {
    const component = manifests.componentsById.get(componentId);
    if (!component) throw new Error(`Unknown component: "${componentId}"`);
    moduleIds.push(...(component.modules || []));
  }
  return dedupeStrings(moduleIds);
}

// ── Listing helpers ──────────────────────────────────────────────────────────

function listProfiles(repoRoot = REPO_ROOT) {
  const { profiles } = loadManifests(repoRoot);
  return Object.entries(profiles).map(([id, p]) => ({
    id,
    description: p.description,
    moduleCount: Array.isArray(p.modules) ? p.modules.length : 0,
    modules: p.modules || [],
  }));
}

function listModules(repoRoot = REPO_ROOT) {
  const { modules } = loadManifests(repoRoot);
  return modules
    .filter(m => !m.synthetic)
    .map(m => ({
      id: m.id,
      kind: m.kind,
      description: m.description,
      defaultInstall: m.defaultInstall,
      cost: m.cost,
      stability: m.stability,
    }));
}

function listComponents(repoRoot = REPO_ROOT) {
  const { components } = loadManifests(repoRoot);
  return components
    .filter(c => !c.synthetic)
    .map(c => ({
      id: c.id,
      family: c.family,
      description: c.description,
      modules: c.modules || [],
    }));
}

module.exports = {
  REPO_ROOT,
  INSTALL_TARGET,
  loadManifests,
  resolveInstallPlan,
  listProfiles,
  listModules,
  listComponents,
};
