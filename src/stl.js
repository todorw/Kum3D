export function toBinaryStl({ positions, indices }, header = 'Kum3D') {
  const triangles = indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const label = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buffer, 0, label.length).set(label);
  view.setUint32(80, triangles, true);

  let o = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(o, positions[v], true);
      view.setFloat32(o + 4, positions[v + 1], true);
      view.setFloat32(o + 8, positions[v + 2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buffer);
}
