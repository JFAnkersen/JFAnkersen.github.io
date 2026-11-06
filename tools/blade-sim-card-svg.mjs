// Generic 3D-style picture of a blade fatigue test for the project card on the front page:
// test stand with root flange, blade, clamp frame and a blade exciter down to the floor. No labels.
// Writes img/blade-simulator/blade-test-card.svg (1600 x 900).
// With --support it adds a glass-fibre leaf spring under the blade, linked to it by a rod, and writes
// img/test-optimizer/test-optimizer-card.svg instead (the Fatigue Test Acceleration Optimizer's card).
// Not part of the site. Run with:  node tools/blade-sim-card-svg.mjs [--support]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SUPPORT = process.argv.includes("--support");
const out = process.argv.slice(2).find((a) => a.endsWith(".svg")) ??
  fileURLToPath(new URL(SUPPORT ? "../img/test-optimizer/test-optimizer-card.svg" : "../img/blade-simulator/blade-test-card.svg", import.meta.url));
const W = 1600, H = 900;
const r = (v) => Math.round(v * 10) / 10;

// World: X along the blade (root at 0, tip at +), Y up, Z across (+ towards the viewer)
const O = [1130, 640], S = 0.78;                            // screen origin and scale
const P = (x, y, z) => [O[0] + S * (-0.85 * x + 0.5 * z), O[1] + S * (0.12 * x + 0.45 * z - y)];
const path = (pts, close = true) => "M" + pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" L") + (close ? " Z" : "");
const poly = (pts3) => path(pts3.map((p) => P(...p)));

// Blade: elliptic sections, half-chord c (Z) and half-thickness t (Y)
const L = 1380, YC = 340;
const chord = (s) => (s < 0.2 ? 92 + 98 * Math.sin((s / 0.2) * Math.PI / 2) : 16 + 174 * Math.pow((1 - s) / 0.8, 1.1));
const thick = (s) => (s < 0.2 ? 92 - 36 * Math.sin((s / 0.2) * Math.PI / 2) : 7 + 49 * Math.pow((1 - s) / 0.8, 1.3));
const sag = (s) => -26 * s * s;                              // a little gravity sag towards the tip

function section(s, n = 48) {
  const x = s * L, c = chord(s), t = thick(s), yc = YC + sag(s);
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return P(x, yc + t * Math.sin(a), c * Math.cos(a));
  });
}
// Silhouette: top-most and bottom-most screen point of each section
const N = 90, top = [], bot = [], mid = [];
for (let i = 0; i <= N; i++) {
  const s = 0.02 + (0.98 * i) / N, pts = section(s);
  top.push(pts.reduce((a, b) => (b[1] < a[1] ? b : a)));
  bot.push(pts.reduce((a, b) => (b[1] > a[1] ? b : a)));
  mid.push(P(s * L, YC + sag(s) - 0.35 * thick(s), chord(s) * 0.55)); // where the upper surface turns away
}
const tipPt = P(L + 14, YC + sag(1), 0);
const bladeOutline = path([...top, tipPt, ...bot.reverse()]);
const bladeLower = path([...mid, tipPt, ...[...bot].reverse()]);
bot.reverse();

// Shadow of the blade on the floor
const shadow = [];
for (let i = 0; i <= N; i++) { const s = 0.02 + (0.98 * i) / N; shadow.push(P(s * L, 0, -chord(s) * 0.9 + 60)); }
for (let i = N; i >= 0; i--) { const s = 0.02 + (0.98 * i) / N; shadow.push(P(s * L, 0, chord(s) * 0.9 + 60)); }

// Clamp frame around the blade (at the exciter; with --support also at the link rod)
const SC = SUPPORT ? 0.45 : 0.6, SS = 0.84;
const frameAt = (sp) => {
  const cz = chord(sp) + 40, cy0 = YC + sag(sp) - thick(sp) - 46, cy1 = YC + sag(sp) + thick(sp) + 46;
  return { x: sp * L, cz, cy0, cy1, pts: (x) => [[x, cy0, -cz], [x, cy1, -cz], [x, cy1, cz], [x, cy0, cz]] };
};
const F1 = frameAt(SC), F2 = frameAt(SS);
const XC = F1.x, cz = F1.cz, cy0 = F1.cy0, cy1 = F1.cy1, frame = F1.pts;

// Round flange on the stand (in the Y-Z plane at X = 0)
const ring = (rad, x = 0, yc = YC, n = 64) =>
  Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return P(x, yc + rad * Math.sin(a), rad * Math.cos(a)); });

