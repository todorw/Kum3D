export function sampleImage(image, resolution, region = { x: 0, y: 0, w: image.width, h: image.height }) {
  const scale = resolution / Math.max(region.w, region.h);
  const cols = Math.max(2, Math.round(region.w * scale));
  const rows = Math.max(2, Math.round(region.h * scale));
  const canvas = new OffscreenCanvas(cols, rows);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const luma = new Float32Array(cols * rows);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  return { cols, rows, data, luma, region, scale };
}
