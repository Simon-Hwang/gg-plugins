#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.GATEGUARD_STATE_DIR || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.gateguard');
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const EDIT_WRITE_HOOK_ID = 'pre:edit-write:gateguard-fact-force';
const BASH_HOOK_ID = 'pre:bash:gateguard-fact-force';
const DISABLE_VALUES = new Set(['0', 'false', 'off', 'disabled', 'disable']);
const DESTRUCTIVE_BASH = /\b(rm\s+-rf|git\s+reset\s+--hard|git\s+checkout\s+--|git\s+clean\s+-f|drop\s+table|delete\s+from|truncate|git\s+push\s+--force(?!-with-lease)|git\s+commit\s+--amend|dd\s+if=)\b/i;

let activeStateFile = null;

function normalizeEnv(value) {
  return String(value || '').trim().toLowerCase();
}

function isDisabled() {
  if (DISABLE_VALUES.has(normalizeEnv(process.env.GG_GATEGUARD))) {
    return true;
  }

  const disabledHooks = String(process.env.GG_DISABLED_HOOKS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return disabledHooks.includes(EDIT_WRITE_HOOK_ID) || disabledHooks.includes(BASH_HOOK_ID);
}

function hash(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}

function sanitizeSessionKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized && sanitized.length <= 64 ? sanitized : hash('sid', raw);
}

function resolveSessionKey(data) {
  const candidates = [
    data?.session_id,
    data?.sessionId,
    data?.session?.id,
    process.env.CLAUDE_SESSION_ID,
    process.env.GG_SESSION_ID,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeSessionKey(candidate);
    if (sanitized) return sanitized;
  }

  const transcriptPath = data?.transcript_path || data?.transcriptPath || process.env.CLAUDE_TRANSCRIPT_PATH;
  if (transcriptPath && String(transcriptPath).trim()) {
    return hash('tx', path.resolve(String(transcriptPath).trim()));
  }
  return hash('proj', path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd()));
}

function getStateFile(data) {
  if (!activeStateFile) {
    activeStateFile = path.join(STATE_DIR, `state-${resolveSessionKey(data)}.json`);
  }
  return activeStateFile;
}

function loadState(data) {
  const stateFile = getStateFile(data);
  try {
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (Date.now() - Number(state.last_active || 0) <= SESSION_TIMEOUT_MS) {
        return {
          checked: Array.isArray(state.checked) ? state.checked : [],
          last_active: Number(state.last_active || Date.now()),
        };
      }
    }
  } catch (_error) {
    /* ignore malformed state */
  }
  return { checked: [], last_active: Date.now() };
}

function saveState(data, state) {
  const stateFile = getStateFile(data);
  const tmpFile = `${stateFile}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const finalState = {
      checked: Array.from(new Set(Array.isArray(state.checked) ? state.checked : [])).slice(-500),
      last_active: Date.now(),
    };
    fs.writeFileSync(tmpFile, JSON.stringify(finalState, null, 2), 'utf8');
    fs.renameSync(tmpFile, stateFile);
    return true;
  } catch (_error) {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch (_cleanupError) {
      /* ignore cleanup failure */
    }
    return false;
  }
}

function isChecked(data, key) {
  return loadState(data).checked.includes(key);
}

function markChecked(data, key) {
  const state = loadState(data);
  if (!state.checked.includes(key)) state.checked.push(key);
  return saveState(data, state);
}

function sanitizePath(filePath) {
  let sanitized = '';
  for (const char of String(filePath || '')) {
    const code = char.codePointAt(0);
    const control = code <= 0x1f || code === 0x7f;
    const bidi = (code >= 0x200e && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    sanitized += control || bidi ? ' ' : char;
  }
  return sanitized.trim().slice(0, 500);
}

function isClaudeSettingsPath(filePath) {
  return /(^|\/)\.claude\/settings(?:\.[^/]+)?\.json$/i.test(String(filePath || '').replace(/\\/g, '/'));
}

function isReadOnlyGitIntrospection(command) {
  const trimmed = String(command || '').trim();
  if (!trimmed || /[\r\n;&|><`$()]/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens[0] !== 'git' || tokens.length < 2) return false;

  const subcommand = tokens[1].toLowerCase();
  const args = tokens.slice(2);
  if (subcommand === 'status') return args.every(arg => ['--porcelain', '--short', '--branch'].includes(arg));
  if (subcommand === 'diff') return args.length <= 1 && args.every(arg => ['--name-only', '--name-status'].includes(arg));
  if (subcommand === 'log') return args.every(arg => arg === '--oneline' || /^--max-count=\d+$/.test(arg));
  if (subcommand === 'branch') return args.length === 1 && args[0] === '--show-current';
  return false;
}

