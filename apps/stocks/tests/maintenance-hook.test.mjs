import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useMaintenanceStatus } from "../src/hooks.js";

async function harness(run) {
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let visible = true, timerSequence = 0, latest;
  Object.defineProperty(document, "visibilityState", { get: () => visible ? "visible" : "hidden" });
  const timers = new Map(), requests = [], commits = [];
  globalThis.setInterval = callback => { const id = ++timerSequence; timers.set(id, callback); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  const readStatus = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  function View({ enabled }) {
    latest = useMaintenanceStatus({ readStatus, enabled });
    const status = latest.status;
    useLayoutEffect(() => { commits.push({ enabled, status }); });
    return createElement("span", null, status ? status.active ? "paused" : "clear" : "unknown");
  }
  const root = createRoot(document.getElementById("root"));
  const render = enabled => act(async () => flushSync(() => root.render(createElement(View, { enabled }))));
  const resolve = (index, active) => act(async () => requests[index].resolve({ active, details: null }));
  try {
    await run({ render, resolve, requests, commits, latest: () => latest, tick: () => act(async () => { for (const callback of timers.values()) callback(); }),
      focus: () => act(async () => window.dispatchEvent(new dom.window.Event("focus"))),
      blur: () => act(async () => window.dispatchEvent(new dom.window.Event("blur"))),
      visibility: value => act(async () => { visible = value; document.dispatchEvent(new dom.window.Event("visibilitychange")); }) });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.setInterval = previous.setInterval; globalThis.clearInterval = previous.clearInterval;
    for (const [key, value] of [["window", previous.window], ["document", previous.document], ["IS_REACT_ACT_ENVIRONMENT", previous.act]]) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    assert.equal(timers.size, 0, "unmount removes the poll timer");
  }
}

test("returning focus discards a prior clear result before a delayed maintenance read resolves", () => harness(async s => {
  await s.render(true); await s.resolve(0, false); assert.equal(s.latest().status.active, false);
  await s.focus(); assert.equal(s.requests.length, 2); assert.equal(s.latest().status, null);
  await s.resolve(1, true); assert.equal(s.latest().status.active, true);
}));

test("clicking another window keeps the status, so the Pix code does not disappear", () => harness(async s => {
  await s.render(true); await s.resolve(0, false);
  await s.blur();
  assert.equal(s.latest().status.active, false);
  assert.equal(s.requests.length, 1);
}));

test("hidden pages discard pending answers and resume with a fresh public status read", () => harness(async s => {
  await s.render(true); await s.visibility(false); await s.resolve(0, false);
  assert.equal(s.latest().status, null);
  await s.tick(); assert.equal(s.requests.length, 1);
  await s.visibility(true); assert.equal(s.requests.length, 2);
  await s.resolve(1, true); assert.equal(s.latest().status.active, true);
}));

test("slow periodic reads coalesce instead of continually superseding every response", () => harness(async s => {
  await s.render(true); await s.tick(); await s.tick(); assert.equal(s.requests.length, 1);
  await s.resolve(0, false); assert.equal(s.latest().status.active, false);
  await s.tick(); await s.tick(); assert.equal(s.requests.length, 2);
  await s.resolve(1, true); assert.equal(s.latest().status.active, true);
}));

test("disable and re-enable cannot reuse a clear result from the previous status lifecycle", () => harness(async s => {
  await s.render(true); await s.resolve(0, false);
  await s.render(false); const from = s.commits.length;
  await s.render(true);
  for (const c of s.commits.slice(from)) assert.equal(c.status, null);
  await s.resolve(1, true); assert.equal(s.latest().status.active, true);
}));
