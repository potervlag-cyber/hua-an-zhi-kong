import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished chemical safety application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>化安智控 \| 化工过程安全与清洁生产智能辅助系统<\/title>/i);
  assert.match(html, /事故应急指导/);
  assert.match(html, /40 类流程/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("contains four distinct emergency response profiles", async () => {
  const source = JSON.parse(await readFile(new URL("../app/data/source-data.json", import.meta.url), "utf8"));
  const rows = source.emergency["响应分级措施"].slice(4);
  assert.deepEqual(rows.map((row) => row[0]), ["蓝色", "黄色", "橙色", "红色"]);
  assert.equal(new Set(rows.map((row) => row[1])).size, 4);
  assert.equal(new Set(rows.map((row) => row[3])).size, 4);
  assert.equal(new Set(rows.map((row) => row[7])).size, 4);
  assert.ok(rows.every((row) => row.length === 10 && row.every(Boolean)));
});

test("ships complete equipment and emergency knowledge bases", async () => {
  const source = JSON.parse(await readFile(new URL("../app/data/source-data.json", import.meta.url), "utf8"));
  const equipment = source.equipment["设备速查"].slice(4);
  const inspections = source.equipment["检查知识库"].slice(4);
  const accidents = source.emergency["分步应急流程"].slice(4);
  const emergencyCards = source.emergency["应急处置卡"].slice(3);

  assert.equal(equipment.length, 30);
  assert.equal(inspections.length, 203);
  assert.equal(accidents.length, 40);
  assert.equal(emergencyCards.length, 40);
  assert.equal(new Set(equipment.map((row) => row[1])).size, 30);
  assert.equal(new Set(accidents.map((row) => row[2])).size, 40);
  assert.ok(equipment.every((row) => row.length === 8 && row.every((value) => value !== null && value !== "")));
  assert.ok(inspections.every((row) => row.length === 10 && row.every((value) => value !== null && value !== "")));
  assert.ok(accidents.every((row) => row.length === 18 && row.every((value) => value !== null && value !== "")));
  assert.ok(emergencyCards.every((row) => row.length === 12 && row.every((value) => value !== null && value !== "")));

  const checkCounts = new Map();
  for (const row of inspections) checkCounts.set(row[2], (checkCounts.get(row[2]) ?? 0) + 1);
  assert.ok(equipment.every((row) => checkCounts.get(row[1]) === row[2]));
  assert.ok(accidents.every((row) => row.slice(6, 12).every(Boolean)));
});

test("ships exactly 1500 chemicals and an APK SQLite database", async () => {
  const source = JSON.parse(await readFile(new URL("../app/data/source-data.json", import.meta.url), "utf8"));
  const rows = source.chemicals["化学品安全数据"].slice(4);
  assert.equal(rows.length, 1500);
  assert.deepEqual(rows.map((row) => row[0]), Array.from({ length: 1500 }, (_, index) => index + 1));
  assert.ok(rows.slice(0, 100).every((row) => !String(row[22]).includes("安全参数未核验")));
  assert.ok(rows.slice(100, 1000).every((row) => String(row[22]).includes("PubChem CID")));
  const physchem = rows.slice(1000);
  assert.equal(new Set(physchem.map((row) => row[3])).size, 500);
  assert.ok(physchem.every((row) => /^\d{2,7}-\d{2}-\d$/.test(row[3])));
  assert.ok(physchem.every((row) => String(row[22]).includes("PubChem Experimental Properties")));
  assert.ok(physchem.every((row) => [row[6], row[7], row[8], row[9], row[10]].every((value) => !String(value).includes("未收录该项"))));

  const generated = rows.slice(100);
  const verified = generated.filter((row) => String(row[22]).includes("GHS核验状态：来源已核验"));
  const partial = generated.filter((row) => String(row[22]).includes("GHS核验状态：部分核验"));
  assert.equal(verified.length, 713);
  assert.equal(partial.length, 4);
  assert.ok(verified.every((row) => /\bH\d{3}\b/.test(row[11]) && String(row[22]).includes("来源数：")));

  const safety = JSON.parse(await readFile(new URL("../db/pubchem-safety-1400.json", import.meta.url), "utf8"));
  assert.equal(safety.complete, true);
  assert.equal(safety.records.length, 1400);
  assert.deepEqual(safety.statusCounts, { unavailable: 683, verified: 713, partial: 4 });

  const database = await readFile(new URL("../android/assets/databases/chemicals.db", import.meta.url));
  assert.equal(database.subarray(0, 16).toString("binary"), "SQLite format 3\0");
});
