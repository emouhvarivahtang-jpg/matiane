# Landing book preview

The configurator uses six Blender meshes: hard and soft bindings, each with
40, 60 or 80 pages. `tools/build-landing-models.py` constructs cover boards,
a continuous spine and a layered paper block. Hardcover boards project beyond
the paper; soft covers have square corners and a gently curved fore edge.
Dimensions are schematic comparisons, not production measurements. Paired sheets
share a visible layer to prevent subpixel moiré on small displays.

Run Blender 4.3+ from the repository root:

```sh
blender -b -t 4 -P tools/build-landing-models.py
node tools/encode-landing-posters.mjs
```

GLBs and 18 localized WebP posters are checked into `public/landing/models/`.
Blender and source PNGs are not needed for production builds. Intermediate PNGs
and the editable Blender scene go into `work/book-3d/`. Existing PNGs are reused;
remove the particular generated PNGs before deliberately re-rendering a changed
model. `--models-only` exports meshes without rendering; `--preview` renders the
Russian 80-page hardcover only. The existing cover artwork supplies all three
languages and is not embedded in the GLBs.

`landing-book-preview.jsx` loads `landing-book-scene.js` near the viewport.
Three.js and the models are separate lazy chunks and never enter the studio.
Only the selected model is requested. The scene renders on demand, caps device
pixel ratio and releases its resources on unmount. Dragging rotates the book;
the cover/side presets and rotation buttons also work from a keyboard. Touch
uses `pan-y` to retain ordinary vertical page scrolling. Reduced motion skips
the settling animation.

A localized render remains available during loading, on initialization failure
or WebGL context loss. It still follows the selected binding, page count and
language. Prices and registration links remain ordinary React controls.

`tests/landing-book.spec.js` checks lazy loading, model and language changes,
rotation, a narrow viewport, and the fallback. The normal production suite also
checks prices and studio style/viewport isolation. Repeat the required isolation
and viewport tests on the live HTTPS origin after publication.
