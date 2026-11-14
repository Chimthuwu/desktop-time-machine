/**
 * Desktop Time Machine - Skin Switcher / OS Museum Controller
 */

class SkinSwitcherUI {
  constructor(skinManager, engine) {
    this.skinManager = skinManager;
    this.engine = engine;
    this.isOpen = false;
    this.switching = false;
    this.overlay = null;
  }

  init() {
    this.createDom();
    this.attachEventListeners();
  }

  createDom() {
    // Modal Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'dtm-switcher-overlay';
    this.overlay.id = 'dtmSwitcherOverlay';
    this.overlay.innerHTML = `
      <div class="dtm-switcher-dialog">
        <div class="dtm-switcher-header">
          <div class="dtm-switcher-title-group">
            <span class="dtm-dial-icon">⏳</span>
            <div>
              <h2 class="dtm-switcher-title">DESKTOP TIME MACHINE</h2>
              <div class="dtm-switcher-subtitle">RETRO OPERATING SYSTEM MUSEUM &amp; ERA SELECTOR</div>
            </div>
          </div>
          <button class="dtm-switcher-close-btn" id="dtmSwitcherClose" title="Close Museum (Esc)">×</button>
        </div>
        <div class="dtm-switcher-body" id="dtmSwitcherGallery">
          <!-- Populated dynamically -->
        </div>
        <div class="dtm-switcher-status" id="dtmSwitcherStatus" role="status" aria-live="polite"></div>
        <div class="dtm-switcher-footer">
          <span>Tip: Press <kbd>F8</kbd> or <kbd>Ctrl+Shift+T</kbd> at any time to travel between eras</span>
          <span id="dtmHostInfo">Host: Windows 10/11</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Wire close button & backdrop click
    this.overlay.querySelector('#dtmSwitcherClose').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  attachEventListeners() {
    // Global hotkey listeners
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F8' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't')) {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Listen for engine events
    this.engine.on('dtm:open-switcher', () => this.open());
  }

  renderGallery() {
    const gallery = this.overlay.querySelector('#dtmSwitcherGallery');
    gallery.innerHTML = '';

    const skins = this.skinManager.getAvailableSkins();
    const currentSkin = this.skinManager.getCurrentSkin();

    skins.forEach(skin => {
      const isActive = skin.id === currentSkin.id;
      const isReady = skin.status === 'ready';

      const card = document.createElement('div');
      card.className = `dtm-card ${isActive ? 'active-skin' : ''}`;

      // Apply theme color accent if available
      if (skin.themeColor) {
        card.style.setProperty('--skin-theme', skin.themeColor);
      }

      const capabilitiesHtml = (skin.capabilities || [])
        .slice(0, 4)
        .map(c => `<span class="dtm-cap-tag">${c}</span>`)
        .join('');

      // Preview image (if skin provides one)
      const previewHtml = skin.previewImage
        ? `<div class="dtm-card-preview"><img src="${skin.previewImage}" alt="${skin.name} preview" loading="lazy"></div>`
        : `<div class="dtm-card-preview dtm-card-preview--placeholder" style="background:${skin.themeColor || '#252430'}"><span class="dtm-preview-icon">${skin.icon || '🖥️'}</span></div>`;

      const versionHtml = skin.version
        ? `<span class="dtm-card-version">v${skin.version}</span>`
        : '';

      let actionButtonHtml = '';
      if (isActive) {
        actionButtonHtml = `<button class="dtm-load-btn btn-active">● Active Era</button>`;
      } else if (isReady) {
        actionButtonHtml = `<button class="dtm-load-btn btn-ready" data-switch="${skin.id}">Transport to ${skin.era || skin.period}</button>`;
      } else {
        actionButtonHtml = `<button class="dtm-load-btn btn-roadmap" disabled>In Development</button>`;
      }

      card.innerHTML = `
        ${previewHtml}
        <div class="dtm-card-top">
          <span class="dtm-card-icon">${skin.icon || '🖥️'}</span>
          <span class="dtm-period-badge">${skin.era || skin.period}</span>
        </div>
        <div class="dtm-card-title-row">
          <h3 class="dtm-card-title">${skin.name}</h3>
          ${versionHtml}
        </div>
        <p class="dtm-card-desc">${skin.description}</p>
        <div class="dtm-card-capabilities">${capabilitiesHtml}</div>
        <div class="dtm-card-action">${actionButtonHtml}</div>
      `;

      const switchBtn = card.querySelector('[data-switch]');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => this.performSwitch(skin));
      }

      gallery.appendChild(card);
    });

    // Update host info if available
    this.engine.system.getInfo().then(info => {
      const hostEl = this.overlay.querySelector('#dtmHostInfo');
      if (hostEl && info) {
        hostEl.textContent = `Host: ${info.username}@${info.hostname} (${info.type} ${info.arch})`;
      }
    }).catch(() => {});
  }

  async performSwitch(skin) {
    if (this.switching) return;
    this.switching = true;
    const buttons = Array.from(this.overlay.querySelectorAll('.dtm-load-btn'));
    buttons.forEach((b) => { b.disabled = true; });
    this.setStatus(`Transporting to ${skin.era || skin.period || skin.name}…`);

    let ok = false;
    try {
      ok = await this.skinManager.switchSkin(skin.id);
    } catch (error) {
      console.warn('[DTM] Skin switch failed:', error);
      ok = false;
    }
    this.switching = false;

    // The switcher closes ONLY after the new era has loaded successfully.
    if (ok) {
      this.setStatus('');
      this.close();
      return;
    }

    this.setStatus(`Could not load ${skin.name}. Staying in the current era.`, true);
    this.renderGallery();
  }

  setStatus(message, isError) {
    const status = this.overlay && this.overlay.querySelector('#dtmSwitcherStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
  }

  open() {
    this.renderGallery();
    this.setStatus('');
    this.overlay.classList.add('open');
    this.isOpen = true;
  }

  close() {
    this.overlay.classList.remove('open');
    this.isOpen = false;
    const viewport = document.getElementById('skin-viewport');
    if (viewport) {
      try { viewport.contentWindow.focus(); } catch (e) {}
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}

window.dtmSwitcherUI = new SkinSwitcherUI(window.dtmSkinManager, window.dtmEngine);
window.DTM.ui = window.dtmSwitcherUI;
