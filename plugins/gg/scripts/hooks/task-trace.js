#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const path = require('path');
const {
  appendFile,
  getClaudeDir,
} = require('../lib/utils');

const SCHEMA_VERSION = 'gg.task-trace.v1';
const TRACE_FILE_NAME = 'gg-task-trace.jsonl';
const MAX_STDIN = 1024 * 1024;
const MAX_SUMMARY = 220;
const FILE_PATH_KEYS = new Set([
  'file_path',
  'file_paths',
  'source_path',
  'destination_path',
  'old_file_path',
  'new_file_path',
]);

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/\bgh[opsu]_[A-Za-z0-9_]+\b/g, '[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, '[REDACTED]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(/\bASIA[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(/(Authorization\s*:?\s*)(Bearer|Basic)?\s*[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password|credentials?)\s*[=:]\s*)["']?[^"',;\s}]+["']?/gi, '$1[REDACTED]');
}

function normalizeText(value) {
  return stripAnsi(redactSecrets(value)).replace(/\s+/g, ' ').trim();
}

function truncate(value, maxLength = MAX_SUMMARY) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function sanitizeParamValue(value, depth = 0) {
  if (depth >= 4) {
    return '[Truncated]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncate(value, 180);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map(entry => sanitizeParamValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 24)
        .map(([key, nested]) => [key, sanitizeParamValue(nested, depth + 1)])
    );
  }
  return truncate(String(value), 180);
}

function sanitizeInputParams(toolInput) {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    return '{}';
  }
  try {
    return JSON.stringify(sanitizeParamValue(toolInput));
  } catch (_error) {
    return '{}';
  }
}

function pushUnique(list, value) {
  const candidate = String(value || '').trim();
  if (!candidate || /^(https?:\/\/|app:\/\/|plugin:\/\/|mcp:\/\/)/i.test(candidate)) {
    return;
  }
  if (!list.includes(candidate)) {
    list.push(candidate);
  }
}

function collectFilePaths(value, paths = []) {
  if (!value || typeof value !== 'object') {
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => collectFilePaths(entry, paths));
    return paths;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FILE_PATH_KEYS.has(key)) {
      if (Array.isArray(nested)) {
        nested.forEach(entry => pushUnique(paths, entry));
      } else {
        pushUnique(paths, nested);
      }
    } else if (nested && typeof nested === 'object') {
      collectFilePaths(nested, paths);
    }
  }
  return paths;
}

function pushFileEvent(events, event) {
  if (!event.path) {
    return;
  }
  if (!events.some(existing => existing.path === event.path && existing.action === event.action)) {
    events.push(event);
  }
}

function extractFileEvents(toolName, toolInput = {}) {
  const events = [];
  const filePath = toolInput.file_path;

  if (toolName === 'Read') {
    pushFileEvent(events, { path: filePath, action: 'read' });
  } else if (toolName === 'Write') {
    pushFileEvent(events, { path: filePath, action: 'write' });
  } else if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'ApplyPatch') {
    pushFileEvent(events, { path: filePath || toolInput.path, action: 'modify' });
  } else if (toolName === 'Delete') {
    pushFileEvent(events, { path: filePath || toolInput.path, action: 'delete' });
  } else if (toolName === 'Move' || toolName === 'Rename') {
    pushFileEvent(events, { path: toolInput.source_path || toolInput.old_file_path, action: 'move' });
    pushFileEvent(events, { path: toolInput.destination_path || toolInput.new_file_path, action: 'move' });
  }

  collectFilePaths(toolInput).forEach(candidate => {
    if (!events.some(event => event.path === candidate)) {
      pushFileEvent(events, { path: candidate, action: toolName === 'Read' ? 'read' : 'touch' });
    }
  });

  return events;
}

function summarizeInput(toolName, toolInput = {}) {
  if (!toolName) {
    return '';
  }
  const paths = collectFilePaths(toolInput);
  if (paths.length > 0) {
    return truncate(`${toolName} ${paths.join(', ')}`);
  }
  return truncate(`${toolName} ${JSON.stringify(sanitizeParamValue(toolInput))}`);
}

function summarizeOutput(output) {
  if (output === null || output === undefined) {
    return '';
  }
  if (typeof output === 'string') {
    return truncate(output);
  }
  if (typeof output === 'object' && typeof output.output === 'string') {
    return truncate(output.output);
  }
  return truncate(JSON.stringify(output));
}

function getHookEvent(env = process.env) {
  const hookId = String(env.GG_HOOK_ID || env.hookId || '').trim();
  if (hookId.startsWith('prompt:')) return 'user_prompt';
  if (hookId.startsWith('failure:')) return 'tool_failure';
  if (hookId.startsWith('session-start:')) return 'session_start';
  if (hookId.startsWith('session-end:') || hookId.startsWith('stop:')) return 'session_end';

  const raw = String(env.CLAUDE_HOOK_EVENT_NAME || env.GG_HOOK_EVENT_NAME || '').trim();
  if (raw === 'UserPromptSubmit') return 'user_prompt';
  if (raw === 'PostToolUseFailure') return 'tool_failure';
  if (raw === 'SessionStart') return 'session_start';
  if (raw === 'SessionEnd' || raw === 'Stop') return 'session_end';
  return 'tool_complete';
}

function getTraceDir(env = process.env) {
  const configured = String(env.GG_TASK_TRACE_DIR || '').trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(getClaudeDir(), 'metrics');
}

