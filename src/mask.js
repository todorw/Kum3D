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

function floodBackground(mask, data, cols, rows, tolerance) {
  const bg = borderColor(data, cols, rows);
  const limit = (tolerance * MAX_DISTANCE) ** 2;
  const similar = (i) => {
    const p = i * 4;
    if (data[p + 3] < 128) return true;
    if (!bg) return false;
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
    if (data[i * 4 + 3] < 128) mask[i] = 0;
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

export function buildMask({ cols, rows, data }, { cutout, tolerance }) {
  const mask = new Uint8Array(cols * rows).fill(1);
  if (!cutout) return mask;
  floodBackground(mask, data, cols, rows, tolerance);
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
