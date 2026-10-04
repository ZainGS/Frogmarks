/**
 * Retro-chrome theme effect: cover `panel` with a dark canvas and dissolve it in random diamond cells (~300 ms), so
 * the panel appears to dither in. The canvas is fixed-positioned on <body> at the panel's place, so it can be called
 * synchronously before Angular renders the panel's `.visible` change. Removes itself when done.
 */
export function ditherReveal(panel: HTMLElement): void {
  const cs = getComputedStyle(panel);
  const left = parseFloat(cs.left) || 70;
  const top  = (parseFloat(cs.top) || 0) + (parseFloat(cs.marginTop) || 0);
  const cellSize = 8;
  // offsetWidth is layout-based (not affected by translateX transform)
  const w = panel.offsetWidth || 250;
  // Use max-height value: calc(100vh - 242px)
  const h = window.innerHeight - 242;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  Object.assign(canvas.style, {
    position: 'fixed',
    top:  top  + 'px',
    left: left + 'px',
    width:  w + 'px',
    height: h + 'px',
    pointerEvents: 'none',
    zIndex: '10001',
  });

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, w, h);
  document.body.appendChild(canvas);

  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);
  const total = cols * rows;
  const cells = Array.from({length: total}, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const duration = 300;
  let revealed = 0;
  const startTime = performance.now();
  // r slightly > half-diagonal of cell to overlap corners and avoid seam flashes
  const r = cellSize * 0.78;

  const frame = (now: number) => {
    if (!canvas.isConnected) return;
    const elapsed = now - startTime;
    const targetRevealed = Math.min(total, Math.floor(total * (elapsed / duration)));

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    while (revealed < targetRevealed) {
      const cell = cells[revealed];
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const cx = (col + 0.5) * cellSize;
      const cy = (row + 0.5) * cellSize;
      ctx.beginPath();
      ctx.moveTo(cx,     cy - r);
      ctx.lineTo(cx + r, cy    );
      ctx.lineTo(cx,     cy + r);
      ctx.lineTo(cx - r, cy    );
      ctx.closePath();
      ctx.fill();
      revealed++;
    }
    ctx.restore();

    if (revealed < total) {
      requestAnimationFrame(frame);
    } else {
      // Fade out instead of hard-remove to dissolve any inter-diamond seam pixels
      canvas.style.transition = 'opacity 80ms linear';
      canvas.style.opacity = '0';
      setTimeout(() => canvas.remove(), 100);
    }
  };

  requestAnimationFrame(frame);
}
