# Launchstack visual assets

Generated with the built-in image_gen tool. The PNG files are original exports; WebP versions are optimized for the app and README. The logo and seven icons are editable SVG artwork created directly for this repository.

## Assets

- `readme-cover.png` / `readme-cover.webp`: wide editorial README and marketing cover.
- `product-workspace.png` / `product-workspace.webp`: transparent product illustration, used in the landing hero.
- `logo-light.svg`: dark mark for light backgrounds.
- `logo-dark.svg`: light mark for dark backgrounds.
- `favicon.svg`: orange mark on a charcoal tile.
- `icons/*.svg`: agent, sandbox, workflow, feature, repair, checks, and parallel.

The stacked mark represents layered cloud workspaces. App rendering uses `BrandMark` in `components/landing/logo.tsx`; keep its geometry synchronized with the SVG exports when changing the mark. Icons use 48px artboards, neutral gray strokes, and warm orange accents. All are decorative next to existing text labels.

## Generation prompts

### README cover

```text
Use case: ads-marketing
Asset type: wide 16:9 GitHub README cover for Launchstack, a cloud coding agent product.
Primary request: a sleek minimal engaging editorial brand cover. Near-black charcoal backdrop with extremely subtle warm studio atmosphere. Left half holds beautiful precise Swiss sans-serif typography; right half a sculptural exploded stack of three floating thin square graphite and frosted silver plates, isometric view, a single vivid warm orange (#ff8a3d) inner seam. Suggest isolated cloud workspaces and software layers, elegant engineering object, tactile anodized metal, soft realistic shadows, no chrome excess.
Text (verbatim): "Launchstack" small at upper left; "Send coding work" then "to the cloud." as large bold white headline on left; "launchstack.sh" small muted at lower left.
Composition: wide landscape, large breathing room, typography fully readable, stack centered within right 45%, safe margins 7%. Premium technical publication cover. Clean straight rectangular geometry.
Constraints: exact three text strings only. No fake UI, no badges, no rockets, no robots, no clouds, no decorative code, no extra logos, no watermark. Monochrome plus one orange seam. Not a busy futuristic sci-fi image.
```

### Product illustration

```text
Use case: stylized-concept
Asset type: square transparent product illustration for Launchstack landing hero and product marketing.
Primary request: a sleek sculptural cloud coding workspace object: three thin square graphite metal and milky frosted glass plates floating in a precise exploded vertical stack, isometric front three-quarter view. Top plate has a tiny inset terminal prompt symbol >_ engraved in pale silver, nothing else. The middle plate has a single warm orange (#ff8a3d) illuminated inner edge, restrained. Lower plate charcoal matte anodized metal. Rounded corners extremely slight. Precise beveled edges, museum-quality industrial product rendering. Each layer is separated by a modest gap. A minimal small orange square status inset on top plate.
Composition: isolated centered entire object, fills central 75% of square canvas, generous padding on all sides, no cropped parts. Orthographic perspective, clear silhouette at thumbnail size.
Lighting: soft broad studio light, silver edge highlights readable on both black and white, refined tiny contact occlusion between layers, no cast shadow on any background.
Constraints: genuinely transparent background. No text or branding other than engraved >_ symbol. No floor, no scenery, no pedestal, no floating extra particles, no robots, no rockets, no purple or blue neon, no busy circuit-board detail, no watermark. Monochrome graphite and frosted silver with a single orange accent.
```
