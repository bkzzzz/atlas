import { createReferenceRetrievalHandler } from "@/lib/reference-retrieval-handler";
import {
  embedReferenceQuery,
  loadReferenceFamilyIndex,
  loadReferenceIndexes,
} from "@/lib/reference-index-server";

export const POST = createReferenceRetrievalHandler({
  loadIndexes: loadReferenceIndexes,
  loadFamilyIndex: loadReferenceFamilyIndex,
  embedQuery: embedReferenceQuery,
});
