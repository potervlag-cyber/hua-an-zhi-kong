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
  assert.match(html, /23 类流程/);
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
