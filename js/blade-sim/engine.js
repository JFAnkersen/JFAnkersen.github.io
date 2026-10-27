// ------------------------------------------------------------
// Blade fatigue test simulator: the calculation engine.
// No page code in here, so the same file runs in the browser and in Node
// (tools/blade-sim-test.mjs checks it against textbook results).
//
// Method, in short:
//   1. Euler-Bernoulli beam finite elements (2 DOF per node: deflection + slope),
//      clamped at the root. EI(x), mu(x) and beta(x) come from the input file.
//   2. The first few natural modes from the eigenproblem K·phi = omega²·M·phi.
//   3. Each mode is simulated as one mass-spring-damper. The rest of the modes are
//      added as a static correction (mode-acceleration method), so the gravity sag
//      and the quasi-static part of the exciter response are exact.
//
// Sign convention: deflection w and loads are positive upwards (Flap) or sideways (Edge).
// Bending moment M(x) = EI·w'' = sum of the loads outboard of x times their lever arm.
// ------------------------------------------------------------

export const GRAVITY = 9.82;          // [m/s²], same value as the original MATLAB code

// Load timeline, in seconds (same idea as Blade_load.m)
export const TIMELINE = {
  gravityRamp: 5,                     // Flap: gravity ramps from 0 to full over this time
  flapStart: 10,                      // Flap: excitation starts after gravity has settled
  edgeStart: 0,                       // Edge: no gravity, excitation starts at once
  forceRamp: 10,                      // excitation amplitude ramps from 0 to full over this time
};

// 5-point Gauss-Legendre rule on [0, 1]: [position, weight]
const GAUSS = [
  [0.5, 0.28444444444444444],
  [0.5 - 0.26923465505284155, 0.23931433524968324],
  [0.5 + 0.26923465505284155, 0.23931433524968324],
  [0.5 - 0.45308992296933200, 0.11846344252809454],
  [0.5 + 0.45308992296933200, 0.11846344252809454],
];

// ---------- Small helpers ----------

