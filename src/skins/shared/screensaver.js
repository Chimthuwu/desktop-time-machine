/*
 * Desktop Time Machine — classic screensavers.
 *
 * A shared implementation of the screensavers that shipped with Windows 95
 * (and Plus!): Mystify Your Mind, Starfield Simulation, 3D Pipes, 3D Maze,
 * Flying Windows, Scrolling Marquee, Curves and Colors and Blank Screen.
 *
 * The Win95 and Win98 skins both include this file:
 *   <script src="../shared/screensaver.js"></script>
 * then call DTMSaver.start('mystify') and DTMSaver.stop().
 *
 * Every renderer draws in CSS pixels; the canvas itself is scaled for the
 * device pixel ratio so lines stay sharp on HiDPI displays.
 */
(function () {
  'use strict';

  let overlay = null;
  let canvas = null;
  let raf = 0;
  let lastTime = 0;
  let stopLoop = null;

  // Classic Windows palette, used where the original screensavers drew from it.
  const PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  const PIPE_COLORS = ['#008080', '#800080', '#808000', '#000080', '#008000', '#800000',
    '#c0c0c0', '#ff00ff', '#ffff00', '#00ffff'];

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  function stop() {
    if (!overlay) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (stopLoop) { try { stopLoop(); } catch (e) {} stopLoop = null; }
    overlay.remove();
    overlay = null;
    canvas = null;
    document.removeEventListener('pointerdown', onActivity, true);
    document.removeEventListener('keydown', onActivity, true);
    document.removeEventListener('wheel', onActivity, true);
  }

  function onActivity() { stop(); }

  function start(type, options) {
    if (overlay) return false;
    if (!type || type === 'none' || !RENDERERS[type]) return false;

    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:999999;cursor:none;overflow:hidden;';
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Any mouse button, key or scroll wheel wakes the machine, as in 1995.
    document.addEventListener('pointerdown', onActivity, true);
    document.addEventListener('keydown', onActivity, true);
    document.addEventListener('wheel', onActivity, true);

    const state = { ctx, w: width, h: height, options: options || {} };
    stopLoop = RENDERERS[type](state) || null;
    lastTime = 0;

    const tick = (now) => {
      if (!overlay) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 1 / 60;
      lastTime = now;
      if (stopLoop && stopLoop.frame) stopLoop.frame(dt, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return true;
  }

  // -------------------------------------------------------------------------
  // Mystify Your Mind
  // -------------------------------------------------------------------------

  function mystify({ ctx, w, h }) {
    // Two lines by default, each a closed polygon whose vertices bounce off
    // the edges. The trails come from a slow fade of the previous frame and
    // the colours drift the way the original's did.
    const lines = [];
    for (let i = 0; i < 2; i++) {
      const pts = [];
      const count = 4;
      for (let j = 0; j < count; j++) {
        pts.push({
          x: rand(40, w - 40),
          y: rand(40, h - 40),
          vx: rand(-2.4, 2.4) || 1.8,
          vy: rand(-2.4, 2.4) || 1.4
        });
      }
      lines.push({ pts, hue: i * 140, speed: rand(0.5, 1.0) });
    }

    return {
      frame(dt) {
        const k = dt * 60;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, w, h);

        lines.forEach((line) => {
          line.hue = (line.hue + 20 * line.speed * dt) % 360;
          line.pts.forEach((p) => {
            p.x += p.vx * k;
            p.y += p.vy * k;
            if (p.x < 2) { p.x = 2; p.vx = Math.abs(p.vx); }
            if (p.x > w - 2) { p.x = w - 2; p.vx = -Math.abs(p.vx); }
            if (p.y < 2) { p.y = 2; p.vy = Math.abs(p.vy); }
            if (p.y > h - 2) { p.y = h - 2; p.vy = -Math.abs(p.vy); }
          });

          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'hsl(' + line.hue.toFixed(0) + ',100%,60%)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          line.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // -------------------------------------------------------------------------
  // Starfield Simulation ("Flying Through Space")
  // -------------------------------------------------------------------------

  function starfield({ ctx, w, h }) {
    const cx = w / 2;
    const cy = h / 2;
    const stars = [];
    const count = Math.round((w * h) / 2200);
    const fov = Math.max(w, h) * 0.42;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(-1, 1),
        y: rand(-1, 1),
        z: Math.random(),
        // Give every star its own speed so the field has depth.
        boost: rand(0.75, 1.45)
      });
    }
    let speed = 0.35;

    return {
      frame(dt) {
        speed = Math.min(speed + dt * 0.05, 1.6);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.lineCap = 'round';

        stars.forEach((s) => {
          const oldZ = s.z;
          s.z -= speed * s.boost * dt;
          if (s.z <= 0.03) {
            s.x = rand(-1, 1);
            s.y = rand(-1, 1);
            s.z = 1;
            return;
          }
          const x = cx + (s.x / s.z) * fov;
          const y = cy + (s.y / s.z) * fov;
          const px = cx + (s.x / oldZ) * fov;
          const py = cy + (s.y / oldZ) * fov;

          const near = Math.min(1, 1 - s.z);
          const brightness = 0.25 + near * 0.75;
          ctx.strokeStyle = 'rgba(255,255,255,' + brightness.toFixed(2) + ')';
          ctx.lineWidth = 1 + near * 2.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        });
      }
    };
  }

  // -------------------------------------------------------------------------
  // 3D Pipes
  // -------------------------------------------------------------------------

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function pipes({ ctx, w, h }) {
    const focal = Math.min(w, h) * 1.35;
    const BOUND = 6;
    const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const pipesList = [];

    const Z_MIN = 8;
    const Z_MAX = 30;
    function spawn() {
      const d = pick(AXES);
      return {
        x: rand(-BOUND, BOUND),
        y: rand(-BOUND, BOUND),
        z: rand(Z_MIN, Z_MAX),
        d: { x: d[0], y: d[1], z: d[2] },
        color: pick(PIPE_COLORS),
        pts: [],
        joint: 0
      };
    }

    const count = Math.max(12, Math.round(Math.min(w, h) / 55));
    for (let i = 0; i < count; i++) {
      const pipe = spawn();
      // Seed the trail so the first frame is not an empty screen.
      for (let k = 0; k < 10; k++) {
        pipe.x += pipe.d.x * 0.55;
        pipe.y += pipe.d.y * 0.55;
        pipe.z += pipe.d.z * 0.55;
        pipe.pts.push({ x: pipe.x, y: pipe.y, z: pipe.z, joint: 0 });
      }
      pipesList.push(pipe);
    }

    function project(p) {
      const scale = focal / p.z;
      return { x: w / 2 + p.x * scale, y: h / 2 + p.y * scale, r: Math.max(1, 0.11 * scale) };
    }

    function turn(pipe) {
      const perp = AXES.filter((a) => (a[0] * pipe.d.x + a[1] * pipe.d.y + a[2] * pipe.d.z) === 0);
      const d = pick(perp);
      pipe.d = { x: d[0], y: d[1], z: d[2] };
      pipe.joint = 1;
    }

    return {
      frame(dt) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        pipesList.forEach((pipe) => {
          const steps = Math.max(1, Math.round(dt * 45));
          for (let i = 0; i < steps; i++) {
            const step = 0.4;
            pipe.x += pipe.d.x * step;
            pipe.y += pipe.d.y * step;
            pipe.z += pipe.d.z * step;

            // Pipes live inside a box in front of the camera and turn at its
            // walls, so the whole tangle stays on screen.
            const outside =
              Math.abs(pipe.x) > BOUND || Math.abs(pipe.y) > BOUND ||
              pipe.z > Z_MAX || pipe.z < Z_MIN;
            if (outside) {
              pipe.x = Math.max(-BOUND, Math.min(BOUND, pipe.x));
              pipe.y = Math.max(-BOUND, Math.min(BOUND, pipe.y));
              pipe.z = Math.max(Z_MIN, Math.min(Z_MAX, pipe.z));
              turn(pipe);
            } else if (Math.random() < 0.13) {
              turn(pipe);
            }

            pipe.pts.push({ x: pipe.x, y: pipe.y, z: pipe.z, joint: pipe.joint });
            pipe.joint = 0;
            if (pipe.pts.length > 30) pipe.pts.shift();
          }

          const pts = pipe.pts;
          if (pts.length < 2) return;
          const projected = pts.map(project).filter((p) => p.r < Math.max(w, h));

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Black keyline around the tube.
          for (let i = 1; i < projected.length; i++) {
            const a = projected[i - 1];
            const b = projected[i];
            const r = (a.r + b.r) / 2;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = r * 2 + 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }

          // Each segment is shaded across its width so the pipe looks round.
          for (let i = 1; i < projected.length; i++) {
            const a = projected[i - 1];
            const b = projected[i];
            const r = (a.r + b.r) / 2;
            const nx = -(b.y - a.y);
            const ny = b.x - a.x;
            const len = Math.hypot(nx, ny) || 1;
            const ox = (nx / len) * r;
            const oy = (ny / len) * r;
            const g = ctx.createLinearGradient(a.x - ox, a.y - oy, a.x + ox, a.y + oy);
            g.addColorStop(0, shade(pipe.color, -80));
            g.addColorStop(0.3, shade(pipe.color, 85));
            g.addColorStop(0.62, pipe.color);
            g.addColorStop(1, shade(pipe.color, -70));
            ctx.strokeStyle = g;
            ctx.lineWidth = Math.max(1, r * 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }

          // Elbow joints where the pipe changed direction.
          projected.forEach((p, i) => {
            if (!pts[i].joint) return;
            const g = ctx.createRadialGradient(p.x - p.r / 3, p.y - p.r / 3, p.r / 6, p.x, p.y, p.r * 1.1);
            g.addColorStop(0, shade(pipe.color, 95));
            g.addColorStop(0.65, pipe.color);
            g.addColorStop(1, shade(pipe.color, -70));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 1.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        });
      }
    };
  }

  // -------------------------------------------------------------------------
  // 3D Maze
  // -------------------------------------------------------------------------

  function maze({ ctx, w, h, options }) {
    const COLS = 15;
    const ROWS = 15;
    const TEX = 32;
    const RW = 320;
    const RH = 200;

    // Wall grid: true = solid. A recursive backtracker carves the odd cells,
    // leaving the rows and columns between them as walls.
    const solid = Array.from({ length: ROWS }, () => Array(COLS).fill(true));
    const carve = [[1, 1]];
    solid[1][1] = false;
    const jumps = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    while (carve.length) {
      const [x, y] = carve[carve.length - 1];
      const options_ = jumps.filter(([dx, dy]) =>
        x + dx > 0 && x + dx < COLS - 1 &&
        y + dy > 0 && y + dy < ROWS - 1 &&
        solid[y + dy][x + dx]);
      if (!options_.length) { carve.pop(); continue; }
      const [dx, dy] = pick(options_);
      solid[y + dy][x + dx] = false;
      solid[y + (dy >> 1)][x + (dx >> 1)] = false;
      carve.push([x + dx, y + dy]);
    }

    // --- brick wall texture ---
    const tex = document.createElement('canvas');
    tex.width = TEX;
    tex.height = TEX;
    const tg = tex.getContext('2d');
    tg.fillStyle = '#8d8579'; // mortar
    tg.fillRect(0, 0, TEX, TEX);
    const brickH = 8;
    for (let row = 0; row < TEX / brickH; row++) {
      const offset = row % 2 ? 8 : 0;
      for (let bx = -1; bx < 3; bx++) {
        tg.fillStyle = shade('#9b3222', Math.floor(rand(-30, 26)));
        tg.fillRect(bx * 16 + offset + 1, row * brickH + 1, 14, brickH - 2);
      }
    }
    const texData = tg.getImageData(0, 0, TEX, TEX).data;

    // --- camera wanders cell to cell, always down a corridor ---
    const openNeighbours = (x, y) => [
      [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
    ].filter(([nx, ny]) => ny > 0 && ny < ROWS - 1 && nx > 0 && nx < COLS - 1 && !solid[ny][nx]);

    function chooseNext(prevCell, cell) {
      const open = openNeighbours(cell.x, cell.y);
      if (!open.length) return cell;
      const notBack = open.filter(([nx, ny]) => !(nx === prevCell.x && ny === prevCell.y));
      const list = notBack.length ? notBack : open;
      const ahead = [cell.x + (cell.x - prevCell.x), cell.y + (cell.y - prevCell.y)];
      const straight = list.find(([nx, ny]) => nx === ahead[0] && ny === ahead[1]);
      const chosen = straight && Math.random() < 0.72 ? straight : pick(list);
      return { x: chosen[0], y: chosen[1] };
    }

    let prevCell = { x: 1, y: 1 };
    let curCell = chooseNext(prevCell, prevCell);
    let progress = 0;
    const cam = { x: 1.5, y: 1.5, a: Math.atan2(curCell.y - prevCell.y, curCell.x - prevCell.x) };
    const speed = 1.45 * (options.speed || 1);

    const off = document.createElement('canvas');
    off.width = RW;
    off.height = RH;
    const offCtx = off.getContext('2d');
    const image = offCtx.createImageData(RW, RH);
    const buf = image.data;

    function step(dt) {
      progress += dt * speed;
      while (progress >= 1) {
        progress -= 1;
        prevCell = curCell;
        curCell = chooseNext(prevCell, curCell);
      }
      cam.x = prevCell.x + (curCell.x - prevCell.x) * progress + 0.5;
      cam.y = prevCell.y + (curCell.y - prevCell.y) * progress + 0.5;

      const target = Math.atan2(curCell.y - prevCell.y, curCell.x - prevCell.x);
      let diff = target - cam.a;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cam.a += diff * Math.min(1, dt * 9);
    }

    function render() {
      const dirX = Math.cos(cam.a);
      const dirY = Math.sin(cam.a);
      const planeX = -dirY * 0.66;
      const planeY = dirX * 0.66;

      // The original ran on a black floor and ceiling.
      for (let i = 0; i < RW * RH; i++) {
        const o = i * 4;
        buf[o] = 9;
        buf[o + 1] = 9;
        buf[o + 2] = 11;
        buf[o + 3] = 255;
      }

      for (let x = 0; x < RW; x++) {
        const cameraX = (2 * x) / RW - 1;
        const rayX = dirX + planeX * cameraX;
        const rayY = dirY + planeY * cameraX;
        let mapX = Math.floor(cam.x);
        let mapY = Math.floor(cam.y);
        const deltaX = Math.abs(1 / (rayX || 1e-6));
        const deltaY = Math.abs(1 / (rayY || 1e-6));
        let sideX;
        let sideY;
        let stepX;
        let stepY;
        if (rayX < 0) { stepX = -1; sideX = (cam.x - mapX) * deltaX; }
        else { stepX = 1; sideX = (mapX + 1 - cam.x) * deltaX; }
        if (rayY < 0) { stepY = -1; sideY = (cam.y - mapY) * deltaY; }
        else { stepY = 1; sideY = (mapY + 1 - cam.y) * deltaY; }

        let hit = false;
        let side = 0;
        for (let guard = 0; guard < 64 && !hit; guard++) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
          else { sideY += deltaY; mapY += stepY; side = 1; }
          if (mapX < 0 || mapY < 0 || mapX >= COLS || mapY >= ROWS) break;
          if (solid[mapY][mapX]) hit = true;
        }
        if (!hit) continue;

        const dist = Math.max(0.08, side === 0 ? sideX - deltaX : sideY - deltaY);
        const lineH = Math.floor(RH / dist);
        const start = Math.floor((RH - lineH) / 2);
        const end = start + lineH;

        let wallX = side === 0 ? cam.y + dist * rayY : cam.x + dist * rayX;
        wallX -= Math.floor(wallX);
        let texX = Math.floor(wallX * TEX);
        if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = TEX - texX - 1;

        const fog = Math.max(0.1, Math.min(1, 2.6 / (dist + 0.9)));
        const sideShade = side === 1 ? 0.68 : 1;
        const y0 = Math.max(0, start);
        const y1 = Math.min(RH, end);
        for (let y = y0; y < y1; y++) {
          const texY = Math.floor(((y - start) / lineH) * TEX) & (TEX - 1);
          const t = (texY * TEX + texX) * 4;
          const o = (y * RW + x) * 4;
          buf[o] = texData[t] * fog * sideShade;
          buf[o + 1] = texData[t + 1] * fog * sideShade;
          buf[o + 2] = texData[t + 2] * fog * sideShade;
          buf[o + 3] = 255;
        }
      }

      offCtx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, w, h);
    }

    return {
      frame(dt) {
        step(dt);
        render();
      }
    };
  }

  // -------------------------------------------------------------------------
  // Flying Windows
  // -------------------------------------------------------------------------

  function flagSprite() {
    const W = 96;
    const H = 80;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const panes = [
      ['#ff0000', 0, 0],
      ['#00a800', 1, 0],
      ['#0000e0', 0, 1],
      ['#ffd700', 1, 1]
    ];
    const wave = (x) => Math.sin((x / W) * Math.PI * 2) * 5;

    panes.forEach(([color, col, row]) => {
      g.fillStyle = color;
      const x0 = col * (W / 2) + 3;
      const x1 = x0 + W / 2 - 6;
      const yBase = row * (H / 2) + 4;
      const hgt = H / 2 - 8;
      for (let x = x0; x < x1; x++) {
        const off = wave(x + col * 2);
        g.fillRect(x, yBase + off, 1, hgt);
      }
      // black outline around each pane, as in the logo
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x0, yBase + wave(x0));
      for (let x = x0; x <= x1; x++) g.lineTo(x, yBase + wave(x));
      g.lineTo(x1, yBase + hgt + wave(x1));
      for (let x = x1; x >= x0; x--) g.lineTo(x, yBase + hgt + wave(x));
      g.closePath();
      g.stroke();
    });
    return c;
  }

  function flyingWindows({ ctx, w, h }) {
    const sprite = flagSprite();
    const focal = Math.min(w, h) * 0.9;
    const logos = [];
    const count = 26;
    const spawn = (far) => ({
      x: rand(-9, 9),
      y: rand(-6, 6),
      z: far ? rand(14, 40) : rand(4, 40),
      spin: rand(-0.6, 0.6)
    });
    for (let i = 0; i < count; i++) logos.push(spawn(true));

    return {
      frame(dt) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        logos.forEach((logo) => {
          logo.z -= dt * 14;
          logo.spin += dt * 0.4;
          if (logo.z < 0.4) Object.assign(logo, spawn(true));
          const scale = focal / logo.z;
          const x = w / 2 + logo.x * scale;
          const y = h / 2 + logo.y * scale;
          const sw = (sprite.width / 96) * scale * 1.5;
          const sh = (sprite.height / 80) * scale * 1.5;
          if (sw < 1 || x < -sw || y < -sh || x > w + sw || y > h + sh) return;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(logo.spin) * 0.15);
          ctx.globalAlpha = Math.max(0.15, Math.min(1, 2.2 - logo.z / 18));
          ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
          ctx.restore();
        });
      }
    };
  }

  // -------------------------------------------------------------------------
  // Scrolling Marquee
  // -------------------------------------------------------------------------

  function marquee({ ctx, w, h, options }) {
    const text = options.text || 'Desktop Time Machine';
    const speed = options.speed || 160; // pixels per second
    const started = performance.now();

    return {
      frame(dt, now) {
        // Time-based position, so pause-free and independent of frame rate.
        ctx.font = '56px "Times New Roman", Times, serif';
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(text).width;
        const span = w + textWidth;
        const travelled = ((now - started) / 1000) * speed;
        const x = w - (travelled % span);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, h / 2);
      }
    };
  }

  // -------------------------------------------------------------------------
  // Curves and Colors (Plus!)
  // -------------------------------------------------------------------------

  function curves({ ctx, w, h }) {
    const curvesList = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      curvesList.push({
        pts: Array.from({ length: 4 }, () => ({
          x: rand(0, w),
          y: rand(0, h),
          vx: rand(-3.4, 3.4),
          vy: rand(-3.4, 3.4)
        })),
        hue: (i * 360) / count
      });
    }

    return {
      frame(dt) {
        const k = dt * 60;
        ctx.fillStyle = 'rgba(0,0,0,0.045)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        curvesList.forEach((curve) => {
          curve.hue = (curve.hue + 30 * dt) % 360;
          curve.pts.forEach((p) => {
            p.x += p.vx * k;
            p.y += p.vy * k;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
            p.x = Math.max(0, Math.min(w, p.x));
            p.y = Math.max(0, Math.min(h, p.y));
          });
          ctx.strokeStyle = 'hsl(' + curve.hue.toFixed(0) + ',100%,55%)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(curve.pts[0].x, curve.pts[0].y);
          ctx.bezierCurveTo(
            curve.pts[1].x, curve.pts[1].y,
            curve.pts[2].x, curve.pts[2].y,
            curve.pts[3].x, curve.pts[3].y
          );
          ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // -------------------------------------------------------------------------
  // Blank Screen
  // -------------------------------------------------------------------------

  function blank() {
    return { frame() {} };
  }

  const RENDERERS = {
    mystify,
    starfield,
    pipes,
    maze,
    flyingwindows: flyingWindows,
    marquee,
    curves,
    blank
  };

  window.DTMSaver = {
    start,
    stop,
    active() { return !!overlay; },
    names: {
      mystify: 'Mystify Your Mind',
      starfield: 'Starfield Simulation',
      pipes: '3D Pipes',
      maze: '3D Maze',
      flyingwindows: 'Flying Windows',
      marquee: 'Scrolling Marquee',
      curves: 'Curves and Colors',
      blank: 'Blank Screen'
    }
  };
})();
