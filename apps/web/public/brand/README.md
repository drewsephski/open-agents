# Launchstack visual assets

Generated with the built-in image_gen tool. The PNG files are original exports; WebP versions are optimized for the app and README. The logo and seven icons are editable SVG artwork created directly for this repository.

## Assets

- `readme-cover.png` / `readme-cover.webp`: wide editorial README and marketing cover.
- `product-workspace.png` / `product-workspace.webp`: transparent product illustration, used in the landing hero.
- `workspace-{top,middle,bottom}.png` / `.webp`: separate transparent slabs for the interactive hero. PNGs are original generated exports; WebPs preserve alpha and use quality 90. The hero stays still until hover or explicit playback, then separates the slabs and applies individual parallax.
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

### Interactive workspace layers

Generated with the built-in `image_gen` tool, using `product-workspace.webp` as the edit target and style reference, with `transparent_background: true`. Each of the three calls used this prompt, substituting the corresponding extraction instruction below for `{layer}`:

```text
Use case: background-extraction / precise-object-edit. Asset type: a single separate transparent PNG layer for a web hero animation. Input image 1 is the edit target and exact style reference. Extract ONLY {layer} Render ONE complete freestanding slab centered in a square canvas. Exactly match the existing camera angle, perspective, diamond outline, beveled rounded corners, premium realistic studio lighting, graphite/glass material texture. Place slab horizontally centered; widest outer corners at x=10% and x=90%; top rear corner at y=22%; bottom front corner including thickness at y=78%. This fixed framing is crucial so separate panels have identical size and camera angle when composited. Entire object fits within canvas with clean antialiased alpha edges, no cropping. No background, cast ground shadow, additional objects, extra slabs, text, labels, watermark, or redesign. Preserve original realism and material. True transparent background.
```

- Top: `the TOP graphite metal terminal slab. Preserve the >_ engraved terminal mark and tiny orange square indicator. Remove both lower slabs. Reconstruct any edge necessary.`
- Middle: `the MIDDLE frosted silver glass slab with an orange illuminated perimeter edge. Remove the upper graphite slab and the bottom graphite slab. Reconstruct the hidden upper rear part of this single slab so its entire diamond-shaped top face and entire outer perimeter are visible. NO terminal mark or indicator on this middle slab.`
- Bottom: `the BOTTOM dark graphite metal slab. Remove the top terminal slab and the middle glass slab. Reconstruct the hidden rear upper portion of this single slab so its complete dark diamond-shaped top face is visible. NO symbols, terminal marks, or lights on this slab.`
