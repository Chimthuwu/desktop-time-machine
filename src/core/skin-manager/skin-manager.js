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
    this.fallbackSkins = [
      {
        id: 'windows95',
        name: 'Windows 95',
        period: '1995',
        version: '1.0.0',
        description: 'The landmark 32-bit operating system that introduced the Start button, taskbar, grey 3D bevels, and modern desktop paradigm.',
        author: 'Retro Desktop Simulator',
        entry: './skins/windows95/desktop.html',
        status: 'ready',
        icon: '🪟',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'screensaver']
      },
      {
        id: 'macos8',
        name: 'Mac OS 8',
        period: '1997',
        version: '1.0.0',
        description: 'The classic Macintosh Platinum appearance with authentic grey dither background, top menu bar, Apple menu, and Control Strip.',
        author: 'Retro Desktop Simulator',
        entry: './skins/macos8/desktop.html',
        status: 'ready',
        icon: '💻',
        capabilities: ['window-management', 'desktop-icons', 'apple-menu', 'control-strip', 'calculator', 'sound-chimes']
      },
      {
        id: 'windows98',
        name: 'Windows 98',
        period: '1998',
        version: '1.0.0',
        description: 'Active Desktop era with web integration, gradient title bars, Quick Launch toolbar, and enhanced multimedia. Windows 98 built on 95\'s foundation with tighter Internet Explorer 4 integration and a more polished shell.',
        author: 'Desktop Time Machine',
        entry: './skins/windows98/desktop.html',
        status: 'ready',
        icon: '🪟',
        capabilities: ['window-management', 'filesystem', 'application-launcher', 'desktop-icons', 'start-menu', 'taskbar', 'quick-launch', 'active-desktop', 'multimedia', 'screensaver']
      },
      {
        id: 'macosx',
        name: 'Mac OS X (Aqua)',
        period: '2001',
        version: '1.0.0',
        description: 'Mac OS X 10.0–10.3 Aqua: translucent menu bar, pinstripe and brushed-metal windows, a magnifying Dock, and a Finder that browses your real host files.',
        author: 'Desktop Time Machine',
        entry: './skins/macosx/desktop.html',
        status: 'ready',
        icon: '💧',
        capabilities: ['aqua', 'dock', 'apple-menu', 'filesystem', 'window-management', 'desktop-icons', 'calculator', 'cli', 'multimedia']
      },
      {
        id: 'windowsXP',
        name: 'Windows XP (Luna)',
        period: '2001',
        version: '0.1.0',
        description: 'The iconic blue Luna interface with two-column Start menu, rounded window frames, and vibrant wallpapers.',
        author: 'Community',
        status: 'roadmap',
        icon: '🖼️',
        capabilities: ['luna-theme', 'two-column-start', 'visual-styles']
      },
      {
        id: 'amiga-workbench',
        name: 'Amiga Workbench 3.1',
        period: '1985–1993',
        version: '0.1.0',
        description: 'Preemptive multitasking pioneer with top title bar, blue/orange palette, ram disk icons, and high-performance feel.',
        author: 'Community',
        status: 'roadmap',
        icon: '💾',
        capabilities: ['amiga-dock', 'custom-screens', 'cli']
      },
      {
        id: 'beos',
        name: 'BeOS R5',
        period: '1998',
        version: '0.1.0',
        description: 'The revolutionary multimedia OS featuring yellow tabbed window title bars, Deskbar, and clean typography.',
        author: 'Community',
        status: 'roadmap',
        icon: '⚡',
        capabilities: ['tabbed-windows', 'deskbar', 'workspaces']
      }
    ];
  }

  async init() {
    // Populate fallback skins first
    this.fallbackSkins.forEach(skin => this.skins.set(skin.id, skin));

    // Discover installed skins through IPC
    try {
      const installedSkins = await this.engine.preload.getAvailableSkins();
      if (Array.isArray(installedSkins) && installedSkins.length > 0) {
        installedSkins.forEach(skin => {
          const entryPath = `./skins/${skin.folder}/${skin.entry || 'desktop.html'}`;
          this.skins.set(skin.id, {
            ...skin,
            entry: entryPath,
            status: skin.status || 'ready'
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
      const fallback = this.getSkin('windows95');
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
