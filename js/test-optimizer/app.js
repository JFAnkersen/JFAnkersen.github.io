// ------------------------------------------------------------
// Fatigue Test Acceleration Optimizer: the page (form, charts and workshop spec).
// The calculation is in optimizer.js and runs in worker.js, so the page stays responsive.
// ------------------------------------------------------------
import { parseCsv, parseXlsx, rowsToInput } from "../blade-sim/input.js";
import { lineChart, cssVar, fmt, niceTicks } from "../blade-sim/charts.js";
import { DEFAULTS, baseline } from "./optimizer.js";

const GENERIC_FILE = "../data/test-optimizer/generic-blade-nrel5mw-target.csv";
const $ = (id) => document.getElementById(id);

let file = null;            // the input file as read
let work = null;            // the input used (file + test type)
let sourceName = "";
const settings = structuredClone(DEFAULTS);
let base = null;            // the test without spring (computed on the page, it is quick)
let out = null;             // optimizer results { base, results, front }
let selected = null;
let worker = null;

// ---------- Loading input ----------

async function loadGeneric() {
  const text = await (await fetch(GENERIC_FILE)).text();
  setInput(rowsToInput(parseCsv(text)), "generic-blade-nrel5mw-target.csv (NREL 5 MW reference blade, 61.5 m, example target)");
}

async function loadFile(f) {
  try {
    const rows = /\.xlsx?$/i.test(f.name) ? await parseXlsx(await f.arrayBuffer()) : parseCsv(await f.text());
    const input = rowsToInput(rows);
    if (input.errors.length) {
      showMessages($("messages"), input.errors.map((t) => ["error", `${f.name}: ${t}`]));
      return;
    }
    setInput(input, f.name);
  } catch (err) {
    showMessages($("messages"), [["error", `${f.name}: ${err.message}`]]);
  }
}

function setInput(input, name) {
  file = input;
  sourceName = name;
  const msgs = input.warnings.map((t) => ["warning", t]);
  if (!input.targetMom) msgs.push(["warning", "No \"Target Mom [kNm]\" column: the moment of the test without spring (exciter at full force) is used as the target."]);
  if (!input.exciters.length) msgs.push(["error", "The file has no exciter (Exciter Pos [m] + Fpeak [N]). The optimizer needs one."]);
  if (input.exciters.length > 1) msgs.push(["warning", "Only the first exciter is used."]);
  showMessages($("messages"), msgs);
  setTestType(input.testType);
}

function setTestType(type) {
  const ei = (type === "Flap" ? file.eiFlap : file.eiEdge) ?? file.ei ?? file.eiFlap ?? file.eiEdge;
  work = { ...file, testType: type, ei, exciters: file.exciters.slice(0, 1) };
  document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === type)));
  $("source-info").textContent = sourceName;
  $("clamp-table").querySelector("tbody").innerHTML = work.clamps.length
    ? work.clamps.map((c) => `<tr><td>${c.pos}</td><td>${c.mass}</td></tr>`).join("")
    : `<tr class="empty-row"><td colspan="2">No clamps in the file: only the yoke for the link rod is used.</td></tr>`;
  const ex = work.exciters[0];
  $("exciter-info").textContent = ex ? `Exciter at ${ex.pos} m. Its peak force in the file is not used: the force needed is computed.` : "";
  refreshBase();
  markStale();
}

function showMessages(box, list) {
  box.hidden = !list.length;
  box.replaceChildren(...list.map(([kind, text]) => {
    const p = document.createElement("p");
    p.className = kind;
    p.textContent = text;
    return p;
  }));
}

// ---------- Settings ----------

function bindSettings() {
  document.querySelectorAll("[data-key]").forEach((el) => {
    const key = el.dataset.key, scale = Number(el.dataset.scale ?? 1);
    el.value = el.tagName === "SELECT" ? settings[key] : Number((settings[key] / scale).toPrecision(6));
    el.addEventListener("change", () => {
      if (el.tagName === "SELECT") settings[key] = el.value;
      else {
        const v = Number(el.value);
        if (!Number.isFinite(v) || v < 0) { el.value = Number((settings[key] / scale).toPrecision(6)); return; }
        settings[key] = v * scale;
      }
      if (settings.zoneEnd <= settings.zoneStart) settings.zoneEnd = Math.min(1, settings.zoneStart + 0.05);
      refreshBase();
      markStale();
    });
  });
  document.querySelectorAll(".segmented button").forEach((b) => b.addEventListener("click", () => setTestType(b.dataset.type)));
  $("btn-generic").addEventListener("click", loadGeneric);
  $("file-input").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
  const zone = $("drop-zone");
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("drag");
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  $("btn-run").addEventListener("click", run);
  $("btn-spec").addEventListener("click", downloadSpec);
  $("btn-print").addEventListener("click", () => window.print());
}

