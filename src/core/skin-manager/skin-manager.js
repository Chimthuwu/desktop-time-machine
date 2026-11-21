/**
 * Desktop Time Machine - Skin Manager
 * Handles discovery, manifest validation, switching, and registry of retro skins
 */

class SkinManager {
  constructor(engine) {
    this.engine = engine;
    this.activeSkinId = 'windows95';
    this.loadedSkinId = null;
    this.isSwitching = false;
    this.skins = new Map();
    // Immutable recovery registry. Installed manifests may override the main
    // registry but can never destroy this known-good fallback.
    this.recoverySkins = new Map();
    this.fallbackSkins = [
      {
        id: 'windows95',
        name: 'Windows 95',
        era: '1995',
        period: '1995',
        version: '1.0.0',
        description: 'The landmark 32-bit operating system that introduced the Start button, taskbar, grey 3D bevels, and modern desktop paradigm.',
        author: 'Desktop Time Machine',
        entry: './skins/windows95/desktop.html',
        status: 'ready',
        icon: '🪟',
        themeColor: '#008080',
        previewImage: '../screenshots/gallery-win95.png',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'taskbar', 'screensaver']
      },
      {
        id: 'macos8',
        name: 'Mac OS 8',
        era: '1997',
        period: '1997',
        version: '1.0.0',
        description: 'The classic Macintosh Platinum appearance with authentic grey dither background, top menu bar, Apple menu, and Control Strip.',
        author: 'Desktop Time Machine',
        entry: './skins/macos8/desktop.html',
        status: 'ready',
        icon: '💻',
        themeColor: '#888888',
        capabilities: ['window-management', 'desktop-icons', 'apple-menu', 'control-strip', 'calculator', 'sound-chimes', 'trash-bin']
      },
      {
        id: 'windows98',
        name: 'Windows 98',
        era: '1998',
        period: '1998',
        version: '1.0.0',
        description: 'Active Desktop era with web integration, gradient title bars, Quick Launch toolbar, and enhanced multimedia. Windows 98 built on 95\'s foundation with tighter Internet Explorer 4 integration and a more polished shell.',
        author: 'Desktop Time Machine',
        entry: './skins/windows98/desktop.html',
        status: 'ready',
        icon: '🪟',
        themeColor: '#008080',
        previewImage: './skins/windows98/assets/preview.svg',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'taskbar', 'quick-launch', 'active-desktop', 'multimedia', 'screensaver']
      },
      {
        id: 'macosx',
        name: 'Mac OS X',
        era: '2001',
        period: '2001–2003',
        version: '1.0.0',
        description: 'Mac OS X 10.0–10.3 Aqua: translucent menu bar, pinstripe and brushed-metal windows, a magnifying Dock, and a Finder that browses your real host files.',
        author: 'Desktop Time Machine',
        entry: './skins/macosx/desktop.html',
        status: 'ready',
        icon: '💧',
        themeColor: '#3f7fbf',
        previewImage: '../screenshots/gallery-macosx.png',
        capabilities: ['aqua', 'dock', 'apple-menu', 'filesystem', 'window-management', 'desktop-icons', 'calculator', 'cli', 'multimedia']
      },
      {
        id: 'templeos',
        name: 'TempleOS',
        era: '2017',
        period: '2013–2017',
        version: '0.1.0',
        description: 'TempleOS V5.03 with 640×480 graphics, a 16-color display, a HolyC command prompt, and built-in tools.',
        author: 'Desktop Time Machine',
        entry: './skins/templeos/desktop.html',
        status: 'ready',
        icon: '✝',
        themeColor: '#0000aa',
        capabilities: ['cli', 'filesystem', 'application-launcher']
      },
      {
        id: 'windowsXP',
        name: 'Windows XP',
        era: '2001',
        period: '2001–2006',
        version: '1.0.0',
        description: 'The Luna desktop with a two-column Start menu, taskbar, grouped windows, and Explorer-style file browsing.',
        author: 'Desktop Time Machine',
        entry: './skins/windowsXP/desktop.html',
        status: 'ready',
        icon: '🪟',
        themeColor: '#245edb',
        previewImage: '../screenshots/gallery-winxp.png',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'taskbar', 'luna-theme', 'two-column-start', 'visual-styles']
      },
      {
        id: 'amiga-workbench',
        name: 'Amiga Workbench 3.1',
        era: '1992',
        period: '1992–1993',
        version: '1.0.0',
        description: 'Workbench 3.1 with disk and drawer icons, the screen title bar, Intuition-style windows, and AmigaShell.',
        author: 'Desktop Time Machine',
        entry: './skins/amiga-workbench/desktop.html',
        status: 'ready',
        icon: '💾',
        themeColor: '#0055aa',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'cli']
      },
      {
        id: 'beos',
        name: 'BeOS R5',
        era: '2000',
        period: '2000',
        version: '1.0.0',
        description: 'The BeOS R5 desktop with tabbed windows, Tracker-style file browsing, a Deskbar, and four workspaces.',
        author: 'Desktop Time Machine',
        entry: './skins/beos/desktop.html',
        status: 'ready',
        icon: '⚡',
        themeColor: '#4c5860',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'tabbed-windows', 'deskbar', 'workspaces', 'cli', 'multimedia']
      }
    ];
  }

  async init() {
    // Populate fallback skins first, keeping a separate recovery copy.
    this.fallbackSkins.forEach(skin => {
      const copy = Object.assign({}, skin);
      this.skins.set(skin.id, copy);
      this.recoverySkins.set(skin.id, Object.assign({}, copy));
    });

    // Discover installed skins through IPC
    try {
      const installedSkins = await this.engine.preload.getAvailableSkins();
      if (Array.isArray(installedSkins) && installedSkins.length > 0) {
        installedSkins.forEach(skin => {
          if (skin.folder !== skin.id) {
            console.warn(`[SkinManager] Skin "${skin.id}" folder mismatch (${skin.folder}); ignoring.`);
            return;
          }
          const invalid = skin._manifestValid === false;
          if (invalid) {
            console.warn(`[SkinManager] Skin "${skin.id}" has manifest errors:`, skin._manifestErrors);
          }
          const entryPath = `./skins/${skin.folder}/${skin.entry || 'desktop.html'}`;
          this.skins.set(skin.id, {
            ...skin,
            entry: entryPath,
            status: invalid ? 'roadmap' : (skin.status || 'ready')
          });
        });
      }
    } catch (err) {
      console.warn('[SkinManager] Could not dynamically load skins via IPC:', err);
    }

    // Validate the remembered selection. A stale localStorage value can point
    // at a roadmap skin, a removed skin, or a skin without an entry point.
    const storedSkinId = localStorage.getItem('dtm_active_skin');
    const preferred = storedSkinId ? this.getSkin(storedSkinId) : null;
    if (preferred && this.isLoadable(preferred)) {
      this.activeSkinId = preferred.id;
    } else {
      if (storedSkinId && storedSkinId !== 'windows95') {
        console.warn(`[SkinManager] Stored skin "${storedSkinId}" is not loadable; falling back to Windows 95.`);
      }
      this.activeSkinId = 'windows95';
      localStorage.setItem('dtm_active_skin', this.activeSkinId);
    }
    this.loadedSkinId = null;

    console.log(`[SkinManager] Loaded ${this.skins.size} skins into registry. Active: ${this.activeSkinId}`);
  }

  isLoadable(skin) {
    return !!skin && skin.status === 'ready' && typeof skin.entry === 'string' && skin.entry.length > 0;
  }

  getAvailableSkins() {
    return Array.from(this.skins.values());
  }

  getSkin(skinId) {
    return this.skins.get(skinId) || null;
  }

  getCurrentSkin() {
    return this.getSkin(this.activeSkinId) || this.getSkin('windows95') || null;
  }

  /**
   * Load a skin document into the shell viewport and wait until it is really
   * usable. Resolves only once the iframe reports the requested document and
   * that document exposes the skin's #desktop root.
   */
  loadSkinDocument(skin, viewport) {
    if (!viewport) return Promise.reject(new Error('Skin viewport element is missing'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const marker = '/skins/' + skin.id + '/';
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        viewport.removeEventListener('load', onLoad);
        viewport.removeEventListener('error', onError);
        if (error) reject(error); else resolve();
      };
      const onLoad = () => {
        let doc;
        try {
          doc = viewport.contentDocument;
        } catch (error) {
          finish(error);
          return;
        }
        // Ignore load events belonging to a superseded src value.
        if (!doc || !doc.URL || doc.URL.indexOf(marker) === -1) return;
        if (!doc.getElementById('desktop')) {
          finish(new Error('Loaded document has no #desktop root: ' + doc.URL));
          return;
        }
        finish();
      };
      const onError = () => finish(new Error('Iframe failed to load ' + skin.entry));
      const timer = setTimeout(() => finish(new Error('Timed out after 15s loading ' + skin.entry)), 15000);
      viewport.addEventListener('load', onLoad);
      viewport.addEventListener('error', onError);
      viewport.src = skin.entry;
    });
  }

  /**
   * Initial mount. Used by the shell after init(); validates the remembered
   * skin and falls back to Windows 95 if it cannot be displayed.
   */
  async mountActiveSkin() {
    const skin = this.getCurrentSkin();
    const viewport = document.getElementById('skin-viewport');
    if (!skin) {
      console.error('[SkinManager] No usable skin is registered.');
      return false;
    }
    if (this.loadedSkinId === skin.id) return true;
    try {
      await this.loadSkinDocument(skin, viewport);
      this.loadedSkinId = skin.id;
      try { if (viewport && viewport.contentWindow) viewport.contentWindow.focus(); }
      catch (error) { console.warn('[DTM] Could not focus skin viewport:', error); }
      return true;
    } catch (error) {
      console.error(`[SkinManager] Failed to mount startup skin "${skin.name}":`, error);
      if (skin.id === 'windows95') return false;
      const fallback = this.recoverySkins.get('windows95');
      if (!fallback || !this.isLoadable(fallback)) return false;
      this.activeSkinId = 'windows95';
      this.loadedSkinId = null;
      try {
        await this.loadSkinDocument(fallback, viewport);
        this.loadedSkinId = fallback.id;
        localStorage.setItem('dtm_active_skin', fallback.id);
        return true;
      } catch (fallbackError) {
        console.error('[SkinManager] Windows 95 fallback also failed:', fallbackError);
        return false;
      }
    }
  }

  async switchSkin(skinId) {
    const skin = this.getSkin(skinId);
    if (!skin) {
      console.error(`[SkinManager] Unknown skin: ${skinId}`);
      return false;
    }

    if (!this.isLoadable(skin)) {
      console.warn(`[SkinManager] Skin "${skinId}" is not ready or has no entry point; refusing to switch.`);
      return false;
    }

    if (this.isSwitching) {
      console.warn('[SkinManager] A skin switch is already in progress; ignoring request for ' + skinId + '.');
      return false;
    }

    const viewport = document.getElementById('skin-viewport');
    if (viewport && this.loadedSkinId === skin.id) {
      // Already on screen; keep the persisted selection in sync.
      this.activeSkinId = skin.id;
      localStorage.setItem('dtm_active_skin', skin.id);
      return true;
    }

    const previousId = this.activeSkinId;
    const previousSkin = this.getSkin(previousId);
    this.isSwitching = true;

    // Release the previous skin's desktop watchers/listeners before its
    // iframe document is replaced. Repeated switches must not leak either.
    try {
      this.engine.desktop.unmount(previousId);
    } catch (error) {
      console.warn('[DTM] Previous skin desktop cleanup failed:', error);
    }

    try {
      await this.loadSkinDocument(skin, viewport);
    } catch (error) {
      console.error(`[SkinManager] Failed to load "${skin.name}" (${skin.entry}):`, error);
      // The failed iframe may already have mounted its mirror; release it
      // before restoring so watchers/listeners do not accumulate.
      try { this.engine.desktop.unmount(skin.id); } catch (cleanupError) {
        console.warn('[DTM] Failed skin cleanup error:', cleanupError);
      }
      // Do not strand the user on a broken era: restore the previous skin.
      this.activeSkinId = previousId;
      this.loadedSkinId = null;
      if (previousSkin && this.isLoadable(previousSkin)) {
        try {
          await this.loadSkinDocument(previousSkin, viewport);
          this.loadedSkinId = previousSkin.id;
          localStorage.setItem('dtm_active_skin', previousSkin.id);
        } catch (restoreError) {
          console.error(`[SkinManager] Could not restore previous skin "${previousSkin.name}":`, restoreError);
          const recovery = this.recoverySkins.get(previousId) || this.recoverySkins.get('windows95');
          if (recovery && this.isLoadable(recovery)) {
            try {
              await this.loadSkinDocument(recovery, viewport);
              this.activeSkinId = recovery.id;
              this.loadedSkinId = recovery.id;
              localStorage.setItem('dtm_active_skin', recovery.id);
            } catch (recoveryError) {
              console.error('[SkinManager] Recovery skin also failed:', recoveryError);
            }
          }
        }
      }
      return false;
    } finally {
      this.isSwitching = false;
    }

    this.activeSkinId = skin.id;
    this.loadedSkinId = skin.id;
    localStorage.setItem('dtm_active_skin', skin.id);

    // Notify shell/listeners
    this.engine.emit('dtm:skin-changed', skin);

    try { if (viewport && viewport.contentWindow) viewport.contentWindow.focus(); }
    catch (error) { console.warn('[DTM] Could not focus skin viewport:', error); }

    return true;
  }
}

window.dtmSkinManager = new SkinManager(window.dtmEngine);
window.DTM.skins = window.dtmSkinManager;
