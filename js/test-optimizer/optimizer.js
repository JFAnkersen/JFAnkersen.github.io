// ------------------------------------------------------------
// Fatigue Test Acceleration Optimizer: the calculation.
// No page code in here, so it also runs in Node (tools/test-optimizer-test.mjs).
//
// Idea: a glass-fibre (GFRP) beam under the blade, simply supported at both ends and linked
// to the blade by a rod at its mid-span, acts as a spring. It raises the blade's first natural
// frequency (= the test frequency), so the test takes fewer days. The price: the bending-moment
// distribution changes, and the exciter must work harder.
//
// The beam can be prismatic (constant width) or a leaf spring whose width tapers from mid-span to
// zero at the ends (a diamond-shaped plate seen from above). The leaf spring has the same stress
// along its whole length, so it stores the same energy with a third of the material.
//
// For every candidate support (link position p on the blade, support stiffness k):
//   1. tune the clamp masses so the bending moment fits the target (lowest exciter power),
//   2. size a rectangular GFRP beam that gives the stiffness k at the allowed stress,
//   3. rebuild the blade + beam model with that beam and repeat, so the beam's own mass is included,
//   4. read off test time, exciter force/stroke/power, beam stress and the mass needed on each support.
// At resonance a single mode is driven, so steady state follows directly from mode 1:
//   amplitude a, force F = c·ω·a / phi_exciter, power P = ½·c·ω²·a²   (c = 2·zeta·ω)
// ------------------------------------------------------------

import { buildModel, GRAVITY } from "../blade-sim/engine.js";

export const DEFAULTS = {
  cycles: 5e6,              // load cycles in the test
  zoneStart: 0,             // test zone, as fractions of the blade length
  zoneEnd: 0.7,
  overloadMax: 0.15,        // allowed overload in the test zone (the moment never goes below target)
  maxForce: 25e3,           // exciter limits [N], [m], [W]
  maxStroke: 1.0,
  maxPower: 60e3,
  minModeGap: 1.25,         // mode 2 must be at least this factor above mode 1
  dampingModel: "constant", // "constant": keep the damping ratio of the test without support; "input": beta from the file
  clampLevels: [250, 500, 1000, 1500, 2000, 3000, 4000, 6000],   // clamp masses to choose from [kg]
  // GFRP beam (unidirectional pultruded glass fibre)
  shape: "leaf",            // "leaf" = width tapers to the ends, "prismatic" = constant width
  E: 40e9,                  // [Pa]
  density: 2000,            // [kg/m³]
  stressAmp: 60e6,          // allowed stress amplitude for the whole test, incl. safety [Pa]
  width: 0.8,               // beam width b at mid-span [m]; grows if the span limit is reached
  maxWidth: 1.5,            // wider than this: split into several beams side by side
  maxSpan: 20,              // [m]
  maxBeamMass: 10000,       // [kg]
  beamBeta: 0.02,           // damping of the beam [1/s]
  link: 50e6,               // stiffness of the link rod [N/m]
  // Link hardware, assumed point masses: a yoke clamped on the blade, a solid steel rod and a
  // spherical bearing at each rod end. The yoke, the upper bearing and half the rod sit on the blade;
  // the lower bearing and the other half of the rod sit on the spring at mid-span.
  yokeMass: 400,            // [kg]
  rodLength: 2.5,           // [m]
  rodDiameter: 0.08,        // solid steel rod [m]
  bearingMass: 25,          // each spherical bearing incl. its housing [kg]
  safetyFactor: 2,          // on the uplift of each beam support
  positions: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9],
  stiffness: [25e3, 50e3, 100e3, 150e3, 200e3, 300e3, 400e3, 600e3, 800e3, 1.2e6],   // [N/m]
};

const STEEL_DENSITY = 7850;   // [kg/m³]

// Masses of the link hardware: on the blade at the link point and on the spring at mid-span [kg]
export function linkMasses(s) {
  const rod = STEEL_DENSITY * (Math.PI / 4) * s.rodDiameter ** 2 * s.rodLength;
  return { rod, blade: s.yokeMass + s.bearingMass + rod / 2, spring: s.bearingMass + rod / 2 };
}

function interp(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 1;
  while (xs[i] < x) i++;
  const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + f * (ys[i] - ys[i - 1]);
}

const MODEL_OPTIONS = { elements: 20, modes: 2, eigen: "subspace" };

// ---------- Steady resonance test of one set-up ----------

