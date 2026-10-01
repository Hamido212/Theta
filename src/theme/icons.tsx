// Small inline icons need no external asset or JavaScript. Every link supplies its own label.
export function SocialIcon({ href }: { href: string }) {
  let host = "";
  try { host = new URL(href, "https://theta.invalid").hostname; } catch { /* Invalid targets still render safely. */ }
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (href.startsWith("mailto:")) return <svg {...common}><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="m3 6 9 7 9-7" /></svg>;
  if (host === "github.com") return <svg {...common}><path d="M9 19c-5 1-5-3-7-3m14 6v-4c0-1-.2-2-1-2.5 3-.3 6-1.5 6-6.5 0-1.4-.5-2.5-1.4-3.4.2-1 .1-2.1-.3-3.1 0 0-1.2-.4-3.4 1.3a12 12 0 0 0-6.2 0C7.5 2.1 6.3 2.5 6.3 2.5c-.4 1-.5 2.1-.3 3.1A5 5 0 0 0 4.6 9c0 5 3 6.2 6 6.5-.8.5-1 1.5-1 2.5v4" /></svg>;
  if (host === "linkedin.com" || host === "www.linkedin.com") return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7.5 10v7M7.5 6.5v.5M11.5 17v-7m0 3c0-4 5-4 5 0v4" /></svg>;
  if (/\/[^/]*(feed|rss)[^/]*\.xml$/.test(href)) return <svg {...common}><path d="M4 4a16 16 0 0 1 16 16M4 10a10 10 0 0 1 10 10" /><circle cx="5" cy="19" r="1" fill="currentColor" /></svg>;
  return <svg {...common}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" /></svg>;
}
