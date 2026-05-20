#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getTraceFilePath } = require('./hooks/task-trace');

const SUMMARY_SCHEMA_VERSION = 'gg.task-trace.summary.v1';
const TIMELINE_SCHEMA_VERSION = 'gg.task-trace.timeline.v1';

function usage() {
  return [
    'Usage: node scripts/task-trace-inspect.js <summary|timeline> [options]',
    '',
    'Options:',
    '  --trace-file <path>      Read a specific task trace JSONL file',
    '  --session <id>           Filter to one session id',
    '  --task <id>              Filter to one task id',
    '  --format <json|markdown> Output format (default: json)',
    '  --write <path>           Write output to a file',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'summary';
  const options = {
    command,
    traceFile: null,
    sessionId: null,
    taskId: null,
    format: 'json',
    writePath: null,
  };

  for (let index = command === args[0] ? 1 : 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [flag, inlineValue] = arg.split('=', 2);
    const nextValue = inlineValue !== undefined ? inlineValue : args[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (!nextValue) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === '--trace-file') options.traceFile = nextValue;
    else if (flag === '--session') options.sessionId = nextValue;
    else if (flag === '--task') options.taskId = nextValue;
    else if (flag === '--format') options.format = nextValue;
    else if (flag === '--write') options.writePath = nextValue;
    else throw new Error(`Unknown argument: ${flag}`);
  }

  if (!['summary', 'timeline'].includes(options.command)) {
    throw new Error(`Invalid command: ${options.command}`);
  }
  if (!['json', 'markdown'].includes(options.format)) {
    throw new Error(`Invalid format: ${options.format}`);
  }

  return options;
}

function readTraceRecords(traceFile) {
  const target = path.resolve(traceFile || getTraceFilePath());
  if (!fs.existsSync(target)) {
    return [];
  }
  return fs.readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(record => record && record.schemaVersion === 'gg.task-trace.v1');
}

function filterRecords(records, options = {}) {
  return records.filter(record => {
    if (options.sessionId && record.session_id !== options.sessionId) {
      return false;
    }
    if (options.taskId && record.task_id !== options.taskId) {
      return false;
    }
    return true;
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function buildSummary(records) {
  const bySession = new Map();
  records.forEach(record => {
    const sessionId = record.session_id || 'unknown';
    if (!bySession.has(sessionId)) {
      bySession.set(sessionId, {
        session_id: sessionId,
        firstSeen: record.timestamp,
        lastSeen: record.timestamp,
        totalEvents: 0,
        toolCalls: 0,
        failures: 0,
        tasks: new Set(),
        tools: new Set(),
        files: new Set(),
        signals: new Set(),
      });
    }
    const session = bySession.get(sessionId);
    session.totalEvents += 1;
    session.firstSeen = session.firstSeen && session.firstSeen < record.timestamp ? session.firstSeen : record.timestamp;
    session.lastSeen = session.lastSeen && session.lastSeen > record.timestamp ? session.lastSeen : record.timestamp;
    if (record.event === 'tool_complete') session.toolCalls += 1;
    if (record.event === 'tool_failure') session.failures += 1;
    if (record.task_id) session.tasks.add(record.task_id);
    if (record.tool_name) session.tools.add(record.tool_name);
    (record.file_paths || []).forEach(filePath => session.files.add(filePath));
    (record.signals || []).forEach(signal => session.signals.add(signal));
  });

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    totalEvents: records.length,
    sessions: Array.from(bySession.values()).map(session => ({
      session_id: session.session_id,
      firstSeen: session.firstSeen,
      lastSeen: session.lastSeen,
      totalEvents: session.totalEvents,
      toolCalls: session.toolCalls,
      failures: session.failures,
      tasks: uniqueSorted([...session.tasks]),
      tools: uniqueSorted([...session.tools]),
      files: uniqueSorted([...session.files]),
      signals: uniqueSorted([...session.signals]),
    })).sort((left, right) => right.lastSeen.localeCompare(left.lastSeen)),
  };
}

function buildTimeline(records) {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    totalEvents: records.length,
    events: records.slice().sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp))),
  };
}

function escapeCell(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function renderSummaryMarkdown(summary) {
  const lines = [
    '# Task Trace Summary',
    '',
    `Total events: ${summary.totalEvents}`,
    '',
    '| Session | Events | Tool Calls | Failures | Signals | Files |',
    '| --- | ---: | ---: | ---: | --- | --- |',
  ];
  summary.sessions.forEach(session => {
    lines.push(`| ${escapeCell(session.session_id)} | ${session.totalEvents} | ${session.toolCalls} | ${session.failures} | ${escapeCell(session.signals.join(', '))} | ${escapeCell(session.files.join(', '))} |`);
  });
  return `${lines.join('\n')}\n`;
}

function renderTimelineMarkdown(timeline) {
  const lines = [
    '# Task Trace Timeline',
    '',
    '| # | Timestamp | Event | Tool | Summary | Files | Signals |',
    '| ---: | --- | --- | --- | --- | --- | --- |',
  ];
  timeline.events.forEach((event, index) => {
    const summary = event.input_summary || event.output_summary || '';
    lines.push(`| ${index + 1} | ${escapeCell(event.timestamp)} | ${escapeCell(event.event)} | ${escapeCell(event.tool_name)} | ${escapeCell(summary)} | ${escapeCell((event.file_paths || []).join(', '))} | ${escapeCell((event.signals || []).join(', '))} |`);
  });
  return `${lines.join('\n')}\n`;
}

function renderPayload(payload, command, format) {
  if (format === 'json') {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return command === 'summary'
    ? renderSummaryMarkdown(payload)
    : renderTimelineMarkdown(payload);
}

function inspect(options = {}) {
  const records = filterRecords(readTraceRecords(options.traceFile), options);
  return options.command === 'summary'
    ? buildSummary(records)
    : buildTimeline(records);
}

function main() {
  try {
    const options = parseArgs(process.argv);
    const payload = inspect(options);
    const output = renderPayload(payload, options.command, options.format);
    if (options.writePath) {
      const target = path.resolve(options.writePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output, 'utf8');
    } else {
      process.stdout.write(output);
    }
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n\n${usage()}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  SUMMARY_SCHEMA_VERSION,
  TIMELINE_SCHEMA_VERSION,
  buildSummary,
  buildTimeline,
  filterRecords,
  inspect,
  parseArgs,
  readTraceRecords,
  renderPayload,
};

