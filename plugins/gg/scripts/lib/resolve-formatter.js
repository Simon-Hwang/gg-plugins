'use strict';

const fs = require('fs');
const path = require('path');

const projectRootCache = new Map();
const formatterCache = new Map();
const binCache = new Map();

const BIOME_CONFIGS = ['biome.json', 'biome.jsonc'];
const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];
const PROJECT_ROOT_MARKERS = ['package.json', ...BIOME_CONFIGS, ...PRETTIER_CONFIGS];
const WIN_CMD_SHIMS = { npx: 'npx.cmd', pnpm: 'pnpm.cmd', yarn: 'yarn.cmd', bunx: 'bunx.cmd' };
const FORMATTER_PACKAGES = {
  biome: { binName: 'biome', pkgName: '@biomejs/biome' },
  prettier: { binName: 'prettier', pkgName: 'prettier' },
};

function findProjectRoot(startDir) {
  if (projectRootCache.has(startDir)) return projectRootCache.get(startDir);

  let dir = path.resolve(startDir);
  while (dir !== path.dirname(dir)) {
    if (PROJECT_ROOT_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))) {
      projectRootCache.set(startDir, dir);
      return dir;
    }
    dir = path.dirname(dir);
  }

  projectRootCache.set(startDir, path.resolve(startDir));
  return path.resolve(startDir);
}

function detectFormatter(projectRoot) {
  if (formatterCache.has(projectRoot)) return formatterCache.get(projectRoot);

  if (BIOME_CONFIGS.some(config => fs.existsSync(path.join(projectRoot, config)))) {
    formatterCache.set(projectRoot, 'biome');
    return 'biome';
  }

  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath) && Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(pkgPath, 'utf8')), 'prettier')) {
      formatterCache.set(projectRoot, 'prettier');
      return 'prettier';
    }
  } catch (_error) {
    /* ignore malformed package.json */
  }

  if (PRETTIER_CONFIGS.some(config => fs.existsSync(path.join(projectRoot, config)))) {
    formatterCache.set(projectRoot, 'prettier');
    return 'prettier';
  }

  formatterCache.set(projectRoot, null);
  return null;
}

function getRunnerFromPackageManager(projectRoot) {
  const { getPackageManager } = require('./package-manager');
  const pm = getPackageManager({ projectDir: projectRoot });
  const [rawBin = 'npx', ...prefix] = String(pm?.config?.execCmd || 'npx').split(/\s+/).filter(Boolean);
  const bin = process.platform === 'win32' ? WIN_CMD_SHIMS[rawBin] || rawBin : rawBin;
  return { bin, prefix };
}

function resolveFormatterBin(projectRoot, formatter) {
  const key = `${projectRoot}:${formatter}`;
  if (binCache.has(key)) return binCache.get(key);

  const pkg = FORMATTER_PACKAGES[formatter];
  if (!pkg) {
    binCache.set(key, null);
    return null;
  }

  const localBin = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${pkg.binName}.cmd` : pkg.binName,
  );
  if (fs.existsSync(localBin)) {
    const result = { bin: localBin, prefix: [] };
    binCache.set(key, result);
    return result;
  }

  const runner = getRunnerFromPackageManager(projectRoot);
  const result = { bin: runner.bin, prefix: [...runner.prefix, pkg.pkgName] };
  binCache.set(key, result);
  return result;
}

function clearCaches() {
  projectRootCache.clear();
  formatterCache.clear();
  binCache.clear();
}

module.exports = {
  findProjectRoot,
  detectFormatter,
  resolveFormatterBin,
  clearCaches,
};