function markStale() {
  if (out) $("run-info").textContent = "Settings changed: run the optimization again to update the results.";
}

// ---------- The test without spring ----------

function refreshBase() {
  if (!work?.exciters.length) { base = null; renderTarget(); return; }
  try {
    const b = baseline(work, settings);
    base = { L: b.model.L, mass: b.model.mass, ctx: b.ctx, targetSource: b.targetSource, result: b.result };
  } catch (err) {
    base = null;
    showMessages($("messages"), [["error", err.message]]);
  }
  renderTarget();
}

const colors = () => ({
  c1: cssVar("--sim-1"), c2: cssVar("--sim-2"), c3: cssVar("--sim-3"), c4: cssVar("--sim-4"), muted: cssVar("--muted"),
});
const charts = {};
function update(id, cfg) {
  if (charts[id]) charts[id].update(cfg);
  else charts[id] = lineChart($(id), cfg);
}
const zoneBand = () => base && { x0: settings.zoneStart * base.L, x1: settings.zoneEnd * base.L };

function renderTarget() {
  if (!base) { $("blade-stats").innerHTML = ""; return; }
  const c = colors(), r = base.result;
  $("blade-stats").innerHTML = [
    ["Length", `${base.L.toFixed(1)} m`],
    ["Mass", `${(base.mass / 1000).toFixed(1)} t`],
    ["f₁ no spring", `${r.f1.toFixed(3)} Hz`],
    ["Test time", `${r.days.toFixed(1)} days`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  update("chart-target", {
    series: [
      { x: r.nodesX, y: kNm(r.target), color: c.c3, width: 2.5, label: base.targetSource === "file" ? "Target" : "Target (from test)" },
      { x: r.nodesX, y: kNm(r.moment), color: c.muted, dash: [5, 4], label: "No spring" },
    ],
    xLabel: "Span [m]", yLabel: "Moment [kNm]", band: zoneBand(), yMin: 0,
  });
}
const kNm = (arr) => Float64Array.from(arr, (v) => v / 1000);

// ---------- Running the optimizer ----------

function run() {
  if (!work?.exciters.length) return;
  worker?.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const t0 = performance.now();
  $("btn-run").disabled = true;
  $("progress").hidden = false;
  $("progress-bar").style.width = "0%";
  $("run-info").textContent = "Searching spring positions and stiffnesses…";
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      $("progress-bar").style.width = `${((100 * data.done) / data.total).toFixed(0)}%`;
      return;
    }
    $("btn-run").disabled = false;
    $("progress").hidden = true;
    worker.terminate();
    worker = null;
    if (data.type === "error") { $("run-info").textContent = `Error: ${data.message}`; return; }
    out = data;
    const nOk = out.results.filter((r) => r.feasible).length;
    $("run-info").textContent = `${out.results.length} spring designs in ${((performance.now() - t0) / 1000).toFixed(1)} s, ` +
      `${nOk} within all limits.`;
    selected = out.front[0] ?? null;
    renderResults();
  };
  worker.postMessage({ input: work, settings });
}

// ---------- Results ----------

function renderResults() {
  const b = out.base.result, r = selected;
  const days = (v) => `${v.toFixed(1)} days`;
  const stats = [["Without spring", days(b.days), `f₁ = ${b.f1.toFixed(3)} Hz · ${(b.power / 1000).toFixed(1)} kW`]];
  if (r) {
    stats.push(
      ["Selected design", days(r.days), `f₁ = ${r.f1.toFixed(3)} Hz (+${((r.f1 / b.f1 - 1) * 100).toFixed(1)} %)`],
      ["Time saved", days(b.days - r.days), `${(((b.days - r.days) / b.days) * 100).toFixed(1)} % shorter test`],
      ["Exciter", `${(r.power / 1000).toFixed(1)} kW`, `${(r.force / 1000).toFixed(1)} kN · ±${r.stroke.toFixed(2)} m`],
      ["Spring", `${(r.beam.mass / 1000).toFixed(2)} t`, `GFRP, ${r.beam.span.toFixed(1)} m span`],
    );
  } else stats.push(["No design", "–", "None meets all limits. Relax a limit and run again."]);
  $("result-stats").innerHTML = stats.map(([k, v, sub], i) =>
    `<dl class="stat${i === 1 && r && !r.feasible ? " warn" : ""}"><dt>${k}</dt><dd>${v}<span class="sub">${sub}</span></dd></dl>`).join("");
  renderPareto();
  renderMoment();
  renderSpec();
}