function getTraceFilePath(env = process.env) {
  const configured = String(env.GG_TASK_TRACE_FILE || '').trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(getTraceDir(env), TRACE_FILE_NAME);
}

function isEnabled(env = process.env) {
  return !['0', 'false', 'off', 'no'].includes(String(env.GG_TASK_TRACE || 'on').trim().toLowerCase());
}

function makeId(prefix = 'trace') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function deriveTaskId(input, env = process.env) {
  if (input.task_id) return String(input.task_id);
  if (env.GG_TASK_ID) return String(env.GG_TASK_ID);
  const session = input.session_id || env.CLAUDE_SESSION_ID || 'unknown';
  const prompt = input.prompt || input.user_prompt || input.message || '';
  if (!prompt) {
    return `task-${session}`;
  }
  const digest = crypto.createHash('sha1').update(`${session}:${prompt}`).digest('hex').slice(0, 12);
  return `task-${digest}`;
}

function addSignal(signals, kind, value) {
  const normalized = String(value || '').trim().replace(/[^A-Za-z0-9_./:-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) {
    return;
  }
  const signal = `${kind}:${normalized}`;
  if (!signals.includes(signal)) {
    signals.push(signal);
  }
}

function extractSignalsFromText(text) {
  const signals = [];
  const source = String(text || '');
  for (const match of source.matchAll(/\/gg:[A-Za-z0-9_-]+/g)) {
    addSignal(signals, 'command', match[0]);
  }
  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z0-9_-]+)\s+skill\b/gi)) {
    addSignal(signals, 'skill', match[1]);
  }
  for (const match of source.matchAll(/\b([A-Za-z][A-Za-z0-9_-]+)\s+agent\b/gi)) {
    addSignal(signals, 'agent', match[1]);
  }
  for (const match of source.matchAll(/skills\/([A-Za-z0-9_-]+)\/SKILL\.md/g)) {
    addSignal(signals, 'skill', match[1]);
  }
  for (const match of source.matchAll(/agents\/([A-Za-z0-9_-]+)\.md/g)) {
    addSignal(signals, 'agent', match[1]);
  }
  return signals;
}

function extractSignals(input, toolInput = {}) {
  const signals = [];
  const chunks = [
    input.prompt,
    input.user_prompt,
    input.message,
    toolInput.prompt,
    toolInput.description,
    toolInput.subagent_type ? `${toolInput.subagent_type} agent` : '',
    toolInput.target_file,
    toolInput.path,
    toolInput.file_path,
  ];
  chunks.forEach(chunk => {
    extractSignalsFromText(chunk).forEach(signal => {
      if (!signals.includes(signal)) signals.push(signal);
    });
  });
  return signals;
}

function buildTraceRecord(input, env = process.env) {
  const event = getHookEvent(env);
  const toolName = String(input.tool_name || input.tool || '').trim();
  const toolInput = input.tool_input || input.input || {};
  const toolOutput = input.tool_output ?? input.tool_response ?? input.output ?? '';
  const prompt = input.prompt || input.user_prompt || input.message || '';

  if (event.startsWith('tool_') && !toolName) {
    return null;
  }

  const fileEvents = event.startsWith('tool_') ? extractFileEvents(toolName, toolInput) : [];
  const filePaths = fileEvents.length > 0
    ? [...new Set(fileEvents.map(fileEvent => fileEvent.path))]
    : collectFilePaths(toolInput);

  const sessionId = String(input.session_id || input.session || env.CLAUDE_SESSION_ID || env.ECC_SESSION_ID || 'unknown');

  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId(event),
    timestamp: new Date().toISOString(),
    event,
    session_id: sessionId,
    task_id: deriveTaskId(input, env),
    cwd: input.cwd || env.PWD || null,
    project_hint: input.project_hint || env.CLAUDE_PROJECT_DIR || null,
    tool_name: toolName || null,
    tool_use_id: input.tool_use_id || '',
    input_summary: event === 'user_prompt' ? truncate(prompt) : summarizeInput(toolName, toolInput),
    output_summary: event.startsWith('tool_') ? summarizeOutput(toolOutput) : '',
    input_params_json: event.startsWith('tool_') ? sanitizeInputParams(toolInput) : '{}',
    file_paths: filePaths,
    file_events: fileEvents,
    signals: extractSignals(input, toolInput),
  };
}

function appendTraceRecord(record, env = process.env) {
  if (!record) {
    return null;
  }
  const traceFile = getTraceFilePath(env);
  appendFile(traceFile, `${JSON.stringify(record)}\n`);
  return traceFile;
}

function run(rawInput, env = process.env) {
  const effectiveEnv = env === process.env ? env : { ...process.env, ...env };
  if (!isEnabled(effectiveEnv)) {
    return rawInput;
  }

  try {
    const input = rawInput.trim() ? JSON.parse(rawInput) : {};
    const record = buildTraceRecord(input, effectiveEnv);
    appendTraceRecord(record, effectiveEnv);
  } catch (_error) {
    // Hooks should never block the user's primary workflow.
  }
  return rawInput;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      raw += chunk.slice(0, MAX_STDIN - raw.length);
    }
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  SCHEMA_VERSION,
  TRACE_FILE_NAME,
  buildTraceRecord,
  extractFileEvents,
  extractSignalsFromText,
  getTraceFilePath,
  redactSecrets,
  run,
  sanitizeInputParams,
};

