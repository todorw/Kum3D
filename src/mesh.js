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
  let k = 0;
  const tri = (a, b, c) => {
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = c;
  };
  const wall = (p, q) => {
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

  return { positions, indices, size: [width, length, base + depth] };
}
