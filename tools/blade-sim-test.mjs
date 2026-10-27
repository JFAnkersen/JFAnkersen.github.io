// Checks the blade simulator engine against textbook results.
// Not part of the website. Run with:  node tools/blade-sim-test.mjs
import { readFileSync } from "node:fs";
import { buildModel, runTest, resonanceCurve, defaultFtest, GRAVITY } from "../js/blade-sim/engine.js";
import { parseCsv, rowsToInput } from "../js/blade-sim/input.js";

let failures = 0;
function check(name, got, want, relTol) {
  const err = Math.abs(got - want) / Math.abs(want);
  const ok = err <= relTol;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got.toPrecision(6)}, expected ${want.toPrecision(6)} (error ${(err * 100).toFixed(3)} %)`);
}

// Uniform cantilever: L = 10 m, EI = 1e6 Nm², mu = 50 kg/m
const L = 10, EI = 1e6, mu = 50;
const uniform = (extra) => ({
  testType: "Flap", tilt: 0, rigHeight: 0,
  span: [0, L], mu: [mu, mu], ei: [EI, EI], beta: [0, 0],
  clamps: [], exciters: [], ...extra,
});

// 1. Natural frequencies: f = (bL)² / (2π L²) · sqrt(EI / mu)
{
  const m = buildModel(uniform());
  [1.875104, 4.694091, 7.854757].forEach((bl, k) => {
    check(`uniform beam mode ${k + 1}`, m.modes[k].f, (bl * bl) / (2 * Math.PI * L * L) * Math.sqrt(EI / mu), 1e-4);
  });
}

// 2. Gravity sag and root moment: w_tip = qL⁴/8EI, M_root = qL²/2
{
  const m = buildModel(uniform());
  const q = mu * GRAVITY;
  check("gravity tip sag", -m.basis.gravity.w.at(-1), (q * L ** 4) / (8 * EI), 1e-5);
  check("gravity root moment", -m.basis.gravity.m[0], (q * L * L) / 2, 1e-4);
  check("blade mass", m.mass, mu * L, 1e-9);
}

// 3. Tip point load: w_tip = PL³/3EI, M_root = PL
{
  const P = 1000;
  const m = buildModel(uniform({ testType: "Edge", exciters: [{ pos: L, force: P }] }));
  check("tip load deflection", m.basis.exciter.w.at(-1), (P * L ** 3) / (3 * EI), 1e-9);
  check("tip load root moment", m.basis.exciter.m[0], P * L, 1e-9);
}

// 4. Time simulation reaches the steady-state amplitude of the resonance curve
{
  const input = uniform({ testType: "Edge", beta: [0.5, 0.5], exciters: [{ pos: 7, force: 500 }] });
  const m = buildModel(input);
  const ftest = 0.9 * m.modes[0].f;
  const r = runTest(m, { ftest, simTime: 120 });
  const curve = resonanceCurve(m, [ftest]);
  check("steady tip amplitude vs resonance curve", r.summary.tipAmplitude, curve.amp[0], 5e-3);
  // Energy balance: average input power = power lost in damping, ½·c·ω²·|eta|² summed over modes (approx.)
  console.log(`      average exciter power ${r.summary.powerAvg.toFixed(2)} W, computed in ${r.computeMs.toFixed(1)} ms (${r.steps} steps)`);
}

// 5. Generic NREL 5 MW blade (public data): known clamped-blade frequencies
{
  const text = readFileSync(new URL("../data/blade-sim/generic-blade-nrel5mw.csv", import.meta.url), "utf8");
  const input = rowsToInput(parseCsv(text));
  if (input.errors.length) { console.log("Input errors:", input.errors); failures++; }
  // Bare blade (no clamps). Published values for this blade are about 0.68 Hz (1st flap),
  // 1.09 Hz (1st edge) and 1.95 Hz (2nd flap), so these are a plausibility check only.
  const flap = buildModel({ ...input, clamps: [], ei: input.eiFlap });
  const edge = buildModel({ ...input, clamps: [], testType: "Edge", ei: input.eiEdge });
  console.log(`NREL 5MW bare blade: flap ${flap.modes.map((x) => x.f.toFixed(3)).join(" / ")} Hz, ` +
    `edge ${edge.modes[0].f.toFixed(3)} Hz, mass ${(flap.mass / 1000).toFixed(2)} t`);

  for (const testType of ["Flap", "Edge"]) {
    const t0 = performance.now();
    const m = buildModel({ ...input, testType, ei: testType === "Flap" ? input.eiFlap : input.eiEdge });
    const ftest = testType === "Flap" ? input.ftest : defaultFtest(m);
    const r = runTest(m, { ftest, simTime: input.simTime, rigHeight: input.rigHeight, tilt: input.tilt });
    console.log(`NREL 5MW ${testType}: mass ${(m.mass / 1000).toFixed(2)} t, f = ${m.modes.map((x) => x.f.toFixed(3)).join(" / ")} Hz, ` +
      `zeta1 = ${(m.modes[0].zeta * 100).toFixed(2)} %, static tip ${r.summary.tipStatic.toFixed(2)} m, ` +
      `tip amp ${r.summary.tipAmplitude.toFixed(2)} m, root M amp ${(r.summary.rootMomentAmplitude / 1000).toFixed(0)} kNm, ` +
      `power ${(r.summary.powerAvg / 1000).toFixed(2)} kW, lowest tip ${r.summary.tipLowest?.toFixed(2)} m above ground, ` +
      `${(performance.now() - t0).toFixed(1)} ms`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
