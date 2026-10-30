# Matiane landing: photo journal

Approved direction: an editorial photo journal, 2026-10-30. The landing and
studio remain independent interfaces; see `AGENTS.md` for the mandatory
production and live isolation checks.

Preserve the Matiane palette: milk `#faf8f2`, forest-green `#304b3c` and
terracotta `#a94933`. A large roman headline and actual book spreads lead the
page. Use unequal columns, flat surfaces and rules instead of decorative
eyebrows, one italic accent phrase, tilted display books and repeated cards.
The wordmark is retained. Cormorant Garamond Bold, FiraGO and BPG Serif Modern
are self-hosted, freely licensed faces with Cyrillic and Georgian coverage.

The hero previews three actual Matiane spreads, captured in each supported
language from synthetic books. The process section shows the actual editor.
Customer books must never become marketing assets without explicit consent.
The CC0 example photographs and all source licenses are in
`public/landing/SOURCES.md`.

The configurator has native cover and page-count radios, live prices in GEL
and an expandable six-price table. A single cover sample changes thickness
and board appearance as options change. The physical model is schematic;
do not treat its pixel depth as a printing specification. The supplied prices:

| Pages | Softcover | Hardcover |
| --- | --- | --- |
| 40 | 80 ₾ | 100 ₾ |
| 60 | 110 ₾ | 140 ₾ |
| 80 | 150 ₾ | 190 ₾ |

Book scenarios: first year, travel, and the year's memories (2026). The third
step is saving the design and sending the order to the administrator. The user
wants the WhatsApp handoff in the platform, not on the landing; no recipient
number or WhatsApp link is invented here. Existing actions lead to registration
or sign-in, with the chosen language. A future product task can connect book
identification and order details to the administrator. This redesign does not
claim to have implemented that platform workflow.

Language order is Georgian, English, Russian. Explicit `lang` links and saved
preferences win; new landing visitors default to Georgian. No generic helper
slogans below CTAs, and no marketing FAQ.

## Hallmark tooling

Source: https://github.com/nutlope/hallmark, MIT, version 2.0.0, revision
`4f6a46c6dc325d40ab268c93e25c7b96676ebccd`. The skill was validated with its
`refcheck.mjs` and theme validator and copied locally to
`.agents/skills/hallmark`. It is ignored development tooling, not a dependency
of the shipped website. A fresh environment can install the project-local Codex
skill with `npx skills add nutlope/hallmark --agent codex` or copy the validated
`skills/hallmark` directory from the source repository.

The brand scaffold supplies the scale and token discipline; user palette and
surface-isolation requirements take priority. All landing tokens live in
`src/landing.css`, so the existing PostCSS guard covers every rule. Do not add
unscoped base styles or alter the studio's typography to fit the landing.

Hallmark render checks require Chromium and `puppeteer-core`; install the latter
outside the application dependencies, then set `HALLMARK_PUPPETEER` to that
directory and `CHROME_PATH` to the browser. The existing local tool environment
is `/workspace/.design-reference/hallmark`. Render/audit records, before-and-after
screenshots and the Hallmark comparison are ignored under `.hallmark/`.

Run Hallmark against the landing JSX and CSS and the actual Vite URL, then
`npm run test:production -- --workers=1`. After publication run the browser
checks against the actual HTTPS site with the supported verifying TLS relay.
Check all price combinations, language order, example-spread controls,
registration, mobile action targets and studio geometry.
