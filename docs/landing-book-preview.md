# Landing book product card

The configurator shows fixed, almost frontal renders of the six Blender bindings:
hard and soft covers with 40, 60 or 80 pages. The complete cover faces the viewer;
a small angle reveals the cover overhang and page block. Soft covers keep square
corners and a gentle fore-edge curve. Dimensions are schematic comparisons, not
manufacturing measurements.

The customer-facing card uses native WebP images. There is no WebGL viewer,
drag gesture, rotation button, view toggle or input capture. Desktop hover adds
a small 4.5% zoom; coarse pointers and reduced-motion preferences keep it still.
The selected price is displayed directly; there is no separate all-prices table.

`tools/build-landing-models.py` is the Blender 4.3+ geometry source. Paired sheets
share a visible layer to prevent subpixel moiré. Regenerate the GLBs with:

```sh
blender -b -t 4 -P tools/build-landing-models.py -- --models-only
```

To regenerate the current product images, start `npm run dev`, then run:

```sh
node tools/render-landing-cards.mjs
```

This offline tool uses the Blender GLBs, the existing KA/EN/RU cover textures and
`tools/landing-card-renderer.js` for the fixed camera and lighting. It renders
at 1400px and saves 1000px WebPs under `public/landing/models/card-*.webp`.
`--preview` writes only the Russian 80-page hardcover into `work/book-card/`.
Three.js is a development dependency and is not loaded by the site.

Legacy GLBs and older fallback images are retained for previously loaded site
versions. The current card only requests the selected `card-*.webp` image.

`tests/landing-book.spec.js` covers variant/language switching, absence of viewer
controls, hover, reduced motion and normal page scrolling. The production suite
also checks all six supplied prices and the isolated studio layout. Repeat the
required isolation and viewport tests on the live HTTPS origin after publication.
