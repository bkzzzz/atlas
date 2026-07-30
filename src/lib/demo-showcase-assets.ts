export type DemoShowcaseAsset = {
  src: string;
  label: string;
  width: number;
  height: number;
  pixelated?: boolean;
};

// Curated local-only assets approved for the ambient product showcase.
// Keeping the list isolated makes additions intentional and prevents remote
// image URLs from becoming background dependencies.
const MOSSBOUND_PIXEL = {
  src: "/references/mossbound-pixel.webp",
  label: "Mossbound Pixel",
  width: 640,
  height: 420,
  pixelated: true,
} as const;

const SUNFORGE_TACTICS = {
  src: "/references/sunforge-tactics.webp",
  label: "Sunforge Tactics",
  width: 640,
  height: 420,
} as const;

const IRONWOOD_FOLK = {
  src: "/references/ironwood-folk.webp",
  label: "Ironwood Folk",
  width: 640,
  height: 420,
} as const;

const HEARTHLIGHT_STORYBOOK = {
  src: "/references/hearthlight-storybook.webp",
  label: "Hearthlight Storybook",
  width: 640,
  height: 420,
} as const;

const PAPER_DUNGEON = {
  src: "/references/paper-dungeon.webp",
  label: "Paper Dungeon",
  width: 640,
  height: 420,
} as const;

const MOONLIT_INK = {
  src: "/references/moonlit-ink.webp",
  label: "Moonlit Ink",
  width: 640,
  height: 420,
} as const;

export const DEMO_SHOWCASE_BANDS: readonly (readonly DemoShowcaseAsset[])[] = [
  [MOSSBOUND_PIXEL, SUNFORGE_TACTICS, IRONWOOD_FOLK],
  [HEARTHLIGHT_STORYBOOK, PAPER_DUNGEON, MOONLIT_INK],
  [IRONWOOD_FOLK, MOONLIT_INK, MOSSBOUND_PIXEL],
  [PAPER_DUNGEON, SUNFORGE_TACTICS, HEARTHLIGHT_STORYBOOK],
] as const;

export const DEMO_SHOWCASE_ARCHIVE: readonly DemoShowcaseAsset[] = [
  MOONLIT_INK,
  MOSSBOUND_PIXEL,
  SUNFORGE_TACTICS,
  HEARTHLIGHT_STORYBOOK,
  IRONWOOD_FOLK,
  PAPER_DUNGEON,
] as const;