// Linear interpolation in a table (xs increasing), held constant outside the table
function interp(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

// Hermite cubic shape functions of a beam element of length h, at xi in [0, 1]
function shape(xi, h) {
  const x2 = xi * xi, x3 = x2 * xi;
  return [1 - 3 * x2 + 2 * x3, h * (xi - 2 * x2 + x3), 3 * x2 - 2 * x3, h * (x3 - x2)];
}

// Their second derivative with respect to x (curvature)
function shapeDD(xi, h) {
  return [(-6 + 12 * xi) / (h * h), (-4 + 6 * xi) / h, (6 - 12 * xi) / (h * h), (-2 + 6 * xi) / h];
}

function zeros(n) {
  return Array.from({ length: n }, () => new Float64Array(n));
}

// Cholesky factor L (lower) of a symmetric positive definite matrix
function cholesky(A) {
  const n = A.length, L = zeros(n);
  for (let j = 0; j < n; j++) {
    let d = A[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 0)) throw new Error("Matrix is not positive definite (check that EI and mu are positive).");
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  return L;
}

// Solve L·y = b (forward) and L^T·x = y (backward)
function forward(L, b) {
  const n = L.length, y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  return y;
}
function backward(L, y) {
  const n = L.length, x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
function cholSolve(L, b) {
  return backward(L, forward(L, b));
}

// All eigenvalues/vectors of a symmetric matrix (cyclic Jacobi). Returns ascending order.
function jacobiEigen(A0) {
  const n = A0.length;
  const A = A0.map((r) => Float64Array.from(r));
  const V = zeros(n);
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < n; i++) {
      diag += A[i][i] * A[i][i];
      for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    }
    if (off <= 1e-30 * diag) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [...Array(n).keys()].sort((a, b) => A[a][a] - A[b][b]);
  return {
    values: order.map((i) => A[i][i]),
    vectors: order.map((i) => Float64Array.from(V, (row) => row[i])),
  };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function matVec(A, x) {
  return Float64Array.from(A, (row) => dot(row, x));
}

// ---------- 1. Finite element model ----------

// input: { testType, tilt, span[], mu[], ei[], beta[], clamps:[{pos, mass}], exciters:[{pos, force}] }
export function buildModel(input, { elements = 40, modes = 3 } = {}) {
  const x0 = input.span[0];
  const xs = input.span.map((v) => v - x0);           // span measured from the root
  const L = xs[xs.length - 1];
  const muAt = (x) => Math.max(interp(xs, input.mu, x), 1e-6);
  const eiAt = (x) => Math.max(interp(xs, input.ei, x), 1e-6);
  const betaAt = (x) => Math.max(interp(xs, input.beta, x), 0);

  const Ne = elements, h = L / Ne;
  const n = 2 * Ne;                                   // free DOFs (root deflection and slope are fixed)
  const K = zeros(n), M = zeros(n), C = zeros(n);
  const dofs = (e) => [2 * e - 2, 2 * e - 1, 2 * e, 2 * e + 1]; // reduced DOF numbers; < 0 = fixed

  const locate = (x) => {
    const e = Math.min(Math.max(Math.floor(x / h), 0), Ne - 1);
    return { e, xi: Math.min(Math.max(x / h - e, 0), 1) };
  };

  const addOuter = (A, e, N, factor) => {
    const d = dofs(e);
    for (let a = 0; a < 4; a++) {
      if (d[a] < 0) continue;
      for (let b = 0; b < 4; b++) if (d[b] >= 0) A[d[a]][d[b]] += factor * N[a] * N[b];
    }
  };

  for (let e = 0; e < Ne; e++) {
    for (const [xi, w] of GAUSS) {
      const x = (e + xi) * h, m = muAt(x);
      addOuter(K, e, shapeDD(xi, h), w * h * eiAt(x));
      const N = shape(xi, h);
      addOuter(M, e, N, w * h * m);
      addOuter(C, e, N, w * h * m * betaAt(x));
    }
  }

  // Clamps (and the exciter's own mass) as point masses
  const clamps = input.clamps.filter((c) => c.mass > 0 && c.pos > 0 && c.pos <= L + 1e-9);
  for (const c of clamps) {
    const { e, xi } = locate(c.pos), N = shape(xi, h);
    addOuter(M, e, N, c.mass);
    addOuter(C, e, N, c.mass * betaAt(c.pos));
  }

  // Load vectors: gravity (Flap only) and the exciters at their peak force
  const flap = input.testType === "Flap";
  const gc = flap ? GRAVITY * Math.cos((input.tilt * Math.PI) / 180) : 0;
  const ones = Float64Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1 : 0));
  const Fg = matVec(M, ones).map((v) => -gc * v);       // = -g·cos(tilt)·(distributed + clamp masses)
  const exciters = input.exciters.filter((x) => x.pos > 0 && x.pos <= L + 1e-9 && x.force !== 0);
  const Fe = new Float64Array(n);
  for (const ex of exciters) {
    const { e, xi } = locate(ex.pos), N = shape(xi, h), d = dofs(e);
    for (let a = 0; a < 4; a++) if (d[a] >= 0) Fe[d[a]] += ex.force * N[a];
  }

  // Natural modes: with M = L·L^T, solve the standard problem (L^-1·K·L^-T)·y = lambda·y
  const Lm = cholesky(M);
  const X = K.map((_, j) => forward(Lm, Float64Array.from(K, (row) => row[j]))); // columns of L^-1·K
  const A = X.map((_, j) => forward(Lm, Float64Array.from(X, (col) => col[j])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) A[i][j] = A[j][i] = 0.5 * (A[i][j] + A[j][i]);
  const eig = jacobiEigen(A);

  const modeList = [];
  for (let k = 0; k < Math.min(modes, n); k++) {
    const phi = backward(Lm, eig.vectors[k]);         // mass-normalised: phi^T·M·phi = 1
    if (phi[n - 2] < 0) phi.forEach((v, i) => (phi[i] = -v)); // tip moves in + direction
    const omega = Math.sqrt(Math.max(eig.values[k], 0));
    const c = dot(phi, matVec(C, phi));
    modeList.push({
      phi, omega, f: omega / (2 * Math.PI), c,
      zeta: c / (2 * omega),
      g: dot(phi, Fg),                                // modal gravity force
      e: dot(phi, Fe),                                // modal exciter force (at peak)
    });
  }

  // Static solutions with the full stiffness matrix (the "static correction")
  const Lk = cholesky(K);
  const ug = cholSolve(Lk, Fg);
  const ue = cholSolve(Lk, Fe);

  // Evaluate a DOF vector at any x (Hermite interpolation)
  const valueAt = (u, x) => {
    const { e, xi } = locate(x), N = shape(xi, h), d = dofs(e);
    let s = 0;
    for (let a = 0; a < 4; a++) if (d[a] >= 0) s += N[a] * u[d[a]];
    return s;
  };

  // Output points = element nodes
  const nodesX = Float64Array.from({ length: Ne + 1 }, (_, i) => i * h);
  const atNodes = (u) => Float64Array.from(nodesX, (_, i) => (i === 0 ? 0 : u[2 * i - 2]));

  // Bending moment along the span from a distributed load q(x) plus point loads,
  // by statics: M(x) = ∫_x^L q(s)(s - x) ds + Σ P (p - x) for p > x
  const SUB = 8, nf = Ne * SUB + 1, hf = h / SUB;
  const momentOf = (q, points) => {
    const qs = Float64Array.from({ length: nf }, (_, j) => q(j * hf));
    const out = new Float64Array(Ne + 1);
    let A0 = 0, A1 = 0;                               // ∫ q ds and ∫ q·s ds, from the tip inwards
    for (let j = nf - 1; j >= 0; j--) {
      if (j < nf - 1) {
        const s0 = j * hf, s1 = s0 + hf;
        A0 += 0.5 * (qs[j] + qs[j + 1]) * hf;
        A1 += 0.5 * (qs[j] * s0 + qs[j + 1] * s1) * hf;
      }
      if (j % SUB === 0) {
        const x = j * hf;
        let m = A1 - x * A0;
        for (const p of points) if (p.pos > x) m += p.load * (p.pos - x);
        out[j / SUB] = m;
      }
    }
    return out;
  };

  const basis = {
    gravity: {
      w: atNodes(ug),
      m: momentOf((x) => -gc * muAt(x), clamps.map((c) => ({ pos: c.pos, load: -gc * c.mass }))),
      atExciters: exciters.map((ex) => valueAt(ug, ex.pos)),
    },
    exciter: {
      w: atNodes(ue),
      m: momentOf(() => 0, exciters.map((ex) => ({ pos: ex.pos, load: ex.force }))),
      atExciters: exciters.map((ex) => valueAt(ue, ex.pos)),
    },
    modes: modeList.map((md) => {
      const w2 = md.omega * md.omega;
      return {
        w: atNodes(md.phi),
        m: momentOf((x) => w2 * muAt(x) * valueAt(md.phi, x),
          clamps.map((c) => ({ pos: c.pos, load: w2 * c.mass * valueAt(md.phi, c.pos) }))),
        atExciters: exciters.map((ex) => valueAt(md.phi, ex.pos)),
      };
    }),
  };

  // Mode shapes for plotting, scaled so the tip moves 1
  const shapes = modeList.map((md) => {
    const w = atNodes(md.phi), tip = w[Ne];
    return Float64Array.from(w, (v) => v / tip);
  });

  let mass = clamps.reduce((s, c) => s + c.mass, 0);
  for (let e = 0; e < Ne; e++) for (const [xi, w] of GAUSS) mass += w * h * muAt((e + xi) * h);

  return {
    L, h, elements: Ne, flap, gc, nodesX, modes: modeList, shapes, basis,
    clamps, exciters, mass,
    eiAt, muAt,
  };
}

// ---------- 2. Load timeline ----------

export function loadTimeline(model, ftest) {
  const T = TIMELINE;
  const start = model.flap ? T.flapStart : T.edgeStart;
  const omega = 2 * Math.PI * ftest;
  return {
    start,
    gravity: (t) => (model.flap ? Math.min(t / T.gravityRamp, 1) : 0),
    // Exciter factor between -1 and 1: ramped sine
    exciter: (t) => (t < start ? 0 : Math.min((t - start) / T.forceRamp, 1) * Math.sin(omega * (t - start))),
  };
}

// ---------- 3. Time simulation ----------

// options: { ftest [Hz], simTime [s], rigHeight [m], tilt [deg] }
export function runTest(model, { ftest, simTime, rigHeight = 0, tilt = 0 }) {
  const t0 = performance.now();
  const modes = model.modes, nm = modes.length;
  const load = loadTimeline(model, ftest);
  const fmax = Math.max(ftest, ...modes.map((m) => m.f));
  const dt = Math.min(0.01, 1 / (50 * fmax));
  const steps = Math.ceil(simTime / dt) + 1;

  const t = new Float64Array(steps), G = new Float64Array(steps), S = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    t[i] = i * dt;
    G[i] = load.gravity(t[i]);
    S[i] = load.exciter(t[i]);
  }

  // Each mode: eta'' + c·eta' + omega²·eta = G·g + S·e, Newmark average acceleration
  // (unconditionally stable). The stored coefficient is eta minus its static part,
  // so w = G·u_gravity + S·u_exciter + Σ coef_k·phi_k (mode-acceleration method).
  const coef = modes.map(() => new Float64Array(steps));
  modes.forEach((md, k) => {
    const k2 = md.omega * md.omega, c = md.c;
    const kHat = k2 + (2 * c) / dt + 4 / (dt * dt);
    const force = (i) => G[i] * md.g + S[i] * md.e;
    let u = 0, v = 0, a = force(0);
    coef[k][0] = u - force(0) / k2;
    for (let i = 1; i < steps; i++) {
      const p = force(i) + (4 / (dt * dt)) * u + (4 / dt) * v + a + c * ((2 / dt) * u + v);
      const u1 = p / kHat;
      const v1 = (2 / dt) * (u1 - u) - v;
      const a1 = (4 / (dt * dt)) * (u1 - u) - (4 / dt) * v - a;
      u = u1; v = v1; a = a1;
      coef[k][i] = u - force(i) / k2;
    }
  });

  const B = model.basis, nn = model.nodesX.length, tipIdx = nn - 1;
  const deflectionAt = (i, out = new Float64Array(nn)) => {
    for (let j = 0; j < nn; j++) {
      let s = G[i] * B.gravity.w[j] + S[i] * B.exciter.w[j];
      for (let k = 0; k < nm; k++) s += coef[k][i] * B.modes[k].w[j];
      out[j] = s;
    }
    return out;
  };
  const momentAt = (i, out = new Float64Array(nn)) => {
    for (let j = 0; j < nn; j++) {
      let s = G[i] * B.gravity.m[j] + S[i] * B.exciter.m[j];
      for (let k = 0; k < nm; k++) s += coef[k][i] * B.modes[k].m[j];
      out[j] = s;
    }
    return out;
  };

  // Tip deflection and exciter power over time
  const tip = new Float64Array(steps);
  const nx = model.exciters.length;
  const exW = model.exciters.map(() => new Float64Array(steps));
  for (let i = 0; i < steps; i++) {
    let s = G[i] * B.gravity.w[tipIdx] + S[i] * B.exciter.w[tipIdx];
    for (let k = 0; k < nm; k++) s += coef[k][i] * B.modes[k].w[tipIdx];
    tip[i] = s;
    for (let x = 0; x < nx; x++) {
      let w = G[i] * B.gravity.atExciters[x] + S[i] * B.exciter.atExciters[x];
      for (let k = 0; k < nm; k++) w += coef[k][i] * B.modes[k].atExciters[x];
      exW[x][i] = w;
    }
  }
  const power = new Float64Array(steps);       // exciter input power = force · velocity
  for (let i = 1; i < steps - 1; i++) {
    let p = 0;
    for (let x = 0; x < nx; x++) {
      const v = (exW[x][i + 1] - exW[x][i - 1]) / (2 * dt);
      p += model.exciters[x].force * S[i] * v;
    }
    power[i] = p;
  }

  // Steady-state window: up to the last 10 whole load periods after the force ramp
  const rampEnd = load.start + TIMELINE.forceRamp;
  const period = 1 / ftest;
  const nPeriods = Math.min(10, Math.floor((simTime - rampEnd) / period));
  const steady = nPeriods >= 1;
  const wStart = steady ? simTime - nPeriods * period : simTime;
  const i0 = Math.min(Math.ceil(wStart / dt), steps - 2), i1 = steps - 2;

  // Envelopes along the span (steady window) and ground clearance (whole run)
  const wMax = new Float64Array(nn).fill(-Infinity), wMin = new Float64Array(nn).fill(Infinity);
  const mMax = new Float64Array(nn).fill(-Infinity), mMin = new Float64Array(nn).fill(Infinity);
  const sinT = Math.sin((tilt * Math.PI) / 180), cosT = Math.cos((tilt * Math.PI) / 180);
  let clearance = Infinity, clearanceAt = { t: 0, x: 0 }, tipLowest = Infinity;
  const wBuf = new Float64Array(nn), mBuf = new Float64Array(nn);
  for (let i = 0; i < steps; i++) {
    deflectionAt(i, wBuf);
    if (model.flap) {
      for (let j = 0; j < nn; j++) {
        const y = rigHeight + model.nodesX[j] * sinT + wBuf[j] * cosT;
        if (y < clearance) { clearance = y; clearanceAt = { t: t[i], x: model.nodesX[j] }; }
        if (j === tipIdx && y < tipLowest) tipLowest = y;
      }
    }
    if (i < i0 || i > i1) continue;
    momentAt(i, mBuf);
    for (let j = 0; j < nn; j++) {
      if (wBuf[j] > wMax[j]) wMax[j] = wBuf[j];
      if (wBuf[j] < wMin[j]) wMin[j] = wBuf[j];
      if (mBuf[j] > mMax[j]) mMax[j] = mBuf[j];
      if (mBuf[j] < mMin[j]) mMin[j] = mBuf[j];
    }
  }
  const mAmp = Float64Array.from(mMax, (v, j) => (v - mMin[j]) / 2);

  let pSum = 0, pMax = -Infinity, pMin = Infinity;
  for (let i = i0; i <= i1; i++) {
    pSum += power[i];
    if (power[i] > pMax) pMax = power[i];
    if (power[i] < pMin) pMin = power[i];
  }

  return {
    dt, steps, t, G, S, coef, tip, power,
    deflectionAt, momentAt,
    window: { steady, start: t[i0], end: t[i1], i0, i1, periods: nPeriods },
    envelope: { wMax, wMin, wGravity: B.gravity.w, mMax, mMin, mAmp },
    summary: {
      tipAmplitude: (wMax[tipIdx] - wMin[tipIdx]) / 2,
      tipMean: (wMax[tipIdx] + wMin[tipIdx]) / 2,
      tipStatic: B.gravity.w[tipIdx],
      rootMomentAmplitude: mAmp[0],
      rootMomentMean: (mMax[0] + mMin[0]) / 2,
      powerAvg: pSum / (i1 - i0 + 1),
      powerPeak: pMax,
      powerMin: pMin,
      clearance: model.flap ? clearance : null,     // lowest point of the blade above ground
      clearanceAt,
      tipLowest: model.flap ? tipLowest : null,      // lowest tip position above ground
    },
    computeMs: performance.now() - t0,
  };
}

