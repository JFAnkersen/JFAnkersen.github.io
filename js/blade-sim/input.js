// ------------------------------------------------------------
// Blade fatigue test simulator: reading and writing the input file.
// Same column layout as the Excel input files of the original MATLAB version,
// so an existing file can be loaded as .xlsx or saved as .csv from Excel.
// Files are read in the visitor's browser and never uploaded anywhere.
// ------------------------------------------------------------

// kind: "setting" = one value (first row), "list" = one item per row,
//       "station" = one value per blade station (row)
export const COLUMNS = [
  { key: "testType", header: "Test Type", kind: "setting", text: "Flap or Edge" },
  { key: "tilt", header: "Tilt [deg]", kind: "setting", text: "Blade tilted upwards from horizontal (Flap)" },
  { key: "rigHeight", header: "Rig Height [m]", kind: "setting", text: "Height of the blade root above the ground (Flap)" },
  { key: "simTime", header: "Simulation Time [s]", kind: "setting", text: "Length of the simulation" },
  { key: "ftest", header: "Ftest [Hz]", kind: "setting", optional: true, text: "Test frequency. If missing: 98 % of mode 1" },
  { key: "clampPos", header: "Clamps Position incl Exciter [m]", kind: "list", optional: true, text: "Position of each clamp/yoke along the span" },
  { key: "clampMass", header: "Clamp Masses [kg]", kind: "list", optional: true, text: "Mass of each clamp, incl. the exciter's moving mass" },
  { key: "exciterPos", header: "Exciter Pos [m]", kind: "list", text: "Position of each exciter (up to 3 used in the MATLAB version)" },
  { key: "fpeak", header: "Fpeak [N]", kind: "list", text: "Peak force of each exciter (sine amplitude)" },
  { key: "span", header: "L span [m]", kind: "station", text: "Station position along the blade, from the root" },
  { key: "beta", header: "Beta [1/s]", kind: "station", text: "Damping (velocity-proportional, per unit mass)" },
  { key: "mu", header: "mu [kg/m]", kind: "station", text: "Mass per metre" },
  { key: "ei", header: "Ei [Nm^2]", kind: "station", text: "Bending stiffness in the test direction" },
  { key: "eiFlap", header: "Ei Flap [Nm^2]", kind: "station", optional: true, text: "Optional: flapwise stiffness (lets you switch Flap/Edge)" },
  { key: "eiEdge", header: "Ei Edge [Nm^2]", kind: "station", optional: true, text: "Optional: edgewise stiffness" },
  { key: "targetMom", header: "Target Mom [kNm]", kind: "station", optional: true, text: "Optional: target bending-moment amplitude, shown on the moment plot" },
];

// "Ei [Nm^2]" -> "einm2", so small differences in spelling and spacing don't matter
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  testType: ["testtype", "type"],
  tilt: ["tiltdeg", "tilt"],
  rigHeight: ["righeightm", "righeight"],
  simTime: ["simulationtimes", "simulationtime", "simtimes", "simtime"],
  ftest: ["ftesthz", "ftest", "testfrequencyhz"],
  clampPos: ["clampspositioninclexciterm", "clamppositionm", "clampposm", "clamppos"],
  clampMass: ["clampmasseskg", "clampmasskg", "clampmass"],
  exciterPos: ["exciterposm", "exciterpositionm", "exciterpos"],
  fpeak: ["fpeakn", "fpeak"],
  span: ["lspanm", "spanm", "lspan", "span"],
  beta: ["beta1s", "beta"],
  mu: ["mukgm", "mu"],
  ei: ["einm2", "ei"],
  eiFlap: ["eiflapnm2", "eiflap"],
  eiEdge: ["eiedgenm2", "eiedge"],
  targetMom: ["targetmomknm", "targetmomentknm", "targetmom"],
};

// ---------- Reading ----------

// CSV text -> rows of cells. Handles "," or ";" (Danish Excel) or tab, and quotes.
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  const delim = [";", "\t", ","].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  rows.decimalComma = delim === ";";
  return rows;
}

// .xlsx -> rows of cells, using SheetJS (only loaded when someone opens an Excel file)
const SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
export async function parseXlsx(arrayBuffer) {
  if (!globalThis.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SHEETJS;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the Excel reader. Save the file as CSV instead."));
      document.head.append(s);
    });
  }
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
}

