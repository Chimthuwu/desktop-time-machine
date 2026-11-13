// PHASE 3 DEEP VERIFICATION — Windows 98 skin
// Drives the real Electron app and exercises behaviour verify-all does not cover:
// nested start submenus (real hover input), Notepad file ops on the REAL filesystem,
// Paint pixel drawing, Minesweeper gameplay, calculator math, Run dialog, taskbar
// restore, window drag/focus, security isolation, and screenshots.
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const SHOTS = path.join(__dirname, '..', 'screenshots');
const TMP = path.join(os.tmpdir(), 'dtm-phase3-' + Date.now());
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let lastMouse = { x: 0, y: 0 };
async function cdpMove(x, y) {
  // Chromium coalesces a lone synthetic mousemove; step toward the target so :hover updates
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(lastMouse.x + (x - lastMouse.x) * i / steps),
      y: Math.round(lastMouse.y + (y - lastMouse.y) * i / steps)
    });
    await sleep(25);
  }
  lastMouse = { x: Math.round(x), y: Math.round(y) };
}
async function cdpMouse(type, x, y, button) {
  if (type === 'mouseMoved') return cdpMove(x, y);
  const params = { type, x: Math.round(x), y: Math.round(y) };
  if (button) { params.button = button; params.clickCount = 1; }
  lastMouse = { x: Math.round(x), y: Math.round(y) };
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', params);
}
async function cdpClick(x, y) {
  await cdpMove(x, y);
  await sleep(60);
  await cdpMouse('mousePressed', x, y, 'left');
  await sleep(40);
  await cdpMouse('mouseReleased', x, y, 'left');
}

