export type DetectedFileType = {
  ext: string;
  mime: string;
};

/**
 * Detect MIME type from a buffer using the ESM-only `file-type` package.
 * Wrapped so Nest's CommonJS build does not need Node16 module resolution.
 */
export async function detectFileTypeFromBuffer(
  buffer: Uint8Array | ArrayBuffer,
): Promise<DetectedFileType | undefined> {
  const { fileTypeFromBuffer } = (await (0, eval)('import("file-type")')) as {
    fileTypeFromBuffer: (
      data: Uint8Array | ArrayBuffer,
    ) => Promise<DetectedFileType | undefined>;
  };
  return fileTypeFromBuffer(buffer);
}
