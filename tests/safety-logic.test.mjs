import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  MAX_SIMULATION_POINTS,
  classifyChemicalRisk,
  csvCell,
  inspectionRiskLevel,
  simulationPointCount,
} from "../app/safety-logic.ts";

test("known H codes remain visible when their source is only partially verified", () => {
  assert.equal(
    classifyChemicalRisk("安全数据部分核验：H314；H318", "H314: Causes severe skin burns"),
    "high",
  );
  assert.equal(classifyChemicalRisk("安全危害数据待核验", "毒性数据未核验"), "unknown");
});

test("low acute-toxicity wording is not promoted to a critical hazard", () => {
  assert.equal(classifyChemicalRisk("一般工业品", "低急性毒性"), "low");
  assert.equal(classifyChemicalRisk("一般工业品", "急性毒性较低"), "low");
});

test("a single critical inspection abnormality cannot be downgraded", () => {
  assert.equal(inspectionRiskLevel(25, true, false), "重大风险");
  assert.equal(inspectionRiskLevel(5, false, true), "较高风险");
});

test("CSV cells neutralize spreadsheet formula prefixes", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://example.invalid\")"), '"\'=HYPERLINK(""https://example.invalid"")"');
  assert.equal(csvCell("\t+1+1"), '"\'\t+1+1"');
  assert.equal(csvCell("normal"), '"normal"');
});

test("simulation sampling rejects non-finite input and exposes a hard point limit", () => {
  assert.equal(simulationPointCount(Number.POSITIVE_INFINITY, 1), 0);
  assert.equal(simulationPointCount(10, 2), 6);
  assert.ok(simulationPointCount(1_000_000, 1) > MAX_SIMULATION_POINTS);
});

test("Android WebView and backup policies keep the native bridge local", async () => {
  const java = await readFile(new URL("../android/src/com/huaan/zhikong/MainActivity.java", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../android/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(java, /shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\)/);
  assert.match(java, /TRUSTED_WEB_PREFIX = "\/assets\/www\/"/);
  assert.match(java, /Intent\.ACTION_VIEW/);
  assert.match(java, /TOP_BLACK_BAR_HEIGHT_MM = 0\.5f/);
  assert.match(java, /controller\.hide\(WindowInsets\.Type\.statusBars\(\)\)/);
  assert.match(java, /millimetersToPixels\(TOP_BLACK_BAR_HEIGHT_MM\)/);
  assert.match(manifest, /android:allowBackup="false"/);
});

test("TypeScript and database builder use the same data version", async () => {
  const dataSource = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
  const match = dataSource.match(/export const dataVersion = "([^"]+)"/);
  assert.ok(match, "app/data.ts must export a literal dataVersion");
  const result = spawnSync("python", ["-c", String.raw`import runpy; print(runpy.run_path("scripts/build-chemical-database.py")["DATA_VERSION"])`], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(match[1], result.stdout.trim());
});

test("packaged SQLite risk values match the shared source classifier", () => {
  const script = String.raw`
import json, runpy, sqlite3
from pathlib import Path
root = Path.cwd()
module = runpy.run_path(str(root / "scripts" / "build-chemical-database.py"))
source = json.loads((root / "app" / "data" / "source-data.json").read_text(encoding="utf-8"))
rows = source["chemicals"]["化学品安全数据"][4:]
expected = {int(row[0]): module["classify_risk"](str(row[11]), str(row[14])) for row in rows}
connection = sqlite3.connect(f"file:{(root / 'android' / 'assets' / 'databases' / 'chemicals.db').as_posix()}?mode=ro", uri=True)
actual = dict(connection.execute("SELECT id, risk FROM chemicals"))
metadata = dict(connection.execute("SELECT key, value FROM metadata"))
integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
connection.close()
assert integrity == "ok"
assert actual == expected
assert metadata["data_version"] == module["DATA_VERSION"]
assert metadata["chemical_count"] == str(len(rows))
assert actual[1477] == "high"
`;
  const result = spawnSync("python", ["-c", script], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
