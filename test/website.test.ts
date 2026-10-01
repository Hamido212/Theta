import { expect, test } from "bun:test";
import { exportSite } from "../src/export";
import { seedWebsite } from "../examples/website/seed";
import { testSite } from "./helpers";

// Theta's own website is built from ordinary blocks; it must keep working as Theta changes.
test("the Theta website seeds, renders and exports without JavaScript", async () => {
  const site = await testSite();
  const { comparePage, downloadPage } = await seedWebsite(site);
  const nav = site.pages.nav(site.settings.site()).map((item) => item.title);
  expect(nav).toContain("Vergleich");
  expect(nav).toContain("Download");

  for (const path of ["/", `/${comparePage.slug}`, `/${downloadPage.slug}`]) {
    const response = await site.app.request(path);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("<script");
  }
  const files = await exportSite(site, "https://theta.example");
  const home = new TextDecoder().decode(files.get("index.html"));
  expect(home).toContain("Deine Website. Von dir gepflegt.");
  expect([...files.keys()].some((path) => path.endsWith(".js"))).toBe(false);
  await expect(seedWebsite(site)).rejects.toThrow("frische Datenbank");
});
