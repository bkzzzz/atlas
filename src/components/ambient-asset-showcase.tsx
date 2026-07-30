import Image from "next/image";
import {
  DEMO_SHOWCASE_ARCHIVE,
  DEMO_SHOWCASE_BANDS,
} from "@/lib/demo-showcase-assets";
import { useLanguage } from "@/components/language-provider";

export function AmbientAssetShowcase() {
  const { t } = useLanguage();

  return (
    <div aria-hidden="true" className="atlas-showcase">
      {DEMO_SHOWCASE_BANDS.map((assets, bandIndex) => (
        <div
          className={`atlas-showcase__band atlas-showcase__band--${bandIndex + 1}`}
          key={bandIndex}
        >
          <div
            className={`atlas-showcase__track ${
              bandIndex % 2 ? "atlas-showcase__track--reverse" : ""
            }`}
          >
            {[...assets, ...assets].map((asset, assetIndex) => (
              <figure
                className={`atlas-showcase__asset atlas-showcase__asset--scale-${
                  (assetIndex + bandIndex) % 3
                }`}
                key={`${bandIndex}-${asset.src}-${assetIndex}`}
              >
                <div className="atlas-showcase__image">
                  <ShowcaseImage asset={asset} sizes="265px" />
                </div>
                <figcaption>{asset.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
      <div className="atlas-showcase__archive">
        <div className="atlas-showcase__archive-heading">
          <span>{t("archive.title")}</span>
          <span>{t("archive.notes")}</span>
        </div>
        {DEMO_SHOWCASE_ARCHIVE.map((asset, assetIndex) => (
          <figure
            className="atlas-showcase__archive-item"
            key={asset.src}
          >
            <ShowcaseImage asset={asset} sizes="220px" />
            <figcaption>
              <span>{String(assetIndex + 1).padStart(2, "0")}</span>
              {asset.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function ShowcaseImage({
  asset,
  sizes,
}: {
  asset: (typeof DEMO_SHOWCASE_ARCHIVE)[number];
  sizes: string;
}) {
  return (
    <Image
      alt=""
      className={asset.pixelated ? "atlas-showcase__pixel-art" : ""}
      height={asset.height}
      sizes={sizes}
      src={asset.src}
      width={asset.width}
    />
  );
}
