function smoothOutline(positions, count, edges) {
  const links = new Map();
  for (let i = 0; i < edges.length; i += 2) {
    const [p, q] = [edges[i], edges[i + 1]];
    if (!links.has(p)) links.set(p, []);
    if (!links.has(q)) links.set(q, []);
    links.get(p).push(q);
    links.get(q).push(p);
  }
  for (let pass = 0; pass < 12; pass++) {
    const factor = pass % 2 ? -0.53 : 0.5;
    const next = new Map();
    for (const [v, [a, b]] of links) {
      next.set(v, [0, 1].map((o) => {
        const p = positions[v * 3 + o];
        return p + factor * ((positions[a * 3 + o] + positions[b * 3 + o]) / 2 - p);
      }));
    }
    for (const [v, [x, y]] of next) {
      positions[v * 3] = positions[(count + v) * 3] = x;
      positions[v * 3 + 1] = positions[(count + v) * 3 + 1] = y;
    }
  }
}

export function buildRelief({ cols, rows, values, mask }, { step, base, depth }) {
  const vcols = cols + 1;
  const vindex = new Int32Array(vcols * (rows + 1)).fill(-1);
  const heights = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      let sum = 0;
      let n = 0;
      for (let pr = r - 1; pr <= r; pr++) {
        for (let pc = c - 1; pc <= c; pc++) {
          if (pr < 0 || pc < 0 || pr >= rows || pc >= cols) continue;
          const i = pr * cols + pc;
          if (!mask[i]) continue;
          sum += values[i];
          n++;
        }
      }
      if (!n) continue;
      vindex[r * vcols + c] = heights.length;
      heights.push(sum / n);
    }
  }

  const count = heights.length;
  if (!count) return null;
  const width = cols * step;
  const length = rows * step;
  const positions = new Float32Array(count * 2 * 3);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const v = vindex[r * vcols + c];
      if (v < 0) continue;
      const t = v * 3;
      const b = (count + v) * 3;
      positions[t] = positions[b] = c * step - width / 2;
      positions[t + 1] = positions[b + 1] = length / 2 - r * step;
      positions[t + 2] = base + heights[v] * depth;
      positions[b + 2] = 0;
    }
  }

  const open = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols || !mask[r * cols + c];
  let quads = 0;
  let walls = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;
      quads++;
      walls += open(r, c - 1) + open(r + 1, c) + open(r, c + 1) + open(r - 1, c);
    }
  }

  const indices = new Uint32Array((quads * 4 + walls * 2) * 3);
  const edges = new Uint32Array(walls * 2);
  let k = 0;
  let ec = 0;
  const tri = (a, b, c) => {
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = c;
  };
  const wall = (p, q) => {
    edges[ec++] = p;
    edges[ec++] = q;
    tri(q, p, count + p);
    tri(q, count + p, count + q);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;
      const a = vindex[r * vcols + c];
      const b = vindex[r * vcols + c + 1];
      const e = vindex[(r + 1) * vcols + c + 1];
      const d = vindex[(r + 1) * vcols + c];
      tri(a, d, e);
      tri(a, e, b);
      tri(count + a, count + e, count + d);
      tri(count + a, count + b, count + e);
      if (open(r, c - 1)) wall(a, d);
      if (open(r + 1, c)) wall(d, e);
      if (open(r, c + 1)) wall(e, b);
      if (open(r - 1, c)) wall(b, a);
    }
  }

  smoothOutline(positions, count, edges);
  return { positions, indices, size: [width, length, base + depth] };
}
