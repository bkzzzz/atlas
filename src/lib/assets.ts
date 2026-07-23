// These types represent the JSON returned by the asset Route Handlers.
// They are safe to share with Client Components because they contain no Prisma code.
export const ASSET_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type ImageAsset = {
  id: string;
  characterId: string;
  name: string;
  imageUrl: string;
  type: string;
  provider: string;
  status: AssetStatus;
  prompt: string | null;
  feedback: string | null;
  createdAt: string;
};

export type CreateImageAssetInput = Pick<
  ImageAsset,
  "name" | "imageUrl" | "type" | "provider" | "status"
>;

export type UpdateImageAssetInput = Pick<
  ImageAsset,
  "name" | "type" | "provider" | "prompt" | "feedback"
>;