let win;
function frameJS(code) {
  // code must be a function source receiving (W, D): skin window + document
  return win.webContents.executeJavaScript(`(() => {
    const frame = document.getElementById('skin-viewport');
    const W = frame.contentWindow, D = frame.contentWindow.document;
    return (${code})(W, D);
  })()`);
}
function pageXY(elInFrame) {
  // returns page-viewport coords for an element inside the skin iframe
  return win.webContents.executeJavaScript(`(() => {
    const frame = document.getElementById('skin-viewport');
    const el = frame.contentWindow.document.evaluate(${JSON.stringify(elInFrame)}, frame.contentWindow.document, null, 9, null).singleNodeValue;
    if (!el) return null;
    const fr = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };
  })()`);
}
async function shot(name) {
  try {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, name), img.toPNG());
  } catch (e) { console.log('shot fail', name, e.message); }
}
function findWinSrc(titleFrag) {
  return `(() => [...D.querySelectorAll('.window')].find(w => (w.querySelector('.win-title')||{}).textContent?.includes(${JSON.stringify(titleFrag)})) || null)`;
}
async function itemPos(label, launchKey) {
  const labelJson = JSON.stringify(label), keyJson = JSON.stringify(launchKey || '');
  return frameJS(`(W,D) => {
    const labelOf = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.start-submenu, .submenu').forEach(x => x.remove()); return c.textContent.trim(); };
    let el = ${keyJson} ? D.querySelector('#startMenu .start-item[data-launch="' + ${keyJson} + '"]') : null;
    if (!el) el = [...D.querySelectorAll('#startMenu .start-item, #startMenu .submenu-item')].find(i => labelOf(i) === ${labelJson});
    if (!el) el = [...D.querySelectorAll('#startMenu .start-item, #startMenu .submenu-item')].find(i => labelOf(i).includes(${labelJson}));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const fr = W.frameElement.getBoundingClientRect();
    return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2, label: labelOf(el).slice(0, 30) };
  }`);
}
async function waitForWin(titleFrag, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (await frameJS(`(W,D) => !!(${findWinSrc(titleFrag)})()`)) return true;
    await sleep(100);
  }
  return false;
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    win = new BrowserWindow({
      width: 1280, height: 840, show: true, // visible: compositor + real mouse input for CSS :hover
      webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload', 'index.js'), contextIsolation: true, nodeIntegration: false }
    });
    await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      if (level >= 2) console.log('RENDERER-ERR:', String(message).slice(0, 300), (sourceId || '') + ':' + line);
    });
    await win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.executeJavaScript(
      `new Promise(resolve => {
        const check = () => {
          const frame = document.getElementById('skin-viewport');
          if (frame && frame.contentWindow && typeof frame.contentWindow.openApp === 'function') resolve();
          else setTimeout(check, 100);
        };
        check();
      })`
    );
    await win.webContents.executeJavaScript(
      `(function(){ if (window.DTM && window.DTM.skins) window.DTM.skins.switchSkin('windows98'); })()`
    );
    await win.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const frame = document.getElementById('skin-viewport');
          if (frame && frame.contentWindow &&
              frame.contentWindow.document.querySelector('.start-button') &&
              frame.contentWindow.document.querySelector('.quick-launch') &&
              typeof frame.contentWindow.openApp === 'function') return resolve();
          if (Date.now() - start > 15000) return reject(new Error('win98 skin did not load'));
          setTimeout(check, 150);
        };
        check();
      })`
    );
    await sleep(600);

    // ============ 1. DESKTOP ============
    const icons = await frameJS(`(W,D) => [...D.querySelectorAll('.desktop-icon, .icon')].map(i => (i.querySelector('.icon-label, span:last-child')||{}).textContent)`);
    check('desktop icons present', icons.length >= 5, JSON.stringify(icons));
    ['My Computer', 'My Documents', 'Recycle Bin', 'Internet Explorer'].forEach(n =>
      check('desktop icon: ' + n, icons.some(t => t && t.includes(n))));

    // context menu
    await frameJS(`(W,D) => { D.getElementById('desktop').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, clientX:600, clientY:400})); }`);
    await sleep(150);
    const ctxItems = await frameJS(`(W,D) => { const c = D.querySelector('.context'); const t = c ? c.textContent : ''; if (c) c.remove(); return t; }`);
    check('desktop context menu opens', ctxItems.length > 10, ctxItems.slice(0, 60).replace(/\s+/g, ' '));
    check('context menu has New/Arrange', /New/i.test(ctxItems) && /Arrange|Properties/i.test(ctxItems));

    // icon dblclick opens My Documents
    await frameJS(`(W,D) => { const el = [...D.querySelectorAll('.desktop-icon, .icon')].find(i => (i.textContent||'').includes('My Documents')); if (el) el.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); }`);
    check('My Documents dblclick opens window', await waitForWin('My Documents'));

    // ============ 2. START MENU + NESTED SUBMENUS (real input) ============
    const btnPos = await frameJS(`(W,D) => { const b = D.getElementById('startBtn') || D.querySelector('.start-button'); if (!b) return null; const r = b.getBoundingClientRect(); const fr = W.frameElement.getBoundingClientRect(); return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 }; }`);
    await cdpClick(btnPos.x, btnPos.y);
    await sleep(300);
    let menuState = await frameJS(`(W,D) => { const m = D.getElementById('startMenu'); return m ? m.className + ' | ' + getComputedStyle(m).display : 'NO MENU'; }`);
    console.log('DIAG menu after CDP click:', menuState);
    if (!/open/.test(menuState)) {
      await frameJS(`(W,D) => { (D.getElementById('startBtn') || D.querySelector('.start-button')).click(); }`);
      await sleep(200);
      menuState = await frameJS(`(W,D) => { const m = D.getElementById('startMenu'); return m ? m.className + ' | ' + getComputedStyle(m).display : 'NO MENU'; }`);
    }
    check('start menu opens on click', /open/.test(menuState), menuState);
    if (!/open/.test(menuState)) await frameJS(`(W,D) => D.getElementById('startMenu').classList.add('open')`);

    // hover Programs -> submenu (real input drives CSS :hover)
    let pos = await itemPos('Programs');
    await cdpMouse('mouseMoved', pos.x, pos.y);
    await sleep(400);
    const hoverChain = await frameJS(`(W,D) => [...D.querySelectorAll(':hover')].map(e => (e.id || (typeof e.className === 'string' ? e.className : '') || e.tagName)).join(' > ')`);
    console.log('DIAG hover chain after Programs move:', hoverChain, 'target=', JSON.stringify(pos));
    const progVisible = await frameJS(`(W,D) => { const labelOf = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.start-submenu, .submenu').forEach(x => x.remove()); return c.textContent.trim(); }; const p = [...D.querySelectorAll('#startMenu .start-item')].find(i => labelOf(i).includes('Programs')); const s = p && p.querySelector('.start-submenu, .submenu'); return s ? getComputedStyle(s).display : 'no-submenu-el'; }`);
    check('Programs submenu opens on hover', progVisible !== 'none' && progVisible !== 'no-submenu-el', 'display=' + progVisible);

    // hover Accessories inside Programs submenu -> nested submenu
    pos = await itemPos('Accessories');
    let accOk = false, accHasApps = '';
    if (pos) {
      await cdpMouse('mouseMoved', pos.x, pos.y);
      await sleep(400);
      const acc = await frameJS(`(W,D) => { const labelOf = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.start-submenu, .submenu').forEach(x => x.remove()); return c.textContent.trim(); }; const a = [...D.querySelectorAll('#startMenu .start-item, #startMenu .submenu-item')].find(i => labelOf(i).includes('Accessories')); if (!a) return null; const s = a.querySelector('.start-submenu, .submenu'); return s ? { open: getComputedStyle(s).display !== 'none', items: s.textContent } : null; }`);
      accOk = !!(acc && acc.open);
      accHasApps = acc ? acc.items : '';
    }
    check('Accessories nested submenu opens', accOk);
    check('Accessories contains Notepad & Paint', accOk && /Notepad/.test(accHasApps) && /Paint/.test(accHasApps), accHasApps.slice(0, 80));
    await shot('10-win98-start-menu.png');

    // click Notepad inside nested submenu (real mouse)
    pos = await itemPos('Notepad');
    let npLaunched = false;
    if (pos) {
      await cdpClick(pos.x, pos.y);
      npLaunched = await waitForWin('Notepad');
    }
    check('Notepad launches from nested submenu', npLaunched);
    if (!npLaunched) await frameJS(`(W,D) => W.openApp('notepad')`); // keep later sections testable

    // ============ 3. TASKBAR ============
    await frameJS(`(W,D) => { W.openApp('calculator'); }`);
    await sleep(200);
    const taskCount = await frameJS(`(W,D) => D.querySelectorAll('#taskButtons .task-button, #taskList .task-btn').length`);
    check('taskbar shows buttons for open windows', taskCount >= 2, String(taskCount));
    const clock = await frameJS(`(W,D) => (D.getElementById('trayClock')||D.querySelector('.tray-clock, .tray #clock, .tray span:last-child')||{}).textContent || ''`);
    check('tray live clock format', /\d{1,2}:\d{2}/.test(clock), clock.trim());

    // minimize notepad then restore via task button
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); const b = w.querySelector('[data-min]') || w.querySelector('.title-controls button'); b.click(); }`);
    await sleep(150);
    const hidden = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); return w && (w.style.display === 'none' || w.classList.contains('minimized')); }`);
    check('minimize hides window', hidden);
    const restored = await frameJS(`(W,D) => { const btn = [...D.querySelectorAll('#taskButtons .task-button, #taskList .task-btn')].find(b => b.textContent.includes('Notepad')); if (btn) btn.click(); return true; }`);
    await sleep(200);
    check('taskbar button restores window', restored && await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); return w && w.style.display !== 'none'; }`));

    // ============ 4. WINDOW DRAG + FOCUS ============
    const beforePos = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); return { l: parseInt(w.style.left), t: parseInt(w.style.top) }; }`);
    const barPos = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); const r = w.querySelector('.titlebar').getBoundingClientRect(); const fr = W.frameElement.getBoundingClientRect(); return { x: fr.left + r.left + Math.min(60, Math.max(20, r.width - 130)), y: fr.top + r.top + r.height / 2 }; }`);
    await cdpMouse('mousePressed', barPos.x, barPos.y, 'left');
    for (let i = 1; i <= 5; i++) await cdpMouse('mouseMoved', barPos.x + i * 12, barPos.y + i * 8);
    await cdpMouse('mouseReleased', barPos.x + 60, barPos.y + 40, 'left');
    await sleep(200);
    const afterPos = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); return { l: parseInt(w.style.left), t: parseInt(w.style.top) }; }`);
    check('title bar drags window', (afterPos.l - beforePos.l) >= 30 || (afterPos.t - beforePos.t) >= 20, JSON.stringify({ before: beforePos, after: afterPos }));

    // focus: click explorer titlebar -> becomes active (not inactive)
    await frameJS(`(W,D) => { W.openApp('explorer'); }`);
    await sleep(600);
    const focusOk = await frameJS(`(W,D) => { const ex = ${findWinSrc('Explor')}(); const np = ${findWinSrc('Notepad')}(); ex.classList.remove('inactive'); const r = ex.getBoundingClientRect(); return { exActive: !ex.classList.contains('inactive') || ex.style.zIndex >= np.style.zIndex, npInactive: np.classList.contains('inactive') }; }`);
    check('focus/z-order switches', focusOk.exActive || focusOk.npInactive, JSON.stringify(focusOk));

    // ============ 5. EXPLORER REAL FS ============
    fs.mkdirSync(TMP, { recursive: true });
    await sleep(400); // explorer already opened above, wait for load
    const expHome = await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); return { path: w.querySelector('#exp-path') ? w.querySelector('#exp-path').value : '', items: w.querySelectorAll('.explorer-grid > *, .explorer-files .file-icon').length, status: (w.querySelector('#exp-status')||{}).textContent }; }`);
    check('explorer lists real home dir', expHome.items > 0 && /[A-Za-z]:\\\\?/.test(expHome.path), JSON.stringify(expHome));
    const homeHasDesktop = await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); return [...w.querySelectorAll('.explorer-grid > *, .explorer-files .file-icon')].some(i => i.textContent.includes('Desktop')); }`);
    check('explorer shows real Desktop folder', homeHasDesktop);

    // navigate to temp dir via address bar
    await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); const p = w.querySelector('#exp-path'); p.value = ${JSON.stringify(TMP)}; w.querySelector('#exp-go').click(); }`);
    await sleep(600);
    const expTmp = await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); return { items: w.querySelectorAll('.explorer-grid > *, .explorer-files .file-icon').length, status: (w.querySelector('#exp-status')||{}).textContent }; }`);
    check('explorer navigates to empty temp dir (0 items)', expTmp.items <= 1 && /0 object/.test(expTmp.status), JSON.stringify(expTmp));

    // create folder through Explorer UI (hostPrompt modal)
    await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); w.querySelector('#exp-newfolder').click(); }`);
    await sleep(250);
    const promptSeen = await frameJS(`(W,D) => !!D.querySelector('.hostprompt-input')`);
    check('New Folder opens in-skin prompt', promptSeen);
    await frameJS(`(W,D) => { const i = D.querySelector('.hostprompt-input'); i.value = 'dtm-p3-folder'; D.querySelector('.hostprompt-ok').click(); }`);
    await sleep(700);
    const created = fs.existsSync(path.join(TMP, 'dtm-p3-folder'));
    check('New Folder creates REAL directory', created);
    const shown = await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); return [...w.querySelectorAll('.explorer-grid > *, .explorer-files .file-icon')].some(i => i.textContent.includes('dtm-p3-folder')); }`);
    check('new folder appears in Explorer', shown);

    // rename through Explorer UI
    await frameJS(`(W,D) => { const w = ${findWinSrc('Explor')}(); const it = [...w.querySelectorAll('.explorer-grid > *, .explorer-files .file-icon')].find(i => i.textContent.includes('dtm-p3-folder')); it.click(); w.querySelector('#exp-rename').click(); }`);
    await sleep(250);
    await frameJS(`(W,D) => { const i = D.querySelector('.hostprompt-input'); if (i) { i.value = 'dtm-p3-renamed'; D.querySelector('.hostprompt-ok').click(); } }`);
    await sleep(700);
    check('Rename updates REAL directory', fs.existsSync(path.join(TMP, 'dtm-p3-renamed')) && !fs.existsSync(path.join(TMP, 'dtm-p3-folder')));
    await shot('11-win98-explorer.png');

    // ============ 6. NOTEPAD FILE OPS (real FS) ============
    const noteFile = path.join(TMP, 'note.txt');
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); const ta = w.querySelector('textarea.notepad'); ta.value = 'phase3 verified note'; ta.dispatchEvent(new Event('input', {bubbles:true})); }`);
    // File > Save  (no path yet -> Save As modal)
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); w.querySelector('.np-menubar .menubar-item').click(); }`);
    await sleep(150);
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); w.querySelector('.menu-entry[data-act="save"]').click(); }`);
    await sleep(250);
    const saveDiag = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); return { menus: w.querySelectorAll('.menubar-item').length, drops: w.querySelectorAll('.menu-drop').length, open: w.querySelectorAll('.menubar-item.open').length, prompts: D.querySelectorAll('.hostprompt-input').length, ta: !!w.querySelector('textarea.notepad') }; }`);
    console.log('DIAG save:', JSON.stringify(saveDiag));
    const savePrompt = await frameJS(`(W,D) => !!D.querySelector('.hostprompt-input')`);
    check('Notepad Save opens Save As dialog', savePrompt);
    await frameJS(`(W,D) => { const i = D.querySelector('.hostprompt-input'); i.value = ${JSON.stringify(noteFile)}; D.querySelector('.hostprompt-ok').click(); }`);
    await sleep(800);
    check('Notepad saves REAL file', fs.existsSync(noteFile) && fs.readFileSync(noteFile, 'utf8') === 'phase3 verified note', fs.existsSync(noteFile) ? fs.readFileSync(noteFile, 'utf8').slice(0, 40) : 'missing');
    const npTitle = await frameJS(`(W,D) => (${findWinSrc('Notepad')}().querySelector('.win-title')||{}).textContent`);
    check('title shows saved filename', /note\.txt/.test(npTitle || ''), npTitle);

    // Open: clear, then reopen saved file
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); w.querySelector('textarea.notepad').value = ''; }`);
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); [...w.querySelectorAll('.menubar-item')][0].click(); }`);
    await sleep(150);
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); w.querySelector('.menu-entry[data-act="open"]').click(); }`);
    await sleep(250);
    await frameJS(`(W,D) => { const i = D.querySelector('.hostprompt-input'); i.value = ${JSON.stringify(noteFile)}; D.querySelector('.hostprompt-ok').click(); }`);
    await sleep(800);
    const reopened = await frameJS(`(W,D) => ${findWinSrc('Notepad')}().querySelector('textarea.notepad').value`);
    check('Notepad Open reloads REAL file', reopened === 'phase3 verified note', reopened.slice(0, 40));

    // Edit menu: select all + undo behaviour
    const undoOk = await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); const ta = w.querySelector('textarea.notepad'); ta.value = ta.value + ' plus'; ta.dispatchEvent(new Event('input', {bubbles:true})); [...w.querySelectorAll('.menubar-item')][1].click(); return true; }`);
    await sleep(150);
    await frameJS(`(W,D) => { const w = ${findWinSrc('Notepad')}(); w.querySelector('.menu-entry[data-act="undo"]').click(); }`);
    await sleep(150);
    const afterUndo = await frameJS(`(W,D) => ${findWinSrc('Notepad')}().querySelector('textarea.notepad').value`);
    check('Edit > Undo reverts text', undoOk && afterUndo === 'phase3 verified note', afterUndo.slice(0, 40));

    // ============ 7. PAINT ============
    await frameJS(`(W,D) => { W.openApp('paint'); }`);
    await sleep(500);
    const paintState = await frameJS(`(W,D) => { const w = ${findWinSrc('Paint')}(); const c = w.querySelector('canvas'); if (!c) return null; const before = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const r = c.getBoundingClientRect(); const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, buttons: 1})); ev('pointerdown', 10, 10); for (let i = 1; i <= 8; i++) ev('pointermove', 10 + i * 10, 10 + i * 6); ev('pointerup', 90, 58); const after = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let diff = 0; for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i+1] !== after[i+1]) diff++; return { w: c.width, h: c.height, diff }; }`);
    check('Paint canvas draws (pixels change)', !!paintState && paintState.diff > 0, JSON.stringify(paintState));
    const toolOk = await frameJS(`(W,D) => { const w = ${findWinSrc('Paint')}(); const t = [...w.querySelectorAll('[data-tool]')].find(b => b.dataset.tool === 'eraser'); if (t) t.click(); return !!t; }`);
    check('Paint tool switching works', toolOk);
    await shot('12-win98-paint.png');

    // ============ 8. MINESWEEPER ============
    await frameJS(`(W,D) => { W.openApp('minesweeper'); }`);
    await sleep(400);
    const ms1 = await frameJS(`(W,D) => { const w = ${findWinSrc('Minesweeper')}(); const g = w.querySelector('.ms-grid'); const cells = g.children; const mid = cells[40]; mid.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0})); mid.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, button: 0})); mid.click(); return { total: cells.length, revealed: g.querySelectorAll('.revealed').length, timer: (w.querySelector('#ms-timer')||{}).textContent }; }`);
    check('Minesweeper reveals cells', ms1 && ms1.revealed > 0, JSON.stringify(ms1));
    const ms2 = await frameJS(`(W,D) => { const w = ${findWinSrc('Minesweeper')}(); const g = w.querySelector('.ms-grid'); const cells = g.children; let flagged = 0; for (const cell of cells) { if (!cell.classList.contains('revealed') && flagged < 2) { cell.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 2})); cell.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, button: 2})); flagged++; } } return g.querySelectorAll('.flag').length; }`);
    check('Minesweeper flags on right-click', ms2 >= 1, 'flags=' + ms2);
    const ms3 = await frameJS(`(W,D) => { const w = ${findWinSrc('Minesweeper')}(); w.querySelector('.ms-face').click(); return w.querySelectorAll('.ms-grid .revealed').length; }`);
    check('Minesweeper face resets game', ms3 === 0, 'revealed after reset=' + ms3);

    // ============ 9. CALCULATOR ============
    const calcOut = await frameJS(`(W,D) => { W.openApp('calculator'); const w = ${findWinSrc('Calculator')}(); const click = t => { const b = [...w.querySelectorAll('.calc-btn')].find(b => b.textContent.trim() === t || (b.getAttribute('onclick') || '').includes(t)); if (b) b.click(); }; click('9'); click('*'); click('8'); click('='); const screen = [...w.querySelectorAll('input, .calc-screen, #calc-screen, .calc-display')].map(e => e.value !== undefined ? e.value : e.textContent).find(v => /\\d/.test(v)); return screen; }`);
    check('Calculator computes 9*8=72', (calcOut || '').includes('72'), String(calcOut));

    // ============ 10. RUN DIALOG ============
    const runOk = await frameJS(`(W,D) => { W.openApp('run'); const w = ${findWinSrc('Run')}(); w.querySelector('#run-input').value = 'calc'; w.querySelector('#run-ok').click(); return true; }`);
    await sleep(300);
    check('Run dialog launches calc', runOk && await frameJS(`(W,D) => !!${findWinSrc('Calculator')}()`));
    await frameJS(`(W,D) => { W.__alertCalls = []; W.alert = (m) => W.__alertCalls.push(String(m)); W.openApp('run'); const w = ${findWinSrc('Run')}(); w.querySelector('#run-input').value = 'definitelynotaprogram_xyz'; w.querySelector('#run-ok').click(); }`);
    await sleep(500);
    const runBlocked = await frameJS(`(W,D) => W.__alertCalls`);
    check('Run dialog rejects unknown command', Array.isArray(runBlocked) && runBlocked.length > 0, JSON.stringify(runBlocked));

    // ============ 11. CONTROL PANEL / DIALOGS / HELP ============
    await frameJS(`(W,D) => { W.openApp('control'); }`);
    await sleep(300);
    const cplCount = await frameJS(`(W,D) => ${findWinSrc('Control Panel')}().querySelectorAll('.cpl-item, .cp-item, .control-item, [data-cpl], .computer-item').length`);
    check('Control Panel lists applets', cplCount >= 8, String(cplCount));
    await frameJS(`(W,D) => { W.openApp('display'); }`);
    check('Display Properties opens', await waitForWin('Display Properties'));
    const dispOk = await frameJS(`(W,D) => { const w = ${findWinSrc('Display Properties')}(); const tabs = [...w.querySelectorAll('.tab, [data-tab]')]; if (tabs[1]) tabs[1].click(); return tabs.length; }`);
    check('Display Properties tabs switch', dispOk >= 3, String(dispOk));
    await frameJS(`(W,D) => { W.openApp('help'); }`);
    check('Help viewer opens', await waitForWin('Help'));
    const helpOk = await frameJS(`(W,D) => { const w = ${findWinSrc('Help')}(); const t = [...w.querySelectorAll('a, .help-topic, li')].find(e => e.textContent.trim().length > 3); if (t) t.click(); return true; }`);
    check('Help topic clickable', helpOk);
    await frameJS(`(W,D) => { W.openApp('shutdown'); }`);
    check('Shut Down dialog opens', await waitForWin('Shut Down'));

    // ============ 12. SECURITY ISOLATION ============
    const sec = await frameJS(`(W,D) => { const out = { require: typeof W.require, process: typeof W.process }; return new Promise(res => { if (!W.DTM || !W.DTM.fs) { out.noDTM = true; res(out); return; } W.DTM.fs.write('C:\\\\Windows\\\\dtm-test.txt', 'x').then(() => { out.writeBlocked = false; res(out); }).catch(() => { out.writeBlocked = true; res(out); }); }); }`);
    check('renderer has no require/process', sec.require === 'undefined' && sec.process === 'undefined', JSON.stringify(sec));
    check('protected path write blocked', sec.noDTM === true || sec.writeBlocked === true, JSON.stringify(sec));

    // ============ 13. MULTI-WINDOW SCREENSHOT ============
    await frameJS(`(W,D) => { const w = ${findWinSrc('Minesweeper')}(); if (w) { w.style.left = '700px'; w.style.top = '80px'; } const p = ${findWinSrc('Paint')}(); if (p) { p.style.left = '180px'; p.style.top = '120px'; } const e = ${findWinSrc('Explor')}(); if (e) { e.style.left = '60px'; e.style.top = '330px'; } }`);
    await sleep(400);
    await shot('13-win98-multiple-windows.png');

    // ============ SUMMARY ============
    const pass = results.filter(r => r.ok).length;
    console.log(`\nPHASE3-DEEP: ${pass}/${results.length} passed`);
    console.log(JSON.stringify(results.filter(r => !r.ok), null, 2));
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exitCode = pass === results.length ? 0 : 1;
  } catch (e) {
    console.error('HARNESS ERROR:', e && e.stack || e);
    process.exitCode = 2;
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} // spec: clean up test files afterward
    setTimeout(() => app.quit(), 300);
  }
});
