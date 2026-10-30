# Matiane landing alternatives

The user rejected the asymmetric photo-journal design. This instruction
supersedes the earlier editorial direction. The brand palette remains milk
`#faf8f2`, forest-green `#304b3c`, terracotta `#a94933`.

| URL | Design | Main source |
| --- | --- | --- |
| `/` | Original warm design from `94c6640`, with approved content changes | `landing.jsx`, `landing.css`, `landing-classic-text.js` |
| `/landing-v2` | New classical photo-book landing | `landing-v2.jsx`, `landing-v2.css` |
| `/landing-archive` | Photo-journal snapshot from `2d2097f` | `landing-archive*` |

The archive is frozen, including its own copy and prices. Only import paths
changed. Each version has an independent lazy loader and both surface/version
CSS guards. Shared configurator styles use separate `--catalog-*` tokens.
The studio's source, styles and saved data are outside this task's scope.

The exact Russian first-screen proposition is:

> Перенесите воспоминания из ленты телефона в книгу

The other languages convey the same meaning. The restored version retains its
original composition; its longer headline is sized to keep the action visible.
V2 follows this clear reading order:

1. Proposition, registration action and actual Matiane sample book.
2. First year, travel, and memories of 2026.
3. Upload photos, assemble the book, save/send the order to the administrator.
4. Cover and page configurator with the six exact prices.
5. A book as a gift and registration action, then compact footer.

No invented reviews, customers, discounts or delivery promises. No marketing FAQ
or helper slogans beneath buttons. V2 avoids decorative labels and giant footer
wordmarks. Both versions preserve registration/login links and the locale.
Language order is Georgian, English, Russian. Fresh landing visitors default to
Georgian; explicit URL and saved preferences take priority.

| Inside pages | Softcover | Hardcover |
| --- | --- | --- |
| 40 | 80 ₾ | 100 ₾ |
| 60 | 110 ₾ | 140 ₾ |
| 80 | 150 ₾ | 190 ₾ |

Native radios change price, binding shape and schematic thickness. Inside pages
are 19 × 24 cm; model depth is not a print-spine measurement. The public pricing
selection is illustrative, not automatically stored in a newly created book.

WhatsApp handoff belongs in the platform as separate work. No recipient number
has been provided, and no fake chat link or order confirmation is introduced.
All photos/captures are examples from licensed public assets and synthetic books,
never customer books. Provenance is in `public/landing/SOURCES.md`.

The additional GitHub research is documented in `landing-research.md`. Hallmark
was reread; the user's classical structure takes priority over a skill's
preference for unusual composition. The archive is not restyled to fit a linter.

## Hallmark tooling

Source: https://github.com/nutlope/hallmark, MIT, version 2.0.0, revision
`4f6a46c6dc325d40ab268c93e25c7b96676ebccd`. The skill was validated with its
`refcheck.mjs` and theme validator and copied locally to
`.agents/skills/hallmark`. It is ignored development tooling, not a dependency
of the shipped website. A fresh environment can install the project-local Codex
skill with `npx skills add nutlope/hallmark --agent codex` or copy the validated
`skills/hallmark` directory from the source repository.

The brand scaffold supplies the scale and token discipline; user palette and
surface-isolation requirements take priority. Each version owns its stylesheet and token block, with the PostCSS surface and
version guards covering every rule. Do not add
unscoped base styles or alter the studio's typography to fit the landing.

Hallmark render checks require Chromium and `puppeteer-core`; install the latter
outside the application dependencies, then set `HALLMARK_PUPPETEER` to that
directory and `CHROME_PATH` to the browser. The existing local tool environment
is `/workspace/.design-reference/hallmark`. Render/audit records, before-and-after
screenshots and the Hallmark comparison are ignored under `.hallmark/`.

Run Hallmark against the landing JSX and CSS and the actual Vite URL, then
`npm run test:production -- --workers=1`. After publication run the browser
checks against the actual HTTPS site with the supported verifying TLS relay.
Check all price combinations, language order, all three routes, example-spread controls,
registration, mobile action targets and studio geometry.
