// File preview utilities — image detection and MIME types

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

const MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

export function isImageFile(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function getImageMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}
