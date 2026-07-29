"use client";

import { useId } from "react";
import styles from "./atlas-artwork.module.css";

export type ArtworkAsset = "CHARACTER" | "ITEM" | "ICON" | "ENVIRONMENT";
export type ArtworkStyle = "PIXEL_ART" | "FANTASY_2D" | "STORYBOOK";
export type ArtworkView = "FRONT" | "SIDE" | "ISOMETRIC" | "TOP_DOWN";

type AtlasArtworkProps = {
  assetType: ArtworkAsset;
  visualStyle: ArtworkStyle;
  viewAngle?: ArtworkView;
  className?: string;
  compact?: boolean;
};

const STYLE_CLASSES: Record<ArtworkStyle, string> = {
  PIXEL_ART: styles.pixel,
  FANTASY_2D: styles.fantasy,
  STORYBOOK: styles.storybook,
};

const VIEW_CLASSES: Record<ArtworkView, string> = {
  FRONT: styles.front,
  SIDE: styles.side,
  ISOMETRIC: styles.isometric,
  TOP_DOWN: styles.topDown,
};

export function AtlasArtwork({
  assetType,
  visualStyle,
  viewAngle = "FRONT",
  className = "",
  compact = false,
}: AtlasArtworkProps) {
  const id = useId().replaceAll(":", "");
  const primary = `${id}-primary`;
  const secondary = `${id}-secondary`;
  const glow = `${id}-glow`;

  return (
    <div
      aria-hidden="true"
      className={`${styles.frame} ${STYLE_CLASSES[visualStyle]} ${
        VIEW_CLASSES[viewAngle]
      } ${compact ? styles.compact : ""} ${className}`}
    >
      <svg className={styles.artwork} fill="none" viewBox="0 0 320 320">
        <defs>
          <linearGradient id={primary} x1="76" x2="247" y1="64" y2="278">
            <stop stopColor="var(--art-primary-light)" />
            <stop offset="1" stopColor="var(--art-primary)" />
          </linearGradient>
          <linearGradient id={secondary} x1="101" x2="233" y1="80" y2="272">
            <stop stopColor="var(--art-secondary-light)" />
            <stop offset="1" stopColor="var(--art-secondary)" />
          </linearGradient>
          <radialGradient id={glow}>
            <stop stopColor="var(--art-glow)" stopOpacity=".95" />
            <stop offset=".55" stopColor="var(--art-glow)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--art-glow)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse
          className={styles.groundGlow}
          cx="160"
          cy="263"
          fill={`url(#${glow})`}
          rx="112"
          ry="38"
        />

        <g className={styles.viewTransform}>
          {assetType === "CHARACTER" && (
            <CharacterArtwork
              glow={glow}
              primary={primary}
              secondary={secondary}
            />
          )}
          {assetType === "ITEM" && (
            <ItemArtwork glow={glow} primary={primary} secondary={secondary} />
          )}
          {assetType === "ICON" && (
            <IconArtwork glow={glow} primary={primary} secondary={secondary} />
          )}
          {assetType === "ENVIRONMENT" && (
            <EnvironmentArtwork
              glow={glow}
              primary={primary}
              secondary={secondary}
            />
          )}
        </g>
      </svg>
    </div>
  );
}

function CharacterArtwork({
  primary,
  secondary,
  glow,
}: {
  primary: string;
  secondary: string;
  glow: string;
}) {
  return (
    <>
      <ellipse className={styles.shadow} cx="158" cy="269" rx="70" ry="14" />
      <path
        className={styles.backShape}
        d="M116 134c-21 28-29 83-20 125 22 17 104 17 127-1 4-50-4-97-27-124-19-19-61-19-80 0Z"
        fill={`url(#${secondary})`}
      />
      <path
        className={styles.cloakFold}
        d="M118 145c-14 34-16 80-10 115m39-112-15 118m51-115 13 108"
      />
      <path
        className={styles.bodyShape}
        d="M133 139c-12 24-15 68-8 103 16 9 51 9 70-1 4-39-2-78-13-102-13-11-36-11-49 0Z"
        fill={`url(#${primary})`}
      />
      <path
        className={styles.belt}
        d="M124 190c22 8 50 8 70 0l2 17c-24 8-50 8-74 0l2-17Z"
      />
      <path
        className={styles.boot}
        d="m128 236-7 28c7 7 21 8 30 3l1-31h-24Zm42 0 3 31c9 5 23 3 29-4l-8-27h-24Z"
      />
      <path
        className={styles.arm}
        d="M131 153c-21 8-31 27-33 55l18 6c8-22 17-35 29-42l-14-19Zm52 1c18 7 28 22 34 45l-17 9c-10-20-18-29-30-35l13-19Z"
        fill={`url(#${primary})`}
      />
      <path
        className={styles.face}
        d="M132 87c2-24 18-38 35-38 22 0 37 18 35 43-2 25-15 43-36 43-20 0-37-21-34-48Z"
      />
      <path
        className={styles.hair}
        d="M130 91c-5-27 11-50 39-50 25 0 42 20 35 51l-11-14-5 22-12-24-15 19-10-18-21 14Z"
        fill={`url(#${secondary})`}
      />
      <path className={styles.eye} d="M149 104h8m19 0h8" />
      <path
        className={styles.scarf}
        d="M129 127c19 14 52 15 75-1l-11 28c-18 9-43 8-58-2l-6-25Z"
      />
      <path className={styles.staff} d="m222 68 10 201" />
      <path
        className={styles.crystal}
        d="m221 37 19 24-15 27-23-20 19-31Z"
        fill={`url(#${primary})`}
      />
      <circle cx="221" cy="62" fill={`url(#${glow})`} r="42" />
      <g className={styles.pixelDetails}>
        <path d="M103 158h13v13h-13zm20-28h12v12h-12zm57 15h13v12h-13zm-47 77h12v12h-12zm42-12h13v13h-13z" />
      </g>
      <g className={styles.paintDetails}>
        <path d="M146 163c10 8 29 8 40-1m-50 58c14 7 37 7 54-1" />
        <path d="m211 52 11-15 2 20 16 4-15 5-4 18-3-17-16-3 15-5-6-7Z" />
      </g>
    </>
  );
}

