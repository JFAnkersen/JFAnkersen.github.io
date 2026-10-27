// ------------------------------------------------------------
// Blade fatigue test simulator: the page (form, charts and animation).
// The physics is in engine.js, file reading/writing in input.js.
// ------------------------------------------------------------
import { buildModel, runTest, resonanceCurve, defaultFtest, TIMELINE } from "./engine.js";
import { COLUMNS, parseCsv, parseXlsx, rowsToInput, inputToCsv } from "./input.js";
import { lineChart, cssVar, fmt } from "./charts.js";

const GENERIC_FILE = "../data/blade-sim/generic-blade-nrel5mw.csv";
const MAX_EXCITERS = 3, MAX_CLAMPS = 10;

const $ = (id) => document.getElementById(id);
let work = null;          // the input being simulated (file + edits in the form)
let sourceName = "";
let model = null, run = null;
let curve = null;

// ---------- Loading input ----------

async function loadGeneric() {
  const text = await (await fetch(GENERIC_FILE)).text();
  setInput(rowsToInput(parseCsv(text)), "generic-blade-nrel5mw.csv (NREL 5 MW reference blade, 61.5 m)");
}

async function loadFile(file) {
  try {
    const rows = /\.xlsx?$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
    const input = rowsToInput(rows);
    if (input.errors.length) {
      showMessages($("messages"), input.errors.map((t) => ["error", `${file.name}: ${t}`]));
      return;
    }
    setInput(input, file.name);
  } catch (err) {
    showMessages($("messages"), [["error", `${file.name}: ${err.message}`]]);
  }
}

function setInput(input, name) {
  work = structuredClone(input);
  work.eiSingle = input.ei;               // the plain "Ei" column, if the file has no flap/edge columns
  work.ei = eiFor(work.testType);
  sourceName = name;
  showMessages($("messages"), input.warnings.map((t) => ["warning", t]));
  fillForm();
  recompute();
}

const hasBothEi = () => Boolean(work.eiFlap && work.eiEdge);
function eiFor(type) {
  if (type === "Flap" && work.eiFlap) return work.eiFlap;
  if (type === "Edge" && work.eiEdge) return work.eiEdge;
  return work.eiSingle ?? work.eiFlap ?? work.eiEdge;
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

// ---------- Form ----------

function fillForm() {
  document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === work.testType)));
  document.querySelectorAll("[data-flap-only]").forEach((el) => (el.hidden = work.testType !== "Flap"));
  $("tilt").value = work.tilt;
  $("rig-height").value = work.rigHeight;
  $("sim-time").value = work.simTime;
  $("beta").value = Number(work.beta[0].toPrecision(4));
  if (work.ftest != null) setFtestFields(work.ftest);
  renderListTable("exciter-table", work.exciters, ["pos", "force"], "No exciter: only gravity is simulated.");
  renderListTable("clamp-table", work.clamps, ["pos", "mass"], "No clamps.");
  $("add-exciter").disabled = work.exciters.length >= MAX_EXCITERS;
  $("add-clamp").disabled = work.clamps.length >= MAX_CLAMPS;
}

function setFtestFields(f) {
  $("ftest").value = Number(f.toFixed(3));
  $("ftest-range").value = f;
}

