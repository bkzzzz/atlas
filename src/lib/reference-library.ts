import type { ReferenceItem } from "@/lib/art-direction-core";

const LOCAL_REFERENCE_SOURCE = "Atlas curated reference library";
const LOCAL_REFERENCE_LICENSE = "Atlas prototype reference";

export const REFERENCE_LIBRARY: readonly ReferenceItem[] = [
  {
    id: "mossbound-pixel",
    title: "Mossbound Pixel",
    imageUrl: "/references/mossbound-pixel.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#18251f", "#355b3e", "#6f8f4f", "#d19a46", "#f1d38a"],
    traits: [
      "chunky pixel clusters",
      "forest-worn silhouettes",
      "warm focal accents",
    ],
    description:
      "Grounded woodland pixel art with compact forms, deliberate clusters, and amber highlights that remain legible at game scale.",
    styleHints: {
      lineStyle:
        "Hard one-pixel contours with selective broken edges and no anti-aliasing",
      lighting:
        "Soft overcast forest light punctuated by small warm emissive accents",
      materials: ["moss", "weathered iron", "rough leather", "aged wood"],
      shapeLanguage:
        "Stout asymmetrical silhouettes built from blocky organic masses",
      detailLevel:
        "Medium-low detail resolved into intentional clusters for small sprites",
      compositionNotes: [
        "Keep the primary silhouette readable before surface texture.",
        "Reserve the warmest color for the gameplay focal point.",
      ],
    },
  },
  {
    id: "hearthlight-storybook",
    title: "Hearthlight Storybook",
    imageUrl: "/references/hearthlight-storybook.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#382b35", "#765044", "#c17c51", "#e9b96e", "#f7e6bd"],
    traits: [
      "soft ink contours",
      "welcoming warm light",
      "whimsical proportions",
    ],
    description:
      "A tactile storybook direction shaped by curved silhouettes, gentle imperfection, and warm domestic light.",
    styleHints: {
      lineStyle:
        "Loose hand-inked contours with tapered weight and softly irregular edges",
      lighting:
        "Broad golden hearth light with quiet plum-colored ambient shadows",
      materials: ["painted wood", "wool", "handmade ceramic", "brushed brass"],
      shapeLanguage:
        "Rounded, slightly top-heavy forms with friendly bends and softened corners",
      detailLevel:
        "Medium illustrated detail with texture concentrated around focal areas",
      compositionNotes: [
        "Favor an inviting three-quarter arrangement with gentle visual rhythm.",
        "Use overlapping curves to make the asset feel handmade and approachable.",
      ],
    },
  },
  {
    id: "moonlit-ink",
    title: "Moonlit Ink",
    imageUrl: "/references/moonlit-ink.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#111421", "#29304d", "#596b8e", "#9fb4c7", "#e5e6d2"],
    traits: [
      "expressive brush lines",
      "nocturnal negative space",
      "silver rim light",
    ],
    description:
      "Graphic nocturnal fantasy using confident ink gestures, restrained blue-gray color, and moonlit edge separation.",
    styleHints: {
      lineStyle:
        "Expressive dry-brush contours with bold-to-hairline variation",
      lighting:
        "Cool directional moonlight with silver rims and deep unfilled shadow",
      materials: ["blackened steel", "ink-washed cloth", "bone", "wet stone"],
      shapeLanguage:
        "Long tapered diagonals balanced by broad areas of negative space",
      detailLevel:
        "Selective high detail at the focal point with large simplified shadow shapes",
      compositionNotes: [
        "Let negative space separate gestures instead of outlining every form.",
        "Place a pale rim along the silhouette that communicates the action.",
      ],
    },
  },
  {
    id: "sunforge-tactics",
    title: "Sunforge Tactics",
    imageUrl: "/references/sunforge-tactics.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#222938", "#4f5966", "#bd633d", "#e5a94f", "#f6df9a"],
    traits: [
      "isometric clarity",
      "faceted construction",
      "tactical readability",
    ],
    description:
      "Crisp tactical fantasy built around isometric planes, durable silhouettes, and sun-baked metal accents.",
    styleHints: {
      lineStyle:
        "Clean controlled edges with restrained dark contour accents between planes",
      lighting:
        "High warm key light casting short, graphic cool-gray shadows",
      materials: ["hammered bronze", "sandstone", "canvas", "dark steel"],
      shapeLanguage:
        "Interlocking wedges, sturdy trapezoids, and readable stepped planes",
      detailLevel:
        "Medium detail organized into large plane changes for tactical zoom levels",
      compositionNotes: [
        "Align major edges to a consistent isometric grid.",
        "Separate gameplay-facing surfaces through value before adding texture.",
      ],
    },
  },
  {
    id: "porcelain-arcana",
    title: "Porcelain Arcana",
    imageUrl: "/references/porcelain-arcana.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#19233c", "#43527a", "#9c78a8", "#d9c9dc", "#f4eee2"],
    traits: [
      "elegant symmetry",
      "ceramic surfaces",
      "restrained magical glow",
    ],
    description:
      "Refined arcane design that contrasts delicate porcelain surfaces with deep indigo structure and measured violet magic.",
    styleHints: {
      lineStyle:
        "Fine precise contours with ornamental breaks and minimal exterior weight",
      lighting:
        "Cool gallery-soft light with a restrained lavender inner glow",
      materials: ["glazed porcelain", "silver filigree", "velvet", "crystal"],
      shapeLanguage:
        "Tall symmetric silhouettes made from nested ovals, crescents, and fine points",
      detailLevel:
        "High ornamental detail grouped into calm, clearly bounded regions",
      compositionNotes: [
        "Anchor elaborate ornament inside a simple symmetric outer silhouette.",
        "Keep magical emission subtle enough to preserve porcelain value changes.",
      ],
    },
  },
  {
    id: "ironwood-folk",
    title: "Ironwood Folk",
    imageUrl: "/references/ironwood-folk.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#24211d", "#554635", "#876846", "#ae8d60", "#d5c39c"],
    traits: [
      "carved folk shapes",
      "earthbound palette",
      "visible craft marks",
    ],
    description:
      "Rustic folk fantasy with carved construction, simple symbolic motifs, and an honest muted material palette.",
    styleHints: {
      lineStyle:
        "Carved-looking dark grooves with blunt ends and slight handmade variance",
      lighting:
        "Diffuse workshop light with shallow warm shadows and matte highlights",
      materials: ["ironwood", "raw linen", "wrought iron", "clay"],
      shapeLanguage:
        "Broad primitive profiles assembled from discs, pegs, and sturdy carved blocks",
      detailLevel:
        "Medium-low detail expressed through a few bold craft marks and symbols",
      compositionNotes: [
        "Make construction joints and material thickness visually understandable.",
        "Use repeated folk motifs to unify the design without filling every surface.",
      ],
    },
  },
  {
    id: "neon-relic",
    title: "Neon Relic",
    imageUrl: "/references/neon-relic.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#11131f", "#2e3152", "#7b3fa1", "#e64691", "#48d7d2"],
    traits: [
      "ancient-tech contrast",
      "sharp emissive accents",
      "graphic dark masses",
    ],
    description:
      "A bold magitech direction pairing monumental relic forms with sparse cyan and magenta energy systems.",
    styleHints: {
      lineStyle:
        "Crisp geometric contours interrupted by thin luminous circuit seams",
      lighting:
        "Low ambient exposure driven by cyan and magenta emissive edge light",
      materials: ["obsidian", "anodized metal", "holographic glass", "energy plasma"],
      shapeLanguage:
        "Heavy monolithic masses cut by narrow channels and precise angular notches",
      detailLevel:
        "Medium detail with dense information limited to illuminated technology zones",
      compositionNotes: [
        "Keep most of the silhouette dark and use emission to explain function.",
        "Concentrate thin technical detail around one dominant ancient form.",
      ],
    },
  },
  {
    id: "paper-dungeon",
    title: "Paper Dungeon",
    imageUrl: "/references/paper-dungeon.webp",
    sourceName: LOCAL_REFERENCE_SOURCE,
    license: LOCAL_REFERENCE_LICENSE,
    palette: ["#302a27", "#6b5040", "#a87955", "#d1ae7d", "#eee0ba"],
    traits: [
      "cut-paper layers",
      "tabletop staging",
      "readable flat shapes",
    ],
    description:
      "Playful dungeon art assembled from paper-like layers, strong flat shapes, and tactile tabletop shadows.",
    styleHints: {
      lineStyle:
        "Scissor-cut edges with occasional printed ink marks and no smooth vector perfection",
      lighting:
        "Soft overhead tabletop light producing shallow shadows between paper layers",
      materials: ["dyed paper", "cardboard", "printed ink", "wooden token"],
      shapeLanguage:
        "Stacked flat silhouettes with simple tabs, arches, and chunky geometric cutouts",
      detailLevel:
        "Low-to-medium detail optimized for instant recognition and layer separation",
      compositionNotes: [
        "Build depth through overlapping planes rather than modeled volume.",
        "Preserve a clear margin around every important cut-paper silhouette.",
      ],
    },
  },
];
