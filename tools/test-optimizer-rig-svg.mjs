// Generic illustration for the Fatigue Test Acceleration Optimizer: the blade test of
// tools/blade-sim-rig-svg.mjs plus a glass-fibre leaf spring under the blade, linked to it by a rod,
// on two supports with ballast. Writes img/test-optimizer/support-rig.svg (1600 x 900).
// Not part of the site. Run with:  node tools/test-optimizer-rig-svg.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = process.argv[2] ?? fileURLToPath(new URL("../img/test-optimizer/support-rig.svg", import.meta.url));
const W = 1600, H = 900, GROUND = 770;
const X0 = 330, LEN = 1190, Y_ROOT = 430, TILT = 0.1;     // blade root position and tilt (rise per px, about 5.7 deg)
const r = (v) => Math.round(v * 10) / 10;

// Blade centre line for a given tip deflection A (positive = down), uniform-load cantilever shape
const shapeW = (s) => (s * s * (6 - 4 * s + s * s)) / 3;
const centre = (s, A) => [X0 + s * LEN, Y_ROOT - s * LEN * TILT + A * shapeW(s)];
// Thickness: round root, max at the shoulder, thin tip
const thick = (s) => (s < 0.18 ? 118 + 34 * Math.sin((s / 0.18) * Math.PI / 2) : 12 + 140 * Math.pow((1 - s) / 0.82, 1.15));

function bladePath(A) {
  const up = [], lo = [];
  for (let i = 0; i <= 120; i++) {
    const s = i / 120, [x, y] = centre(s, A), t = thick(s);
    up.push([x, y - 0.56 * t]);
    lo.push([x, y + 0.44 * t]);
  }
  const [tx, ty] = centre(1, A);
  const pts = [...up, [tx + 10, ty], ...lo.reverse()];
  return "M" + pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" L") + " Z";
}

