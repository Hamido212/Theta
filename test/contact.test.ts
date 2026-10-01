import { describe, expect, test } from "bun:test";
import type { Block } from "../src/blocks";
import { RateLimit, parseSubmission } from "../src/contact";
import { exportSite } from "../src/export";
import { pageBlocks } from "../src/templates";
import { form, testSite } from "./helpers";

const contactForm = (phone = false): Block[] => [
  { id: "intro", type: "text", text: "Schreib uns" },
  { id: "kontakt", type: "form", button: "Abschicken", success: "Danke, bis bald!", phone },
];

// A site with a published contact page.
async function siteWithForm({ login = false, phone = false } = {}) {
  const site = await testSite({ login });
  const page = site.pages.create("Kontakt");
  site.pages.save(page.slug, { blocks: contactForm(phone) });
  site.pages.publish(page.slug, true);
  // Visitors need a moment to fill in the form; a token from five seconds ago passes.
  const send = (fields: Record<string, string>, path = `/${page.slug}`) =>
    site.app.request(path, form({ _form: "kontakt", _token: site.contact.token(Date.now() - 5_000), website: "", ...fields }));
  return { ...site, page, send };
}

const visitor = { name: "Ada Lovelace", email: "ada@example.com", message: "Habt ihr am Samstag einen Tisch für vier?" };
// The e-mail copy is sent after the visitor got the answer.
const mailDone = () => Bun.sleep(5);

describe("checking what visitors type", () => {
  test("cleans the input and reports each problem in the site's language", () => {
    const { submission, errors } = parseSubmission({ name: "  Ada \n Lovelace ", email: " ada@example.com ", phone: "+49 30 123", message: "Hallo\r\nWelt" }, false);
    expect(submission).toEqual({ name: "Ada Lovelace", email: "ada@example.com", phone: "", message: "Hallo\nWelt" });
    expect(errors).toEqual({});

    expect(parseSubmission({ email: "keine-adresse", phone: "ruf an", message: "" }, true).errors).toEqual({
      name: "Bitte gib deinen Namen an.",
      email: "Bitte gib eine gültige E-Mail-Adresse an.",
      phone: "Bitte nur Ziffern, Leerzeichen und + ( ) / - verwenden.",
      message: "Bitte schreib eine Nachricht.",
    });
    expect(parseSubmission({}, false, true).errors.name).toBe("Please enter your name.");
    expect(parseSubmission({ ...visitor, message: "x".repeat(9_000) }, false).submission.message).toHaveLength(5_000);
  });

  test("form tokens are signed, need a few seconds and expire after a day", async () => {
    const { contact } = await testSite();
    const now = Date.now();
    expect(contact.checkToken(contact.token(now - 5_000), now)).toBe("ok");
    expect(contact.checkToken(contact.token(now - 500), now)).toBe("too-fast");
    expect(contact.checkToken(contact.token(now - 25 * 60 * 60 * 1000), now)).toBe("invalid");
    const [time, signature] = contact.token(now - 5_000).split(".");
    expect(contact.checkToken(`${Number(time) - 1000}.${signature}`, now)).toBe("invalid");
    expect(contact.checkToken(`${time}.`, now)).toBe("invalid");
    expect(contact.checkToken(undefined, now)).toBe("invalid");
    // Another site has its own secret.
    expect((await testSite()).contact.checkToken(contact.token(now - 5_000), now)).toBe("invalid");
  });

  test("the rate limit counts per visitor and forgets after its window", () => {
    const limit = new RateLimit(2, 1_000);
    expect([limit.allow("a", 0), limit.allow("a", 10), limit.allow("a", 20), limit.allow("b", 20)]).toEqual([true, true, false, true]);
    expect(limit.allow("a", 1_011)).toBe(true);
  });
});

