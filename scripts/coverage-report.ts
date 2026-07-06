/**
 * Per-area coverage report across all workspaces. Reads the LCOV files produced
 * by each workspace's `test:coverage` script and prints line/function coverage
 * aggregated per source directory, worst-covered first.
 *
 *   bun run test:coverage             # from the repo root: runs all suites, then this
 *   bun scripts/coverage-report.ts    # re-print from existing lcov files
 *   bun scripts/coverage-report.ts --html coverage/index.html
 *                                     # additionally write a browsable HTML report
 *                                     # (per-file drill-down incl. uncovered line ranges)
 *
 * The pass/fail gates stay where they are (scripts/check-coverage.ts and the
 * frontend vitest thresholds) — this script is purely a report.
 */
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const htmlFlagIndex = process.argv.indexOf("--html");
const htmlPath = htmlFlagIndex === -1 ? null : (process.argv[htmlFlagIndex + 1] ?? "coverage/index.html");

const WORKSPACES = [
  { dir: "apps/api", name: "apps/api" },
  { dir: "packages/shared", name: "packages/shared" },
  { dir: "apps/frontend", name: "apps/frontend" },
  { dir: "apps/rebalancer", name: "apps/rebalancer" }
];

// Directory depth to aggregate at, e.g. src/api/services/quote.
const DEPTH = 4;

interface FileCov {
  path: string;
  lf: number;
  lh: number;
  fnf: number;
  fnh: number;
  /** Consecutive un-hit source lines, merged into ranges like "120-134". */
  uncovered: string[];
}

interface Agg {
  lf: number;
  lh: number;
  fnf: number;
  fnh: number;
  files: FileCov[];
}

