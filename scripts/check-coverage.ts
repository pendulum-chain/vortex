/**
 * Coverage gate for the bun workspaces. Reads an LCOV report produced by
 * `bun test --coverage --coverage-reporter=lcov` and fails when the aggregate
 * line/function coverage drops below the given floors.
 *
 *   bun scripts/check-coverage.ts <lcov path> <line floor> <function floor>
 *
 * The floors are a ratchet: each workspace's package.json passes values set
 * just under the coverage measured when they were last raised. If you add
 * meaningfully-tested code, raise them; never lower them to make CI pass.
 *
 * (bunfig's `coverageThreshold` is not used because bun 1.3.1 enforces it in a
 * way that fails on any single uncovered file, which makes a total-level
 * ratchet impossible.)
 */
const [lcovPath, lineFloorArg, functionFloorArg] = process.argv.slice(2);
const lineFloor = Number(lineFloorArg);
const functionFloor = Number(functionFloorArg);

if (!lcovPath || Number.isNaN(lineFloor) || Number.isNaN(functionFloor)) {
  console.error("usage: bun scripts/check-coverage.ts <lcov path> <line floor 0..1> <function floor 0..1>");
  process.exit(1);
}

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
  `check-coverage: lines ${(lineCoverage * 100).toFixed(2)}% (floor ${lineFloor * 100}%), ` +
    `functions ${(functionCoverage * 100).toFixed(2)}% (floor ${functionFloor * 100}%)`
);

if (lineCoverage < lineFloor || functionCoverage < functionFloor) {
  console.error("check-coverage: coverage fell below the ratchet floor. Add tests for the code you added.");
  process.exit(1);
}
