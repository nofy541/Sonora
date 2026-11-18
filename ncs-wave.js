(() => {
  const hostSelector = '[class*="VibePage_vibeAnimation__"], [class*="VibeBlock_vibeAnimation__"]';
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let canvas, painter, frame, lastPaint = 0;
  let bass = 0, middle = 0, treble = 0, phase = 0;
  let target = [0, 0, 0];
  document.addEventListener('sonora-ncs-audio-levels', event => {
    if (typeof event.detail !== 'string') return;
    const incoming = event.detail.split(',').map(Number);
    if (incoming.length === 3 && incoming.every(level => Number.isFinite(level) && level >= 0 && level <= 1)) target = incoming;
  });

  function draw(now) {
    const bounds = canvas.getBoundingClientRect();
    const side = Math.round(Math.min(bounds.width, bounds.height));
    if (side < 1) return;
    const resolution = Math.min(1.75, devicePixelRatio);
    const pixels = Math.round(side * resolution);
    if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
    const ctx = painter;
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
    ctx.clearRect(0, 0, side, side);
    ctx.translate(side / 2, side / 2);
    const time = motion.matches ? 0 : phase;
    const ink = root.style.getPropertyValue('--sonora-ncs-ink') || '#f51a90';
    const radius = side * (.405 + .041 * bass);
    const glow = ctx.createRadialGradient(0, 0, radius * .77, 0, 0, radius * 1.16);
    glow.addColorStop(0, ink + '00');
    glow.addColorStop(.58, ink + '25');
    glow.addColorStop(.75, ink + '12');
    glow.addColorStop(1, ink + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    for (let strand = 0; strand < 40; strand++) {
      const v = strand / 39;
      ctx.beginPath();
      for (let i = 0; i <= 144; i++) {
        const a = i * Math.PI / 72;
        const envelope = .48 + .32 * Math.sin(a * 3 + time) + .18 * Math.cos(a * 5 - time * 1.3);
        const fold = Math.sin(a * 6 - time * 1.8 + v * 7);
        const detail = Math.sin(a * 13 + time * 3) * treble * .021;
        const r = radius * (1 + detail - v * (.038 + envelope * (.10 + .15 * bass)) + fold * v * (.009 + .043 * middle));
        const phase = a + Math.sin(a * 3 - time) * v * .125;
        const x = Math.cos(phase) * r;
        const y = Math.sin(phase) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = strand === 0 ? 1.35 : .5;
      ctx.globalAlpha = strand === 0 ? .72 + bass * .25 : (.23 + middle * .21) * (1 - v * .64);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    frame = undefined;
    if (!canvas?.isConnected || document.hidden) return;
    if (now - lastPaint >= 32 || motion.matches) {
      target = [0, 0, 0];
      document.dispatchEvent(new Event('sonora-ncs-audio-request'));
      const follow = (current, next) => {
        const level = current + (next - current) * (next > current ? .48 : .18);
        return level < .004 && next === 0 ? 0 : level;
      };
      bass = follow(bass, target[0]);
      middle = follow(middle, target[1]);
      treble = follow(treble, target[2]);
      phase += .14 * Math.max(0, bass + middle * .65 - .055);
      draw(now);
      lastPaint = now;
    }
    if (!motion.matches) frame = requestAnimationFrame(tick);
  }
  const resize = new ResizeObserver(() => { if (canvas?.isConnected && !document.hidden) draw(performance.now()); });
  function sync() {
    const host = root.dataset.sonoraWaveShape === 'ncs' ? document.querySelector(hostSelector) : null;
    if (canvas && canvas.parentElement !== host) {
      resize.disconnect();
      canvas.remove();
      canvas = painter = undefined;
    }
    if (host && !canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'sonora-ncs-ring';
      canvas.setAttribute('aria-hidden', 'true');
      painter = canvas.getContext('2d');
      host.append(canvas);
      resize.observe(canvas);
    }
    if (canvas && !document.hidden) {
      if (motion.matches) draw(0);
      else if (!frame) frame = requestAnimationFrame(tick);
    } else if (frame) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-sonora-wave-shape'] });
  new MutationObserver(records => {
    if (root.dataset.sonoraWaveShape === 'ncs' && (!canvas?.isConnected ||
        records.some(record => Array.from(record.addedNodes).some(node =>
          node.nodeType === 1 && (node.matches(hostSelector) || node.querySelector(hostSelector)))))) sync();
  }).observe(document.body, { childList: true, subtree: true });
  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('sonora-ncs-color', () => { if (canvas?.isConnected && !document.hidden) draw(performance.now()); });
  sync();
})();
