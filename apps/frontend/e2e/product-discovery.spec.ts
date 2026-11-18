import { expect, test } from "@playwright/test";

test.use({ viewport: { height: 844, width: 320 } });

for (const locale of ["en", "pt-BR"]) {
  for (const audience of ["individuals", "business"]) {
    test(`${locale} ${audience}: Brazilian product entries fit a narrow screen`, async ({ page }) => {
      await page.route("**/maintenance/status", route =>
        route.fulfill({
          json: { is_maintenance_active: false, maintenance_details: null }
        })
      );
      const path = audience === "business" ? `/${locale}/business` : `/${locale}/`;
      await page.goto(`${path}#discover-${audience}`);
      const section = page.locator(`section[aria-labelledby="discover-${audience}"]`);
      await expect(section).toBeVisible();
      await expect(section.locator('a[href="/pt-br/gold/"]')).toHaveCount(1);
      await expect(section.locator('a[href="/pt-br/stocks/"]')).toHaveCount(1);
      await expect(section.getByRole("heading", { level: 2 })).toContainText(
        locale === "pt-BR"
          ? audience === "business"
            ? "Veja o que"
            : "Ouro e tokens"
          : audience === "business"
            ? "See what"
            : "Gold and US"
      );
      // The old fixed-width footer columns pushed both pages to 368px at this viewport.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      if (audience === "business") {
        await expect
          .poll(() =>
            section.evaluate(element =>
              [...element.querySelectorAll<HTMLImageElement>(".product-discovery__preview")].every(image => {
                const frame = image.parentElement?.getBoundingClientRect();
                return frame && image.getBoundingClientRect().bottom <= frame.bottom - 20;
              })
            )
          )
          .toBe(true);
      }
    });
  }
}
