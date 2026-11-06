import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { usePortfolio } from "../src/hooks.js";

const A = "0x000000000000000000000000000000000000000a", B = "0x000000000000000000000000000000000000000b";
const balance = (owner, label) => ({ owner, label, flags: { NVDA: { paused: false } } });
async function harness(run) {
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [], commits = [], prices = {};
  const runtime = { readHoldings: owner => new Promise((resolve, reject) => requests.push({ owner, resolve, reject })), valuePortfolio: ({ read }) => read, tokenFlags: read => read.flags };
  let latest;
  function View({ address, source }) {
    latest = usePortfolio({ runtime: source, address, prices });
    const p = latest;
    useLayoutEffect(() => { commits.push({ address, read: p.read, valued: p.valued, flags: p.flags, status: p.status, dom: document.getElementById("root").textContent }); });
    return createElement("span", null, p.valued?.label ?? "loading");
  }
  const root = createRoot(document.getElementById("root"));
  const render = (address, source = runtime) => act(async () => flushSync(() => root.render(createElement(View, { address, source }))));
  const resolve = (index, read) => act(async () => requests[index].resolve(read));
  try { await run({ runtime, requests, commits, render, resolve, latest: () => latest }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of [["window", previous.window], ["document", previous.document], ["IS_REACT_ACT_ENVIRONMENT", previous.act]]) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

test("no commit for wallet B or sign-out exposes wallet A's holdings, flags or success state", () => harness(async s => {
  await s.render(A); await s.resolve(0, balance(A, "A has 123 NVDA"));
  const refreshA = s.latest().refresh;
  await s.render(B);
  const switched = s.commits.filter(c => c.address === B);
  assert.ok(switched.length);
  for (const c of switched) { assert.equal(c.read, null); assert.equal(c.valued, null); assert.deepEqual(c.flags, {}); assert.equal(c.status, "loading"); assert.equal(c.dom, "loading"); }
  await refreshA(); assert.equal(s.requests.length, 2, "old callbacks cannot request the previous wallet");
  await s.resolve(1, balance(B, "B holdings"));
  await s.render(null);
  for (const c of s.commits.filter(c => c.address === null)) { assert.equal(c.read, null); assert.equal(c.valued, null); assert.equal(c.status, "idle"); }
}));

test("an old A request cannot overwrite a fresh A result after switching A to B to A", () => harness(async s => {
  await s.render(A); await s.render(B); await s.render(A);
  await s.resolve(2, balance(A, "new A balance"));
  await s.resolve(0, balance(A, "old A balance"));
  await s.resolve(1, balance(B, "old B balance"));
  assert.equal(s.latest().valued.label, "new A balance");
}));

test("a new runtime hides the prior snapshot even when the address stays the same", () => harness(async s => {
  await s.render(A); await s.resolve(0, balance(A, "simulated holdings"));
  const nextRuntime = { ...s.runtime };
  await s.render(A, nextRuntime);
  assert.equal(s.latest().read, null); assert.equal(s.latest().valued, null);
  assert.equal(s.commits.at(-1).status, "loading");
}));

test("out-of-order reads cannot overwrite newer holdings, while an RPC error keeps owned values stale", () => harness(async s => {
  await s.render(A); await s.resolve(0, balance(A, "initial"));
  let first, second;
  await act(async () => { first = s.latest().refresh(); second = s.latest().refresh(); });
  await s.resolve(2, balance(A, "newer")); await second;
  await s.resolve(1, balance(A, "older")); await first;
  assert.equal(s.latest().valued.label, "newer");
  let pending;
  await act(async () => { pending = s.latest().refresh(); });
  await act(async () => { s.requests[3].reject(new Error("RPC unavailable")); await pending; });
  assert.equal(s.latest().valued.label, "newer"); assert.equal(s.latest().status, "rpc_error");
}));
