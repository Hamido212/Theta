import type { ReactNode } from "react";
import { HOME, type NavItem, type SiteSettings } from "../blocks";

// Header, navigation and footer around every page. Used on the public site and in the
// editor; linkTo decides whether links lead to public pages or to their editor.

type SiteFrameProps = {
  site: SiteSettings;
  nav: NavItem[];
  current: string;
  linkTo: (slug: string) => string;
  children: ReactNode;
};

export function SiteFrame({ site, nav, current, linkTo, children }: SiteFrameProps) {
  return (
    <>
      <header className="t-header">
        <a className="t-brand" href={linkTo(HOME)} aria-current={current === HOME ? "page" : undefined}>
          {site.name}
        </a>
        {nav.length > 0 && (
          <nav aria-label="Hauptmenü">
            <ul className="t-nav">
              {nav.map((item) => (
                <li key={item.slug}>
                  <a href={linkTo(item.slug)} aria-current={item.slug === current ? "page" : undefined}>
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="t-page">{children}</main>
      <footer className="t-footer">
        © {new Date().getFullYear()} {site.name}
      </footer>
    </>
  );
}
