const SEGMENTS = 128;
const MIN_RADIUS = 1;
const MIN_HOLE = 0.4;

export function extractProfile(mask, cols, rows) {
  const mids = [];
  for (let r = 0; r < rows; r++) {
    let best = 0;
    let mid = -1;
    for (let c = 0; c < cols; ) {
      if (!mask[r * cols + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < cols && mask[r * cols + c]) c++;
      if (c - start > best) {
        best = c - start;
        mid = (start + c) / 2;
      }
    }
    if (mid >= 0) mids.push(mid);
  }
  mids.sort((a, b) => a - b);
  const axis = Math.min(cols - 1, Math.floor(mids[mids.length >> 1] ?? 0));

  const radii = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    if (!mask[row + axis]) continue;
    let left = axis;
    let right = axis;
    while (left > 0 && mask[row + left - 1]) left--;
    while (right < cols - 1 && mask[row + right + 1]) right++;
    radii[r] = (right - left + 1) / 2;
  }
  return radii;
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

function erode(profile, dz, wall, from) {
  const reach = Math.floor(wall / dz);
  const inner = [];
  for (let m = from; m < profile.length; m++) {
    let best = Infinity;
    for (let l = Math.max(0, m - reach); l <= Math.min(profile.length - 1, m + reach); l++) {
      const offset = (l - m) * dz;
      best = Math.min(best, profile[l] - Math.sqrt(wall * wall - offset * offset));
    }
    inner.push(Math.max(best, MIN_HOLE));
  }
  return inner;
}

export function buildRevolve(radii, { step, smoothing, hollow, wall, floor }) {
  const rows = Array.from(radii).reverse();
  const first = rows.findIndex((r) => r > 0);
  const last = rows.findLastIndex((r) => r > 0);
  if (first < 0 || last - first < 1) return null;

  const profile = smooth(rows.slice(first, last + 1), smoothing).map((r) => Math.max(r * step, MIN_RADIUS));
  const n = profile.length;
  const height = n * step;
  const dz = height / (n - 1);
  const floorRing = Math.ceil(floor / dz);
  const inner = hollow && n - floorRing >= 2 ? erode(profile, dz, wall, floorRing) : null;

  const S = SEGMENTS;
  const cos = Array.from({ length: S }, (_, j) => Math.cos((j / S) * Math.PI * 2));
  const sin = Array.from({ length: S }, (_, j) => Math.sin((j / S) * Math.PI * 2));
  const ringTotal = n + (inner ? inner.length : 0);
  const positions = new Float32Array((ringTotal * S + 2) * 3);
  let v = 0;
  const point = (x, y, z) => {
    positions.set([x, y, z], v * 3);
    return v++;
  };
  const ring = (r, z) => {
    const start = v;
    for (let j = 0; j < S; j++) point(r * cos[j], r * sin[j], z);
    return start;
  };

  const outer = profile.map((r, i) => ring(r, i * dz));
  const holes = inner ? inner.map((r, m) => ring(r, (floorRing + m) * dz)) : [];
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

  const diameter = Math.max(...profile) * 2;
  return { positions, indices, size: [diameter, diameter, height] };
}
