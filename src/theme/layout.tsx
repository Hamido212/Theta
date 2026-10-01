import type { ReactNode } from "react";
import { HOME, type NavItem, type SiteSettings } from "../blocks";
import { RichText } from "./fields";
import { SocialIcon } from "./icons";

// Header, navigation and footer around every page. Used on the public site and in the
// editor; linkTo decides whether links lead to public pages or to their editor.
// Entries with their own href, like the blog, always lead there.

type SiteFrameProps = {
  site: SiteSettings;
  nav: NavItem[];
  // Legal notice and privacy links for the footer.
  legal?: NavItem[];
  current: string;
  linkTo: (slug: string) => string;
  children: ReactNode;
};

export function SiteFrame({ site, nav, legal = [], current, linkTo, children }: SiteFrameProps) {
  return (
    <>
      <header className="t-header">
        <a className="t-brand" href={linkTo(HOME)} aria-current={current === HOME ? "page" : undefined}>
          {site.logo ? <img src={site.logo} alt={site.name} /> : site.name}
        </a>
        {nav.length > 0 && (
          <nav aria-label={site.language === "en" ? "Main navigation" : "Hauptmenü"}>
            <ul className="t-nav">
              {nav.map((item) => (
                <li key={item.slug}>
                  <a href={item.href ?? linkTo(item.slug)} aria-current={item.slug === current ? "page" : undefined}>
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {nav.some((item) => item.slug === "blog") && <a className="t-feed-link" href="/blog/feed.xml" aria-label={site.language === "en" ? "RSS feed" : "RSS-Feed"}><SocialIcon href="/blog/feed.xml" /></a>}
      </header>
      <main className="t-page" lang={site.language ?? "de"}>{children}</main>
      <footer className="t-footer">
        <div className="t-footer-main">
          <div className="t-footer-about">
            <strong className="t-footer-name">{site.name}</strong>
            {site.footer && (
              <div className="t-text">
                <RichText value={site.footer} />
              </div>
            )}
          </div>
          {legal.length > 0 && (
            <nav aria-label={site.language === "en" ? "Legal" : "Rechtliches"}>
              <ul className="t-footer-links">
                {legal.map((item) => (
                  <li key={item.slug}>
                    <a href={linkTo(item.slug)} aria-current={item.slug === current ? "page" : undefined}>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <p className="t-footer-copy">
          © {new Date().getFullYear()} {site.name}
        </p>
      </footer>
    </>
  );
}
