// ------------------------------------------------------------
// Blade fatigue test simulator: small canvas line charts.
// No chart library, so the page stays light. Colors come from the CSS variables,
// so the charts follow light/dark mode.
//
//   const chart = lineChart(canvas, config);  chart.update(newConfig);
//   config: { series: [{ x, y, color, dash, width, label }], xLabel, yLabel, logY,
//             xMin, xMax, yMin, yMax, vlines: [{ x, color, label }], band: { x0, x1 },
//             onClick: (x) => {} }
// ------------------------------------------------------------

export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Short number for axis labels and tooltips: 1.2k, 3.4M, 0.012
export function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e9) return (v / 1e9).toPrecision(digits).replace(/\.?0+$/, "") + "G";
  if (a >= 1e6) return (v / 1e6).toPrecision(digits).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (v / 1e3).toPrecision(digits).replace(/\.?0+$/, "") + "k";
  if (a >= 1e-3) return Number(v.toPrecision(digits)).toString();
  return v.toExponential(1);
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const pow10 = (e) => "10" + String(e).split("").map((c) => SUPERSCRIPT[c]).join("");

export function lineChart(canvas, config) {
  let cfg = config, hoverX = null, frame = null;
  const ctx = canvas.getContext("2d");

  function bounds() {
    const xs = [], ys = [];
    for (const s of cfg.series) {
      for (let i = 0; i < s.x.length; i++) {
        const y = s.y[i];
        if (!Number.isFinite(y) || (cfg.logY && y <= 0)) continue;
        xs.push(s.x[i]); ys.push(y);
      }
    }
    let xMin = cfg.xMin ?? Math.min(...xs), xMax = cfg.xMax ?? Math.max(...xs);
    let yMin = cfg.yMin ?? Math.min(...ys), yMax = cfg.yMax ?? Math.max(...ys);
    if (!xs.length) { xMin = 0; xMax = 1; yMin = cfg.logY ? 1 : 0; yMax = cfg.logY ? 10 : 1; }
    if (xMax === xMin) xMax = xMin + 1;
    if (cfg.logY) {
      yMin = 10 ** Math.floor(Math.log10(yMin)); yMax = 10 ** Math.ceil(Math.log10(yMax));
      if (yMax === yMin) yMax = yMin * 10;
    } else {
      if (cfg.yMin === undefined && cfg.yMax === undefined) {
        const pad = (yMax - yMin) * 0.06 || Math.abs(yMax) * 0.1 || 1;
        yMin -= pad; yMax += pad;
      }
    }
    return { xMin, xMax, yMin, yMax };
  }

  function draw() {
    frame = null;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const text = cssVar("--text"), muted = cssVar("--muted"), border = cssVar("--border");
    const font = cssVar("--font") || "sans-serif";
    const b = bounds();
    const pad = { l: 56, r: 12, t: 26, b: 38 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const ly = (v) => (cfg.logY ? Math.log10(v) : v);
    const X = (v) => pad.l + ((v - b.xMin) / (b.xMax - b.xMin)) * pw;
    const Y = (v) => pad.t + ph - ((ly(v) - ly(b.yMin)) / (ly(b.yMax) - ly(b.yMin))) * ph;
    chart.toX = (px) => b.xMin + ((px - pad.l) / pw) * (b.xMax - b.xMin);

    // Grid and axes
    ctx.font = `11px ${font}`;
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.fillStyle = muted;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const yTicks = cfg.logY
      ? Array.from({ length: Math.round(Math.log10(b.yMax / b.yMin)) + 1 }, (_, i) => b.yMin * 10 ** i)
      : niceTicks(b.yMin, b.yMax, Math.max(3, Math.floor(ph / 40)));
    const yStep = Math.ceil(yTicks.length / Math.max(3, Math.floor(ph / 22)));
    yTicks.forEach((v, i) => {
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      if (i % yStep === 0) ctx.fillText(cfg.logY ? pow10(Math.round(Math.log10(v))) : fmt(v), pad.l - 6, y);
    });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const v of niceTicks(b.xMin, b.xMax, Math.max(3, Math.floor(pw / 70)))) {
      const x = X(v);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
      ctx.fillText(fmt(v), x, pad.t + ph + 5);
    }
    ctx.strokeStyle = muted;
    ctx.strokeRect(pad.l, pad.t, pw, ph);
    if (cfg.xLabel) ctx.fillText(cfg.xLabel, pad.l + pw / 2, H - 14);
    if (cfg.yLabel) {
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(cfg.yLabel, 4, 4);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();

    // Shaded band (e.g. the steady-state window)
    if (cfg.band) {
      ctx.fillStyle = cssVar("--accent-soft");
      ctx.fillRect(X(cfg.band.x0), pad.t, X(cfg.band.x1) - X(cfg.band.x0), ph);
    }

    // Series
    for (const s of cfg.series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 2;
      ctx.setLineDash(s.dash ?? []);
      ctx.beginPath();
      let pen = false;
      const stride = Math.max(1, Math.floor(s.x.length / (pw * 2)));
      for (let i = 0; i < s.x.length; i += stride) {
        const y = s.y[i];
        if (!Number.isFinite(y) || (cfg.logY && y <= 0)) { pen = false; continue; }
        const px = X(s.x[i]), py = Y(y);
        if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
      if (s.points) {
        ctx.fillStyle = s.color;
        for (let i = 0; i < s.x.length; i++) {
          if (!Number.isFinite(s.y[i])) continue;
          ctx.beginPath(); ctx.arc(X(s.x[i]), Y(s.y[i]), 2.5, 0, 2 * Math.PI); ctx.fill();
        }
      }
    }
    ctx.setLineDash([]);

    // Vertical marker lines
    for (const v of cfg.vlines ?? []) {
      const x = X(v.x);
      ctx.strokeStyle = v.color; ctx.lineWidth = 1.5; ctx.setLineDash(v.dash ?? [4, 3]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      if (v.label) {
        ctx.fillStyle = v.color; ctx.textAlign = x > pad.l + pw - 60 ? "right" : "left"; ctx.textBaseline = "top";
        ctx.fillText(v.label, x + (ctx.textAlign === "left" ? 4 : -4), pad.t + 4);
      }
    }
    ctx.restore();

    // Legend (above the plot, right aligned)
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    let lx = W - pad.r;
    for (const s of [...cfg.series].reverse()) {
      if (!s.label) continue;
      const w = ctx.measureText(s.label).width;
      lx -= w;
      ctx.fillStyle = muted; ctx.fillText(s.label, lx, 12);
      lx -= 20;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash ?? []);
      ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + 14, 12); ctx.stroke();
      ctx.setLineDash([]);
      lx -= 12;
    }

    // Hover read-out
    if (hoverX !== null && hoverX >= pad.l && hoverX <= pad.l + pw) {
      const xv = chart.toX(hoverX);
      ctx.strokeStyle = muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hoverX, pad.t); ctx.lineTo(hoverX, pad.t + ph); ctx.stroke();
      const lines = [`${cfg.xLabel ? cfg.xLabel.replace(/ \[.*\]/, "") : "x"}: ${fmt(xv)}`];
      for (const s of cfg.series) {
        if (!s.label) continue;
        const y = valueAt(s, xv);
        if (Number.isFinite(y)) lines.push(`${s.label}: ${fmt(y)}`);
      }
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh = lines.length * 15 + 8;
      let bx = hoverX + 10;
      if (bx + bw > W - 4) bx = hoverX - bw - 10;
      ctx.fillStyle = cssVar("--surface"); ctx.strokeStyle = border;
      ctx.fillRect(bx, pad.t + 6, bw, bh); ctx.strokeRect(bx, pad.t + 6, bw, bh);
      ctx.fillStyle = text; ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, bx + 7, pad.t + 11 + i * 15));
    }
  }

  function valueAt(s, xv) {
    const n = s.x.length;
    if (!n || xv < s.x[0] || xv > s.x[n - 1]) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.x[mid] <= xv) lo = mid; else hi = mid; }
    const f = (xv - s.x[lo]) / (s.x[hi] - s.x[lo] || 1);
    return s.y[lo] + f * (s.y[hi] - s.y[lo]);
  }

  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
  canvas.addEventListener("pointermove", (e) => { hoverX = e.offsetX; redraw(); });
  canvas.addEventListener("pointerleave", () => { hoverX = null; redraw(); });
  canvas.addEventListener("click", (e) => { if (cfg.onClick && chart.toX) cfg.onClick(chart.toX(e.offsetX)); });
  new ResizeObserver(redraw).observe(canvas);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);

  const chart = {
    update(next) { cfg = next; canvas.style.cursor = cfg.onClick ? "crosshair" : ""; redraw(); },
    redraw,
  };
  chart.update(config);
  return chart;
}
