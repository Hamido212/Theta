// Content from the owner's seid.dev portfolio, captured on 1 October 2026.
// The original site stays online; this fixture is an editable Theta test website.
export const projects = [
  {
    title: "BricksSnap", date: "Feb 01, 2026", source: "/projects/project-4",
    summary: "Open-source tool for generating ready-to-import Bricks Builder JSON templates — pre-built sections, design tokens, and an optional AI mode.",
    tags: ["Open Source", "Next.js", "TypeScript", "AI", "Bricks Builder"],
    url: "https://github.com/Hamido212/BricksSnap", linkLabel: "See Repository",
    sections: [
      ["BricksSnap — Bricks Builder Templates on Demand", "BricksSnap is an open-source Next.js tool that generates importable Bricks Builder JSON templates. Developers and designers pick from pre-built sections or describe a full page via prompt — the tool exports valid Bricks JSON ready to import directly."],
      ["Features", "- Template Library — Pre-built sections: Hero, Navbar, Features, Pricing, Testimonials, Footer, and more\n- Full-Page Presets — Complete page layouts at the click of a button\n- Design Tokens — Colors, border radius, shadows, spacing, typography, dark mode\n- AI Mode (optional) — Generate via prompt using OpenAI or Anthropic\n- Export — As Bricks import JSON or directly to clipboard"],
      ["Tech Stack", "Next.js (App Router) · TypeScript · OpenAI API · Anthropic API"],
    ],
  },
  {
    title: "Amt-Vernetzt", date: "Sep 15, 2025", source: "/projects/project-3",
    summary: "Cross-agency platform for secure collaboration — digital case management and inter-agency liaison (Amtshilfe 2.0).",
    tags: ["Next.js", "TypeScript", "PostgreSQL", "Prisma", "RBAC"],
    url: "https://amt-vernetzt.de", linkLabel: "See Website",
    sections: [
      ["Amt-Vernetzt — Amtshilfe 2.0", "Amt-Vernetzt is a multi-tenant platform that allows government agencies to manage cases digitally, share them securely with other organizations, and collaborate efficiently as a team. Strict tenant isolation and compliance are at its core."],
      ["Core Features", "- Multi-tenant Case Management — Digital case files with status, priority, and assignments\n- Amtshilfe — Secure sharing of cases with other agencies (VIEW, COLLAB, HANDOVER)\n- Audit Log — Tamper-proof logging of all actions\n- RBAC — Four roles: ORG_ADMIN, CASE_MANAGER, CASE_WORKER, AUDITOR\n- Case Chat — Context-based messaging directly on a case (internal & shared)\n- Inbox — Direct messages (1:1 chat) between colleagues\n- Kanban Board — Visual workflow management\n- Real-time Notifications — For tasks, assignments, and messages"],
      ["Security", "End-to-end type safety from the database schema to the React client. Server Actions with CSRF protection. Argon2id password hashing. Server-side RBAC guards on every request."],
      ["Tech Stack", "Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma ORM · Tailwind CSS · Shadcn/UI · NextAuth.js v5 · Zod · Lucide React"],
    ],
  },
  {
    title: "Dolmetschernetz", date: "Jun 05, 2025", source: "/projects/project-2",
    summary: "Marketplace for professional interpreters — instant booking, payment protection, and video interpreting across Germany.",
    tags: ["Marketplace", "TypeScript", "Next.js", "SaaS"],
    url: "https://dolmetschernetz.com", linkLabel: "See Website",
    sections: [
      ["Dolmetschernetz — Professional Interpreters on Demand", "Dolmetschernetz connects qualified interpreters with hospitals, law firms, companies, and private individuals across Germany. The platform replaces slow agency calls with instant booking, transparent reviews, and secure payment."],
      ["Core Features", "- Instant Booking — Booked within minutes, no waiting\n- Payment Protection — Payment released only after successful delivery\n- Rating System — Transparent interpreter profiles with certifications\n- Video Interpreting — Flexible remote sessions directly via the platform\n- Emergency Button — Urgent interpreter needed? Connected in under 2 minutes\n- Smart Search — Filter by language, availability, and location"],
      ["Who Is It For?", "Hospitals, law firms, companies, and private individuals navigating government processes."],
      ["Tech Stack", "Next.js (App Router) with TypeScript. Booking and payment logic via Server Actions, PostgreSQL database. Two user types (client & interpreter) with separate registration flows."],
    ],
  },
  {
    title: "Brieffix", date: "Jan 10, 2025", source: "/projects/project-1",
    summary: "AI-powered letter generator — formal letters for cancellations, objections, and legal matters in under a minute.",
    tags: ["SaaS", "AI", "TypeScript", "Next.js"],
    url: "https://www.brieffix.de", linkLabel: "See Website",
    sections: [
      ["Brieffix — No More Paperwork", "Brieffix is a German-language SaaS that uses AI to generate formal letter drafts in seconds. Users describe their situation in plain language — no legal jargon needed. The result can be reviewed, printed, copied, or sent immediately."],
      ["13 Categories", "- Cancellations — Subscriptions, gym memberships, streaming, internet contracts\n- Revocations — Online purchases and contracts\n- Travel Law — Compensation claims for flights, trains, and package tours\n- Tenancy Law — Security deposit recovery, reporting defects\n- Objections — Correcting wrong invoices\n- Job Applications — Professional cover letters\n- And more — including a free-form mode"],
      ["Tech Stack", "Next.js · TypeScript · Shadcn/UI · Brevo (transactional email) · Vercel"],
    ],
  },
];

