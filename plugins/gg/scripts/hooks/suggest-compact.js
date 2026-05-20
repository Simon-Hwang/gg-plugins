#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getTempDir, readStdinJson, writeFile, log } = require('../lib/utils');

async function resolveSessionId() {
  try {
    const input = await readStdinJson({ timeoutMs: 1000 });
    if (input && typeof input.session_id === 'string' && input.session_id) {
      return input.session_id;
    }
  } catch (_error) {
    /* fall through */
  }
  return process.env.CLAUDE_SESSION_ID || 'default';
}

async function main() {
  const rawSessionId = await resolveSessionId();
  const sessionId = rawSessionId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const counterFile = path.join(getTempDir(), `gg-tool-count-${sessionId}`);
  const rawThreshold = parseInt(process.env.GG_COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  let count = 1;
  try {
    const fd = fs.openSync(counterFile, 'a+');
    try {
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      if (bytesRead > 0) {
        const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
        count = Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000 ? parsed + 1 : 1;
      }
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(count), 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_error) {
    writeFile(counterFile, String(count));
  }

  if (count === threshold) {
    log(`[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`);
  }

  if (count > threshold && (count - threshold) % 25 === 0) {
    log(`[StrategicCompact] ${count} tool calls - good checkpoint for /compact if context is stale`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(`[StrategicCompact] Error: ${error.message}\n`);
    process.exit(0);
  });
