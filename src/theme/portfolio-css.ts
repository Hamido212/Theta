// Presentation for the portfolio preset. Content and block validation remain shared
// with the other presets; there is no site-specific HTML or custom CSS in saved pages.
export const portfolioCss = `
.t-header { max-width: min(var(--t-measure), 52rem); padding: 1.1rem 2rem; align-items: center; display: grid; grid-template-columns: 1fr auto 1fr; }
.t-header .t-brand { font-size: 1rem; letter-spacing: -.02em; }
.t-header .t-nav { font-size: 1rem; gap: 1.7rem; }
.t-page { max-width: min(var(--t-measure), 43.5rem); padding: 2.3rem 2rem 1rem; gap: 2rem; font-size: 1rem; line-height: 1.75; }
.t-page .t-heading-1 { font-size: 2.15rem; letter-spacing: -.025em; }
.t-page .t-heading-2 { font-size: 1.4rem; }
.t-page .t-heading-3 { font-size: 1.15rem; }
.t-page .t-text { color: color-mix(in srgb, var(--t-color-text) 82%, var(--t-color-bg)); }
.t-page .t-text p { margin-bottom: 1.25em; }
.t-page .t-button { padding: .45rem .8rem; font-size: 1rem; font-weight: 400; line-height: 1.4; border-radius: 6px; }
.t-page .t-button-secondary { background: transparent; border: 1px solid color-mix(in srgb, var(--t-color-muted) 20%, transparent); color: var(--t-color-text); }
.t-page .t-posts { gap: .9rem; }
.t-page .t-post-card { padding: 1.2rem; border: 1px solid color-mix(in srgb, var(--t-color-muted) 18%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--t-color-bg) 97%, var(--t-color-text)); }
.t-page .t-post-title { font-size: 1.15rem; }
.t-page .t-post-meta { font-size: .82rem; }
.t-footer { margin-top: 3rem; border: 0; text-align: center; font-size: .9rem; }
.t-footer-main { max-width: 48rem; display: flex; flex-direction: column; align-items: center; gap: .7rem; padding: 1rem 2rem 0; }
.t-footer-name { font-size: 1rem; }
.t-footer .t-footer-links { display: flex; gap: 1rem; font-size: .85rem; }
.t-footer .t-footer-copy { padding-top: .5rem; padding-bottom: 2rem; font-size: .8rem; }
.t-profile { margin: 0 0 2rem; grid-template-columns: 120px minmax(0, 24rem); }
.t-profile > img { width: 120px; height: 120px; }
.t-profile-title { font-size: 1.5rem; }
.t-header .t-feed-link { justify-self: end; }
@media (max-width: 40rem) {
  .t-header { padding: 1rem 1.25rem; gap: 1rem; }
  .t-header { grid-template-columns: 1fr auto; }
  .t-header nav { grid-row: 2; grid-column: 1 / -1; }
  .t-header .t-nav { gap: 1rem; font-size: .95rem; }
  .t-page { padding: 1.6rem 1.25rem 1rem; }
  .t-page .t-heading-1 { font-size: 1.85rem; }
  .t-profile { margin-bottom: 1rem; }
}
@media (max-width: 36rem) { .t-profile { grid-template-columns: 1fr; } }
`;
