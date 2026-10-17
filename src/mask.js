const MAX_DISTANCE = 255 * Math.sqrt(3);

function median(values) {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

function borderColor(data, cols, rows) {
  const channels = [[], [], []];
  let total = 0;
  const add = (i) => {
    total++;
    const p = i * 4;
    if (data[p + 3] < 128) return;
    for (let k = 0; k < 3; k++) channels[k].push(data[p + k]);
  };
  for (let c = 0; c < cols; c++) {
    add(c);
    add((rows - 1) * cols + c);
  }
  for (let r = 1; r < rows - 1; r++) {
    add(r * cols);
    add(r * cols + cols - 1);
  }
  if (channels[0].length < total * 0.1) return null;
  return channels.map(median);
}

function edgeMap(data, cols, rows, threshold) {
  const edges = new Uint8Array(cols * rows);
  const lum = (r, c) => {
    const p = (r * cols + c) * 4;
    return (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  };
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const gx = lum(r - 1, c + 1) + 2 * lum(r, c + 1) + lum(r + 1, c + 1) - lum(r - 1, c - 1) - 2 * lum(r, c - 1) - lum(r + 1, c - 1);
      const gy = lum(r + 1, c - 1) + 2 * lum(r + 1, c) + lum(r + 1, c + 1) - lum(r - 1, c - 1) - 2 * lum(r - 1, c) - lum(r - 1, c + 1);
      if (Math.hypot(gx, gy) / 4 > threshold) edges[r * cols + c] = 1;
    }
  }
  return edges;
}

function floodBackground(mask, data, cols, rows, tolerance, edges) {
  const bg = borderColor(data, cols, rows);
  const limit = (tolerance * MAX_DISTANCE) ** 2;
  const similar = (i) => {
    const p = i * 4;
    if (data[p + 3] < 128) return true;
    if (!bg || edges?.[i]) return false;
    const dr = data[p] - bg[0];
    const dg = data[p + 1] - bg[1];
    const db = data[p + 2] - bg[2];
    return dr * dr + dg * dg + db * db <= limit;
  };
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const visit = (i) => {
    if (mask[i] && similar(i)) {
      mask[i] = 0;
      queue[tail++] = i;
    }
  };
  for (let c = 0; c < cols; c++) {
    visit(c);
    visit((rows - 1) * cols + c);
  }
  for (let r = 0; r < rows; r++) {
    visit(r * cols);
    visit(r * cols + cols - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const c = i % cols;
    if (c > 0) visit(i - 1);
    if (c < cols - 1) visit(i + 1);
    if (i >= cols) visit(i - cols);
    if (i < mask.length - cols) visit(i + cols);
  }
  for (let i = 0; i < mask.length; i++) {
    if (data[i * 4 + 3] < 128 || (edges && similar(i))) mask[i] = 0;
  }
}

function removeSpecks(mask, cols) {
  const labels = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const c = i % cols;
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j >= 0 && j < mask.length && mask[j] && labels[j] === -1) {
          labels[j] = label;
          queue[tail++] = j;
        }
      }
    }
    sizes.push(tail);
  }
  const minSize = Math.max(9, sizes.reduce((m, s) => Math.max(m, s), 0) * 0.01);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && sizes[labels[i]] < minSize) mask[i] = 0;
  }
}

function fixPinches(mask, cols, rows) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const tl = (r - 1) * cols + c - 1;
        const a = mask[tl];
        const b = mask[tl + 1];
        if (a === mask[tl + cols + 1] && b === mask[tl + cols] && a !== b) {
          mask[a ? tl + 1 : tl] = 1;
          changed = true;
        }
      }
    }
  }
}

function distanceTo(mask, cols, rows, target) {
  const dist = new Int32Array(mask.length);
  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] === target ? 0 : cols + rows;
  const relax = (i, j) => {
    if (dist[j] + 1 < dist[i]) dist[i] = dist[j] + 1;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c > 0) relax(i, i - 1);
      if (r === 0) continue;
      relax(i, i - cols);
      if (c > 0) relax(i, i - cols - 1);
      if (c < cols - 1) relax(i, i - cols + 1);
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (c < cols - 1) relax(i, i + 1);
      if (r === rows - 1) continue;
      relax(i, i + cols);
      if (c < cols - 1) relax(i, i + cols + 1);
      if (c > 0) relax(i, i + cols - 1);
    }
  }
  return dist;
}

