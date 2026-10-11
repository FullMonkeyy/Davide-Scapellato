# Davide Scapellato — Portfolio

Static site, no build step. Open `index.html` directly in a browser, or serve the folder (e.g. `npx serve .`).

## Structure

| Path | What |
| --- | --- |
| `index.html` | All content. English copy lives here. |
| `assets/js/i18n.js` | Italian and German translations, keyed by `data-i18n` / `data-i18n-html`. |
| `assets/js/scene.js` | Three.js particle system: portrait → sphere → terrain → torus knot → galaxy. |
| `assets/js/main.js` | Scroll (Lenis + GSAP ScrollTrigger), cursor, skill sphere, ⌘K palette, language switch. |
| `assets/css/main.css` | All styles. Colour tokens at the top. |
| `Photo/web/` | Optimised WebP images actually used by the site. `Photo/` keeps the originals. |
| `index-it.html`, `index-de.html` | Redirect to `index.html?lang=it|de` so old links keep working. |

## Editing content

1. Change the English text in `index.html`.
2. If the element has a `data-i18n` key, update the same key in `assets/js/i18n.js` for `it` and `de`.
3. Each section's `data-shape` (0–4) picks which 3D form the particles take while it's on screen.
