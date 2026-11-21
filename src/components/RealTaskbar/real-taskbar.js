/**
 * Desktop Time Machine — shared real Windows taskbar mirror.
 *
 * Polls the host shell once and hands the same data to every skin. Skins own
 * only presentation; launching/activating host items stays here so behaviour
 * is identical in Windows 95, Windows XP, Mac OS X and any future skin.
 */
(function () {
  'use strict';
  if (window.DTMRealTaskbar && window.DTMRealTaskbar.__ready) return;

  const DTM = window.DTM || (window.parent && window.parent.DTM) || null;
  let timer = null;
  let busy = false;
  let listener = null;
  let lastData = null;

  async function refresh() {
    if (busy || !DTM || !DTM.system || !DTM.system.getTaskbar) return lastData;
    busy = true;
    try {
      lastData = await DTM.system.getTaskbar();
      if (listener) listener(lastData);
    } catch (e) {
      // Host taskbar mirroring is best-effort.
    } finally {
      busy = false;
    }
    return lastData;
  }

  function start(onUpdate, intervalMs) {
    listener = typeof onUpdate === 'function' ? onUpdate : null;
    refresh();
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(refresh, intervalMs || 8000);
    window.addEventListener('focus', refresh);
  }

  async function activateWindow(desc) {
    try {
      if (DTM.retroAppForTaskbar) {
        const app = DTM.retroAppForTaskbar({ processName: desc.processName, path: desc.path });
        if (app && DTM.openRetroApp) { DTM.openRetroApp(app, document); return true; }
      }
    } catch (e) {}
    try {
      if (DTM.openRetroShortcut && await DTM.openRetroShortcut({ name: desc.name || desc.title, path: desc.path }, document)) return true;
    } catch (e) {}
    try { await DTM.system.activateWindow(desc.pid); return true; } catch (e) { return false; }
  }

  async function openPinned(item) {
    try {
      if (DTM.openRetroShortcut && await DTM.openRetroShortcut({ name: item.name, path: item.path }, document)) return;
    } catch (e) {}
    try { await DTM.system.openPath(item.path); } catch (e) {}
  }

  async function invokeTray(item) {
    try { await DTM.system.invokeTrayItem(item.name); await refresh(); } catch (e) {}
  }

  async function getVolume() {
    try { return await DTM.system.getVolume(); } catch (e) { return { level: 1, muted: false }; }
  }

  async function setVolume(level, muted) {
    try { await DTM.system.setVolume(level, muted); await refresh(); } catch (e) {}
  }

  function glyphFor(name) {
    const n = String(name || '').toLowerCase();
    if (/network|internet|ethernet|wi-?fi|wlan/.test(n)) return '🌐';
    if (/volume|sound|audio|speaker/.test(n)) return '🔊';
    if (/battery|power/.test(n)) return '🔋';
    if (/security|shield|defender|virus/.test(n)) return '🛡️';
    if (/bluetooth/.test(n)) return '🔵';
    return '•';
  }

  window.DTMRealTaskbar = {
    __ready: true,
    start,
    refresh,
    activateWindow,
    openPinned,
    invokeTray,
    getVolume,
    setVolume,
    glyphFor,
    data: () => lastData,
    emit: (data) => { lastData = data; if (listener) listener(data); }
  };
})();