export const work = [
  { meta: "Jan 2025 – Present", title: "Amt für Soziale Dienste Bremen", text: "**IT Working Student — Digitalization**\n\nWorking student supporting the digitalization efforts of the Beistandschaft department. Involved in improving and modernizing internal digital workflows within a public administration context." },
  { meta: "Jan 2024 – Present", title: "BAMF — Federal Office for Migration and Refugees", text: "**Interpreter — Dari & Persian (Farsi)**\n\nCertified interpreter for Dari and Persian (Farsi) at the Federal Office for Migration and Refugees (BAMF). Providing accurate and impartial interpretation during official asylum hearings and administrative procedures." },
  { meta: "Oct 2023 – Present", title: "University of Bremen", text: "**Computer Science Student**\n\nStudying Computer Science (B.Sc.) at the University of Bremen. Focused on software engineering, algorithms, and applied computer science. Continuously expanding knowledge through coursework, personal projects, and hands-on development." },
  { meta: "Jun 2023 – Oct 2023", title: "Amazon", text: "**Amnesty Responder (AFM)**\n\nWorked as an Amnesty Floor Monitor (AFM) in a robotics-assisted fulfillment center. Responsible for keeping the robot floor clear of obstacles, removing fallen items, and resolving robotic drive issues to ensure uninterrupted flow of operations before problems could escalate." },
];

export const blog = {
  title: "More posts coming soon",
  summary: "I'll be sharing thoughts on coding, new technologies, and my experiments with AI. Stay tuned.",
  text: "I genuinely love to code. Not just as a profession — as a habit. There’s something deeply satisfying about sitting down with a problem and working through it, whether it’s a tricky bug, a system design decision that lingers on a walk, or just the quiet focus of building something from scratch.\n\nRight now I’m spending a lot of time playing with AI — not just using it as a tool, but understanding what’s actually happening under the hood. The pace of progress in this space is unlike anything I’ve seen before, and I want to stay close to it.\n\nI read a lot too: blog posts from engineers at the edge of the field, research papers, changelogs from tools I use daily. It’s one of the most effective ways I know to keep growing and stay curious.\n\nThis is where I’ll share what I’m learning, building, and thinking about. More posts coming soon.",
};

export const legal = {
  terms: [
    ["", "By accessing and using this website (seid.dev, the “Site”), you accept and agree to be bound by the following Terms of Use. Please read them carefully."],
    ["Intellectual property", "All content on this Site — including text, design, code snippets, and project descriptions — is the intellectual property of Hamid Yosefsei unless otherwise noted. You may not reproduce, distribute, or use any content from this Site for commercial purposes without prior written permission."],
    ["Use of content", "You may view and reference content on this Site for personal, non-commercial, and informational purposes. Open-source projects linked from this Site are governed by their respective licenses (as stated in each repository)."],
    ["External links", "This Site contains links to external websites (e.g. GitHub, LinkedIn, live project demos). These links are provided for convenience only. I have no control over the content of those sites and accept no responsibility for them or for any loss or damage that may arise from your use of them."],
    ["No warranties", "This Site is provided “as is” without any representations or warranties, express or implied. The information on this Site may be updated or removed at any time without notice. I do not guarantee the accuracy, completeness, or timeliness of any content."],
    ["Limitation of liability", "To the fullest extent permitted by law, I shall not be liable for any indirect, incidental, or consequential damages arising out of your use of this Site or the projects described herein."],
    ["Changes to these terms", "I reserve the right to update these Terms of Use at any time. Changes take effect as soon as they are posted on this page. Continued use of the Site after changes are posted constitutes your acceptance of the revised terms."],
    ["Contact", "For any questions regarding these Terms, please contact me at [hi@seid.dev](mailto:hi@seid.dev)."],
  ],
  privacy: [
    ["", "This Privacy Policy explains how Hamid Yosefsei (“I”, “me”) handles information in connection with this personal portfolio website (the “Site”)."],
    ["What data is collected", "This Site is a static portfolio website. I do not operate any registration system, user accounts, or login functionality. No personal data such as names, email addresses, or payment information is actively collected or stored by the Site itself.\n\nIf you contact me directly via email, the information you provide in that message (e.g. your name and email address) is used solely to respond to your inquiry and is not shared with third parties."],
    ["Analytics and cookies", "This Site does not use any third-party analytics services, tracking pixels, or advertising cookies. If a hosting provider collects basic server logs (such as IP addresses and page access times) for technical operation and security purposes, that data is governed by the hosting provider’s own privacy policy."],
    ["Links to external websites", "This Site contains links to external websites, including GitHub, LinkedIn, and project websites. I am not responsible for the privacy practices of those sites. I encourage you to review their privacy policies when visiting."],
    ["Changes to this policy", "I may update this Privacy Policy from time to time. Any changes will be reflected on this page with an updated date. Continued use of the Site after changes are posted constitutes acceptance of the revised policy."],
    ["Contact", "If you have any questions about this Privacy Policy, you can reach me at [hi@seid.dev](mailto:hi@seid.dev)."],
  ],
};
