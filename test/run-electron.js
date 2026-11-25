#!/usr/bin/env node
/**
 * Runs one Electron test script with a hard time limit and guaranteed cleanup.
 *
 *   node test/run-electron.js test/media-player.js
 *
 * Why this exists: the tests are plain `electron test/x.js` processes that only quit when their own code reaches
 * app.quit(). If a test hangs (a media element that never ends, a webview that never loads) or crashes after the
 * window is up, the Electron main, renderer and GPU processes stay alive and burn CPU for days. This wrapper kills the
 * whole process tree on timeout, on exit and on Ctrl-C, so nothing can be left behind.
 *
 * TEST_TIMEOUT_MS overrides the limit (default 3 minutes per script).
 */
const { spawn, spawnSync } = require('child_process');
const electronPath = require('electron');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node test/run-electron.js <test-script> [args...]');
  process.exit(2);
}
const limitMs = Number(process.env.TEST_TIMEOUT_MS) || 3 * 60 * 1000;

const child = spawn(electronPath, args, { stdio: 'inherit', windowsHide: true });
let timedOut = false;

function killTree() {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (e) { /* already gone */ }
}

const timer = setTimeout(() => {
  timedOut = true;
  console.error(`\n[run-electron] ${args[0]} exceeded ${Math.round(limitMs / 1000)}s: killing its process tree`);
  killTree();
}, limitMs);

child.on('exit', (code) => {
  clearTimeout(timer);
  killTree(); // sweep any renderer/GPU helper the main process left behind
  process.exit(timedOut ? 124 : (code == null ? 1 : code));
});
child.on('error', (err) => {
  clearTimeout(timer);
  console.error('[run-electron] could not start Electron:', err.message);
  process.exit(1);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killTree(); process.exit(130); });
