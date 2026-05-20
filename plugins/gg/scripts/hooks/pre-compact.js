#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  appendFile,
  ensureDir,
  findFiles,
  getDateTimeString,
  getSessionsDir,
  getTimeString,
  log,
} = require('../lib/utils');

async function main() {
  const sessionsDir = getSessionsDir();
  const compactionLog = path.join(sessionsDir, 'gg-compaction-log.txt');

  ensureDir(sessionsDir);
  appendFile(compactionLog, `[${getDateTimeString()}] Context compaction triggered\n`);

  const sessions = findFiles(sessionsDir, '*-session.tmp');
  if (sessions.length > 0) {
    appendFile(
      sessions[0].path,
      `\n---\n**[Compaction occurred at ${getTimeString()}]** - Context was summarized\n`,
    );
  }

  log('[PreCompact] State saved before compaction');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(`[PreCompact] Error: ${error.message}\n`);
    process.exit(0);
  });