describe("the contact form on a live page", () => {
  test("renders as plain HTML with a signed token, a hidden trap and the privacy link", async () => {
    const site = await siteWithForm();
    const privacy = site.pages.create("Datenschutz");
    site.pages.publish(privacy.slug, true);
    site.settings.saveSite({ name: "Café Morgenrot", privacy: privacy.slug });
    const html = await (await site.app.request(`/${site.page.slug}`)).text();
    expect(html).toContain(`<form class="t-form" id="form-kontakt" action="/${site.page.slug}#form-kontakt" method="post">`);
    expect(html).toMatch(/name="_token" value="\d+\.[\w-]+"/);
    expect(html).toContain('<input tabindex="-1" autoComplete="off" name="website"/>');
    expect(html).toContain(`<a href="/${privacy.slug}">Datenschutzerklärung</a>`);
    expect(html).toContain("Abschicken");
    expect(html).not.toContain('name="phone"');
    expect(html).not.toContain("<script");
  });

  test("a message lands in the inbox and the visitor sees the thank-you note", async () => {
    const site = await siteWithForm({ phone: true });
    const response = await site.send({ ...visitor, phone: "030 1234567" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/${site.page.slug}?gesendet=kontakt#form-kontakt`);
    expect(site.contact.list()).toMatchObject([{ page: site.page.slug, pageTitle: "Kontakt", ...visitor, phone: "030 1234567", readAt: null, mail: "none" }]);
    expect(site.contact.unread()).toBe(1);

    const thanks = await (await site.app.request(response.headers.get("location")!)).text();
    expect(thanks).toContain("Danke, bis bald!");
    expect(thanks).not.toContain("<form");
  });

  test("mistakes come back with what was typed, marked per field", async () => {
    const site = await siteWithForm();
    const response = await site.send({ name: "Ada", email: "ada@", message: "Mein <b>Text</b>" });
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain('value="Ada"');
    expect(html).toContain("Mein &lt;b&gt;Text&lt;/b&gt;");
    expect(html).toContain('aria-invalid="true" aria-describedby="form-kontakt-email-error"');
    expect(html).toContain("Bitte gib eine gültige E-Mail-Adresse an.");
    expect(site.contact.list()).toEqual([]);
  });

  test("bots are turned away without learning why", async () => {
    const site = await siteWithForm();
    // The hidden field was filled in: same answer as a success, nothing stored.
    const trapped = await site.send({ ...visitor, website: "https://spam.test" });
    expect(trapped.status).toBe(303);
    // Sent right after loading the page, or with a made-up token.
    const quick = await site.app.request(`/${site.page.slug}`, form({ _form: "kontakt", _token: site.contact.token(), ...visitor }));
    expect(quick.status).toBe(422);
    expect(await quick.text()).toContain("Das ging sehr schnell.");
    const forged = await site.send({ ...visitor, _token: "123.abc" });
    expect(await forged.text()).toContain("Das Formular war abgelaufen.");
    // From another website.
    expect((await site.app.request(`/${site.page.slug}`, { ...form({ _form: "kontakt", ...visitor }), headers: { ...form({}).headers, origin: "https://evil.test" } })).status).toBe(403);
    expect(site.contact.list()).toEqual([]);
  });

  test("one visitor can send five messages in ten minutes", async () => {
    const site = await siteWithForm();
    for (let i = 0; i < 5; i++) expect((await site.send(visitor)).status).toBe(303);
    const blocked = await site.send(visitor);
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain(visitor.message);
    expect(site.contact.list()).toHaveLength(5);
  });

  test("only forms that are live can receive messages", async () => {
    const site = await siteWithForm();
    expect((await site.send({ ...visitor, _form: "gibt-es-nicht" })).status).toBe(404);
    const draft = site.pages.create("Entwurf");
    site.pages.save(draft.slug, { blocks: contactForm() });
    expect((await site.send(visitor, `/${draft.slug}`)).status).toBe(404);
    // A form added to the draft of a live page waits for publication.
    site.pages.save(site.page.slug, { blocks: [] });
    site.pages.publish(site.page.slug, true);
    site.pages.save(site.page.slug, { blocks: contactForm() });
    expect((await site.send(visitor)).status).toBe(404);
    expect(site.contact.list()).toEqual([]);
  });

  test("works on the home page, in blog posts, in shared sections and in English", async () => {
    const site = await siteWithForm();
    site.settings.saveSite({ name: "Morning Café", language: "en" });
    site.pages.save("home", { blocks: contactForm() });
    site.pages.publish("home", true);
    expect((await site.send(visitor, "/")).headers.get("location")).toBe("/?gesendet=kontakt#form-kontakt");

    const shared = site.pages.createShared("Kontaktabschnitt", [{ id: "band", type: "section", background: "soft" }, ...contactForm()]);
    site.pages.publish(shared.slug, true);
    const post = site.pages.create("News", "", "post");
    site.pages.save(post.slug, { blocks: [{ id: "ref", type: "shared", sectionId: shared.slug }] });
    site.pages.publish(post.slug, true);
    const html = await (await site.app.request(`/blog/${post.slug}`)).text();
    expect(html).toContain('name="_form" value="ref-kontakt"');
    expect(html).toContain("Email");
    expect(html).toContain("By sending, you agree");
    const response = await site.send({ ...visitor, _form: "ref-kontakt", email: "nope" }, `/blog/${post.slug}`);
    expect(await response.text()).toContain("Please enter a valid e-mail address.");
    expect((await site.send({ ...visitor, _form: "ref-kontakt" }, `/blog/${post.slug}`)).status).toBe(303);
    expect(site.contact.list().map((message) => message.page)).toEqual([post.slug, "home"]);
  });

  test("the static export leaves the form out and the dashboard says so", async () => {
    const site = await siteWithForm({ login: true });
    const files = await exportSite(site, "https://cafe.test");
    const html = new TextDecoder().decode(files.get(`${site.page.slug}/index.html`));
    expect(html).toContain("Schreib uns");
    expect(html).not.toContain("<form");
    expect(await (await site.request("/admin")).text()).toContain("In den exportierten Dateien fehlen sie");
  });

  test("the contact page templates include a form", () => {
    expect(pageBlocks("contact", "Kontakt").some((block) => block.type === "form")).toBe(true);
    expect(pageBlocks("agency-contact", "Kontakt").some((block) => block.type === "form")).toBe(true);
  });
});

describe("e-mail copies", () => {
  const smtp = { host: "smtp.example.com", port: "465", security: "tls", user: "cafe@example.com", password: "geheim", from: "cafe@example.com", to: "inhaber@example.com" };

  test("are sent when a mail server is set up, with the visitor as reply address", async () => {
    const site = await siteWithForm();
    site.settings.saveSite({ name: "Café Morgenrot" });
    site.contact.saveMailSettings(smtp);
    await site.send({ ...visitor, name: "Ada\nBcc: x@evil.test" });
    await mailDone();
    expect(site.contact.list()[0]!.mail).toBe("sent");
    const [settings, mail] = site.mail.sent[0]!;
    expect(settings).toMatchObject({ host: "smtp.example.com", port: 465, to: "inhaber@example.com" });
    expect(mail.subject).toBe("Neue Nachricht von Ada Bcc: x@evil.test über Café Morgenrot");
    expect(mail.replyTo).toBe(visitor.email);
    expect(mail.text).toContain(visitor.message);
    expect(mail.text).toContain("http://localhost/admin/messages");
  });

  test("a failing mail server keeps the message and marks it", async () => {
    const site = await siteWithForm();
    site.contact.saveMailSettings(smtp);
    site.mail.control.fail = true;
    const errors = console.error;
    console.error = () => {};
    try {
      expect((await site.send(visitor)).status).toBe(303);
      await mailDone();
    } finally {
      console.error = errors;
    }
    expect(site.contact.list()).toMatchObject([{ ...visitor, mail: "failed" }]);
  });

  test("settings are checked and the password is kept when left empty", async () => {
    const { contact } = await testSite();
    expect(() => contact.saveMailSettings({ ...smtp, host: "smtp example" })).toThrow("Mailserver");
    expect(() => contact.saveMailSettings({ ...smtp, port: "99999" })).toThrow("Port");
    expect(() => contact.saveMailSettings({ ...smtp, to: "inhaber" })).toThrow("Empfänger");
    contact.saveMailSettings(smtp);
    expect(contact.saveMailSettings({ ...smtp, password: "", security: "starttls", port: "587" })).toMatchObject({ password: "geheim", security: "starttls", port: 587 });
    contact.removeMailSettings();
    expect(contact.mailSettings()).toBeNull();
  });
});

describe("the inbox in the admin", () => {
  test("needs a login", async () => {
    const site = await siteWithForm();
    expect((await site.app.request("/admin/messages")).status).toBe(302);
    expect((await site.app.request("/admin/messages/mail", form(smtpFields))).status).toBe(302);
  });

  test("lists messages, marks them read and deletes them", async () => {
    const site = await siteWithForm({ login: true });
    await site.send(visitor);
    const id = site.contact.list()[0]!.id;
    expect(await (await site.request("/admin")).text()).toContain("1 neue Nachricht");

    const inbox = await (await site.request("/admin/messages")).text();
    expect(inbox).toContain("Ada Lovelace");
    expect(inbox).toContain(`href="mailto:ada@example.com`);
    expect(inbox).toContain(visitor.message);

    expect((await site.request(`/admin/messages/${id}/read`, form({ read: "1" }))).status).toBe(303);
    expect(site.contact.unread()).toBe(0);
    expect(await (await site.request("/admin")).text()).not.toContain("neue Nachricht");
    await site.request(`/admin/messages/${id}/read`, form({ read: "0" }));
    expect(site.contact.unread()).toBe(1);

    expect((await site.request(`/admin/messages/${id}/delete`, form({}))).status).toBe(303);
    expect(site.contact.list()).toEqual([]);
  });

  test("sets up, tests and turns off e-mail without ever showing the password", async () => {
    const site = await siteWithForm({ login: true });
    const invalid = await site.request("/admin/messages/mail", form({ ...smtpFields, from: "kein-absender" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain("Der Absender muss eine E-Mail-Adresse sein");

    const saved = await (await site.request("/admin/messages/mail", form(smtpFields))).text();
    expect(saved).toContain("Gespeichert.");
    expect(saved).toContain('value="smtp.example.com"');
    expect(saved).not.toContain("streng-geheim");

    expect(await (await site.request("/admin/messages/mail/test", form({}))).text()).toContain("Test-E-Mail an inhaber@example.com gesendet");
    expect(site.mail.sent.at(-1)![1].subject).toContain("Test von");
    site.mail.control.fail = true;
    expect(await (await site.request("/admin/messages/mail/test", form({}))).text()).toContain("Verbindung abgelehnt");

    await site.request("/admin/messages/mail/delete", form({}));
    expect(site.contact.mailSettings()).toBeNull();
  });
});

const smtpFields = { host: "smtp.example.com", port: "587", security: "starttls", user: "cafe", password: "streng-geheim", from: "cafe@example.com", to: "inhaber@example.com" };
