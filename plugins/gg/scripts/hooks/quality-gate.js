#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { findProjectRoot, detectFormatter, resolveFormatterBin } = require('../lib/resolve-formatter');

const MAX_STDIN = 1024 * 1024;

function exec(command, args, cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: 15000,
    windowsHide: true,
  });
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

function maybeRunQualityGate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  const resolvedFile = path.resolve(filePath);
  const ext = path.extname(resolvedFile).toLowerCase();
  const fix = String(process.env.GG_QUALITY_GATE_FIX || '').toLowerCase() === 'true';
  const strict = String(process.env.GG_QUALITY_GATE_STRICT || '').toLowerCase() === 'true';

  if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext)) {
    const projectRoot = findProjectRoot(path.dirname(resolvedFile));
    const formatter = detectFormatter(projectRoot);
    if (!formatter) return;

    if (formatter === 'biome') {
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return;
      const resolved = resolveFormatterBin(projectRoot, 'biome');
      if (!resolved) return;
      const args = [...resolved.prefix, 'check', resolvedFile];
      if (fix) args.push('--write');
      const result = exec(resolved.bin, args, projectRoot);
      if (result.status !== 0 && strict) log(`[QualityGate] Biome check failed for ${resolvedFile}`);
      return;
    }

    if (formatter === 'prettier') {
      const resolved = resolveFormatterBin(projectRoot, 'prettier');
      if (!resolved) return;
      const result = exec(resolved.bin, [...resolved.prefix, fix ? '--write' : '--check', resolvedFile], projectRoot);
      if (result.status !== 0 && strict) log(`[QualityGate] Prettier check failed for ${resolvedFile}`);
    }
    return;
  }

  if (ext === '.go') {
    if (fix) {
      const result = exec('gofmt', ['-w', resolvedFile]);
      if (result.status !== 0 && strict) log(`[QualityGate] gofmt failed for ${resolvedFile}`);
    } else if (strict) {
      const result = exec('gofmt', ['-l', resolvedFile]);
      if (result.status !== 0 || (result.stdout && result.stdout.trim())) {
        log(`[QualityGate] gofmt check failed for ${resolvedFile}`);
      }
    }
    return;
  }

  if (ext === '.py') {
    const args = ['format'];
    if (!fix) args.push('--check');
    args.push(resolvedFile);
    const result = exec('ruff', args);
    if (result.status !== 0 && strict) log(`[QualityGate] Ruff check failed for ${resolvedFile}`);
  }
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    maybeRunQualityGate(String(input.tool_input?.file_path || ''));
  } catch (_error) {
    /* allow malformed input */
  }
  return rawInput;
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      raw += chunk.substring(0, MAX_STDIN - raw.length);
    }
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
  });
}

module.exports = { run, maybeRunQualityGate };
