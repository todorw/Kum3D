import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMask } from '../src/mask.js';
import { buildHeightmap } from '../src/heightmap.js';
import { buildRelief } from '../src/mesh.js';
import { extractProfile, buildRevolve } from '../src/revolve.js';
import { toBinaryStl } from '../src/stl.js';

function inspect({ positions, indices }) {
  const edges = new Map();
  let volume = 0;
  const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    assert.ok(a !== b && b !== c && a !== c, 'degenerate triangle');
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(`${u},${v}`, (edges.get(`${u},${v}`) ?? 0) + 1);
    const [x, y, z] = [p(a), p(b), p(c)];
    volume += (x[0] * (y[1] * z[2] - y[2] * z[1]) - x[1] * (y[0] * z[2] - y[2] * z[0]) + x[2] * (y[0] * z[1] - y[1] * z[0])) / 6;
  }
  let open = 0;
  for (const [key, count] of edges) {
    const [u, v] = key.split(',');
    if (count !== 1 || edges.get(`${v},${u}`) !== 1) open++;
  }
  return { open, volume };
}

function assertSolid(mesh) {
  assert.ok(mesh, 'mesh was not built');
  const { open, volume } = inspect(mesh);
  assert.equal(open, 0, 'mesh has open or non-manifold edges');
  assert.ok(volume > 0, 'mesh is inside out');
  return volume;
}

function image(cols, rows, paint) {
  const data = new Uint8ClampedArray(cols * rows * 4).fill(255);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = paint(c, r);
      if (color) data.set([...color, 255], (r * cols + c) * 4);
    }
  }
  const luma = Float32Array.from({ length: cols * rows }, (_, i) => data[i * 4] / 255);
  return { cols, rows, data, luma };
}

function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const ring = () => {
  const rnd = seeded(7);
  return image(60, 50, (c, r) => {
    const d = Math.hypot(c - 30, r - 25);
    return (d < 20 && d > 6) || rnd() < 0.08 ? [200 * rnd(), 100, 50] : null;
  });
};

function vase(cols = 40, rows = 80) {
  const mask = new Uint8Array(cols * rows);
  for (let r = 5; r < rows - 2; r++) {
    const w = 6 + 10 * Math.sin((r / rows) * Math.PI) + (r > rows - 10 ? 4 : 0);
    for (let c = 0; c < cols; c++) if (Math.abs(c + 0.5 - cols / 2) < w) mask[r * cols + c] = 1;
  }
  return mask;
}

test('relief with cutout is watertight', () => {
  const sample = ring();
  const mask = buildMask(sample, { cutout: true, tolerance: 0.15 });
  const values = buildHeightmap(sample, mask, { invert: false, contrast: 1, smoothing: 2, border: 2 });
  assertSolid(buildRelief({ ...sample, values, mask }, { step: 1, base: 1, depth: 3 }));
});

test('relief without cutout is watertight', () => {
  const sample = ring();
  const mask = buildMask(sample, { cutout: false });
  const values = buildHeightmap(sample, mask, { invert: true, contrast: 1, smoothing: 0, border: 3 });
  const mesh = buildRelief({ ...sample, values, mask }, { step: 1, base: 1, depth: 3 });
  assertSolid(mesh);
  assert.ok(Math.abs(mesh.size[0] - 60) < 1);
});

test('round solid, hollow and thick walls are watertight', () => {
  const profile = extractProfile(vase(), 40, 80);
  const solid = assertSolid(buildRevolve(profile, { step: 1.5, smoothing: 2, hollow: false, wall: 2, floor: 2 }));
  const hollow = assertSolid(buildRevolve(profile, { step: 1.5, smoothing: 2, hollow: true, wall: 2, floor: 2 }));
  assert.ok(hollow < solid * 0.5);
  assertSolid(buildRevolve(profile, { step: 1.5, smoothing: 0, hollow: true, wall: 15, floor: 30 }));
});

test('stl has a triangle per face', () => {
  const profile = extractProfile(vase(), 40, 80);
  const mesh = buildRevolve(profile, { step: 1, smoothing: 1, hollow: false, wall: 2, floor: 2 });
  const stl = toBinaryStl(mesh);
  const view = new DataView(stl.buffer);
  assert.equal(view.getUint32(80, true), mesh.indices.length / 3);
  assert.equal(stl.length, 84 + (mesh.indices.length / 3) * 50);
});

test('round cutout drops a mug handle', () => {
  const sample = image(120, 110, (c, r) => {
    if (r >= 5 && r < 105 && c >= 10 && c < 80) return [40, 45, 50];
    const d = Math.hypot((c - 84) / 22, (r - 55) / 27);
    return c >= 80 && d > 0.8 && d < 1.15 ? [40, 45, 50] : null;
  });
  const mask = buildMask(sample, { cutout: true, tolerance: 0.15, solid: true });
  const widest = Math.max(...Array.from({ length: 110 }, (_, r) => mask.subarray(r * 120, r * 120 + 120).reduce((a, b) => a + b, 0)));
  assert.ok(widest <= 72, `body too wide: ${widest}`);
});