// ---------- 4. Resonance curve ----------

// Steady-state tip amplitude [m] with the exciters at full force, for a list of test
// frequencies. Uses the same modes + static correction as the time simulation.
export function resonanceCurve(model, freqs) {
  const tipIdx = model.nodesX.length - 1;
  const B = model.basis;
  const n = freqs.length;
  const f = Float64Array.from(freqs), amp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const om = 2 * Math.PI * f[i];
    let re = B.exciter.w[tipIdx], im = 0;              // static part
    model.modes.forEach((md, k) => {
      const k2 = md.omega * md.omega, phiTip = B.modes[k].w[tipIdx];
      const dr = k2 - om * om, di = md.c * om, d2 = dr * dr + di * di;
      re += md.e * phiTip * (dr / d2 - 1 / k2);
      im += md.e * phiTip * (-di / d2);
    });
    amp[i] = Math.hypot(re, im);
  }
  return { f, amp };
}

// Default test frequency when none is given: just below mode 1, like a resonance test
export const defaultFtest = (model) => Number((0.98 * model.modes[0].f).toFixed(3));

// Convenience: build + run in one call
export function simulate(input, options = {}) {
  const model = buildModel(input, options);
  const run = runTest(model, {
    ftest: input.ftest ?? defaultFtest(model),
    simTime: input.simTime,
    rigHeight: input.rigHeight,
    tilt: input.tilt,
  });
  return { model, run };
}