// Rows of cells -> simulator input, with a list of errors and warnings in plain words
export function rowsToInput(rows) {
  const errors = [], warnings = [];
  const num = (v) => {
    if (typeof v === "number") return v;
    let s = String(v ?? "").trim();
    if (s === "") return NaN;
    // Danish Excel: "1.234,5" -> 1234.5 (a value without a comma is read as it is)
    if (rows.decimalComma && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s);
  };

  // Header row: the first row with a span column
  const hIdx = rows.findIndex((r) => r.some((c) => ALIASES.span.includes(norm(c))));
  if (hIdx < 0) {
    return { errors: ["Could not find the header row. It must contain a column called \"L span [m]\"."], warnings };
  }
  const header = rows[hIdx].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[key] = i;
  }
  const data = rows.slice(hIdx + 1);
  const values = (key) => (col[key] === undefined ? [] : data.map((r) => r[col[key]]));
  const firstValue = (key) => values(key).find((v) => String(v ?? "").trim() !== "");

  // Settings (first filled-in value of each column)
  const tt = String(firstValue("testType") ?? "").trim().toLowerCase();
  const testType = tt.startsWith("edge") ? "Edge" : "Flap";
  if (!tt) warnings.push("No Test Type given: Flap is used.");
  const setting = (key, fallback, label) => {
    const v = num(firstValue(key));
    if (Number.isFinite(v)) return v;
    if (fallback !== null) warnings.push(`No ${label} given: ${fallback} is used.`);
    return fallback;
  };
  const tilt = setting("tilt", 0, "tilt");
  const rigHeight = setting("rigHeight", 0, "rig height");
  let simTime = setting("simTime", 60, "simulation time");
  const ftest = setting("ftest", null, "Ftest");

  // Stations: rows with a numeric span value
  const stationRows = data.filter((r) => Number.isFinite(num(r[col.span])));
  const station = (key) => (col[key] === undefined ? null : stationRows.map((r) => num(r[col[key]])));
  const span = station("span");
  const mu = station("mu");
  const eiFlap = station("eiFlap"), eiEdge = station("eiEdge");
  let ei = station("ei") ?? (testType === "Edge" ? eiEdge : eiFlap) ?? eiFlap ?? eiEdge;
  let beta = station("beta");
  const targetMom = station("targetMom");

  if (span.length < 3) errors.push("The blade needs at least 3 stations (rows with an \"L span [m]\" value).");
  for (let i = 1; i < span.length; i++) {
    if (!(span[i] > span[i - 1])) { errors.push(`"L span [m]" must increase from row to row (problem at ${span[i]} m).`); break; }
  }
  if (!mu) errors.push("Column \"mu [kg/m]\" is missing.");
  if (!ei) errors.push("Column \"Ei [Nm^2]\" is missing.");

  // Like Data_Adjustment.m: replace missing or non-positive values instead of failing
  const fix = (arr, label, unit) => {
    if (!arr) return arr;
    const good = arr.filter((v) => Number.isFinite(v) && v > 0);
    const fallback = good.length ? Math.min(...good) : 1;
    let bad = 0;
    const out = arr.map((v) => (Number.isFinite(v) && v > 0 ? v : (bad++, fallback)));
    if (bad) warnings.push(`${bad} value(s) of ${label} were missing or ≤ 0 and were set to ${fallback} ${unit}.`);
    return out;
  };
  const muF = fix(mu, "mu", "kg/m");
  ei = fix(ei, "EI", "Nm²");
  const eiFlapF = eiFlap && fix(eiFlap, "EI flap", "Nm²");
  const eiEdgeF = eiEdge && fix(eiEdge, "EI edge", "Nm²");

  if (!beta) {
    beta = span.map(() => 0.15);
    warnings.push("No damping column \"Beta [1/s]\": 0.15 1/s is used.");
  } else {
    const firstB = beta.find(Number.isFinite) ?? 0.15;
    beta = beta.map((v) => (Number.isFinite(v) && v >= 0 ? v : firstB));
  }

  // Lists: pairs of position + value, skipping empty rows and "0 / 0" placeholders
  const pairs = (kPos, kVal) => {
    const p = values(kPos), v = values(kVal), out = [];
    for (let i = 0; i < Math.max(p.length, v.length); i++) {
      const pos = num(p[i]), val = num(v[i]);
      if (Number.isFinite(pos) && Number.isFinite(val) && pos > 0 && val !== 0) out.push([pos, val]);
    }
    return out;
  };
  const exciters = pairs("exciterPos", "fpeak").map(([pos, force]) => ({ pos, force }));
  const clamps = pairs("clampPos", "clampMass").map(([pos, mass]) => ({ pos, mass }));
  if (!exciters.length) warnings.push("No exciter given (Exciter Pos [m] + Fpeak [N]): only gravity is simulated.");

  if (simTime > 600) { warnings.push("Simulation time limited to 600 s."); simTime = 600; }

  return {
    errors, warnings,
    testType, tilt, rigHeight, simTime, ftest,
    span, mu: muF, ei, eiFlap: eiFlapF, eiEdge: eiEdgeF, beta,
    targetMom: targetMom && targetMom.some(Number.isFinite) ? targetMom : null,
    clamps, exciters,
  };
}

// ---------- Writing ----------

// Simulator input -> CSV text in the same layout (settings and lists in the first rows)
export function inputToCsv(input) {
  const stationCols = ["span", "beta", "mu"];
  if (input.eiFlap || input.eiEdge) {
    if (input.eiFlap) stationCols.push("eiFlap");
    if (input.eiEdge) stationCols.push("eiEdge");
  } else stationCols.push("ei");
  if (input.targetMom) stationCols.push("targetMom");
  const cols = ["testType", "tilt", "rigHeight", "simTime", "ftest", "clampPos", "clampMass", "exciterPos", "fpeak", ...stationCols];
  const headerOf = (k) => COLUMNS.find((c) => c.key === k).header;
  const settings = { testType: input.testType, tilt: input.tilt, rigHeight: input.rigHeight, simTime: input.simTime, ftest: input.ftest };
  const lists = {
    clampPos: input.clamps.map((c) => c.pos), clampMass: input.clamps.map((c) => c.mass),
    exciterPos: input.exciters.map((e) => e.pos), fpeak: input.exciters.map((e) => e.force),
  };
  const lines = [cols.map(headerOf).join(",")];
  input.span.forEach((_, i) => {
    lines.push(cols.map((k) => {
      let v;
      if (k in settings) v = i === 0 ? settings[k] : "";
      else if (k in lists) v = lists[k][i];
      else v = input[k]?.[i];
      return v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(v);
    }).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}