function dirKey(file: string): string {
  const parts = file.replace(/^\.\//, "").split("/");
  parts.pop();
  return parts.slice(0, DEPTH).join("/") || ".";
}

function pct(hit: number, found: number): string {
  return found === 0 ? "   n/a" : `${((hit / found) * 100).toFixed(1).padStart(5)}%`;
}

function parseLcov(lcov: string): FileCov[] {
  const files: FileCov[] = [];
  let cur: FileCov | null = null;
  let missedLines: number[] = [];
  for (const line of lcov.split("\n")) {
    if (line.startsWith("SF:")) {
      cur = { fnf: 0, fnh: 0, lf: 0, lh: 0, path: line.slice(3).replace(/^\.\//, ""), uncovered: [] };
      missedLines = [];
      files.push(cur);
    } else if (cur && line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",");
      if (Number(hits) === 0) missedLines.push(Number(lineNo));
    } else if (cur && line.startsWith("LF:")) cur.lf = Number(line.slice(3));
    else if (cur && line.startsWith("LH:")) cur.lh = Number(line.slice(3));
    else if (cur && line.startsWith("FNF:")) cur.fnf = Number(line.slice(4));
    else if (cur && line.startsWith("FNH:")) cur.fnh = Number(line.slice(4));
    else if (cur && line === "end_of_record") {
      missedLines.sort((a, b) => a - b);
      for (let i = 0; i < missedLines.length; i++) {
        const start = missedLines[i];
        while (i + 1 < missedLines.length && missedLines[i + 1] === missedLines[i] + 1) i++;
        cur.uncovered.push(start === missedLines[i] ? String(start) : `${start}-${missedLines[i]}`);
      }
      cur = null;
    }
  }
  return files;
}

function groupByArea(files: FileCov[]): Map<string, Agg> {
  const dirs = new Map<string, Agg>();
  for (const f of files) {
    const key = dirKey(f.path);
    const agg = dirs.get(key) ?? { files: [], fnf: 0, fnh: 0, lf: 0, lh: 0 };
    agg.files.push(f);
    agg.lf += f.lf;
    agg.lh += f.lh;
    agg.fnf += f.fnf;
    agg.fnh += f.fnh;
    dirs.set(key, agg);
  }
  return dirs;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function coverageClass(hit: number, found: number): string {
  if (found === 0) return "ok";
  const p = hit / found;
  return p >= 0.5 ? "ok" : p >= 0.25 ? "mid" : "low";
}

function htmlPct(hit: number, found: number): string {
  return found === 0 ? "n/a" : `${((hit / found) * 100).toFixed(1)}%`;
}

function renderFileRow(f: FileCov): string {
  const ranges = f.uncovered.length
    ? `<span class="ranges" title="uncovered lines">${escapeHtml(f.uncovered.slice(0, 12).join(", "))}${f.uncovered.length > 12 ? ", …" : ""}</span>`
    : "";
  return `<tr class="file ${coverageClass(f.lh, f.lf)}">
    <td class="path">${escapeHtml(f.path)}${ranges}</td>
    <td class="num">${htmlPct(f.lh, f.lf)}</td><td class="num">${htmlPct(f.fnh, f.fnf)}</td>
    <td class="num">${f.lf}</td></tr>`;
}

function renderWorkspace(name: string, dirs: Map<string, Agg>): string {
  const rows = [...dirs.entries()].sort(([, a], [, b]) => (a.lf ? a.lh / a.lf : 1) - (b.lf ? b.lh / b.lf : 1));
  const total: Agg = { files: [], fnf: 0, fnh: 0, lf: 0, lh: 0 };
  let body = "";
  for (const [dir, a] of rows) {
    total.lf += a.lf;
    total.lh += a.lh;
    total.fnf += a.fnf;
    total.fnh += a.fnh;
    const files = a.files
      .sort((x, y) => (x.lf ? x.lh / x.lf : 1) - (y.lf ? y.lh / y.lf : 1))
      .map(renderFileRow)
      .join("\n");
    const width = a.lf ? Math.round((a.lh / a.lf) * 100) : 100;
    body += `<tbody>
      <tr class="area ${coverageClass(a.lh, a.lf)}" onclick="this.parentElement.classList.toggle('open')">
        <td class="path"><span class="arrow">▸</span>${escapeHtml(dir)}
          <span class="bar"><i style="width:${width}%"></i></span></td>
        <td class="num">${htmlPct(a.lh, a.lf)}</td><td class="num">${htmlPct(a.fnh, a.fnf)}</td>
        <td class="num">${a.lf}</td></tr>
      ${files}
    </tbody>\n`;
  }
  return `<section>
    <h2>${escapeHtml(name)} <small>${htmlPct(total.lh, total.lf)} lines · ${htmlPct(total.fnh, total.fnf)} functions · ${total.lf} LOC</small></h2>
    <table>
      <thead><tr><th>area / file (click to expand)</th><th class="num">lines</th><th class="num">fns</th><th class="num">LOC</th></tr></thead>
      ${body}
    </table>
  </section>`;
}

const STYLE = `
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #1c2426; background: #f6f7f6; margin: 0; padding: 2rem 1rem; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.3rem; margin: 0 0 0.2rem; }
  .sub { color: #5c6a6d; font-size: 0.85rem; margin: 0 0 1.5rem; }
  h2 { font-size: 1rem; margin: 1.8rem 0 0.5rem; }
  h2 small { color: #5c6a6d; font-weight: 400; font-size: 0.8rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dde3e2; border-radius: 6px; }
  th { text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #5c6a6d; padding: 0.5rem 0.75rem; border-bottom: 1px solid #dde3e2; }
  td { padding: 0.35rem 0.75rem; border-bottom: 1px solid #eef1f0; font-variant-numeric: tabular-nums; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.area { cursor: pointer; font-weight: 600; }
  tr.area:hover { background: #f2f5f4; }
  tr.file { display: none; font-size: 0.82rem; }
  tbody.open tr.file { display: table-row; }
  tbody.open .arrow { display: inline-block; transform: rotate(90deg); }
  .arrow { color: #5c6a6d; margin-right: 0.4rem; transition: transform 0.1s; }
  tr.file .path { padding-left: 2rem; font-family: ui-monospace, Menlo, monospace; }
  .ranges { display: block; color: #a05a48; font-size: 0.72rem; margin-top: 0.1rem; word-break: break-all; }
  .bar { display: inline-block; vertical-align: middle; width: 110px; height: 8px; background: #e9edec; border-radius: 3px; margin-left: 0.6rem; overflow: hidden; }
  .bar i { display: block; height: 100%; }
  tr.ok .bar i { background: #2e7d4f; } tr.ok td.num { color: #2e7d4f; }
  tr.mid .bar i { background: #a8741f; } tr.mid td.num { color: #a8741f; }
  tr.low .bar i { background: #b04a32; } tr.low td.num { color: #b04a32; }
`;

let missing = false;
const sections: string[] = [];

for (const ws of WORKSPACES) {
  const lcovPath = join(ROOT, ws.dir, "coverage/lcov.info");
  const lcovFile = Bun.file(lcovPath);
  if (!(await lcovFile.exists())) {
    console.error(`\n${ws.name}: no coverage/lcov.info — run \`bun run test:coverage\` in ${ws.dir} first`);
    missing = true;
    continue;
  }

  const files = parseLcov(await lcovFile.text());
  const dirs = groupByArea(files);
  const rows = [...dirs.entries()].sort(([, a], [, b]) => (a.lf ? a.lh / a.lf : 1) - (b.lf ? b.lh / b.lf : 1));
  const total: Agg = { files: [], fnf: 0, fnh: 0, lf: 0, lh: 0 };

  console.log(`\n${ws.name}`);
  console.log("  lines   fns    files  LOC     area");
  for (const [dir, a] of rows) {
    total.lf += a.lf;
    total.lh += a.lh;
    total.fnf += a.fnf;
    total.fnh += a.fnh;
    total.files.push(...a.files);
    console.log(
      `  ${pct(a.lh, a.lf)} ${pct(a.fnh, a.fnf)} ${String(a.files.length).padStart(6)} ${String(a.lf).padStart(7)}  ${dir}`
    );
  }
  console.log(
    `  ${pct(total.lh, total.lf)} ${pct(total.fnh, total.fnf)} ${String(total.files.length).padStart(6)} ${String(total.lf).padStart(7)}  TOTAL`
  );

  sections.push(renderWorkspace(ws.name, dirs));
}

if (missing) process.exit(1);

if (htmlPath) {
  const out = join(ROOT, htmlPath);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vortex coverage report</title><style>${STYLE}</style></head><body><main>
<h1>Vortex coverage report</h1>
<p class="sub">Generated ${new Date().toISOString()} · areas sorted worst-covered first · click an area to see its files and their uncovered line ranges</p>
${sections.join("\n")}
</main></body></html>`;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(out), { recursive: true });
  await Bun.write(out, html);
  console.log(`\nHTML report written to ${out}`);
}
