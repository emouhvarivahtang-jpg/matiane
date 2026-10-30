# Matiane surface isolation

The public landing and the photo-book studio are independent product surfaces.
Changes to one must never change the layout, typography, controls, or behavior
of the other. This is an explicit user requirement.

- Landing: `src/landing.jsx`, `src/landing-text.js`, `src/landing.css` and
  `public/landing/`. Studio: `src/main.jsx`, `src/styles.css`, `src/studio.css`,
  `src/fonts.css`, the book editor and account components.
- Keep independent lazy loader callbacks in `src/entry.jsx`. Do not put both
  dynamic imports in one conditional callback: Vite 6 can attach only the last
  branch's CSS dependencies, leaving the production studio unstyled.
- Preserve the surface guards in `deploy/scope-ui-styles.js`. Neither stylesheet
  may style the other surface, including root/body, buttons, text and images.
  Shared HTML must not contain landing-specific body styles.
- For changes involving entry points, CSS, routing or the landing, run
  `npm run test:production -- --workers=1` in addition to appropriate normal
  tests. Development-server tests alone cannot validate generated CSS loading.
- After publishing these changes, verify `tests/surface-isolation.spec.js` and
  `tests/editor-viewport.spec.js` against the actual HTTPS site using the
  existing `MATIANE_TEST_URL` and `MATIANE_TLS_RELAY=1` workflow. Include editor
  geometry, independent sidebar scrolling, mobile panels, cover and inner
  spreads. A successful registration alone does not validate studio layout.
- Preserve all cloud books, photos, sessions and volumes. Test with synthetic
  accounts or mocked data; never alter customer books to test presentation.

## Landing design and content

The user selected Hallmark and an editorial photo-journal direction on 2026-10-30.
Keep the milk, forest-green and terracotta palette, asymmetric typography and
actual studio samples. Avoid decorative eyebrows, italic accent words, generic
card rows, helper slogans under buttons and a marketing FAQ. Details are in
`docs/landing-design.md`. The project-local Hallmark skill is installed under
`.agents/skills/hallmark` (ignored tooling, not an application dependency).

Landing language choices are Georgian, English, Russian, in that order; a new
visitor defaults to Georgian, with explicit URL and saved choices respected.
Prices are in Georgian lari: hardcover 40/60/80 pages costs 100/140/190;
softcover costs 80/110/150. These are user-supplied commercial facts. Do not
invent delivery charges, offers, contact numbers or print specifications.
The WhatsApp order handoff belongs in the studio, as separate product work;
the landing's main actions still lead to studio registration. The user expressly
requested a material/thickness model in the book configurator; this is a
functional exception to avoiding decorative CSS book mockups elsewhere.