function ItemArtwork({
  primary,
  secondary,
  glow,
}: {
  primary: string;
  secondary: string;
  glow: string;
}) {
  return (
    <>
      <ellipse className={styles.shadow} cx="160" cy="268" rx="64" ry="13" />
      <circle cx="166" cy="161" fill={`url(#${glow})`} r="104" />
      <path
        className={styles.itemOutline}
        d="M155 42h22l3 39-13 15-14-15 2-39Z"
        fill={`url(#${secondary})`}
      />
      <path
        className={styles.blade}
        d="m167 62 48 120-50 47-48-47 50-120Z"
        fill={`url(#${primary})`}
      />
      <path className={styles.bladeLine} d="m167 76-2 139m2-139 34 104-36 35" />
      <path
        className={styles.guard}
        d="m106 204 59 23 61-25 10 16-61 31-76-27 7-18Z"
        fill={`url(#${secondary})`}
      />
      <path
        className={styles.handle}
        d="m155 240 22-1 4 42-31 1 5-42Z"
        fill={`url(#${primary})`}
      />
      <path className={styles.itemOutline} d="m145 279 42-1-6 17h-32l-4-16Z" />
      <g className={styles.pixelDetails}>
        <path d="M128 151h14v14h-14zm58 18h14v14h-14zm-26-76h13v13h-13z" />
      </g>
      <g className={styles.paintDetails}>
        <path d="m138 156 28-63 29 74-29 34-28-45Z" />
        <path d="m164 114 7 17 17 7-17 7-7 18-7-18-17-7 17-7 7-17Z" />
      </g>
    </>
  );
}

function IconArtwork({
  primary,
  secondary,
  glow,
}: {
  primary: string;
  secondary: string;
  glow: string;
}) {
  return (
    <>
      <circle cx="160" cy="158" fill={`url(#${glow})`} r="125" />
      <path
        className={styles.iconBack}
        d="m160 38 102 48-10 118-92 79-92-79L58 86l102-48Z"
        fill={`url(#${secondary})`}
      />
      <path
        className={styles.iconFace}
        d="m160 64 76 36-8 91-68 63-68-63-8-91 76-36Z"
        fill={`url(#${primary})`}
      />
      <path className={styles.iconInset} d="m160 87 52 25-6 68-46 45-46-45-6-68 52-25Z" />
      <path
        className={styles.iconMark}
        d="m161 99 18 39 43 6-31 30 8 43-38-20-39 20 8-43-31-30 43-6 19-39Z"
      />
      <circle className={styles.iconCore} cx="160" cy="157" r="25" />
      <g className={styles.pixelDetails}>
        <path d="M77 89h18v18H77zm148 0h18v18h-18zM91 198h17v17H91zm122 0h17v17h-17z" />
      </g>
      <g className={styles.paintDetails}>
        <path d="M160 52v31M73 96l31 15m143-15-31 15M82 205l28-20m128 20-28-20" />
      </g>
    </>
  );
}

function EnvironmentArtwork({
  primary,
  secondary,
  glow,
}: {
  primary: string;
  secondary: string;
  glow: string;
}) {
  return (
    <>
      <ellipse className={styles.shadow} cx="160" cy="272" rx="110" ry="17" />
      <path
        className={styles.islandBack}
        d="M45 200 160 113l116 83-116 83L45 200Z"
        fill={`url(#${secondary})`}
      />
      <path className={styles.islandEdge} d="m45 200 115 83 116-87v27l-115 71-116-68v-26Z" />
      <path
        className={styles.islandTop}
        d="M67 194 160 124l94 68-94 68-93-66Z"
        fill={`url(#${primary})`}
      />
      <path
        className={styles.tower}
        d="M132 90h57l-4 116-25 18-25-18-3-116Z"
        fill={`url(#${secondary})`}
      />
      <path className={styles.roof} d="m124 96 36-62 38 62h-74Z" fill={`url(#${primary})`} />
      <path className={styles.door} d="M148 166c0-20 25-20 25 0v43l-13 9-12-9v-43Z" />
      <path className={styles.window} d="M148 111h24v29h-24z" />
      <path
        className={styles.path}
        d="m148 213 24 1 39 21-50 25-50-36 37-11Z"
      />
      <circle cx="110" cy="172" fill={`url(#${glow})`} r="42" />
      <path className={styles.tree} d="m108 122 35 58h-70l35-58Zm0 27 44 55H64l44-55Z" />
      <path className={styles.trunk} d="M101 198h14v27h-14z" />
      <g className={styles.pixelDetails}>
        <path d="M79 178h15v15H79zm139 15h15v15h-15zM151 70h17v17h-17z" />
      </g>
      <g className={styles.paintDetails}>
        <path d="M77 190c26 9 50 6 69-7m32 38c19-10 39-16 59-17" />
        <path d="m216 151 9 18 19 3-14 13 4 20-18-10-18 10 4-20-14-13 19-3 9-18Z" />
      </g>
    </>
  );
}