const SC = 0.42;                                      // clamp / exciter position along the span
const SS = 0.8;                                       // link clamp / spring position
const [cx, cyMid] = centre(SC, 18), tc = thick(SC);
const [, cyUp] = centre(SC, -120), [, cyDown] = centre(SC, 150);

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A tilted wind turbine blade in a test stand, driven by a blade exciter on the ground, with a glass-fibre leaf spring under the outer part of the blade linked to it by a rod">
<title>Blade fatigue test with a glass-fibre spring</title>
<style>
  .bg { fill: #eef3fb; } .grid { stroke: rgba(10,108,255,0.08); }
  .ground { fill: #d9d2c5; } .groundline { stroke: #8a7a63; } .hatch { stroke: #b3a68f; }
  .stand { fill: #c7cfdb; stroke: #5b6472; } .standdark { fill: #aeb8c6; stroke: #5b6472; }
  .blade { fill: #ffffff; stroke: #2b3442; } .ghost { fill: none; stroke: #0a6cff; stroke-dasharray: 14 10; opacity: 0.55; }
  .steel { fill: #0a6cff; stroke: #0849ad; } .act { fill: #d9762b; stroke: #9a4f15; } .rod { stroke: #8a95a5; }
  .label { fill: #2b3442; font: 600 26px "JetBrains Mono", Consolas, monospace; letter-spacing: 1px; }
  .small { fill: #5b6472; font: 500 22px "JetBrains Mono", Consolas, monospace; }
  .lead { stroke: #5b6472; } .arrow { stroke: #d9762b; fill: #d9762b; }
  .axis { stroke: #5b6472; stroke-dasharray: 26 7 5 7; } .tiltarc { fill: none; stroke: #d9762b; }
  .gfrp { fill: #1aa39a; stroke: #0d6f69; } .gfrp-ghost { fill: none; stroke: #1aa39a; stroke-dasharray: 10 8; opacity: 0.7; }
  .ballast { fill: #8a95a5; stroke: #4a515c; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #101826; } .grid { stroke: rgba(77,155,255,0.09); }
    .ground { fill: #2a2620; } .groundline { stroke: #b09c7f; } .hatch { stroke: #5c5244; }
    .stand { fill: #2b3646; stroke: #8f99a6; } .standdark { fill: #222c3a; stroke: #8f99a6; }
    .blade { fill: #dfe6ef; stroke: #0b0f16; } .ghost { stroke: #4d9bff; }
    .steel { fill: #4d9bff; stroke: #9cc6ff; } .act { fill: #f29a52; stroke: #ffc79a; } .rod { stroke: #a9b4c2; }
    .label { fill: #e8edf4; } .small { fill: #8f99a6; } .lead { stroke: #8f99a6; } .arrow { stroke: #f29a52; fill: #f29a52; }
    .axis { stroke: #8f99a6; } .tiltarc { stroke: #f29a52; }
    .gfrp { fill: #2cc4b9; stroke: #9ff0ea; } .gfrp-ghost { stroke: #2cc4b9; } .ballast { fill: #4a5361; stroke: #a9b4c2; }
  }
</style>
<defs>
  <marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow"/></marker>
</defs>
<rect width="${W}" height="${H}" class="bg"/>
`;
// blueprint grid
for (let x = 0; x <= W; x += 40) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="grid"/>`;
for (let y = 0; y <= H; y += 40) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="grid"/>`;

// ground with hatching
s += `<rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" class="ground"/>`;
for (let x = -40; x < W; x += 34) s += `<line x1="${x}" y1="${H}" x2="${x + 60}" y2="${GROUND + 4}" class="hatch" stroke-width="3"/>`;
s += `<line x1="0" y1="${GROUND}" x2="${W}" y2="${GROUND}" class="groundline" stroke-width="5"/>`;

// test stand: concrete block with a steel root plate
s += `<rect x="70" y="270" width="230" height="${GROUND - 270}" rx="6" class="stand" stroke-width="4"/>`;
s += `<rect x="70" y="270" width="230" height="40" rx="6" class="standdark" stroke-width="4"/>`;
for (const y of [380, 500, 620]) s += `<line x1="90" y1="${y}" x2="280" y2="${y}" class="lead" stroke-width="2" opacity="0.4"/>`;
s += `<rect x="296" y="${Y_ROOT - 105}" width="40" height="210" rx="4" class="steel" stroke-width="4"/>`;
for (const dy of [-80, -40, 0, 40, 80]) s += `<circle cx="316" cy="${Y_ROOT + dy}" r="6" class="stand" stroke-width="2"/>`;

// glass-fibre leaf spring on two supports with ballast, and the link rod up to the blade
const [sx, syMid] = centre(SS, 18), ts = thick(SS);
const SY = GROUND - 150, SPAN = 400, sx0 = sx - SPAN / 2, sx1 = sx + SPAN / 2;
const springPath = (d) => {                           // deflection shape of a beam loaded at mid-span
  const top = [], bot = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, v = Math.min(u, 1 - u), x = sx0 + u * SPAN, y = SY + d * (3 * v - 4 * v ** 3);
    top.push([x, y - 7]); bot.push([x, y + 7]);
  }
  return "M" + [...top, ...bot.reverse()].map(([x, y]) => `${r(x)},${r(y)}`).join(" L") + " Z";
};
s += `<path d="${springPath(-34)}" class="gfrp-ghost" stroke-width="3"/>`;
s += `<path d="${springPath(30)}" class="gfrp-ghost" stroke-width="3"/>`;
for (const x of [sx0, sx1]) {
  s += `<rect x="${r(x - 70)}" y="${GROUND - 70}" width="140" height="70" rx="6" class="ballast" stroke-width="4"/>`;
  s += `<path d="M${r(x)},${SY + 8} L${r(x - 26)},${GROUND - 70} L${r(x + 26)},${GROUND - 70} Z" class="stand" stroke-width="4"/>`;
}
s += `<path d="${springPath(0)}" class="gfrp" stroke-width="4"/>`;
const linkBottom = syMid + 0.44 * ts + 26;
s += `<line x1="${r(sx)}" y1="${r(linkBottom)}" x2="${r(sx)}" y2="${SY - 8}" class="rod" stroke-width="12" stroke-linecap="round"/>`;
s += `<circle cx="${r(sx)}" cy="${SY - 8}" r="11" class="stand" stroke-width="4"/>`;

// blade: extreme positions as ghosts, then the blade itself
s += `<path d="${bladePath(-120)}" class="ghost" stroke-width="3"/>`;
s += `<path d="${bladePath(150)}" class="ghost" stroke-width="3"/>`;
s += `<path d="${bladePath(18)}" class="blade" stroke-width="5" stroke-linejoin="round"/>`;


// clamps (yokes) around the blade: at the exciter and at the link rod
const cw = 54;
const yoke = (x, yMid, t) => {
  s += `<rect x="${r(x - cw / 2)}" y="${r(yMid - 0.56 * t - 30)}" width="${cw}" height="${r(t + 56)}" rx="8" class="steel" stroke-width="4"/>`;
  s += `<rect x="${r(x - cw / 2 + 12)}" y="${r(yMid - 0.56 * t - 4)}" width="${cw - 24}" height="${r(t + 4)}" rx="3" class="blade" stroke-width="3"/>`;
};
yoke(cx, cyMid, tc);
yoke(sx, syMid, ts);

// blade exciter on the ground: base plate, actuator body, rod up to the clamp
const clampBottom = cyMid + 0.44 * tc + 26;
const bodyTop = GROUND - 190, bodyBot = GROUND - 30;
s += `<rect x="${r(cx - 90)}" y="${GROUND - 22}" width="180" height="22" rx="4" class="standdark" stroke-width="4"/>`;
s += `<circle cx="${r(cx)}" cy="${GROUND - 30}" r="14" class="stand" stroke-width="4"/>`;
s += `<line x1="${r(cx)}" y1="${r(bodyTop)}" x2="${r(cx)}" y2="${r(clampBottom)}" class="rod" stroke-width="16" stroke-linecap="round"/>`;
s += `<rect x="${r(cx - 30)}" y="${r(bodyTop)}" width="60" height="${r(bodyBot - bodyTop)}" rx="10" class="act" stroke-width="4"/>`;
s += `<rect x="${r(cx - 36)}" y="${r(bodyTop)}" width="72" height="18" rx="5" class="act" stroke-width="4"/>`;
s += `<circle cx="${r(cx)}" cy="${r(clampBottom)}" r="12" class="stand" stroke-width="4"/>`;

// motion arrow and force text
const ax = cx + 70;
s += `<line x1="${r(ax)}" y1="${r(cyUp - 40)}" x2="${r(ax)}" y2="${r(cyDown + 30)}" class="arrow" stroke-width="5" marker-start="url(#tip)" marker-end="url(#tip)"/>`;
s += `<text x="${r(cx - 50)}" y="560" class="label" text-anchor="end">F(t) = F·sin(2πft)</text>`;

// labels with leader lines
const label = (x, y, tx, ty, text, sub) => {
  s += `<line x1="${r(x)}" y1="${r(y)}" x2="${r(tx)}" y2="${r(ty + 8)}" class="lead" stroke-width="2"/>`;
  s += `<circle cx="${r(x)}" cy="${r(y)}" r="5" class="lead" fill="none" stroke-width="3"/>`;
  s += `<text x="${r(tx)}" y="${r(ty)}" class="label">${text}</text>`;
  if (sub) s += `<text x="${r(tx)}" y="${r(ty + 30)}" class="small">${sub}</text>`;
};
label(185, 290, 70, 150, "TEST STAND", "blade root bolted to a rigid block");
label(cx - 30, bodyTop + 70, cx - 430, GROUND - 120, "BLADE EXCITER", "on the ground or on the blade");
label(cx - cw / 2, cyMid - 0.56 * tc - 20, cx - 160, 150, "CLAMP", "mass tuned by the optimizer");
label(sx - 110, SY - 4, cx + 100, 500, "GFRP LEAF SPRING", "raises the test frequency");
label(sx + 4, (linkBottom + SY) / 2, sx + 30, 150, "LINK ROD", "pinned at both ends");
label(sx1 + 40, GROUND - 40, sx1 - 60, GROUND - 230, "BALLAST", "≥ 2 × uplift");

s += `</svg>\n`;
writeFileSync(out, s);
console.log("written", out, s.length, "bytes");
