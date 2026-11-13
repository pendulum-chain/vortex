import { expect, it, vi } from "vitest";

it.each([
  ["/pt-BR/business", "en-US", "pt-BR"],
  ["/pt-br/", "en-US", "pt-BR"],
  ["/en/business", "pt-BR", "en"],
  ["/", "pt-BR", "pt-BR"]
])("initializes %s in %s's correct route language", async (pathname, browserLanguage, expected) => {
  vi.resetModules();
  vi.stubGlobal("window", { location: { pathname }, navigator: { language: browserLanguage, languages: [browserLanguage] } });
  try {
    const { default: i18n } = await import("./i18n");
    expect(i18n.resolvedLanguage).toBe(expected);
  } finally { vi.unstubAllGlobals(); }
});
