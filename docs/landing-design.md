# verso landing directions

The main page remains the approved classical photo-book landing. The user asked
for five visually different alternatives while keeping all copy, languages and
prices, and renamed the product to lowercase `verso` everywhere.

| URL | Design | Main source |
| --- | --- | --- |
| `/`, `/landing-v2` | Current milk, forest and terracotta design | `landing-v2.jsx`, `landing-v2.css` |
| `/designs` | Localized comparison gallery with actual browser previews | `landing-designs.jsx`, `landing-designs.css` |
| `/designs/folio` | White gallery, centered serif hero, red accents, fine rules | `landing-themes.css` |
| `/designs/grove` | Olive paper, forest buttons, arches and soft shapes | `landing-themes.css` |
| `/designs/signal` | Cobalt and lime, bold sans serif, graphic panels | `landing-themes.css` |
| `/designs/noir` | Graphite, warm gold, quiet serif typography | `landing-themes.css` |
| `/designs/bloom` | Lavender and coral, rounded cards, reversed desktop hero | `landing-themes.css` |
| `/landing-archive` | Frozen photo-journal snapshot with the new brand name | `landing-archive*` |

The five directions render the same v2 component and copy. No winner is selected.
Each separate surface has an independent lazy loader and surface/version CSS
isolation. Theme rules additionally require their own `data-design` value.
Shared configurator styles use `--catalog-*` tokens. Generate gallery images in
KA, EN and RU with `node tools/capture-landing-designs.mjs` while Vite is running.

The exact Russian proposition remains:

> Перенесите воспоминания из ленты телефона в книгу

The page order is proposition and sample book; first year, travel and 2026;
three creation steps; cover/page configurator; gift section and footer.
No invented reviews, discounts, delivery promises, FAQ or helper slogans.
Actions lead to studio registration/login and preserve the locale.
Language order is KA, EN, RU. Fresh visitors default to Georgian; URL and saved
choices take priority.

| Inside pages | Softcover | Hardcover |
| --- | --- | --- |
| 40 | 80 ₾ | 100 ₾ |
| 60 | 110 ₾ | 140 ₾ |
| 80 | 150 ₾ | 190 ₾ |

The product card keeps the whole cover visible from a fixed, nearly frontal
view. Blender renders show hardcover overhang and square softcover corners.
Native radios change binding, page count and price. Only a restrained desktop
hover zoom is permitted; no drag/rotation controls or all-prices disclosure.
Inside pages are 19 × 24 cm; visual depth is not a printing-spine measurement.
The public selection is illustrative and does not change newly created books.

The rename covers visible landing/studio copy, metadata, favicon, PDF author,
recovery downloads and the sample editor screenshots. It does not change
customer content, cloud volumes, local storage identifiers, cookies, API and
transfer protocols, licensed font identifiers or the deployed host. Old project
files remain importable. Studio layout and editing behavior are untouched.

All photos/captures use existing licensed public assets and synthetic books,
never customer data. Provenance is in `public/landing/SOURCES.md`.

Run `npm test` and `npm run test:production -- --workers=1`. Production browser
checks include all directions, exact shared copy, all six prices, localization,
mobile overflow, first-screen actions, caption spacing and CSS isolation.
After publishing, verify `surface-isolation`, `editor-viewport` and
`landing-designs` against the actual HTTPS site using the verifying TLS relay.

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
