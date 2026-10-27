// Generic illustration: a wind turbine blade clamped in a test stand, driven by one
// ground-based exciter. Writes img/blade-simulator/blade-test-rig.svg (1600 x 900).
// Not part of the site. Run with:  node tools/blade-sim-rig-svg.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = process.argv[2] ?? fileURLToPath(new URL("../img/blade-simulator/blade-test-rig.svg", import.meta.url));
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

const SC = 0.6;                                       // clamp / exciter position along the span
const [cx, cyMid] = centre(SC, 18), tc = thick(SC);
const [, cyUp] = centre(SC, -120), [, cyDown] = centre(SC, 150);

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A tilted wind turbine blade clamped in a test stand and driven by one blade exciter on the ground">
<title>Blade fatigue test with one blade exciter</title>
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
  @media (prefers-color-scheme: dark) {
    .bg { fill: #101826; } .grid { stroke: rgba(77,155,255,0.09); }
    .ground { fill: #2a2620; } .groundline { stroke: #b09c7f; } .hatch { stroke: #5c5244; }
    .stand { fill: #2b3646; stroke: #8f99a6; } .standdark { fill: #222c3a; stroke: #8f99a6; }
    .blade { fill: #dfe6ef; stroke: #0b0f16; } .ghost { stroke: #4d9bff; }
    .steel { fill: #4d9bff; stroke: #9cc6ff; } .act { fill: #f29a52; stroke: #ffc79a; } .rod { stroke: #a9b4c2; }
    .label { fill: #e8edf4; } .small { fill: #8f99a6; } .lead { stroke: #8f99a6; } .arrow { stroke: #f29a52; fill: #f29a52; }
    .axis { stroke: #8f99a6; } .tiltarc { stroke: #f29a52; }
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

// blade: extreme positions as ghosts, then the blade itself
s += `<path d="${bladePath(-120)}" class="ghost" stroke-width="3"/>`;
s += `<path d="${bladePath(150)}" class="ghost" stroke-width="3"/>`;
s += `<path d="${bladePath(18)}" class="blade" stroke-width="5" stroke-linejoin="round"/>`;

// tilt: horizontal reference and the undeformed blade axis (centre lines), with the angle between them
const ang = Math.atan(TILT), R = 1000;
s += `<line x1="${X0}" y1="${Y_ROOT}" x2="${X0 + R + 70}" y2="${Y_ROOT}" class="axis" stroke-width="2.5"/>`;
s += `<line x1="${X0}" y1="${Y_ROOT}" x2="${r(X0 + LEN + 40)}" y2="${r(Y_ROOT - (LEN + 40) * TILT)}" class="axis" stroke-width="2.5"/>`;
s += `<path d="M${X0 + R},${Y_ROOT} A${R},${R} 0 0 0 ${r(X0 + R * Math.cos(ang))},${r(Y_ROOT - R * Math.sin(ang))}" class="tiltarc" stroke-width="5"/>`;

// clamp (yoke) around the blade
const cw = 54, ch = tc + 56;
s += `<rect x="${r(cx - cw / 2)}" y="${r(cyMid - 0.56 * tc - 30)}" width="${cw}" height="${r(ch)}" rx="8" class="steel" stroke-width="4"/>`;
s += `<rect x="${r(cx - cw / 2 + 12)}" y="${r(cyMid - 0.56 * tc - 4)}" width="${cw - 24}" height="${r(tc + 4)}" rx="3" class="blade" stroke-width="3"/>`;

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
s += `<text x="${r(cx + 40)}" y="565" class="label">F(t) = F·sin(2πft)</text>`;

// labels with leader lines
const label = (x, y, tx, ty, text, sub) => {
  s += `<line x1="${r(x)}" y1="${r(y)}" x2="${r(tx)}" y2="${r(ty + 8)}" class="lead" stroke-width="2"/>`;
  s += `<circle cx="${r(x)}" cy="${r(y)}" r="5" class="lead" fill="none" stroke-width="3"/>`;
  s += `<text x="${r(tx)}" y="${r(ty)}" class="label">${text}</text>`;
  if (sub) s += `<text x="${r(tx)}" y="${r(ty + 30)}" class="small">${sub}</text>`;
};
label(185, 290, 70, 150, "TEST STAND", "blade root bolted to a rigid block");
label(cx - 30, bodyTop + 70, cx - 430, GROUND - 120, "BLADE EXCITER", "on the ground or on the blade");
s += `<text x="${X0 + R + 22}" y="${r(Y_ROOT - R * Math.sin(ang / 2) + 12)}" class="label">TILT θ</text>`;
label(cx - cw / 2, cyMid - 0.56 * tc - 20, cx - 320, 150, "CLAMP", "adds mass at the exciter");
const [tipX, tipY] = centre(0.97, 18);
label(tipX, tipY + 4, 1340, GROUND - 120, "BLADE", "swings near mode 1");

s += `</svg>\n`;
writeFileSync(out, s);
console.log("written", out, s.length, "bytes");
