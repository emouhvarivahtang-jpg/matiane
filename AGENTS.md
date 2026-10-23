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