// support: null, or { pos, span, ei, mu, beta, link, taper } as in the engine. The link hardware
// is added as point masses: on the blade at support.pos and on the spring at mid-span.
export function evaluate(input, support, s, { target, zeta }) {
  const lm = linkMasses(s);
  const clamps = support ? [...input.clamps, { pos: support.pos, mass: lm.blade }] : input.clamps;
  const model = buildModel({ ...input, clamps, support: support && { ...support, midMass: lm.spring } }, MODEL_OPTIONS);
  const [m1, m2] = model.modes, B = model.basis.modes[0];
  const L = model.L, x = model.nodesX;
  const inZone = (j) => x[j] >= s.zoneStart * L - 1e-9 && x[j] <= s.zoneEnd * L + 1e-9 && target[j] > 0;

  // Mode 1 bending moment, positive at the root, scaled so it reaches the target everywhere in the zone
  const sign = B.m[0] < 0 ? -1 : 1;
  let scale = 0, signChange = false;
  for (let j = 0; j < x.length; j++) {
    if (!inZone(j)) continue;
    const m = sign * B.m[j];
    if (!(m > 0)) { signChange = true; break; }
    scale = Math.max(scale, target[j] / m);
  }
  let overload = 0;
  for (let j = 0; j < x.length; j++) if (inZone(j)) overload = Math.max(overload, (scale * sign * B.m[j]) / target[j] - 1);

  const zetaUsed = s.dampingModel === "constant" ? zeta : m1.zeta;
  const c = 2 * zetaUsed * m1.omega;
  const phiEx = Math.abs(B.atExciters[0] ?? 0);
  const out = {
    f1: m1.f, f2: m2?.f ?? Infinity, zeta: zetaUsed,
    nodesX: x, moment: Float64Array.from(B.m, (v) => v * sign * scale), target,
    signChange, overload: signChange ? Infinity : overload,
    amplitude: scale,
    tipAmplitude: scale * Math.abs(B.w.at(-1)),
    stroke: scale * phiEx,
    force: phiEx > 0 ? (c * m1.omega * scale) / phiEx : Infinity,
    power: 0.5 * c * m1.omega ** 2 * scale ** 2,
    days: s.cycles / m1.f / 86400,
  };
  if (support) {
    const sup = B.support;
    out.linkForce = Math.abs(sup.linkForce) * scale;
    out.beamMoment = Math.abs(sup.beamMoment) * scale;
    out.beamDeflection = Math.abs(sup.beamDeflection) * scale;
    out.endReaction = Math.abs(sup.endReaction) * scale;
  }
  return out;
}

// Sort key for the clamp search: first fit the moment, then use the least power
const score = (r, s) => (r.overload > s.overloadMax ? 1e12 * (1 + Math.min(r.overload, 1e3)) : r.power);

// Coordinate search over the clamp masses (positions stay where they are)
function tuneClamps(input, support, s, ctx, clamps, passes) {
  let best = evaluate({ ...input, clamps }, support, s, ctx), bestClamps = clamps;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (let i = 0; i < clamps.length; i++) {
      for (const mass of s.clampLevels) {
        if (mass === bestClamps[i].mass) continue;
        const trial = bestClamps.map((c, j) => (j === i ? { ...c, mass } : c));
        const r = evaluate({ ...input, clamps: trial }, support, s, ctx);
        if (score(r, s) < score(best, s)) { best = r; bestClamps = trial; improved = true; }
      }
    }
    if (!improved) break;
  }
  return { result: best, clamps: bestClamps };
}

// ---------- GFRP beam sizing ----------

// Rectangular section b × h (b, I at mid-span), simply supported over span l, loaded at mid-span
// by the link rod. With C = 48 (prismatic) or 32 (leaf spring) and D = 6 or 4:
//   stiffness  k = C·E·I / l³,  I = b·h³/12
//   stress     σ = M·(h/2)/I with M = k·δ·l/4   →   σ = D·E·δ·h / l²
// For a given k and mid-span deflection δ, the shortest beam at the allowed stress has
//   h = [12·k·(D·E·δ/σ)^1.5 / (C·E·b)]^(2/3),   l = sqrt(D·E·δ·h / σ)
// The beam mass (9 or 3)·ρ·E·k·δ²/σ² is the same for any b, so b is a practical choice.
export function sizeBeam(kBeam, delta, s) {
  const { E, stressAmp: sig } = s;
  const leaf = s.shape === "leaf", C = leaf ? 32 : 48, D = leaf ? 4 : 6;
  let b = s.width;
  let h = Math.pow((12 * kBeam * Math.pow((D * E * delta) / sig, 1.5)) / (C * E * b), 2 / 3);
  let l = Math.sqrt((D * E * delta * h) / sig);
  if (l > s.maxSpan) {
    // Span limit reached: keep the span, make the beam thinner (stress) and wider (stiffness)
    l = s.maxSpan;
    h = (sig * l * l) / (D * E * delta);
    b = (12 * kBeam * l ** 3) / (C * E * h ** 3);
  }
  const count = Math.max(1, Math.ceil(b / s.maxWidth - 1e-9));   // beams side by side
  const I = (b * h ** 3) / 12, area = leaf ? (b * l) / 2 : b * l;
  return {
    shape: s.shape, b, h, span: l, count, bEach: b / count,
    I, ei: E * I, mu: s.density * b * h, mass: s.density * h * area, k: kBeam,
  };
}

// ---------- One support design ----------

