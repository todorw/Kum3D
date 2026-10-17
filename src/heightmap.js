const MIN_RANGE = 0.25;
const EDGE_RINGS = 2;

function blurPass(from, to, cols, rows, radius, horizontal) {
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  for (let l = 0; l < lines; l++) {
    const at = (k) => (horizontal ? l * cols + k : k * cols + l);
    for (let k = 0; k < len; k++) {
      let sum = 0;
      for (let j = Math.max(0, k - radius); j <= Math.min(len - 1, k + radius); j++) sum += from[at(j)];
      to[at(k)] = sum;
    }
  }
}

function maskedBlur(values, mask, cols, rows, radius) {
  const n = values.length;
  const weighted = new Float32Array(n);
  const weights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    weighted[i] = values[i] * mask[i];
    weights[i] = mask[i];
  }
  const tmp = new Float32Array(n);
  blurPass(weighted, tmp, cols, rows, radius, true);
  blurPass(tmp, weighted, cols, rows, radius, false);
  blurPass(weights, tmp, cols, rows, radius, true);
  blurPass(tmp, weights, cols, rows, radius, false);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = mask[i] ? weighted[i] / weights[i] : values[i];
  return out;
}

function insetDistance(mask, cols, rows) {
  const dist = new Int32Array(mask.length);
  const get = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? 0 : dist[r * cols + c]);
  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? cols + rows : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (dist[i]) dist[i] = Math.min(dist[i], get(r - 1, c - 1) + 1, get(r - 1, c) + 1, get(r - 1, c + 1) + 1, get(r, c - 1) + 1);
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (dist[i]) dist[i] = Math.min(dist[i], get(r + 1, c + 1) + 1, get(r + 1, c) + 1, get(r + 1, c - 1) + 1, get(r, c + 1) + 1);
    }
  }
  return dist;
}

function settleEdges(luma, mask, cols, rows) {
  const dist = insetDistance(mask, cols, rows);
  const out = Float32Array.from(luma);
  for (let ring = EDGE_RINGS; ring >= 1; ring--) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (dist[i] !== ring) continue;
        let sum = 0;
        let n = 0;
        for (let nr = Math.max(0, r - 1); nr <= Math.min(rows - 1, r + 1); nr++) {
          for (let nc = Math.max(0, c - 1); nc <= Math.min(cols - 1, c + 1); nc++) {
            const j = nr * cols + nc;
            if (dist[j] <= ring) continue;
            sum += out[j];
            n++;
          }
        }
        if (n) out[i] = sum / n;
      }
    }
  }
  return out;
}

function lumaRange(luma, mask) {
  const bins = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < luma.length; i++) {
    if (!mask[i]) continue;
    bins[Math.round(luma[i] * 255)]++;
    total++;
  }
  const percentile = (p) => {
    let seen = 0;
    for (let b = 0; b < 256; b++) {
      seen += bins[b];
      if (seen >= total * p) return b / 255;
    }
    return 1;
  };
  const lo = percentile(0.02);
  const hi = percentile(0.98);
  const mid = (lo + hi) / 2;
  const half = Math.max(hi - lo, MIN_RANGE) / 2;
  return [mid - half, half * 2];
}

export function buildHeightmap({ cols, rows, luma: raw }, mask, { invert, contrast, smoothing, border }) {
  const luma = settleEdges(raw, mask, cols, rows);
  const [min, range] = lumaRange(luma, mask);
  let values = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i++) {
    const v = Math.min(1, Math.max(0, ((luma[i] - min) / range - 0.5) * contrast + 0.5));
    values[i] = invert ? 1 - v : v;
  }
  if (smoothing > 0) values = maskedBlur(values, mask, cols, rows, smoothing);
  if (border > 0) {
    const dist = insetDistance(mask, cols, rows);
    for (let i = 0; i < values.length; i++) {
      if (mask[i] && dist[i] <= border) values[i] = 1;
    }
  }
  return values;
}
