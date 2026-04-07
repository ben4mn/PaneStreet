// Tests for image/PDF preview detection

import { isImageFile, getImageMimeType } from '../file-preview-utils.js';

describe('image file detection', () => {
  it('detects png files', () => {
    expect(isImageFile('photo.png')).toBe(true);
  });

  it('detects jpg files', () => {
    expect(isImageFile('photo.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
  });

  it('detects gif files', () => {
    expect(isImageFile('anim.gif')).toBe(true);
  });

  it('detects svg files', () => {
    expect(isImageFile('icon.svg')).toBe(true);
  });

  it('detects webp files', () => {
    expect(isImageFile('image.webp')).toBe(true);
  });

  it('rejects non-image files', () => {
    expect(isImageFile('code.js')).toBe(false);
    expect(isImageFile('readme.md')).toBe(false);
    expect(isImageFile('data.json')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isImageFile('photo.PNG')).toBe(true);
    expect(isImageFile('photo.JPG')).toBe(true);
  });
});

describe('image MIME type', () => {
  it('returns correct MIME for png', () => {
    expect(getImageMimeType('file.png')).toBe('image/png');
  });

  it('returns correct MIME for jpg', () => {
    expect(getImageMimeType('file.jpg')).toBe('image/jpeg');
    expect(getImageMimeType('file.jpeg')).toBe('image/jpeg');
  });

  it('returns correct MIME for svg', () => {
    expect(getImageMimeType('file.svg')).toBe('image/svg+xml');
  });

  it('returns correct MIME for gif', () => {
    expect(getImageMimeType('file.gif')).toBe('image/gif');
  });

  it('returns correct MIME for webp', () => {
    expect(getImageMimeType('file.webp')).toBe('image/webp');
  });
});
