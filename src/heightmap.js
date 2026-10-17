export function sampleImage(image, resolution) {
  const scale = resolution / Math.max(image.width, image.height);
  const cols = Math.max(2, Math.round(image.width * scale));
  const rows = Math.max(2, Math.round(image.height * scale));
  const canvas = new OffscreenCanvas(cols, rows);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, cols, rows);
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const luma = new Float32Array(cols * rows);
  const alpha = new Float32Array(cols * rows);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
    alpha[i] = data[p + 3] / 255;
  }
  return { cols, rows, luma, alpha };
}

function boxBlur(src, cols, rows, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const pass = (from, to, horizontal) => {
    const len = horizontal ? cols : rows;
    const lines = horizontal ? rows : cols;
    for (let l = 0; l < lines; l++) {
      const at = (k) => (horizontal ? l * cols + k : k * cols + l);
      for (let k = 0; k < len; k++) {
        let sum = 0;
        let count = 0;
        for (let o = -radius; o <= radius; o++) {
          const j = k + o;
          if (j < 0 || j >= len) continue;
          sum += from[at(j)];
          count++;
        }
        to[at(k)] = sum / count;
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

export function buildHeightmap(sample, { invert, contrast, smoothing, border }) {
  const { cols, rows, luma, alpha } = sample;
  let min = Infinity;
  let max = -Infinity;
  for (const v of luma) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  let values = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i++) {
    let v = (luma[i] - min) / range;
    v = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5));
    if (invert) v = 1 - v;
    values[i] = v * alpha[i];
  }
  if (smoothing > 0) values = boxBlur(values, cols, rows, smoothing);
  if (border > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < border || r < border || c >= cols - border || r >= rows - border) {
          values[r * cols + c] = 1;
        }
      }
    }
  }
  return { cols, rows, values };
}
