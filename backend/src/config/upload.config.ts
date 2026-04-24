export const RAFFLE_IMAGE_BUCKET = 'raffle-images';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

