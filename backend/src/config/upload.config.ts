export const RAFFLE_IMAGE_BUCKET = 'raffle-images';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_UPLOAD_IMAGE_WIDTH = 8000;
export const MAX_UPLOAD_IMAGE_HEIGHT = 8000;
export const MAX_UPLOAD_IMAGE_PIXELS =
  MAX_UPLOAD_IMAGE_WIDTH * MAX_UPLOAD_IMAGE_HEIGHT;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