// Scatter chart: test time against exciter power, one point per design
function renderPareto() {
  const canvas = $("chart-pareto"), ctx = canvas.getContext("2d");
  const pts = [{ r: out.base.result, base: true }, ...out.results.map((r) => ({ r }))].filter((p) => Number.isFinite(p.r.power));
  const front = new Set(out.front);
  let hover = null, geom = null;

  function draw() {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const c = colors(), border = cssVar("--border"), text = cssVar("--text"), font = cssVar("--font") || "sans-serif";
    // Axis range from the feasible designs and the baseline, so far-off designs don't squash the plot
    const bDays = out.base.result.days;
    const focus = pts.filter((p) => p.base || (p.r.feasible && p.r.days <= bDays * 1.02));
    const use = focus.length > 2 ? focus : pts;
    let x0 = Math.min(...use.map((p) => p.r.days)), x1 = Math.max(...use.map((p) => p.r.days));
    let y1 = Math.max(...use.map((p) => p.r.power)) / 1000;
    const xpad = (x1 - x0) * 0.15 || 1;
    x0 = Math.max(0, x0 - xpad); x1 += xpad * 0.5; y1 *= 1.25;
    const pad = { l: 52, r: 12, t: W < 420 ? 58 : 42, b: 38 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * pw, Y = (v) => pad.t + ph - (v / y1) * ph;
    geom = { X, Y, pad, pw, ph };

    ctx.font = `11px ${font}`; ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.fillStyle = c.muted;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of niceTicks(0, y1, Math.max(3, Math.floor(ph / 40)))) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(pad.l + pw, Y(v)); ctx.stroke();
      ctx.fillText(fmt(v), pad.l - 6, Y(v));
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const v of niceTicks(x0, x1, Math.max(3, Math.floor(pw / 70)))) {
      ctx.beginPath(); ctx.moveTo(X(v), pad.t); ctx.lineTo(X(v), pad.t + ph); ctx.stroke();
      ctx.fillText(fmt(v), X(v), pad.t + ph + 5);
    }
    ctx.strokeStyle = c.muted; ctx.strokeRect(pad.l, pad.t, pw, ph);
    ctx.fillText("Test time [days]", pad.l + pw / 2, H - 14);
    ctx.textAlign = "left"; ctx.fillText("Exciter power [kW]", 4, 4);

    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
    for (const p of pts) {
      if (p.base || p.r.feasible) continue;
      ctx.globalAlpha = 0.35; ctx.fillStyle = c.muted;
      ctx.beginPath(); ctx.arc(X(p.r.days), Y(p.r.power / 1000), 3, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (out.front.length) {
      ctx.strokeStyle = c.c2; ctx.lineWidth = 2;
      ctx.beginPath();
      out.front.forEach((r, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(r.days), Y(r.power / 1000)));
      ctx.stroke();
    }
    for (const p of pts) {
      if (p.base || !p.r.feasible) continue;
      ctx.fillStyle = front.has(p.r) ? c.c2 : c.c1;
      ctx.beginPath(); ctx.arc(X(p.r.days), Y(p.r.power / 1000), front.has(p.r) ? 4.5 : 3.5, 0, 2 * Math.PI); ctx.fill();
    }
    // Baseline as a diamond, the selected design as a ring
    const bx = X(out.base.result.days), by = Y(out.base.result.power / 1000);
    ctx.fillStyle = c.c3;
    ctx.beginPath(); ctx.moveTo(bx, by - 7); ctx.lineTo(bx + 7, by); ctx.lineTo(bx, by + 7); ctx.lineTo(bx - 7, by); ctx.fill();
    if (selected) {
      ctx.strokeStyle = c.c4; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(X(selected.days), Y(selected.power / 1000), 8, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.restore();

    // Legend
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const items = [[c.c3, "No spring", "diamond"], [c.c2, "Best trade-off", "dot"], [c.c1, "OK", "dot"], [c.muted, "Breaks a limit", "dot"]];
    let lx = pad.l, ly = 26;
    for (const [col, label] of items) {
      const w = ctx.measureText(label).width + 22;
      if (lx + w > W - pad.r) { lx = pad.l; ly += 16; }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(lx + 4, ly, 4, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = c.muted; ctx.fillText(label, lx + 12, ly);
      lx += w;
    }

    if (hover) {
      const r = hover.r;
      const lines = hover.base
        ? ["No spring", `${r.days.toFixed(1)} days · ${(r.power / 1000).toFixed(1)} kW`]
        : [`Spring at ${r.design.pos} m, ${(r.design.k / 1000).toFixed(0)} kN/m`,
           `${r.days.toFixed(1)} days · ${(r.power / 1000).toFixed(1)} kW`,
           `GFRP ${(r.beam.mass / 1000).toFixed(2)} t · overload ${pct(r.overload)}`,
           r.feasible ? "Within all limits" : `Breaks: ${r.reasons.join(", ")}`];
      const hx = X(r.days), hy = Y(r.power / 1000);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh = lines.length * 15 + 8;
      let tx = hx + 12, ty = hy - bh - 6;
      if (tx + bw > W - 4) tx = hx - bw - 12;
      if (ty < 2) ty = hy + 12;
      ctx.fillStyle = cssVar("--surface"); ctx.strokeStyle = border; ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, bw, bh); ctx.strokeRect(tx, ty, bw, bh);
      ctx.fillStyle = text; ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, tx + 7, ty + 5 + i * 15));
    }
  }

  const nearest = (e) => {
    if (!geom) return null;
    let best = null, bd = 18 * 18;
    for (const p of pts) {
      const dx = geom.X(p.r.days) - e.offsetX, dy = geom.Y(p.r.power / 1000) - e.offsetY, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  canvas.onpointermove = (e) => { hover = nearest(e); canvas.style.cursor = hover && !hover.base ? "pointer" : ""; draw(); };
  canvas.onpointerleave = () => { hover = null; draw(); };
  canvas.onclick = (e) => {
    const p = nearest(e);
    if (p && !p.base) { selected = p.r; renderResults(); }
  };
  charts.paretoDraw = draw;
  draw();
}
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : "–");

function renderMoment() {
  const c = colors(), b = out.base.result, r = selected;
  const series = [
    { x: b.nodesX, y: kNm(b.target), color: c.c3, width: 2.5, label: "Target" },
    { x: b.nodesX, y: kNm(b.moment), color: c.muted, dash: [5, 4], label: "No spring" },
  ];
  if (r) series.push({ x: r.nodesX, y: kNm(r.moment), color: c.c1, label: "Spring" });
  update("chart-moment", {
    series, xLabel: "Span [m]", yLabel: "Moment [kNm]", band: zoneBand(), yMin: 0,
    vlines: r ? [{ x: r.design.pos, color: c.c2, label: "spring" }] : [],
  });
  showMessages($("design-messages"), r && !r.feasible ? [["warning", `This design breaks: ${r.reasons.join(", ")}.`]] : []);
}

// ---------- Workshop spec ----------

function specData() {
  const r = selected, s = settings, bm = r.beam, b = out.base.result;
  const leaf = bm.shape === "leaf";
  return {
    leaf,
    rows: [
      ["Spring", [
        ["Material", `GFRP, unidirectional fibres along the span (E = ${(s.E / 1e9).toFixed(0)} GPa, ρ = ${s.density} kg/m³)`],
        ["Shape", leaf ? "Leaf spring: constant thickness, width tapering linearly from mid-span to the supports" : "Constant rectangular section"],
        ["Number side by side", `${bm.count}`],
        [`Width at mid-span${bm.count > 1 ? ", each" : ""}`, `${mm(bm.bEach)} mm`],
        ["Thickness", `${mm(bm.h)} mm`],
        ["Span between supports", `${mm(bm.span)} mm`],
        ["Mass (total)", `${kg(bm.mass)} kg`],
        ["Bending stiffness EI at mid-span", `${(bm.ei / 1e6).toFixed(2)} MNm² (total)`],
        ["Spring stiffness at mid-span", `${(bm.k / 1e3).toFixed(1)} kN/m`],
        ["Deflection at mid-span", `± ${mm(r.beamDeflection)} mm`],
        ["Stress amplitude", `${(r.beamStress / 1e6).toFixed(1)} MPa (allowed ${(s.stressAmp / 1e6).toFixed(0)} MPa) over ${(s.cycles / 1e6).toFixed(1)} million cycles`],
        ["Supports", "One end pinned, the other end pinned and free to slide along the span"],
      ]],
      ["Link rod", [
        ["Position on the blade", `${r.design.pos.toFixed(1)} m from the root, fixed to a yoke of about ${s.yokeMass} kg`],
        ["Connects to", "Mid-span of the spring, a spherical bearing at each end"],
        ["Rod", `Solid steel Ø ${mm(s.rodDiameter)} mm, ${mm(s.rodLength)} mm long, ${kg(r.link.rod)} kg`],
        ["Bearings", `2 spherical bearings, about ${s.bearingMass} kg each`],
        ["Mass in the model", `${kg(r.link.blade)} kg on the blade (yoke, upper bearing, half rod), ${kg(r.link.spring)} kg on the spring (lower bearing, half rod)`],
        ["Force amplitude", `± ${kN(r.linkForce)} kN, rod stress ± ${(r.link.stress / 1e6).toFixed(1)} MPa`],
        ["Required stiffness", `≥ ${(s.link / 1e6).toFixed(0)} MN/m (spring and rod together: ${(r.design.k / 1e3).toFixed(0)} kN/m)`],
      ]],
      ["Each spring support", [
        ["Uplift force amplitude", `± ${kN(r.endReaction)} kN`],
        [`Minimum mass holding it down (safety factor ${s.safetyFactor})`, `${kg(r.supportMassMin)} kg`],
        ["of which the spring's own weight and link hardware", `${kg((bm.mass + r.link.spring) / 2)} kg`],
        ["Ballast or anchoring to add", `≥ ${kg(r.ballast)} kg`],
      ]],
      ["Clamp masses on the blade (tuned)", r.clamps.map((c, i) =>
        [`Clamp ${i + 1} at ${c.pos} m`, `${c.mass} kg${work.clamps[i] && work.clamps[i].mass !== c.mass ? ` (file: ${work.clamps[i].mass} kg)` : ""}`])],
      ["Test", [
        ["Test frequency", `${r.f1.toFixed(3)} Hz (without spring ${b.f1.toFixed(3)} Hz); mode 2 at ${r.f2.toFixed(2)} Hz`],
        ["Test time", `${r.days.toFixed(1)} days (without spring ${b.days.toFixed(1)} days)`],
        ["Exciter", `± ${kN(r.force)} kN, ± ${mm(r.stroke)} mm stroke, ${(r.power / 1000).toFixed(1)} kW average`],
        ["Moment in test zone", `100 % to ${(100 + r.overload * 100).toFixed(1)} % of target`],
      ]],
    ],
  };
}
const mm = (m) => (m * 1000).toFixed(0);
const kg = (v) => (Math.ceil(v / 10) * 10).toFixed(0);
const kN = (v) => (v / 1000).toFixed(1);

function renderSpec() {
  const box = $("spec-sheet");
  if (!selected) { box.innerHTML = `<p class="muted">No design to show.</p>`; return; }
  const d = specData();
  const warn = selected.feasible ? "" : `<p class="spec-warn">This design breaks: ${selected.reasons.join(", ")}.</p>`;
  box.innerHTML = `${warn}<div class="spec-grid">${drawing(d.leaf)}<div class="spec-tables">${[d.rows.slice(0, 1), d.rows.slice(1)].map((col) => `<div>${col.map(([title, rows]) =>
    `<h4>${title}</h4><table class="spec-table">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`).join("")}</div>`).join("")}</div></div>`;
}

// Plan view and side view of the spring with its main dimensions
function drawing(leaf) {
  const bm = selected.beam;
  const W = 420, x0 = 40, x1 = 380, cx = (x0 + x1) / 2;
  const half = Math.min(60, Math.max(16, (bm.bEach / bm.span) * 340 * 2.5));
  const plan = leaf
    ? `<path d="M${x0},90 L${cx},${90 - half} L${x1},90 L${cx},${90 + half} Z" class="f-bg s1" stroke-width="2"/>`
    : `<rect x="${x0}" y="${90 - half}" width="${x1 - x0}" height="${2 * half}" class="f-bg s1" stroke-width="2"/>`;
  const t = Math.min(14, Math.max(4, (bm.h / bm.span) * 340 * 4));
  return `<svg class="diagram" viewBox="0 0 ${W} 300" role="img" aria-label="Plan and side view of the glass-fibre spring with its dimensions">
<defs><marker id="dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="f-muted"/></marker></defs>
<text x="10" y="18" class="strong">Plan view${bm.count > 1 ? ` (×${bm.count} side by side)` : ""}</text>
${plan}
<line x1="${cx}" y1="${90 - half}" x2="${cx}" y2="${90 + half}" class="s-muted" stroke-dasharray="3 3"/>
<line x1="${cx + 30}" y1="${90 - half}" x2="${cx + 30}" y2="${90 + half}" class="s-muted" marker-start="url(#dim)" marker-end="url(#dim)"/>
<text x="${cx + 36}" y="94">b = ${mm(bm.bEach)} mm</text>
<line x1="${x0}" y1="${100 + half}" x2="${x1}" y2="${100 + half}" class="s-muted" marker-start="url(#dim)" marker-end="url(#dim)"/>
<text x="${cx}" y="${114 + half}" text-anchor="middle">span l = ${mm(bm.span)} mm</text>
<text x="10" y="180" class="strong">Side view</text>
<rect x="${x0}" y="${235 - t / 2}" width="${x1 - x0}" height="${t}" class="f-bg s1" stroke-width="2"/>
<path d="M${x0},${235 + t / 2} l-10,16 h20 z" class="f-none s-text" stroke-width="1.5"/>
<path d="M${x1},${235 + t / 2} l-10,16 h20 z" class="f-none s-text" stroke-width="1.5"/>
<circle cx="${x1 - 5}" cy="${255 + t / 2}" r="3" class="f-none s-text"/><circle cx="${x1 + 5}" cy="${255 + t / 2}" r="3" class="f-none s-text"/>
<line x1="${cx}" y1="${235 - t / 2}" x2="${cx}" y2="192" class="s2" stroke-width="3"/>
<text x="${cx + 8}" y="204">link rod to blade, ± ${kN(selected.linkForce)} kN</text>
<text x="${x0}" y="${226 - t / 2}">thickness h = ${mm(bm.h)} mm</text>
<text x="${cx}" y="${280 + t / 2}" text-anchor="middle">≥ ${kg(selected.supportMassMin)} kg holding down each support</text>
</svg>`;
}

function downloadSpec() {
  if (!selected) return;
  const d = specData(), lines = [
    "GFRP SPRING FOR BLADE FATIGUE TEST - WORKSHOP SPEC",
    `Blade: ${sourceName}`,
    `Test: ${work.testType === "Flap" ? "flapwise" : "edgewise"}, ${(settings.cycles / 1e6).toFixed(1)} million cycles`,
    `Made with the Fatigue Test Acceleration Optimizer, ${new Date().toISOString().slice(0, 10)}`,
    selected.feasible ? "" : `WARNING: this design breaks: ${selected.reasons.join(", ")}`,
  ];
  for (const [title, rows] of d.rows) {
    lines.push("", title.toUpperCase());
    const w = Math.max(...rows.map(([k]) => k.length));
    for (const [k, v] of rows) lines.push(`  ${k.padEnd(w)}  ${v}`);
  }
  lines.push("", "Linear model at steady resonance. Check against the material supplier's data before building.");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/plain" }));
  a.download = "gfrp-spring-spec.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Equations ----------

function renderMath() {
  document.querySelectorAll("[data-tex]").forEach((el) => {
    const tex = el.dataset.tex, display = el.classList.contains("eq");
    if (window.katex) katex.render(tex, el, { displayMode: display, throwOnError: false });
    else el.textContent = tex;
  });
}

// ---------- Start ----------

renderMath();
new ResizeObserver(() => charts.paretoDraw?.()).observe($("chart-pareto"));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { charts.paretoDraw?.(); if (out) renderSpec(); });
bindSettings();
loadGeneric().then(run).catch((err) => showMessages($("messages"), [["error", `Could not load the generic blade: ${err.message}`]]));
