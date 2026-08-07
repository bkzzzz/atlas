import "server-only";
import {
  BlobNotFoundError,
  del,
  get,
  put,
} from "@vercel/blob";
import {
  createImageStorage,
  type ImageToStore,
  type StoredReference,
} from "@/lib/image-storage-core";
import { verifyRuntimeEnvironment } from "@/lib/local-environment-safety";

verifyRuntimeEnvironment();

const storage = createImageStorage({
  token: process.env.BLOB_READ_WRITE_TOKEN,
  putBlob: async (pathname, bytes, options) =>
    put(pathname, Buffer.from(bytes), options),
  getBlob: async (pathname, options) => {
    const result = await get(pathname, options);
    if (!result || result.statusCode !== 200) return null;
    return result;
  },
  deleteBlob: del,
  isNotFoundError: (error) => error instanceof BlobNotFoundError,
});

export function putReferenceImage(input: ImageToStore) {
  return storage.putReferenceImage(input);
}

export function getReferenceImageBytes(reference: StoredReference) {
  return storage.getReferenceImageBytes(reference);
}

export function deleteReferenceImage(pathname: string) {
  return storage.deleteReferenceImage(pathname);
}

export function putGeneratedImage(input: ImageToStore) {
  return storage.putGeneratedImage(input);
}

export function deleteGeneratedImage(pathname: string) {
  return storage.deleteGeneratedImage(pathname);
}