function renderListTable(id, items, keys, emptyText) {
  const body = $(id).querySelector("tbody");
  if (!items.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="3">${emptyText}</td></tr>`;
    return;
  }
  body.replaceChildren(...items.map((item, i) => {
    const tr = document.createElement("tr");
    for (const k of keys) {
      const td = document.createElement("td"), inp = document.createElement("input");
      inp.type = "number";
      inp.step = k === "pos" ? "0.5" : "100";
      inp.value = item[k];
      inp.setAttribute("aria-label", k);
      inp.addEventListener("input", () => {
        const v = Number(inp.value);
        if (Number.isFinite(v)) { item[k] = v; schedule(); }
      });
      td.append(inp);
      tr.append(td);
    }
    const td = document.createElement("td"), btn = document.createElement("button");
    btn.type = "button"; btn.className = "remove"; btn.textContent = "×"; btn.title = "Remove";
    btn.addEventListener("click", () => { items.splice(i, 1); fillForm(); recompute(); });
    td.append(btn);
    tr.append(td);
    return tr;
  }));
}

function bindForm() {
  document.querySelectorAll(".segmented button").forEach((b) => b.addEventListener("click", () => {
    if (!work || work.testType === b.dataset.type) return;
    work.testType = b.dataset.type;
    work.ei = eiFor(work.testType);
    work.ftest = null;                    // new frequencies: start just below the new mode 1
    fillForm();
    recompute();
  }));
  const numberField = (id, apply) => $(id).addEventListener("input", () => {
    const v = Number($(id).value);
    if ($(id).value !== "" && Number.isFinite(v)) { apply(v); schedule(); }
  });
  numberField("tilt", (v) => (work.tilt = v));
  numberField("rig-height", (v) => (work.rigHeight = v));
  numberField("sim-time", (v) => (work.simTime = Math.min(Math.max(v, 20), 600)));
  numberField("beta", (v) => (work.beta = work.beta.map(() => Math.max(v, 0))));
  numberField("ftest", (v) => { if (v > 0) { work.ftest = v; $("ftest-range").value = v; } });
  $("ftest-range").addEventListener("input", () => {
    work.ftest = Number($("ftest-range").value);
    $("ftest").value = work.ftest.toFixed(3);
    schedule();
  });
  $("add-exciter").addEventListener("click", () => {
    work.exciters.push({ pos: Number((model ? model.L * 0.67 : 10).toFixed(1)), force: 5000 });
    fillForm(); recompute();
  });
  $("add-clamp").addEventListener("click", () => {
    work.clamps.push({ pos: Number((model ? model.L * 0.4 : 5).toFixed(1)), mass: 500 });
    fillForm(); recompute();
  });

  $("btn-generic").addEventListener("click", loadGeneric);
  $("file-input").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
  $("btn-download").addEventListener("click", () => {
    const { eiSingle, ...rest } = work;
    const csv = inputToCsv(hasBothEi() ? { ...rest, ei: null } : { ...rest, ei: eiSingle ?? work.ei, eiFlap: null, eiEdge: null });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "blade-test-input.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const zone = $("drop-zone");
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("drag");
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(recompute, 90);
}

// ---------- Simulation ----------

function recompute() {
  if (!work) return;
  const t0 = performance.now();
  try {
    model = buildModel(work);
  } catch (err) {
    showMessages($("result-messages"), [["error", `The model could not be built: ${err.message}`]]);
    return;
  }
  if (work.ftest == null) { work.ftest = defaultFtest(model); setFtestFields(work.ftest); }
  run = runTest(model, { ftest: work.ftest, simTime: work.simTime, rigHeight: work.rigHeight, tilt: work.tilt });
  const ms = performance.now() - t0;

  const fTop = model.modes.at(-1).f * 1.25;
  const freqs = [];
  for (let i = 0; i <= 800; i++) freqs.push(0.01 + ((fTop - 0.01) * i) / 800);
  model.modes.forEach((m) => freqs.push(m.f * 0.999, m.f, m.f * 1.001));
  curve = resonanceCurve(model, freqs.sort((a, b) => a - b));
  $("ftest-range").max = Math.max(fTop, work.ftest * 1.1).toFixed(3);
  $("ftest-range").value = work.ftest;

  $("compute-info").textContent =
    `${run.steps.toLocaleString("en")} time steps of ${(run.dt * 1000).toFixed(1)} ms · computed in ${ms.toFixed(0)} ms`;
  $("time").max = work.simTime;
  if (anim.t > work.simTime) anim.t = 0;

  renderBlade();
  renderModes();
  renderResults();
  drawRig();
}

// ---------- Output: blade properties ----------

const charts = {};
const colors = () => ({
  c1: cssVar("--sim-1"), c2: cssVar("--sim-2"), c3: cssVar("--sim-3"), c4: cssVar("--sim-4"), muted: cssVar("--muted"),
});

function markerLines() {
  const c = colors();
  return [
    ...work.exciters.map((e, i) => ({ x: e.pos, color: c.c3, label: i === 0 ? "Exciter" : "" })),
    ...work.clamps.map((cl, i) => ({ x: cl.pos, color: c.muted, label: i === 0 && !work.exciters.length ? "Clamp" : "" })),
  ];
}

function renderBlade() {
  const c = colors();
  const span = work.span;
  const clampMass = model.clamps.reduce((s, cl) => s + cl.mass, 0);
  $("source-info").textContent = `Loaded: ${sourceName}`;
  $("blade-stats").innerHTML = [
    ["Length", `${fmt(model.L)} m`],
    ["Blade mass", `${fmt((model.mass - clampMass) / 1000)} t`],
    ["Clamp mass", `${fmt(clampMass / 1000)} t`],
    ["Stations", span.length],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  const eiSeries = hasBothEi()
    ? [
        { x: span, y: work.eiFlap, color: work.testType === "Flap" ? c.c1 : c.muted, dash: work.testType === "Flap" ? [] : [5, 4], label: "EI flap" },
        { x: span, y: work.eiEdge, color: work.testType === "Edge" ? c.c1 : c.muted, dash: work.testType === "Edge" ? [] : [5, 4], label: "EI edge" },
      ]
    : [{ x: span, y: work.ei, color: c.c1, label: "EI" }];
  update("chart-ei", { series: eiSeries, logY: true, yLabel: "Stiffness EI [Nm²]", vlines: markerLines() });
  update("chart-mu", {
    series: [{ x: span, y: work.mu, color: c.c2, label: "mu" }],
    logY: true, yLabel: "Mass per metre μ [kg/m]", xLabel: "Span [m]", vlines: markerLines(),
  });

  const cols = [["L span [m]", span], ["mu [kg/m]", work.mu]];
  if (hasBothEi()) cols.push(["EI flap [Nm²]", work.eiFlap], ["EI edge [Nm²]", work.eiEdge]);
  else cols.push(["EI [Nm²]", work.ei]);
  cols.push(["Beta [1/s]", work.beta]);
  if (work.targetMom) cols.push(["Target [kNm]", work.targetMom]);
  $("station-count").textContent = span.length;
  $("station-table").innerHTML =
    `<thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
    span.map((_, i) => `<tr>${cols.map(([, a]) => `<td>${Number.isFinite(a[i]) ? Number(a[i].toPrecision(5)) : ""}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
}

function update(id, cfg) {
  if (charts[id]) charts[id].update(cfg);
  else charts[id] = lineChart($(id), cfg);
}

// ---------- Output: modes ----------

function renderModes() {
  const c = colors();
  const names = work.testType === "Flap" ? ["1st flap", "2nd flap", "3rd flap"] : ["1st edge", "2nd edge", "3rd edge"];
  $("mode-stats").innerHTML = model.modes.map((m, k) =>
    `<dl class="stat"><dt>Mode ${k + 1} · ${names[k]}</dt><dd>${m.f.toFixed(3)} Hz` +
    `<span class="sub">damping ζ = ${(m.zeta * 100).toFixed(2)} %</span></dd></dl>`).join("");

  update("chart-shapes", {
    series: model.shapes.map((s, k) => ({ x: model.nodesX, y: s, color: [c.c1, c.c2, c.c3][k], label: `Mode ${k + 1}` })),
    xLabel: "Span [m]", yLabel: "Shape (tip = 1)",
  });

  const near = model.modes.reduce((best, m, k) =>
    (Math.abs(Math.log(work.ftest / m.f)) < Math.abs(Math.log(work.ftest / model.modes[best].f)) ? k : best), 0);
  const fn = model.modes[near].f;
  $("ftest-note").textContent = `${((work.ftest / fn) * 100).toFixed(1)} % of mode ${near + 1} (${fn.toFixed(3)} Hz). ` +
    "A test runs close to, but not exactly at, resonance.";
  const hasForce = model.exciters.length > 0;
  update("chart-resonance", {
    series: [{ x: curve.f, y: hasForce ? curve.amp : curve.amp.map(() => NaN), color: c.c1, label: "Tip amplitude [m]" }],
    logY: true, xLabel: "Test frequency [Hz]", yLabel: hasForce ? "Steady tip amplitude [m]" : "Add an exciter to see the resonance curve",
    vlines: [{ x: work.ftest, color: c.c3, label: `Ftest ${work.ftest.toFixed(3)} Hz`, dash: [] }],
    onClick: (f) => {
      if (!(f > 0)) return;
      work.ftest = Number(f.toFixed(3));
      setFtestFields(work.ftest);
      recompute();
    },
  });
}

// ---------- Output: simulation results ----------

function renderResults() {
  const c = colors(), s = run.summary, flap = model.flap;
  const round = (v, small) => fmt(Math.abs(v) < small ? 0 : v);   // no "3e-5 m" for a zero mean
  const stats = [
    ["Tip amplitude", `± ${fmt(s.tipAmplitude)} m`, `mean ${round(s.tipMean, 1e-3)} m`],
    ["Root moment amplitude", `± ${fmt(s.rootMomentAmplitude / 1000)} kNm`, `mean ${round(s.rootMomentMean / 1000, 1)} kNm`],
    ["Exciter power", `${fmt(s.powerAvg / 1000)} kW`, `average · peak ${fmt(s.powerPeak / 1000)} kW`],
  ];
  if (flap) {
    stats.push(["Gravity tip sag", `${fmt(s.tipStatic)} m`, "static, before the test"]);
    stats.push(["Tip above ground", `${fmt(s.tipLowest)} m`, `lowest point of the tip · blade lowest ${fmt(s.clearance)} m`, s.clearance < 0]);
  }
  if (work.targetMom) {
    const ratios = work.span.map((x, i) => {
      const target = work.targetMom[i];
      if (!(target > 0)) return NaN;
      return interpNodes(run.envelope.mAmp, x - work.span[0]) / 1000 / target;
    }).filter(Number.isFinite);
    if (ratios.length) stats.push(["Moment vs target", `${(Math.min(...ratios) * 100).toFixed(0)}–${(Math.max(...ratios) * 100).toFixed(0)} %`, "amplitude / target along the span"]);
  }
  $("result-stats").innerHTML = stats.map(([k, v, sub, warn]) =>
    `<dl class="stat${warn ? " warn" : ""}"><dt>${k}</dt><dd>${v}<span class="sub">${sub}</span></dd></dl>`).join("");

  const msgs = [];
  if (!run.window.steady) {
    const need = (flap ? TIMELINE.flapStart : TIMELINE.edgeStart) + TIMELINE.forceRamp + 10;
    msgs.push(["warning", `The simulation ends before the force has ramped up. Use at least ${need} s.`]);
  }
  if (flap && s.clearance < 0) msgs.push(["error", `The blade hits the ground (at ${fmt(s.clearanceAt.x)} m, t = ${fmt(s.clearanceAt.t)} s). Raise the rig, add tilt or lower the force.`]);
  showMessages($("result-messages"), msgs);

  const band = run.window.steady ? { x0: run.window.start, x1: run.window.end } : null;
  update("chart-tip", { series: [{ x: run.t, y: run.tip, color: c.c1, label: "Tip [m]", width: 1.5 }], xLabel: "Time [s]", yLabel: "Deflection [m]", band });
  update("chart-power", {
    series: [{ x: run.t, y: run.power.map((p) => p / 1000), color: c.c3, label: "Power [kW]", width: 1.5 }],
    xLabel: "Time [s]", yLabel: "Power [kW]", band,
  });

  const e = run.envelope, x = model.nodesX;
  const wSeries = [
    { x, y: e.wMax, color: c.c1, label: "Max" },
    { x, y: e.wMin, color: c.c4, label: "Min" },
  ];
  if (flap) wSeries.push({ x, y: e.wGravity, color: c.muted, dash: [5, 4], label: "Gravity only" });
  update("chart-wenv", { series: wSeries, xLabel: "Span [m]", yLabel: "Deflection [m]", vlines: markerLines() });

  const kN = (a) => Array.from(a, (v) => v / 1000);
  const mSeries = [
    { x, y: kN(e.mMax), color: c.c1, label: "Max" },
    { x, y: kN(e.mMin), color: c.c4, label: "Min" },
    { x, y: kN(e.mAmp), color: c.c2, label: "Amplitude" },
  ];
  if (work.targetMom) mSeries.push({ x: work.span.map((v) => v - work.span[0]), y: work.targetMom, color: c.c3, dash: [2, 3], label: "Target", points: true });
  update("chart-menv", { series: mSeries, xLabel: "Span [m]", yLabel: "Bending moment [kNm]", vlines: markerLines() });
}

function interpNodes(values, x) {
  const h = model.h, j = Math.min(Math.floor(x / h), values.length - 2), f = x / h - j;
  return values[j] + f * (values[j + 1] - values[j]);
}

// ---------- Animation of the rig ----------

const anim = { t: 0, playing: true, last: null, buf: null };

function frameIndex() {
  return Math.min(Math.round(anim.t / run.dt), run.steps - 1);
}

function drawRig() {
  if (!run) return;
  const canvas = $("rig-canvas"), ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W) return;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const c = colors(), blade = cssVar("--sim-blade"), ground = cssVar("--sim-ground"), font = cssVar("--font");
  const flap = model.flap, L = model.L, ex = Number($("exaggerate").value);
  const th = flap ? (work.tilt * Math.PI) / 180 : 0, H0 = flap ? work.rigHeight : 0;
  const i = frameIndex();
  anim.buf = run.deflectionAt(i, anim.buf ?? undefined);
  const w = anim.buf, x = model.nodesX;

  // Fixed view for the whole run, so the picture doesn't jump
  let tipMax = 0, tipMin = 0;
  for (const v of run.tip) { if (v > tipMax) tipMax = v; if (v < tipMin) tipMin = v; }
  let xMin = -0.1 * L, xMax = 1.04 * L, yMin, yMax;
  if (flap) {
    yMin = -0.05 * L;
    yMax = Math.max(H0 + L * Math.sin(th) + Math.max(tipMax, 0) * ex, H0) + 0.06 * L;
  } else {
    const a = Math.max(Math.abs(tipMax), Math.abs(tipMin)) * ex * 1.25 + 0.02 * L;
    yMin = -Math.max(a, 0.08 * L); yMax = -yMin;
  }
  const pad = 14;
  const s = Math.min((W - 2 * pad) / (xMax - xMin), (H - 2 * pad - 20) / (yMax - yMin));
  const ox = pad + ((W - 2 * pad) - s * (xMax - xMin)) / 2 - s * xMin;
  const oy = H - pad - ((H - 2 * pad - 20) - s * (yMax - yMin)) / 2 + s * yMin;
  const P = (X, Y) => [ox + s * X, oy - s * Y];
  const toWorld = (xb, wv) => (flap
    ? [xb * Math.cos(th) - wv * ex * Math.sin(th), H0 + xb * Math.sin(th) + wv * ex * Math.cos(th)]
    : [xb, wv * ex]);

  // Ground and rig
  if (flap) {
    const [gx0, gy] = P(xMin, 0), [gx1] = P(xMax, 0);
    ctx.fillStyle = ground; ctx.globalAlpha = 0.18;
    ctx.fillRect(gx0, gy, gx1 - gx0, H - gy);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ground; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
    const [rx0, ry0] = P(-0.06 * L, 0), [rx1, ry1] = P(0, H0 + 0.03 * L);
    ctx.fillStyle = cssVar("--border"); ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    ctx.fillRect(rx0, ry1, rx1 - rx0, ry0 - ry1); ctx.strokeRect(rx0, ry1, rx1 - rx0, ry0 - ry1);
  } else {
    const [rx0, ry0] = P(-0.04 * L, yMin), [rx1, ry1] = P(0, yMax);
    ctx.fillStyle = cssVar("--border"); ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
    ctx.fillRect(rx0, ry1, rx1 - rx0, ry0 - ry1); ctx.strokeRect(rx0, ry1, rx1 - rx0, ry0 - ry1);
  }

  // Undeformed axis and gravity-only shape
  ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(...P(...toWorld(0, 0))); ctx.lineTo(...P(...toWorld(L, 0))); ctx.stroke();
  if (flap) {
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    x.forEach((xb, j) => { const p = P(...toWorld(xb, run.envelope.wGravity[j])); j ? ctx.lineTo(...p) : ctx.moveTo(...p); });
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Exciters: ground-based actuator (flap) and a force arrow
  const S = run.S[i];
  ctx.lineCap = "round";
  for (const e of model.exciters) {
    const [bx, by] = P(...toWorld(e.pos, interpNodes(w, e.pos)));
    if (flap) {
      const [gx, gy] = P(e.pos * Math.cos(th), 0);
      ctx.strokeStyle = c.c3; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = c.c3; ctx.fillRect(gx - 8, gy - 4, 16, 4);
    }
    const len = 0.1 * L * s * S * Math.sign(e.force);
    if (Math.abs(len) > 2) {
      const tipY = by - len - 10 * Math.sign(len);
      ctx.strokeStyle = c.c3; ctx.fillStyle = c.c3; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bx + 14, by - 10 * Math.sign(len)); ctx.lineTo(bx + 14, tipY); ctx.stroke();
      const d = Math.sign(len);
      ctx.beginPath(); ctx.moveTo(bx + 14, tipY - 7 * d); ctx.lineTo(bx + 9, tipY); ctx.lineTo(bx + 19, tipY); ctx.closePath(); ctx.fill();
    }
  }

  // Blade, thicker where it is heavier
  const muRoot = model.muAt(0);
  for (let j = 0; j < x.length - 1; j++) {
    const width = 3 + 9 * Math.min(1, Math.sqrt(model.muAt(x[j]) / muRoot));
    ctx.strokeStyle = blade; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(...P(...toWorld(x[j], w[j]))); ctx.lineTo(...P(...toWorld(x[j + 1], w[j + 1]))); ctx.stroke();
  }

  // Clamps
  ctx.fillStyle = c.c1;
  for (const cl of model.clamps) {
    const [px, py] = P(...toWorld(cl.pos, interpNodes(w, cl.pos)));
    ctx.fillRect(px - 6, py - 6, 12, 12);
  }

  // Labels
  const t = run.t[i], start = flap ? TIMELINE.flapStart : TIMELINE.edgeStart;
  const phase = flap && t < TIMELINE.gravityRamp ? "Gravity ramps in"
    : t < start ? "Settling under gravity"
    : t < start + TIMELINE.forceRamp ? "Exciter force ramps up"
    : run.window.steady && t >= run.window.start ? "Steady state" : "Exciter at full force";
  ctx.font = `600 13px ${font}`; ctx.fillStyle = cssVar("--text"); ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillText(`t = ${t.toFixed(1)} s · ${phase}`, 10, 8);
  const narrow = W < 520;                                // phones: second label goes on its own line
  ctx.textAlign = narrow ? "left" : "right"; ctx.font = `12px ${font}`; ctx.fillStyle = c.muted;
  const tipText = w.at(-1).toFixed(2).replace(/^-0\.00$/, "0.00");
  ctx.fillText(`${flap ? "Side view" : "Top view"} · tip ${tipText.startsWith("-") ? "" : "+"}${tipText} m${ex > 1 ? ` · deflection ×${ex}` : ""}`,
    narrow ? 10 : W - 10, narrow ? 26 : 8);

  $("time").value = anim.t;
  $("time-label").textContent = `${anim.t.toFixed(1)} s`;
}

function tick(now) {
  if (anim.playing && run && anim.last !== null) {
    anim.t += ((now - anim.last) / 1000) * Number($("speed").value);
    if (anim.t > work.simTime) anim.t = 0;
  }
  anim.last = now;
  if (run && isVisible($("rig-canvas"))) drawRig();
  requestAnimationFrame(tick);
}

let rigVisible = true;
new IntersectionObserver(([e]) => (rigVisible = e.isIntersecting)).observe($("rig-canvas"));
const isVisible = () => rigVisible;

function bindPlayer() {
  const play = $("play");
  play.addEventListener("click", () => {
    anim.playing = !anim.playing;
    play.textContent = anim.playing ? "❚❚" : "▶";
  });
  $("time").addEventListener("input", () => { anim.t = Number($("time").value); drawRig(); });
  $("exaggerate").addEventListener("change", drawRig);
  new ResizeObserver(drawRig).observe($("rig-canvas"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => recompute());
}

// ---------- Input format table ----------

function renderFormatTable() {
  const kinds = { setting: "Setting (first row)", list: "List (one per row)", station: "Per station" };
  $("format-table").querySelector("tbody").innerHTML = COLUMNS.map((col) =>
    `<tr><td>${col.header}</td><td>${kinds[col.kind]}${col.optional ? ' <span class="opt">(optional)</span>' : ""}</td><td>${col.text}</td></tr>`).join("");
}

// ---------- Equations ----------

// Typeset every data-tex element with KaTeX. Without KaTeX (offline, blocked CDN) the raw formula is shown.
function renderMath() {
  document.querySelectorAll("[data-tex]").forEach((el) => {
    const tex = el.dataset.tex, display = el.classList.contains("eq");
    if (window.katex) katex.render(tex, el, { displayMode: display, throwOnError: false });
    else el.textContent = tex;
  });
}

// ---------- Start ----------

renderMath();
renderFormatTable();
bindForm();
bindPlayer();
loadGeneric().catch((err) => showMessages($("messages"), [["error", `Could not load the generic blade: ${err.message}`]]));
requestAnimationFrame(tick);