// Disc on the floor (X-Z plane)
const disc = (x, z, rad, y = 0, n = 64) =>
  Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return P(x + rad * Math.cos(a), y, z + rad * Math.sin(a)); });

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A wind turbine blade in a fatigue test: the root is bolted to a large test stand, and a clamp on the blade is connected to a blade exciter on the floor${SUPPORT ? ". Further out, a rod links the blade to a glass-fibre leaf spring on two supports" : ""}">
<title>Blade fatigue test</title>
<style>
  .sky { fill: url(#sky); } .floor { fill: #ddd5c7; } .plate { fill: #ece7de; } .rail { stroke: #a99d89; }
  .blk-front { fill: #d6cebf; } .blk-side { fill: #c2b8a7; } .blk-top { fill: #e4ddd0; } .edge { stroke: #9a8f7c; }
  .ring-dark { fill: #7d8590; } .ring-yel { fill: #f2c230; } .root { fill: #f4f6f9; stroke: #b9c1cc; }
  .blade { fill: #ffffff; stroke: #aab3bf; } .blade-low { fill: #dfe4eb; } .shadow { fill: #000; opacity: 0.07; }
  .frame { fill: none; stroke: #f2c230; } .frame-edge { fill: none; stroke: #b48c12; } .pad { fill: #8a6d2a; }
  .rod { stroke: #4a515c; } .cyl { stroke: #2f353e; } .base { fill: #59616d; } .base-top { fill: #7a828e; }
  .person { fill: #5b6472; } .helmet { fill: #0a6cff; }
  .leaf { fill: #2cc4b9; } .leaf-side { fill: #1a9a91; } .leaf-side2 { fill: #22b0a6; }
  .bal-front { fill: #9aa3af; } .bal-side { fill: #858e9b; } .bal-top { fill: #b3bbc6; }
  .sky-a { stop-color: #f3f6fb; } .sky-b { stop-color: #dfe7f2; }
  @media (prefers-color-scheme: dark) {
    .floor { fill: #2c2923; } .plate { fill: #37332c; } .rail { stroke: #5c5244; }
    .blk-front { fill: #3a4250; } .blk-side { fill: #2c3340; } .blk-top { fill: #485162; } .edge { stroke: #1b2029; }
    .ring-dark { fill: #1c222b; } .root { fill: #cfd7e2; stroke: #8f99a6; }
    .blade { fill: #e6ecf3; stroke: #8f99a6; } .blade-low { fill: #b9c3cf; } .shadow { opacity: 0.25; }
    .rod { stroke: #9aa4b2; } .cyl { stroke: #c3cad4; } .base { fill: #3b4350; } .base-top { fill: #566070; }
    .person { fill: #8f99a6; } .helmet { fill: #4d9bff; }
    .leaf { fill: #2cc4b9; } .leaf-side { fill: #168078; } .leaf-side2 { fill: #1d9990; }
    .bal-front { fill: #4a5361; } .bal-side { fill: #3b4350; } .bal-top { fill: #5b6574; }
    .sky-a { stop-color: #131c2b; } .sky-b { stop-color: #0b0f16; }
  }
</style>
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sky-a"/><stop offset="1" class="sky-b"/></linearGradient></defs>
<rect width="${W}" height="${H}" class="sky"/>
`;

// Floor strip with test plates and rails
s += `<path d="${poly([[-700, 0, -330], [1900, 0, -330], [1900, 0, 330], [-700, 0, 330]])}" class="floor"/>`;
s += `<path d="${poly([[XC - 260, 0, -230], [XC + 380, 0, -230], [XC + 380, 0, 230], [XC - 260, 0, 230]])}" class="plate"/>`;
s += `<path d="${poly([[XC - 900, 0, -230], [XC - 300, 0, -230], [XC - 300, 0, 230], [XC - 900, 0, 230]])}" class="plate"/>`;
for (const z of [-300, 300]) s += `<path d="${path([P(-700, 0, z), P(1900, 0, z)], false)}" class="rail" stroke-width="5" fill="none"/>`;

// Test stand block (X from -380 to 0)
const b = { x0: -380, x1: 0, z0: -240, z1: 240, h: 640 };
s += `<path d="${poly([[b.x1, 0, b.z1], [b.x0, 0, b.z1], [b.x0, b.h, b.z1], [b.x1, b.h, b.z1]])}" class="blk-side edge" stroke-width="2"/>`;
s += `<path d="${poly([[b.x1, 0, b.z0], [b.x1, 0, b.z1], [b.x1, b.h, b.z1], [b.x1, b.h, b.z0]])}" class="blk-front edge" stroke-width="2"/>`;
s += `<path d="${poly([[b.x1, b.h, b.z0], [b.x1, b.h, b.z1], [b.x0, b.h, b.z1], [b.x0, b.h, b.z0]])}" class="blk-top edge" stroke-width="2"/>`;
s += `<path d="${path(ring(165))}" class="ring-dark"/>`;
s += `<path d="${path(ring(124))}" class="ring-yel"/>`;
s += `<path d="${path(ring(98))}" class="root" stroke-width="2"/>`;

// Shadow, blade, clamp frame
s += `<path d="${path(shadow)}" class="shadow"/>`;
if (SUPPORT) {
  // Leaf spring: diamond-shaped plate (seen from above) on two supports with ballast, under the outer blade
  const XS = F2.x, SP = 210, ys = 150, t = 14, wz = 85;
  const box = (x0, x1, y0, y1, z0, z1, cls) => {
    s += `<path d="${poly([[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]])}" class="${cls}-side edge" stroke-width="2"/>`;
    s += `<path d="${poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]])}" class="${cls}-front edge" stroke-width="2"/>`;
    s += `<path d="${poly([[x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y1, z0]])}" class="${cls}-top edge" stroke-width="2"/>`;
  };
  for (const xe of [XS + SP, XS - SP]) {
    box(xe - 70, xe + 70, 0, 46, -90, 90, "bal");
    box(xe - 22, xe + 22, 46, ys - t, -34, 34, "blk");
  }
  const a = [XS - SP, ys, 0], n = [XS, ys, -wz], b = [XS + SP, ys, 0], f = [XS, ys, wz];
  const down = ([x, y, z]) => [x, y - t, z];
  s += `<path d="${poly([f, b, down(b), down(f)])}" class="leaf-side"/>`;
  s += `<path d="${poly([a, f, down(f), down(a)])}" class="leaf-side2"/>`;
  s += `<path d="${poly([a, n, b, f])}" class="leaf"/>`;
  const [rx0, ry0] = P(XS, ys, 0), [rx1, ry1] = P(XS, F2.cy0 - 14, 0);
  s += `<line x1="${r(rx0)}" y1="${r(ry0)}" x2="${r(rx1)}" y2="${r(ry1)}" class="rod" stroke-width="12" stroke-linecap="round"/>`;
  s += `<path d="${poly(F2.pts(XS - 40))}" class="frame-edge" stroke-width="30" stroke-linejoin="round"/>`;
}
s += `<path d="${poly(frame(XC - 40))}" class="frame-edge" stroke-width="30" stroke-linejoin="round"/>`;
s += `<path d="${bladeOutline}" class="blade" stroke-width="2"/>`;
s += `<path d="${bladeLower}" class="blade-low"/>`;
s += `<path d="${path([...top, tipPt, ...[...bot].reverse()])}" fill="none" class="blade" stroke-width="2"/>`;
s += `<path d="${poly([[XC, cy0 + 10, -cz + 18], [XC, cy0 + 10, cz - 18], [XC, cy0 + 30, cz - 18], [XC, cy0 + 30, -cz + 18]])}" class="pad"/>`;
s += `<path d="${poly([[XC, cy1 - 10, -cz + 18], [XC, cy1 - 10, cz - 18], [XC, cy1 - 30, cz - 18], [XC, cy1 - 30, -cz + 18]])}" class="pad"/>`;
s += `<path d="${poly(frame(XC))}" class="frame" stroke-width="30" stroke-linejoin="round"/>`;
if (SUPPORT) s += `<path d="${poly(F2.pts(F2.x))}" class="frame" stroke-width="30" stroke-linejoin="round"/>`;

// Blade exciter: base disc on the floor, cylinder and rod up to the clamp
s += `<path d="${path(disc(XC, 0, 120))}" class="base"/>`;
s += `<path d="${path(disc(XC, 0, 92, 14))}" class="base-top"/>`;
const [bx, by] = P(XC, 18, 0), [mx, my] = P(XC, 140, 0), [tx, ty] = P(XC, cy0 - 14, 0);
s += `<line x1="${r(bx)}" y1="${r(by)}" x2="${r(mx)}" y2="${r(my)}" class="cyl" stroke-width="26" stroke-linecap="round"/>`;
s += `<line x1="${r(mx)}" y1="${r(my)}" x2="${r(tx)}" y2="${r(ty)}" class="rod" stroke-width="12" stroke-linecap="round"/>`;

// One person for scale, next to the exciter
const [px, py] = P(XC - 120, 0, 210);
s += `<rect x="${r(px - 9)}" y="${r(py - 96)}" width="18" height="58" rx="6" class="person"/>`;
s += `<rect x="${r(px - 8)}" y="${r(py - 42)}" width="7" height="42" rx="3" class="person"/>`;
s += `<rect x="${r(px + 1)}" y="${r(py - 42)}" width="7" height="42" rx="3" class="person"/>`;
s += `<circle cx="${r(px)}" cy="${r(py - 108)}" r="10" class="person"/>`;
s += `<path d="M${r(px - 11)},${r(py - 110)} a11,11 0 0 1 22,0 z" class="helmet"/>`;

s += `</svg>\n`;
writeFileSync(out, s);
console.log("written", out, s.length, "bytes");
