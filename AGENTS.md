# Matiane surface isolation

The public landing and the photo-book studio are independent product surfaces.
Changes to one must never change the layout, typography, controls, or behavior
of the other. This is an explicit user requirement.

- Landing: `src/landing*.jsx`, `src/landing*.js`, `src/landing*.css` and
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

The user rejected the asymmetric photo-journal design. This supersedes the earlier
editorial direction. Keep the palette, but use clear classical hierarchy, aligned
sections and a visible photo book and action. The exact Russian proposition is
“Перенесите воспоминания из ленты телефона в книгу”, translated into KA and EN.

- `/`: classical landing v2, promoted to the main site by user request.
- `/landing-v2`: retained alias of the main classical landing.
- `/landing-archive`: frozen photo-journal version from `2d2097f`, including its
  own JSX, CSS, copy and catalog. Do not silently redesign the archive.

Keep separate lazy callbacks and CSS guards for each variant. The HTML attribute
`data-landing-version` confines variant styles in addition to `data-surface`.
No FAQ or helper slogans under buttons. Hallmark is under `.agents/skills/hallmark`
(ignored tooling, not a dependency). See `docs/landing-design.md` and
`docs/landing-research.md` for design decisions and the additional GitHub research.

The user explicitly requested Georgian, English, Russian as the language-picker
order everywhere; the studio picker deliberately follows that same order.
This ordering is the sole intentional studio change in the landing redesign.
New landing visitors default to Georgian, with explicit URL and saved choices respected.
Prices are in Georgian lari: hardcover 40/60/80 pages costs 100/140/190;
softcover costs 80/110/150. These are user-supplied commercial facts. Do not
invent delivery charges, offers, contact numbers or print specifications.
The WhatsApp order handoff belongs in the studio, as separate product work;
the landing's main actions still lead to studio registration. The user expressly
requested a material/thickness model in the book configurator; this is a
functional exception to avoiding decorative CSS book mockups elsewhere.
