import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ANONYMOUS_ASSET_OWNER_COOKIE,
  anonymousAssetOwnerKeyFromToken,
} from "@/lib/anonymous-asset-owner";
import { listGeneratedWorkspaceAssets } from "@/lib/workspace-assets";

export const metadata: Metadata = {
  title: "Asset Workspace — Atlas.io",
  description: "Previously generated Atlas game assets.",
};

export default async function WorkspacePage() {
  const cookieStore = await cookies();
  const ownerKey = anonymousAssetOwnerKeyFromToken(
    cookieStore.get(ANONYMOUS_ASSET_OWNER_COOKIE)?.value,
  );
  const assets = ownerKey
    ? await listGeneratedWorkspaceAssets(ownerKey)
    : [];

  return (
    <main className="atlas-app atlas-workspace-page">
      <div className="atlas-workspace-page__shell">
        <header className="atlas-workspace-page__header">
          <div>
            <p className="atlas-eyebrow">Asset workspace</p>
            <h1>Generated assets</h1>
            <p>
              Images generated in this browser appear here after they are saved.
            </p>
          </div>
          <Link className="atlas-button atlas-button--quiet" href="/">
            Back to Atlas
          </Link>
        </header>

        {assets.length ? (
          <section
            aria-label="Generated assets"
            className="atlas-workspace-gallery"
          >
            {assets.map((asset) => (
              <article className="atlas-workspace-card" key={asset.id}>
                <div className="atlas-workspace-card__image">
                  <Image
                    alt={`${asset.name} for ${asset.character.name}`}
                    fill
                    sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                    src={asset.imageUrl}
                    unoptimized
                  />
                </div>
                <div className="atlas-workspace-card__body">
                  <h2>{asset.name}</h2>
                  <p>{asset.character.name} · {asset.type}</p>
                  <time dateTime={asset.createdAt.toISOString()}>
                    {asset.createdAt.toLocaleString("en-US")}
                  </time>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="atlas-workspace-empty">
            <h2>No generated assets yet</h2>
            <p>
              Generate an image on the Atlas homepage, then return here to find it.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
