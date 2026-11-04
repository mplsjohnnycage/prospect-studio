import { test } from "node:test";
import assert from "node:assert/strict";
import { openVectors, runEmbed } from "../../scripts/embed-local.mjs";
import { blendFit, lookalikeScore, proposeLookalikeWeight } from "./agent-core";

const vec = (seed: number) => Array.from({ length: 768 }, (_, i) => seed > 5 ? Math.cos(i * seed) : Math.sin(i) + (seed - 1) * Math.cos(i * 3));
const mock = (byText: Record<string, number[]>): typeof fetch => (async (_u: unknown, init?: { body?: string }) => {
  const { input } = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ data: [{ embedding: byText[input] }] }), { status: 200 });
}) as typeof fetch;

test("embed (mocked endpoint): vectors stored locally; lookalike vs winners; endpoint down falls back", async () => {
  const db = openVectors(":memory:");
  const f = mock({ w1: vec(1), w2: vec(1.01), w3: vec(0.99), p: vec(1.005), far: vec(7) });
  for (const w of ["w1", "w2", "w3"]) await runEmbed(w, { text: w, won: true, winners: [] }, { db, fetchImpl: f });
  const near = await runEmbed("p", { text: "p", won: false, winners: ["w1", "w2", "w3"] }, { db, fetchImpl: f });
  const far = await runEmbed("far", { text: "far", won: false, winners: ["w1", "w2", "w3"] }, { db, fetchImpl: f });
  assert.equal(near.endpointOk, true); assert.equal(near.winners, 3); assert.ok(near.score! > far.score!);
  const down = await runEmbed("x", { text: "x", won: false, winners: [] }, { db, fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch });
  assert.equal(down.endpointOk, false); assert.equal(down.score, undefined);
});
test("lookalike math and weekly weight proposal", () => {
  assert.equal(lookalikeScore([1, 0], [[1, 0]]), undefined);
  assert.equal(lookalikeScore([1, 0], [[1, 0], [1, 0], [1, 0]]), 100);
  assert.equal(blendFit(80, undefined), 80); assert.equal(blendFit(80, 50, 0.3), 71);
  const rows = [...Array(4)].map(() => ({ lookalike: 80, won: true })).concat([...Array(6)].map(() => ({ lookalike: 50, won: false })));
  const p = proposeLookalikeWeight(rows); assert.equal(p.gap, 30); assert.equal(p.weight, 0.4);
});
