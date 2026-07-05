/**
 * Coverage gate for the api suite. Reads the LCOV report produced by
 * `bun test --coverage --coverage-reporter=lcov` and fails when the aggregate
 * line/function coverage drops below the floor.
 *
 * The floors are a ratchet: set just under the measured coverage at the time
 * they were last raised. If you add meaningfully-tested code, raise them;
 * never lower them to make CI pass.
 *
 * (bunfig's `coverageThreshold` is not used because bun 1.3.1 enforces it in a
 * way that fails on any single uncovered file, which makes a total-level
 * ratchet impossible.)
 */
const LINE_FLOOR = 0.43;
const FUNCTION_FLOOR = 0.49;

const lcovPath = new URL("../coverage/lcov.info", import.meta.url).pathname;
const lcov = await Bun.file(lcovPath).text();

let linesFound = 0;
let linesHit = 0;
let functionsFound = 0;
let functionsHit = 0;

for (const line of lcov.split("\n")) {
  if (line.startsWith("LF:")) linesFound += Number(line.slice(3));
  else if (line.startsWith("LH:")) linesHit += Number(line.slice(3));
  else if (line.startsWith("FNF:")) functionsFound += Number(line.slice(4));
  else if (line.startsWith("FNH:")) functionsHit += Number(line.slice(4));
}

if (linesFound === 0 || functionsFound === 0) {
  console.error(`check-coverage: ${lcovPath} contains no coverage data — did the coverage run succeed?`);
  process.exit(1);
}

const lineCoverage = linesHit / linesFound;
const functionCoverage = functionsHit / functionsFound;

console.log(
  `check-coverage: lines ${(lineCoverage * 100).toFixed(2)}% (floor ${LINE_FLOOR * 100}%), ` +
    `functions ${(functionCoverage * 100).toFixed(2)}% (floor ${FUNCTION_FLOOR * 100}%)`
);

if (lineCoverage < LINE_FLOOR || functionCoverage < FUNCTION_FLOOR) {
  console.error("check-coverage: coverage fell below the ratchet floor. Add tests for the code you added.");
  process.exit(1);
}
