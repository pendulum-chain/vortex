// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageKeys, useLocalStorage } from "./useLocalStorage";

const KEY = LocalStorageKeys.SELECTED_NETWORK;

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("falls back to the default value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    expect(result.current.state).toBe("base");
  });

  it("reads an already stored value on first render", () => {
    localStorage.setItem(KEY, "polygon");
    const { result } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    expect(result.current.state).toBe("polygon");
  });

  it("treats an empty stored value as missing", () => {
    localStorage.setItem(KEY, "");
    const { result } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    expect(result.current.state).toBe("base");
  });

  it("is undefined without a default value", () => {
    const { result } = renderHook(() => useLocalStorage<string | undefined>({ key: KEY }));
    expect(result.current.state).toBeUndefined();
  });

  it("set persists the value and updates the state", () => {
    const { result } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    act(() => result.current.set("arbitrum"));
    expect(result.current.state).toBe("arbitrum");
    expect(localStorage.getItem(KEY)).toBe("arbitrum");
  });

  it("clear removes the stored value and restores the default", () => {
    localStorage.setItem(KEY, "polygon");
    const { result } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    act(() => result.current.clear());
    expect(result.current.state).toBe("base");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps set and clear referentially stable across renders", () => {
    const { result, rerender } = renderHook(() => useLocalStorage<string>({ defaultValue: "base", key: KEY }));
    const { set, clear } = result.current;
    rerender();
    expect(result.current.set).toBe(set);
    expect(result.current.clear).toBe(clear);
  });
});