function isSubagentInvocation(data) {
  return [data?.agent_id, data?.agentId, data?.parent_tool_use_id, data?.parentToolUseId]
    .some(value => typeof value === 'string' && value.trim());
}

function editGateMsg(filePath) {
  const safe = sanitizePath(filePath);
  return [
    '[Fact-Forcing Gate]',
    '',
    `Before editing ${safe}, present these facts:`,
    '',
    '1. List ALL files that import/require this file',
    '2. List the public functions/classes affected by this change',
    '3. If this file reads/writes data files, show field names, structure, and date format',
    "4. Quote the user's current instruction verbatim",
    '',
    'Present the facts, then retry the same operation.',
  ].join('\n');
}

function writeGateMsg(filePath) {
  const safe = sanitizePath(filePath);
  return [
    '[Fact-Forcing Gate]',
    '',
    `Before creating ${safe}, present these facts:`,
    '',
    '1. Name the file(s) and line(s) that will call this new file',
    '2. Confirm no existing file serves the same purpose',
    '3. If this file reads/writes data files, show field names, structure, and date format',
    "4. Quote the user's current instruction verbatim",
    '',
    'Present the facts, then retry the same operation.',
  ].join('\n');
}

function destructiveBashMsg() {
  return [
    '[Fact-Forcing Gate]',
    '',
    'Destructive command detected. Before running, present:',
    '',
    '1. List all files/data this command will modify or delete',
    '2. Write a one-line rollback procedure',
    "3. Quote the user's current instruction verbatim",
    '',
    'Present the facts, then retry the same operation.',
  ].join('\n');
}

function withRecoveryHint(message, hookIds = [EDIT_WRITE_HOOK_ID]) {
  const disableTargets = hookIds.map(hookId => `\`${hookId}\``).join(' or ');
  return [
    message,
    '',
    `Recovery: if GateGuard is blocking setup or repair work, run this session with \`GG_GATEGUARD=off\` or add ${disableTargets} to \`GG_DISABLED_HOOKS\`.`,
  ].join('\n');
}

function denyResult(reason, options = {}) {
  const includeRecoveryHint = options.includeRecoveryHint !== false;
  const hookIds = Array.isArray(options.hookIds) && options.hookIds.length > 0 ? options.hookIds : [EDIT_WRITE_HOOK_ID];
  return {
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: includeRecoveryHint ? withRecoveryHint(reason, hookIds) : reason,
      },
    }),
    exitCode: 0,
  };
}

function allowWithStateWarning() {
  return {
    stderr: '[Fact-Forcing Gate] GateGuard state could not be persisted; allowing this operation to avoid a permanent retry loop. Check GATEGUARD_STATE_DIR or filesystem permissions.',
    exitCode: 0,
  };
}

function run(rawInput) {
  let data;
  try {
    data = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch (_error) {
    return rawInput;
  }

  if (isDisabled()) return rawInput;

  activeStateFile = null;
  const rawToolName = String(data.tool_name || '');
  const toolName = { edit: 'Edit', write: 'Write', multiedit: 'MultiEdit', bash: 'Bash' }[rawToolName.toLowerCase()] || rawToolName;
  const toolInput = data.tool_input || {};
  const inSubagent = isSubagentInvocation(data);

  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    if (!filePath || isClaudeSettingsPath(filePath) || inSubagent) return rawInput;
    if (!isChecked(data, filePath)) {
      if (!markChecked(data, filePath)) return allowWithStateWarning();
      return denyResult(toolName === 'Edit' ? editGateMsg(filePath) : writeGateMsg(filePath));
    }
    return rawInput;
  }

  if (toolName === 'MultiEdit') {
    if (inSubagent) return rawInput;
    for (const edit of toolInput.edits || []) {
      const filePath = edit.file_path || '';
      if (filePath && !isClaudeSettingsPath(filePath) && !isChecked(data, filePath)) {
        if (!markChecked(data, filePath)) return allowWithStateWarning();
        return denyResult(editGateMsg(filePath));
      }
    }
    return rawInput;
  }

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (isReadOnlyGitIntrospection(command)) return rawInput;
    if (DESTRUCTIVE_BASH.test(command)) {
      const key = `__destructive__${crypto.createHash('sha256').update(command).digest('hex').slice(0, 16)}`;
      if (!isChecked(data, key)) {
        if (!markChecked(data, key)) return allowWithStateWarning();
        return denyResult(destructiveBashMsg(), { includeRecoveryHint: false, hookIds: [BASH_HOOK_ID] });
      }
    }
    return rawInput;
  }

  return rawInput;
}

module.exports = { run };
