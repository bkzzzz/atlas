import type { StoredImage } from "@/lib/image-storage-core";
import type { GeneratedImage } from "@/lib/image-generation-core";

type PutGeneratedImage = (input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}) => Promise<StoredImage>;

export async function persistGeneratedImage(
  image: GeneratedImage,
  putGeneratedImage: PutGeneratedImage,
): Promise<GeneratedImage> {
  const match = /^data:(image\/png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    image.imageUrl,
  );
  if (!match?.[1] || !match[2]) {
    throw new Error("Generated image payload is invalid.");
  }
  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  if (!bytes.byteLength) {
    throw new Error("Generated image payload is empty.");
  }
  const stored = await putGeneratedImage({
    bytes,
    filename: "generated.png",
    mimeType: match[1],
  });
  return {
    ...image,
    imageUrl: stored.url,
    blobPathname: stored.pathname,
    mimeType: stored.mimeType,
    byteSize: stored.byteSize,
  };
}
