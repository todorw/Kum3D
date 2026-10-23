function draw(source, sx, sy, sw, sh, cols, rows) {
  const canvas = new OffscreenCanvas(cols, rows);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows);
  return ctx.getImageData(0, 0, cols, rows).data;
}

export function sampleImage(image, resolution, region = { x: 0, y: 0, w: image.width, h: image.height }, matte = null) {
  const scale = resolution / Math.max(region.w, region.h);
  const cols = Math.max(2, Math.round(region.w * scale));
  const rows = Math.max(2, Math.round(region.h * scale));
  const data = draw(image, region.x, region.y, region.w, region.h, cols, rows);
  const luma = new Float32Array(cols * rows);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  const sample = { cols, rows, data, luma, region, scale, matte: null };
  if (matte) {
    const kx = matte.width / image.width;
    const ky = matte.height / image.height;
    const alpha = draw(matte, region.x * kx, region.y * ky, region.w * kx, region.h * ky, cols, rows);
    sample.matte = Float32Array.from({ length: cols * rows }, (_, i) => alpha[i * 4 + 3] / 255);
  }
  return sample;
}
