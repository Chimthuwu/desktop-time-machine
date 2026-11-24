/** Regression checks: Windows-style keyboard model for desktop and Explorer surfaces. */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: {
    preload: path.join(ROOT, 'electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true
  } });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dtm-keys-'));

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', 'windows95')`);
    await win.webContents.reload();
    await wait(2200);

    // ---- type-to-select (pure logic) ----
    const names = ['Alpha', 'Beta', 'beta two', 'Gamma'];
    const ta = await win.webContents.executeJavaScript(`(() => {
      const f = window.dtmMirrorKeys.findTypeAhead;
      return {
        firstB: f(['Alpha', 'Beta', 'beta two', 'Gamma'], 'b', -1),
        cycleB: f(['Alpha', 'Beta', 'beta two', 'Gamma'], 'b', 1),
        cycleBWrap: f(['Alpha', 'Beta', 'beta two', 'Gamma'], 'b', 2),
        prefixBe: f(['Alpha', 'Beta', 'beta two', 'Gamma'], 'be', 0),
        prefixBeta2: f(['Alpha', 'Beta', 'beta two', 'Gamma'], 'beta t', 0),
        none: f(['Alpha', 'Beta'], 'z', 0)
      };
    })()`);
    assert('letter jumps to first match', ta.firstB === 1, JSON.stringify(ta));
    assert('repeated letter cycles to next match', ta.cycleB === 2, JSON.stringify(ta));
    assert('repeated letter wraps around', ta.cycleBWrap === 1, JSON.stringify(ta));
    assert('typed prefix narrows the match', ta.prefixBe === 1 && ta.prefixBeta2 === 2, JSON.stringify(ta));
    assert('no match returns -1', ta.none === -1, JSON.stringify(ta));

    // ---- key dispatch with a fake context ----
    const keys = await win.webContents.executeJavaScript(`(() => {
      const H = window.dtmMirrorKeys.handleFileKey;
      const log = [];
      const sel = [{ path: 'C:\\\\x\\\\a.txt', name: 'a.txt' }];
      const ctx = {
        items: () => [{ path: 'C:\\\\x\\\\a.txt', name: 'a.txt' }, { path: 'C:\\\\x\\\\b.txt', name: 'b.txt' }],
        selected: () => sel,
        select: (i) => log.push('select:' + i),
        selectAll: () => log.push('selectAll'),
        clear: () => log.push('clear'),
        open: () => log.push('open'),
        rename: () => log.push('rename'),
        remove: () => log.push('remove'),
        paste: () => log.push('paste'),
        up: () => log.push('up'),
        typeAhead: (c, names, cur) => { log.push('type:' + c); return 1; },
        backspace: 'remove'
      };
      const ev = (key, mods) => Object.assign({ key, ctrlKey: false, metaKey: false, altKey: false,
        defaultPrevented: false, target: { tagName: 'DIV' }, preventDefault() { this.defaultPrevented = true; } }, mods || {});
      const out = {};
      out.f2 = H(ev('F2'), ctx);
      out.del = H(ev('Delete'), ctx);
      out.bksp = H(ev('Backspace'), ctx);
      out.enter = H(ev('Enter'), ctx);
      out.ctrlA = H(ev('a', { ctrlKey: true }), ctx);
      out.ctrlC = H(ev('c', { ctrlKey: true }), ctx);
      out.ctrlX = H(ev('x', { ctrlKey: true }), ctx);
      out.ctrlV = H(ev('v', { ctrlKey: true }), ctx);
      out.down = H(ev('ArrowDown'), ctx);
      out.letter = H(ev('b'), ctx);
      out.space = H(ev(' '), ctx);
      const inInput = H(ev('b', { target: { tagName: 'INPUT' } }), ctx);
      out.inInput = inInput;
      out.log = log;
      return out;
    })()`);
    assert('F2 renames the single selection', keys.f2 === true && keys.log.includes('rename'), JSON.stringify(keys));
    assert('Delete removes the selection', keys.del === true && keys.log.includes('remove'), JSON.stringify(keys));
    assert('Enter opens the selection', keys.enter === true && keys.log.includes('open'), JSON.stringify(keys));
    assert('Ctrl+A selects all', keys.ctrlA === true && keys.log.includes('selectAll'), JSON.stringify(keys));
    assert('Ctrl+V pastes', keys.ctrlV === true && keys.log.includes('paste'), JSON.stringify(keys));
    assert('arrow down selects the next item', keys.down === true && keys.log.includes('select:1'), JSON.stringify(keys));
    assert('typed letter goes to type-to-select', keys.letter === true && keys.log.includes('type:b'), JSON.stringify(keys));
    assert('space is not treated as a letter', keys.space === false, JSON.stringify(keys));
    assert('keys typed into a text field are ignored', keys.inInput === false, JSON.stringify(keys));

    // ---- real copy and cut through the shared clipboard ----
    const src = path.join(work, 'src');
    const dst = path.join(work, 'dst');
    const dst2 = path.join(work, 'dst2');
    fs.mkdirSync(src); fs.mkdirSync(dst); fs.mkdirSync(dst2);
    fs.writeFileSync(path.join(src, 'note.txt'), 'hello');
    const srcFile = path.join(src, 'note.txt');
    const pasted = await win.webContents.executeJavaScript(`(async () => {
      const H = window.dtmMirrorKeys.handleFileKey;
      const sel = [{ path: ${JSON.stringify(srcFile)}, name: 'note.txt' }];
      const ctx = { items: () => [], selected: () => sel, select() {}, selectAll() {}, clear() {}, open() {},
        rename() {}, remove() {}, paste: () => {}, up() {}, typeAhead: () => -1, backspace: 'up' };
      const copyEv = { key: 'c', ctrlKey: true, metaKey: false, altKey: false, defaultPrevented: false,
        target: { tagName: 'DIV' }, preventDefault() { this.defaultPrevented = true; } };
      H(copyEv, ctx);
      const ok = await window.dtmMirrorKeys.pasteClipboard(window.dtmEngine, ${JSON.stringify(dst)});
      return ok;
    })()`);
    assert('Ctrl+C then paste attempts the copy', pasted === true, String(pasted));
    assert('copied file exists at destination', fs.existsSync(path.join(dst, 'note.txt')));
    assert('copy keeps the source', fs.existsSync(srcFile));

    const cutOk = await win.webContents.executeJavaScript(`(async () => {
      const H = window.dtmMirrorKeys.handleFileKey;
      const sel = [{ path: ${JSON.stringify(srcFile)}, name: 'note.txt' }];
      const ctx = { items: () => [], selected: () => sel, select() {}, selectAll() {}, clear() {}, open() {},
        rename() {}, remove() {}, paste: () => {}, up() {}, typeAhead: () => -1, backspace: 'up' };
      H({ key: 'x', ctrlKey: true, altKey: false, metaKey: false, defaultPrevented: false,
        target: { tagName: 'DIV' }, preventDefault() {} }, ctx);
      return await window.dtmMirrorKeys.pasteClipboard(window.dtmEngine, ${JSON.stringify(dst2)});
    })()`);
    assert('Ctrl+X then paste attempts the move', cutOk === true, String(cutOk));
    assert('cut moves the file away from the source', !fs.existsSync(srcFile) && fs.existsSync(path.join(dst2, 'note.txt')));
  } catch (error) {
    assert('file keyboard suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {}
    console.log(JSON.stringify({ passed: results.passed, failed: results.failed, tests: results.tests }, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.quit();
  }
});