// pos [m] on the blade, k [N/m] = stiffness of beam and link rod together
export function designSupport(input, pos, k, s, ctx) {
  if (k >= s.link) return null;
  const kBeam = 1 / (1 / k - 1 / s.link);
  // First guess: a massless 10 m beam with the right stiffness
  let beam = { b: 0, h: 0, span: 10, ei: (kBeam * 1000) / (s.shape === "leaf" ? 32 : 48), mu: 1e-3, mass: 0 };
  let clamps = input.clamps, result = null;
  for (let it = 0; it < 3; it++) {
    const support = { pos, span: beam.span, ei: beam.ei, mu: beam.mu, beta: s.beamBeta, link: s.link, taper: s.shape === "leaf" };
    ({ result, clamps } = tuneClamps(input, support, s, ctx, clamps, it === 0 ? 2 : 1));
    if (!(result.beamDeflection > 0) || !Number.isFinite(result.amplitude)) break;
    const next = sizeBeam(kBeam, result.beamDeflection, s);
    const change = Math.abs(next.mass - beam.mass) / Math.max(next.mass, 1);
    beam = next;
    if (it > 0 && change < 0.02) break;
  }
  // Final check with the sized beam
  const support = { pos, span: beam.span, ei: beam.ei, mu: beam.mu, beta: s.beamBeta, link: s.link, taper: s.shape === "leaf" };
  const r = evaluate({ ...input, clamps }, support, s, ctx);
  r.design = { pos, k };
  r.clamps = clamps;
  r.beam = beam;
  r.beamStress = beam.I > 0 ? (r.beamMoment * beam.h) / 2 / beam.I : Infinity;
  // Mass needed on each beam support so it can't lift: safety factor × uplift / g
  r.supportMassMin = (s.safetyFactor * r.endReaction) / GRAVITY;
  const lm = linkMasses(s);
  r.ballast = Math.max(0, r.supportMassMin - (beam.mass + lm.spring) / 2);
  r.link = { ...lm, stress: r.linkForce / ((Math.PI / 4) * s.rodDiameter ** 2) };
  return finish(r, s);
}

function finish(r, s) {
  r.reasons = [];
  if (r.signChange) r.reasons.push("moment changes sign in the test zone");
  else if (r.overload > s.overloadMax) r.reasons.push(`overload ${(r.overload * 100).toFixed(0)} %`);
  if (r.force > s.maxForce) r.reasons.push("exciter force");
  if (r.stroke > s.maxStroke) r.reasons.push("exciter stroke");
  if (r.power > s.maxPower) r.reasons.push("exciter power");
  if (r.f2 < s.minModeGap * r.f1) r.reasons.push("mode 2 too close");
  if (r.beam) {
    if (r.beamStress > s.stressAmp * 1.02) r.reasons.push("beam stress");
    if (r.beam.mass > s.maxBeamMass) r.reasons.push("beam mass");
  }
  r.feasible = r.reasons.length === 0;
  return r;
}

// ---------- The test without a support (reference, and target if the file has none) ----------

export function baseline(input, s = DEFAULTS) {
  const model = buildModel({ ...input, support: null }, MODEL_OPTIONS);
  let target, targetSource = "file";
  if (input.targetMom) {
    const xs = [], ys = [];
    input.span.forEach((v, i) => { if (Number.isFinite(input.targetMom[i])) { xs.push(v - input.span[0]); ys.push(input.targetMom[i] * 1000); } });
    target = Float64Array.from(model.nodesX, (x) => interp(xs, ys, x));
  } else {
    // No target: the moment the test without support gives at the exciter's full force
    const md = model.modes[0], B = model.basis.modes[0];
    const a = (Math.abs(model.exciters[0]?.force ?? 0) * Math.abs(B.atExciters[0] ?? 0)) / (md.c * md.omega);
    target = Float64Array.from(B.m, (v) => Math.abs(v * a));
    targetSource = "baseline";
  }
  const ctx = { target, zeta: model.modes[0].zeta };
  const result = finish(evaluate(input, null, s, ctx), s);
  result.clamps = input.clamps;
  return { model, ctx, targetSource, result };
}

// Pareto front: feasible designs that no other feasible design beats on both test time and power
export function pareto(results) {
  const ok = results.filter((r) => r.feasible).sort((a, b) => a.days - b.days || a.power - b.power);
  const front = [];
  let best = Infinity;
  for (const r of ok) if (r.power < best - 1e-9) { front.push(r); best = r.power; }
  return front;
}

// The whole sweep, in chunks so a page stays responsive. onProgress(done, total)
export async function optimize(input, s = DEFAULTS, onProgress = () => {}) {
  if (!input.exciters.length) throw new Error("The input needs an exciter (Exciter Pos [m] and Fpeak [N]).");
  const base = baseline(input, s);
  const L = base.model.L;
  const list = [];
  for (const p of s.positions) for (const k of s.stiffness) list.push([Math.round(p * L * 10) / 10, k]);
  const results = [];
  let last = Date.now();
  for (let i = 0; i < list.length; i++) {
    const r = designSupport(input, list[i][0], list[i][1], s, base.ctx);
    if (r) results.push(r);
    if (Date.now() - last > 40) { onProgress(i + 1, list.length); await new Promise((res) => setTimeout(res, 0)); last = Date.now(); }
  }
  onProgress(list.length, list.length);
  // Only designs that are faster than the test without spring are worth having
  return { base, results, front: pareto(results.filter((r) => r.days < base.result.days)) };
}
