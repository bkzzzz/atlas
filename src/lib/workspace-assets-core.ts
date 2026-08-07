export const WORKSPACE_ASSET_LIMIT = 24;

export type WorkspaceAsset = Readonly<{
  id: string;
  name: string;
  imageUrl: string;
  mimeType: string | null;
  byteSize: number | null;
  type: string;
  model: string | null;
  createdAt: Date;
  character: Readonly<{ name: string }>;
}>;

type WorkspaceAssetReaderDependencies = Readonly<{
  findAssets: (
    anonymousOwnerKey: string,
    limit: number,
  ) => Promise<WorkspaceAsset[]>;
}>;

export function createWorkspaceAssetReader(
  dependencies: WorkspaceAssetReaderDependencies,
) {
  return function listGeneratedWorkspaceAssets(anonymousOwnerKey: string) {
    if (!anonymousOwnerKey) return Promise.resolve([]);
    return dependencies.findAssets(
      anonymousOwnerKey,
      WORKSPACE_ASSET_LIMIT,
    );
  };
}
