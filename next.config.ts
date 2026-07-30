import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Kenney bundle and generated indexes are local prototype inputs, not
  // deployment artifacts. Runtime reads still work from the project root,
  // while output tracing cannot copy the ignored 88k-file source bundle.
  outputFileTracingExcludes: {
    "/api/generate-image": [
      "./data/reference-source/Kenney/**/*",
      "./data/reference-index/reference-families.json",
      "./data/reference-index/reference-embeddings.json",
    ],
    "/api/references/image": [
      "./data/reference-source/Kenney/**/*",
      "./data/reference-index/reference-families.json",
      "./data/reference-index/reference-embeddings.json",
    ],
    "/api/references/retrieve": [
      "./data/reference-index/reference-families.json",
      "./data/reference-index/reference-embeddings.json",
    ],
  },
};

export default nextConfig;
