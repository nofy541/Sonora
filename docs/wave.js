const canvas = document.querySelector('.signal canvas');
const ctx = canvas.getContext('2d');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (ctx) {
  let frame;
  const fullTurn = 2 * Math.PI;
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const rule = styles.getPropertyValue('--line').trim();

  function draw(time) {
    const { width, height } = canvas;
    const cx = width / 2;
    const cy = height / 2;
    const t = time / 1000;
    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = rule;
    ctx.globalAlpha = .66;
    for (let x = cx % 28; x < width; x += 28) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = cy % 28; y < height; y += 28) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    ctx.strokeStyle = accent;
    for (let ring = 0; ring < 17; ring++) {
      const depth = ring / 16;
      ctx.globalAlpha = .08 + depth * depth * .63;
      ctx.lineWidth = ring === 16 ? 1.65 : .85;
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const angle = i * fullTurn / 300;
        const warp = Math.sin(3 * angle + t * 1.12 + ring * .16) * 15
          + Math.sin(6 * angle - t * 1.5 + ring * .37) * 8
          + Math.cos(11 * angle + t * 1.9) * 3;
        const radius = 110 + depth * 70 + warp * (.64 + depth * .36);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function tick(time) {
    draw(time);
    frame = requestAnimationFrame(tick);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    if (motion.matches || document.hidden) draw(0);
    else frame = requestAnimationFrame(tick);
  }

  motion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  updateMotion();
}
