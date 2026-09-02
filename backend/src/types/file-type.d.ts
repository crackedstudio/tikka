declare module "file-type" {
  export function fromBuffer(
    buffer: Uint8Array,
  ): Promise<{ mime: string; ext: string } | undefined>;
}
