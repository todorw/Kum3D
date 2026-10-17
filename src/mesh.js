export function buildMesh({ cols, rows, values }, { width, base, depth }) {
  const step = width / (cols - 1);
  const length = step * (rows - 1);
  const count = cols * rows;
  const positions = new Float32Array(count * 2 * 3);

  for (let r = 0; r < rows; r++) {
    const y = length / 2 - r * step;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * step - width / 2;
      const t = i * 3;
      const b = (count + i) * 3;
      positions[t] = positions[b] = x;
      positions[t + 1] = positions[b + 1] = y;
      positions[t + 2] = base + values[i] * depth;
      positions[b + 2] = 0;
    }
  }

  const loop = [];
  for (let c = 0; c < cols - 1; c++) loop.push((rows - 1) * cols + c);
  for (let r = rows - 1; r > 0; r--) loop.push(r * cols + cols - 1);
  for (let c = cols - 1; c > 0; c--) loop.push(c);
  for (let r = 0; r < rows - 1; r++) loop.push(r * cols);

  const quads = (cols - 1) * (rows - 1);
  const indices = new Uint32Array((quads * 4 + loop.length * 2) * 3);
  let k = 0;
  const tri = (a, b, c) => {
    indices[k++] = a;
    indices[k++] = b;
    indices[k++] = c;
  };

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      tri(a, d, b);
      tri(b, d, e);
      tri(count + a, count + b, count + d);
      tri(count + b, count + e, count + d);
    }
  }

  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    tri(q, p, count + p);
    tri(q, count + p, count + q);
  }

  return { positions, indices, size: [width, length, base + depth] };
}
