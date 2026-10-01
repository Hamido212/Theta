import { expect, test } from "bun:test";
import { exportSite } from "../src/export";
import { seedWebsite } from "../examples/website/seed";
import { testSite } from "./helpers";

// Theta's own website is built from ordinary blocks; it must keep working as Theta changes.
test("the Theta website seeds, renders and exports without JavaScript", async () => {
  const site = await testSite();
  const { comparePage, downloadPage, imprintPage, privacyPage } = await seedWebsite(site);
  const nav = site.pages.nav(site.settings.site()).map((item) => item.title);
  expect(nav).toEqual(["Vergleich", "Download"]);
  expect(site.settings.site()).toMatchObject({ imprint: imprintPage.slug, privacy: privacyPage.slug, logo: "/media/theta-logo.svg" });

  for (const path of ["/", `/${comparePage.slug}`, `/${downloadPage.slug}`, `/${imprintPage.slug}`, `/${privacyPage.slug}`]) {
    const response = await site.app.request(path);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain("<script");
    expect(html).toContain(`href="/${imprintPage.slug}"`);
  }
  expect(await (await site.app.request(`/${imprintPage.slug}`)).text()).toContain("Osterstr. 14");
  expect(await (await site.app.request(`/${privacyPage.slug}`)).text()).toContain("Vercel Inc.");

  const files = await exportSite(site, "https://theta.example");
  const home = new TextDecoder().decode(files.get("index.html"));
  expect(home).toContain('Deine Website. <strong class="t-highlight">Von dir gepflegt.</strong>');
  expect(home).toContain('<div class="t-browser">');
  expect(files.has("media/theta-logo.svg")).toBe(true);
  expect([...files.keys()].some((path) => path.endsWith(".js"))).toBe(false);
  await expect(seedWebsite(site)).rejects.toThrow("frische Datenbank");
});
