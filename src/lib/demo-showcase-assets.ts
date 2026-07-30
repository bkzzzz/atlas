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
export const DEMO_SHOWCASE_TRACKS: readonly (readonly DemoShowcaseAsset[])[] = [
  [
    {
      src: "/references/mossbound-pixel.webp",
      label: "Mossbound Pixel",
      width: 640,
      height: 420,
      pixelated: true,
    },
    {
      src: "/references/sunforge-tactics.webp",
      label: "Sunforge Tactics",
      width: 640,
      height: 420,
    },
    {
      src: "/references/ironwood-folk.webp",
      label: "Ironwood Folk",
      width: 640,
      height: 420,
    },
  ],
  [
    {
      src: "/references/hearthlight-storybook.webp",
      label: "Hearthlight Storybook",
      width: 640,
      height: 420,
    },
    {
      src: "/references/paper-dungeon.webp",
      label: "Paper Dungeon",
      width: 640,
      height: 420,
    },
    {
      src: "/references/moonlit-ink.webp",
      label: "Moonlit Ink",
      width: 640,
      height: 420,
    },
  ],
] as const;
