import { findAxis } from './mask.js';
import { maskedBlur } from './heightmap.js';

const MIN_RADIUS = 1;
const MIN_HOLE = 0.4;
const MAX_TILT = 45;

export function extractProfile(mask, cols, rows) {
  const axis = findAxis(mask, cols, rows) ?? 0;
  const ac = Math.min(cols - 1, Math.floor(axis));
  const radii = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    if (!mask[row + ac]) continue;
    let left = ac;
    let right = ac;
    while (left > 0 && mask[row + left - 1]) left--;
    while (right < cols - 1 && mask[row + right + 1]) right++;
    radii[r] = (right - left + 1) / 2;
  }
  return { radii, axis };
}

function despeckle(values, radius) {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - radius), i + radius + 1).sort((a, b) => a - b);
    return window[window.length >> 1];
  });
}

function smooth(values, radius) {
  if (radius <= 0) return values;
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

function trimmed(radii, clean = true) {
  const first = radii.findIndex((r) => r > 0);
  const last = radii.findLastIndex((r) => r > 0);
  if (first < 0 || last - first < 1) return null;
  const values = Array.from(radii.slice(first, last + 1));
  return { first, values: clean ? despeckle(values, 3) : values };
}

function capHeight(edge) {
  const limit = Math.min(edge.length - 1, Math.round(edge.length * 0.25));
  let best = { height: 0, error: Infinity };
  for (let h = 2; h <= limit; h++) {
    const radius = edge[h];
    if (h > radius * Math.sin((MAX_TILT * Math.PI) / 180)) break;
    let error = 0;
    for (let y = 0; y < h; y++) {
      const t = 1 - (y + 0.5) / h;
      error += (edge[y] - radius * Math.sqrt(1 - t * t)) ** 2;
    }
    error = Math.sqrt(error / h) / radius;
    if (error < best.error) best = { height: h, error, radius };
  }
  return best.error < 0.08 ? (Math.asin(best.height / best.radius) * 180) / Math.PI : 0;
}

export function estimateTilt(radii) {
  const profile = trimmed(radii, false);
  if (!profile) return 0;
  const top = capHeight(profile.values);
  const bottom = capHeight([...profile.values].reverse());
  if (top < 4 || bottom < 4) return 0;
  if (Math.abs(top - bottom) > Math.max(top, bottom) * 0.35) return 0;
  return Math.round(Math.min(top, bottom));
}

export function opensWide(radii) {
  const profile = trimmed(radii);
  if (!profile) return true;
  const values = smooth(profile.values, 2);
  const mouth = Math.max(...values.slice(0, Math.max(1, Math.round(values.length * 0.05))));
  return mouth >= Math.max(...values) * 0.45;
}

function erode(profile, dz, wall, from) {
  const reach = Math.floor(wall / dz);
  const inner = [];
  for (let m = from; m < profile.length; m++) {
    let best = Infinity;
    for (let l = Math.max(0, m - reach); l <= Math.min(profile.length - 1, m + reach); l++) {
      const offset = (l - m) * dz;
      best = Math.min(best, profile[l] - Math.sqrt(Math.max(0, wall * wall - offset * offset)));
    }
    inner.push(Math.max(best, MIN_HOLE));
  }
  return inner;
}

function detailField({ luma, mask, cols, rows }, width) {
  const blurred = maskedBlur(luma, mask, cols, rows, Math.max(2, Math.round(width * 0.08)));
  const field = new Float32Array(luma.length);
  const magnitudes = [];
  for (let i = 0; i < luma.length; i++) {
    if (!mask[i]) continue;
    field[i] = luma[i] - blurred[i];
    magnitudes.push(Math.abs(field[i]));
  }
  magnitudes.sort((a, b) => a - b);
  const scale = magnitudes[Math.floor(magnitudes.length * 0.98)] || 1;
  for (let i = 0; i < field.length; i++) field[i] = Math.max(-1, Math.min(1, field[i] / scale));
  return field;
}

export function buildRevolve({ radii, axis }, options, surface = null) {
  const { size, smoothing, hollow, wall, floor, tilt = 0, detail = 0, invert = false } = options;
  const profile = trimmed(radii);
  if (!profile) return null;

  const angle = (Math.min(MAX_TILT, Math.max(0, tilt)) * Math.PI) / 180;
  let values = smooth(smooth(profile.values, smoothing), smoothing);
  let first = profile.first;
  if (angle > 0) {
    const peak = Math.max(...values);
    const span = Math.ceil(peak * Math.sin(angle)) + 1;
    const cut = (edge) => Math.round(Math.max(...edge.slice(0, span)) * Math.sin(angle));
    const top = cut(values);
    const bottom = cut([...values].reverse());
    if (values.length - top - bottom >= 2) {
      values = values.slice(top, values.length - bottom);
      first += top;
    }
  }

  const stretch = 1 / Math.cos(angle);
  const peak = Math.max(...values);
  const step = size / Math.max(values.length * stretch, peak * 2);
  const ringRows = values.map((_, i) => first + values.length - 1 - i);
  const profileMm = values.map((r) => Math.max(r * step, MIN_RADIUS)).reverse();
  const n = profileMm.length;
  const height = n * step * stretch;
  const dz = height / (n - 1);
  const depth = surface ? Math.max(0, detail) : 0;
  const floorRing = Math.ceil(floor / dz);
  const inner = hollow && n - floorRing >= 2 ? erode(profileMm, dz, wall + depth, floorRing) : null;

  const S = depth > 0 ? Math.min(360, Math.max(128, Math.round(Math.PI * peak))) : 128;
  const cos = Array.from({ length: S }, (_, j) => Math.cos((j / S) * Math.PI * 2));
  const sin = Array.from({ length: S }, (_, j) => Math.sin((j / S) * Math.PI * 2));
  const field = depth > 0 ? detailField(surface, peak * 2) : null;
  const fade = Math.max(2, Math.round(n * 0.03));
  const offset = (i, j) => {
    if (!field) return 0;
    const row = ringRows[i];
    const col = Math.round(axis + values[values.length - 1 - i] * cos[j] - 0.5);
    if (row < 0 || row >= surface.rows || col < 0 || col >= surface.cols) return 0;
    const edge = Math.min(1, i / fade, (n - 1 - i) / fade);
    return field[row * surface.cols + col] * Math.abs(sin[j]) * edge * depth * (invert ? -1 : 1);
  };

  const ringTotal = n + (inner ? inner.length : 0);
  const positions = new Float32Array((ringTotal * S + 2) * 3);
  let v = 0;
  const point = (x, y, z) => {
    positions.set([x, y, z], v * 3);
    return v++;
  };
  const ring = (r, z, shift) => {
    const start = v;
    for (let j = 0; j < S; j++) {
      const radius = Math.max(MIN_RADIUS * 0.5, r + shift(j));
      point(radius * cos[j], radius * sin[j], z);
    }
    return start;
  };

  const outer = profileMm.map((r, i) => ring(r, i * dz, (j) => offset(i, j)));
  const holes = inner ? inner.map((r, m) => ring(r, (floorRing + m) * dz, () => 0)) : [];
  const bottom = point(0, 0, 0);
  const cap = point(0, 0, inner ? floorRing * dz : (n - 1) * dz);

  const triangles = (n - 1) * S * 2 + S + (inner ? (holes.length - 1) * S * 2 + S * 3 : S);
  const indices = new Uint32Array(triangles * 3);
  let k = 0;
  const tri = (a, b, c) => {
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = c;
  };
  const at = (start, j) => start + (j % S);

  for (let j = 0; j < S; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = at(outer[i], j);
      const b = at(outer[i], j + 1);
      const c = at(outer[i + 1], j + 1);
      const d = at(outer[i + 1], j);
      tri(a, b, c);
      tri(a, c, d);
    }
    tri(bottom, at(outer[0], j + 1), at(outer[0], j));
    const top = outer[n - 1];
    if (!inner) {
      tri(cap, at(top, j), at(top, j + 1));
      continue;
    }
    for (let m = 0; m < holes.length - 1; m++) {
      const a = at(holes[m], j);
      const b = at(holes[m], j + 1);
      const c = at(holes[m + 1], j + 1);
      const d = at(holes[m + 1], j);
      tri(a, c, b);
      tri(a, d, c);
    }
    tri(cap, at(holes[0], j), at(holes[0], j + 1));
    const lip = holes[holes.length - 1];
    tri(at(top, j), at(top, j + 1), at(lip, j + 1));
    tri(at(top, j), at(lip, j + 1), at(lip, j));
  }

  const diameter = Math.max(...profileMm) * 2;
  return { positions, indices, size: [diameter, diameter, height] };
}
