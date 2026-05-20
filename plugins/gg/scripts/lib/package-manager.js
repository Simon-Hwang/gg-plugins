'use strict';

const fs = require('fs');
const path = require('path');
const { getClaudeDir, readFile, writeFile, commandExists } = require('./utils');

const PACKAGE_MANAGERS = {
  npm: {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCmd: 'npm install',
    runCmd: 'npm run',
    execCmd: 'npx',
    testCmd: 'npm test',
    buildCmd: 'npm run build',
    devCmd: 'npm run dev',
  },
  pnpm: {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    runCmd: 'pnpm',
    execCmd: 'pnpm dlx',
    testCmd: 'pnpm test',
    buildCmd: 'pnpm build',
    devCmd: 'pnpm dev',
  },
  yarn: {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCmd: 'yarn',
    runCmd: 'yarn',
    execCmd: 'yarn dlx',
    testCmd: 'yarn test',
    buildCmd: 'yarn build',
    devCmd: 'yarn dev',
  },
  bun: {
    name: 'bun',
    lockFile: 'bun.lockb',
    installCmd: 'bun install',
    runCmd: 'bun run',
    execCmd: 'bunx',
    testCmd: 'bun test',
    buildCmd: 'bun run build',
    devCmd: 'bun run dev',
  },
};

const DETECTION_PRIORITY = ['pnpm', 'bun', 'yarn', 'npm'];

function detectFromLockFile(projectDir = process.cwd()) {
  for (const name of DETECTION_PRIORITY) {
    if (fs.existsSync(path.join(projectDir, PACKAGE_MANAGERS[name].lockFile))) {
      return name;
    }
  }
  return null;
}

function detectFromPackageJson(projectDir = process.cwd()) {
  const content = readFile(path.join(projectDir, 'package.json'));
  if (!content) return null;

  try {
    const pkg = JSON.parse(content);
    const name = String(pkg.packageManager || '').split('@')[0];
    return PACKAGE_MANAGERS[name] ? name : null;
  } catch (_error) {
    return null;
  }
}

function loadGlobalConfig() {
  const content = readFile(path.join(getClaudeDir(), 'package-manager.json'));
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch (_error) {
    return null;
  }
}

function getPackageManager(options = {}) {
  const { projectDir = process.cwd() } = options;
  const envPm = process.env.GG_PACKAGE_MANAGER;
  if (envPm && PACKAGE_MANAGERS[envPm]) {
    return { name: envPm, config: PACKAGE_MANAGERS[envPm], source: 'environment' };
  }

  const projectConfig = readFile(path.join(projectDir, '.claude', 'package-manager.json'));
  if (projectConfig) {
    try {
      const parsed = JSON.parse(projectConfig);
      if (PACKAGE_MANAGERS[parsed.packageManager]) {
        return {
          name: parsed.packageManager,
          config: PACKAGE_MANAGERS[parsed.packageManager],
          source: 'project-config',
        };
      }
    } catch (_error) {
      /* ignore invalid config */
    }
  }

  const packageJsonPm = detectFromPackageJson(projectDir);
  if (packageJsonPm) {
    return { name: packageJsonPm, config: PACKAGE_MANAGERS[packageJsonPm], source: 'package.json' };
  }

  const lockFilePm = detectFromLockFile(projectDir);
  if (lockFilePm) {
    return { name: lockFilePm, config: PACKAGE_MANAGERS[lockFilePm], source: 'lock-file' };
  }

  const globalConfig = loadGlobalConfig();
  if (globalConfig && PACKAGE_MANAGERS[globalConfig.packageManager]) {
    return {
      name: globalConfig.packageManager,
      config: PACKAGE_MANAGERS[globalConfig.packageManager],
      source: 'global-config',
    };
  }

  return { name: 'npm', config: PACKAGE_MANAGERS.npm, source: 'default' };
}

function setPreferredPackageManager(name) {
  if (!PACKAGE_MANAGERS[name]) {
    throw new Error(`Unknown package manager: ${name}`);
  }
  const config = { packageManager: name, setAt: new Date().toISOString() };
  writeFile(path.join(getClaudeDir(), 'package-manager.json'), JSON.stringify(config, null, 2));
  return config;
}

function getAvailablePackageManagers() {
  return Object.keys(PACKAGE_MANAGERS).filter(commandExists);
}

module.exports = {
  PACKAGE_MANAGERS,
  DETECTION_PRIORITY,
  getPackageManager,
  setPreferredPackageManager,
  getAvailablePackageManagers,
  detectFromLockFile,
  detectFromPackageJson,
};
