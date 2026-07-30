import Image from "next/image";
import { DEMO_SHOWCASE_TRACKS } from "@/lib/demo-showcase-assets";

export function AmbientAssetShowcase() {
  return (
    <div aria-hidden="true" className="atlas-showcase">
      {DEMO_SHOWCASE_TRACKS.map((assets, trackIndex) => (
        <div
          className={`atlas-showcase__track ${
            trackIndex % 2 ? "atlas-showcase__track--reverse" : ""
          }`}
          key={trackIndex}
        >
          {[...assets, ...assets].map((asset, assetIndex) => (
            <figure className="atlas-showcase__asset" key={`${asset.src}-${assetIndex}`}>
              <div className="atlas-showcase__image">
                <Image
                  alt=""
                  className={asset.pixelated ? "atlas-showcase__pixel-art" : ""}
                  height={asset.height}
                  sizes="112px"
                  src={asset.src}
                  unoptimized
                  width={asset.width}
                />
              </div>
              <figcaption>{asset.label}</figcaption>
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}