function enclosedRegions(mask, cols, rows) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const flood = (start) => {
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    const box = { x0: cols, x1: -1, y0: rows, y1: -1, open: false };
    while (head < tail) {
      const i = queue[head++];
      const c = i % cols;
      const r = (i - c) / cols;
      if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1) box.open = true;
      box.x0 = Math.min(box.x0, c);
      box.x1 = Math.max(box.x1, c);
      box.y0 = Math.min(box.y0, r);
      box.y1 = Math.max(box.y1, r);
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j >= 0 && j < mask.length && !mask[j] && !seen[j]) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    return { ...box, pixels: queue.slice(0, tail) };
  };
  const regions = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || seen[i]) continue;
    const region = flood(i);
    if (!region.open) regions.push(region);
  }
  return regions;
}

function fillHoles(mask, cols, rows, centre) {
  for (const hole of enclosedRegions(mask, cols, rows)) {
    if (hole.x0 <= centre && centre <= hole.x1) for (const i of hole.pixels) mask[i] = 1;
  }
}

function bodyRadius(mask, cols, rows, axis) {
  const ac = Math.min(cols - 1, Math.floor(axis));
  const widths = [];
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    if (!mask[row + ac]) continue;
    let left = ac;
    let right = ac;
    while (left > 0 && mask[row + left - 1]) left--;
    while (right < cols - 1 && mask[row + right + 1]) right++;
    widths.push((right - left + 1) / 2);
  }
  widths.sort((x, y) => x - y);
  return widths.length ? widths[widths.length >> 1] : 0;
}

function removeHandles(mask, cols, rows) {
  const axis = findAxis(mask, cols, rows);
  if (axis === null) return;
  const radius = bodyRadius(mask, cols, rows, axis);
  for (const hole of enclosedRegions(mask, cols, rows)) {
    const right = hole.x0 > axis;
    const gap = right ? hole.x0 - axis : axis - hole.x1 - 1;
    if (gap < radius * 0.7) continue;
    const mid = ((hole.y0 + hole.y1) >> 1) * cols;
    let thickness = 0;
    for (let c = right ? hole.x1 + 1 : hole.x0 - 1; c >= 0 && c < cols && mask[mid + c]; c += right ? 1 : -1) thickness++;
    const from = right ? hole.x0 : 0;
    const to = right ? cols - 1 : hole.x1;
    const pad = thickness + ((hole.y1 - hole.y0) >> 1) + 2;
    for (let r = Math.max(0, hole.y0 - pad); r <= Math.min(rows - 1, hole.y1 + pad); r++) {
      mask.fill(0, r * cols + from, r * cols + to + 1);
    }
  }
}

function solidify(mask, cols, rows) {
  const radius = Math.round(Math.max(cols, rows) / 40) + 1;
  const pad = radius + 2;
  const pc = cols + pad * 2;
  const pr = rows + pad * 2;
  const padded = new Uint8Array(pc * pr);
  for (let r = 0; r < rows; r++) padded.set(mask.subarray(r * cols, (r + 1) * cols), (r + pad) * pc + pad);
  const grown = distanceTo(padded, pc, pr, 1);
  for (let i = 0; i < padded.length; i++) padded[i] = grown[i] <= radius ? 1 : 0;
  const bounds = maskBounds(padded, pc, pr);
  if (bounds) fillHoles(padded, pc, pr, Math.round((bounds.x0 + bounds.x1) / 2));
  const shrunk = distanceTo(padded, pc, pr, 0);
  for (let i = 0; i < padded.length; i++) {
    if (shrunk[i] <= radius + 1) padded[i] = 0;
  }
  for (let r = 0; r < rows; r++) mask.set(padded.subarray((r + pad) * pc + pad, (r + pad) * pc + pad + cols), r * cols);
}

export function findAxis(mask, cols, rows) {
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
  return mids.length ? mids[mids.length >> 1] : null;
}

function mirror(mask, cols, rows) {
  const axis = findAxis(mask, cols, rows);
  if (axis === null) return;
  const source = mask.slice();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!source[r * cols + c]) continue;
      const m = Math.round(2 * axis - c - 1);
      if (m >= 0 && m < cols) mask[r * cols + m] = 1;
    }
  }
}

export function buildMask({ cols, rows, data }, { cutout, tolerance, solid }) {
  const mask = new Uint8Array(cols * rows).fill(1);
  if (!cutout) return mask;
  const edges = solid ? edgeMap(data, cols, rows, Math.max(0.03, tolerance / 2)) : null;
  floodBackground(mask, data, cols, rows, tolerance, edges);
  if (solid) {
    solidify(mask, cols, rows);
    removeHandles(mask, cols, rows);
    mirror(mask, cols, rows);
    solidify(mask, cols, rows);
  }
  removeSpecks(mask, cols);
  fixPinches(mask, cols, rows);
  return mask;
}

export function maskBounds(mask, cols, rows) {
  let x0 = cols;
  let y0 = rows;
  let x1 = -1;
  let y1 = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;
      if (c < x0) x0 = c;
      if (c > x1) x1 = c;
      if (r < y0) y0 = r;
      if (r > y1) y1 = r;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
