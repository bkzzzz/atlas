import { createReferenceRetrievalHandler } from "@/lib/reference-retrieval-handler";
import {
  embedReferenceQuery,
  loadReferenceIndexes,
} from "@/lib/reference-index-server";
import { retrieveReferences } from "@/lib/reference-retrieval";

export const POST = createReferenceRetrievalHandler({
  loadIndexes: loadReferenceIndexes,
  embedQuery: embedReferenceQuery,
  keywordFallback: retrieveReferences,
});
