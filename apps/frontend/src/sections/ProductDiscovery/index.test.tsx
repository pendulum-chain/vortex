// @vitest-environment jsdom
import { createInstance } from "i18next";
import { renderToString } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it } from "vitest";
import en from "../../translations/en.json";
import pt from "../../translations/pt.json";
import { ProductDiscovery } from ".";

describe.each(["en", "pt-BR"])("Product discovery in %s", language => {
  async function render(audience: "individuals" | "business") {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({
      fallbackLng: "en",
      lng: language,
      resources: { en: { translation: en }, "pt-BR": { translation: pt } }
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<I18nextProvider i18n={i18n}><ProductDiscovery audience={audience} /></I18nextProvider>);
    return container;
  }

  it.each(["individuals", "business"] as const)("%s links directly to the separate Brazilian apps", async audience => {
    const dom = await render(audience);
    try {
      const document = dom;
      expect(document.querySelectorAll('a[href="/pt-br/gold/"]').length).toBe(1);
      expect(document.querySelectorAll('a[href="/pt-br/stocks/"]').length).toBe(1);
      expect(document.querySelectorAll("h2").length).toBe(1);
      expect(document.querySelectorAll("h3").length).toBe(2);
      expect(document.textContent).not.toContain("sections.productDiscovery");
      expect(document.textContent).not.toMatch(/50\s*bps|0[.,]25\s*%|guaranteed|garantido/i);
      expect([...document.querySelectorAll("img")].every(img => img.hasAttribute("alt") && img.hasAttribute("width") && img.hasAttribute("height"))).toBe(true);
      for (const link of document.querySelectorAll("a[aria-labelledby]")) {
        expect(link.getAttribute("aria-labelledby")?.split(" ").every(id => document.querySelector(`[id="${id}"]`)?.textContent)).toBe(true);
      }
    } finally { dom.replaceChildren(); }
  });

  it("gives consumers cost clarity and businesses a localized sales/docs path", async () => {
    const consumer = await render("individuals"), business = await render("business");
    try {
      expect(consumer.textContent).toContain(language === "en" ? "Fair fees. Clear costs." : "Taxas justas. Custos claros.");
      expect(consumer.querySelector(".product-discovery__qualification")?.textContent).toContain(language === "en" ? "You buy tokens" : "Você compra tokens");
      expect(consumer.querySelector(".product-discovery__business-actions")).toBeNull();
      expect(business.querySelector('a[href="' + (language === "en" ? "/en/contact" : "/pt-BR/contact") + '"]')?.textContent).toBe(language === "en" ? "Build with Vortex" : "Crie com a Vortex");
      expect(business.querySelector('a[href="https://api-docs.vortexfinance.co/"]')?.getAttribute("rel")).toContain("noopener");
      expect(business.querySelectorAll(".product-discovery__preview").length).toBe(2);
    } finally { consumer.replaceChildren(); business.replaceChildren(); }
  });
});
