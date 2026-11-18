import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ProductDiscovery } from ".";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));

it.each(["individuals", "business"] as const)("prerenders the %s discovery section without browser globals", audience => {
  expect(typeof window).toBe("undefined");
  const html = renderToString(<ProductDiscovery audience={audience} />);
  expect(html).toContain('href="/pt-br/gold/"');
  expect(html).toContain('href="/pt-br/stocks/"');
  expect(html).not.toMatch(/style="[^\"]*(width|height):\s*\d/);
});
