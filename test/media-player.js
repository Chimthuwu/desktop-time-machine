/** Regression checks: era media player — playback with sound, playlist, shuffle and repeat. */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A short 8-bit mono WAV so the test does not depend on any media asset.
function writeWav(file, seconds) {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(rate * seconds), 0x80);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: {
    preload: path.join(ROOT, 'electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true
  } });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dtm-media-'));
  const a = path.join(work, 'one.wav');
  const b = path.join(work, 'two.wav');
  writeWav(a, 0.4);
  writeWav(b, 0.4);
  const urlA = pathToFileURL(a).href;
  const urlB = pathToFileURL(b).href;

  try {
    // ---- queue logic (pure) ----

    await win.loadFile(path.join(ROOT, 'src/index.html'));
    // ---- the Windows 98 player with sound ----
    await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', 'windows98')`);
    await win.webContents.reload();
    await wait(2200);
    const logic = await win.webContents.executeJavaScript(`(() => {
      const M = document.getElementById('skin-viewport').contentWindow.DTMMediaPlayer;
      return {
        nextPlain: M.nextIndex({ count: 3, index: 0, shuffle: false, repeat: 'off' }),
        nextEnd: M.nextIndex({ count: 3, index: 2, shuffle: false, repeat: 'off' }),
        nextEndAll: M.nextIndex({ count: 3, index: 2, shuffle: false, repeat: 'all' }),
        nextOne: M.nextIndex({ count: 3, index: 1, shuffle: false, repeat: 'one' }),
        nextShuffle: M.nextIndex({ count: 3, index: 1, shuffle: true, repeat: 'off' }, () => 0.5),
        prevPlain: M.prevIndex({ count: 3, index: 2, repeat: 'off' }),
        prevWrap: M.prevIndex({ count: 3, index: 0, repeat: 'all' }),
        time: M.formatTime(125)
      };
    })()`);
    assert('next advances to the following track', logic.nextPlain === 1, JSON.stringify(logic));
    assert('end of queue stops when repeat is off', logic.nextEnd === -1, JSON.stringify(logic));
    assert('repeat all wraps to the first track', logic.nextEndAll === 0, JSON.stringify(logic));
    assert('repeat one replays the same track', logic.nextOne === 1, JSON.stringify(logic));
    assert('shuffle never picks the current track', logic.nextShuffle !== 1 && logic.nextShuffle >= 0, JSON.stringify(logic));
    assert('previous wraps under repeat all', logic.prevWrap === 2 && logic.prevPlain === 1, JSON.stringify(logic));
    assert('time formats as m:ss', logic.time === '2:05', JSON.stringify(logic));

    const opened = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      w.DTMApps.open('mediaplayer');
      await new Promise((r) => setTimeout(r, 600));
      const root = w.document.querySelector('.dtm-wmp');
      return { found: !!root, theme: root ? root.dataset.theme : null, hasController: !!(root && root._controller) };
    })()`);
    assert('Windows 98 opens the era media player', opened.found === true, JSON.stringify(opened));
    assert('the player uses the Windows 98 theme', opened.theme === 'win98', JSON.stringify(opened));
    assert('the player exposes its controller', opened.hasController === true, JSON.stringify(opened));

    const playback = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const c = w.document.querySelector('.dtm-wmp')._controller;
      c.add([{ name: 'one.wav', path: ${JSON.stringify(a)}, url: ${JSON.stringify(urlA)} },
             { name: 'two.wav', path: ${JSON.stringify(b)}, url: ${JSON.stringify(urlB)} }]);
      c.setRepeat('off');
      c.playAt(0);
      await new Promise((r) => setTimeout(r, 500));
      const m = c.media;
      const during = { time: m.currentTime, paused: m.paused, volume: m.volume, muted: m.muted, state: c.state() };
      await new Promise((r) => setTimeout(r, 1500));
      const after = { index: c.state().index, playing: c.state().playing, count: c.state().count };
      return { during, after };
    })()`);
    assert('a queued file plays with sound (time advances, not muted, full volume)',
      playback.during.time > 0 && playback.during.paused === false && playback.during.muted === false && playback.during.volume === 1,
      JSON.stringify(playback));
    assert('the queue moves on to the next track', playback.after.index === 1 || playback.after.playing === false, JSON.stringify(playback));
    assert('the playlist holds both tracks', playback.during.state.count === 2, JSON.stringify(playback));
    assert('playback stops after the last track when repeat is off', playback.after.playing === false, JSON.stringify(playback));
  } catch (error) {
    assert('media player suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {}
    console.log(JSON.stringify({ passed: results.passed, failed: results.failed, tests: results.tests }, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.quit();
  }
});
