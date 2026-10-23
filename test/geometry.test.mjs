import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMask } from '../src/mask.js';
import { buildHeightmap } from '../src/heightmap.js';
import { buildRelief } from '../src/mesh.js';
import { extractProfile, buildRevolve, estimateTilt, opensWide } from '../src/revolve.js';
import { toBinaryStl } from '../src/stl.js';
import { toThreeMf } from '../src/threemf.js';
import { crc32 } from 'node:zlib';

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
  const solid = assertSolid(buildRevolve(profile, { size: 120, smoothing: 2, hollow: false, wall: 2, floor: 2 }));
  const hollow = assertSolid(buildRevolve(profile, { size: 120, smoothing: 2, hollow: true, wall: 2, floor: 2 }));
  assert.ok(hollow < solid * 0.5);
  assertSolid(buildRevolve(profile, { size: 120, smoothing: 0, hollow: true, wall: 15, floor: 30 }));
});

test('stl has a triangle per face', () => {
  const profile = extractProfile(vase(), 40, 80);
  const mesh = buildRevolve(profile, { size: 80, smoothing: 1, hollow: false, wall: 2, floor: 2 });
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

function cylinder(tiltDegrees, roundBottom = false) {
  const radius = 30;
  const height = 120;
  const cols = 80;
  const rise = radius * Math.sin((tiltDegrees * Math.PI) / 180);
  const side = height * Math.cos((tiltDegrees * Math.PI) / 180);
  const rows = Math.ceil(side + rise * 2) + 4;
  const mask = new Uint8Array(cols * rows);
  const top = 2 + rise;
  for (let r = 0; r < rows; r++) {
    const y = r + 0.5;
    let half = 0;
    if (y >= top && y <= top + side) half = radius;
    else if (rise > 0 && y < top && y > top - rise) half = radius * Math.sqrt(1 - ((top - y) / rise) ** 2);
    else if (rise > 0 && y > top + side && y < top + side + rise) half = radius * Math.sqrt(1 - ((y - top - side) / rise) ** 2);
    if (roundBottom && y > top + side - 12 && y <= top + side) half = radius * Math.sqrt(1 - ((y - top - side + 12) / 12) ** 2);
    for (let c = 0; c < cols; c++) if (Math.abs(c + 0.5 - cols / 2) < half) mask[r * cols + c] = 1;
  }
  return extractProfile(mask, cols, rows);
}

test('tilt is detected from elliptical ends', () => {
  assert.equal(estimateTilt(cylinder(0).radii), 0);
  const tilt = estimateTilt(cylinder(25).radii);
  assert.ok(Math.abs(tilt - 25) <= 4, `estimated ${tilt}`);
});

test('a rounded bottom alone is not mistaken for tilt', () => {
  assert.equal(estimateTilt(cylinder(0, true).radii), 0);
});

test('tilt correction restores the real proportions', () => {
  const options = { size: 120, smoothing: 0, hollow: false, wall: 2, floor: 2 };
  const flat = buildRevolve(cylinder(0), options);
  const fixed = buildRevolve(cylinder(30), { ...options, tilt: 30 });
  assert.ok(Math.abs(fixed.size[2] / fixed.size[0] - flat.size[2] / flat.size[0]) < 0.1);
});

test('surface detail stays watertight', () => {
  const cols = 40;
  const rows = 80;
  const mask = vase(cols, rows);
  const luma = Float32Array.from({ length: cols * rows }, (_, i) => ((i % cols) % 6 < 3 ? 0.2 : 0.8));
  const profile = extractProfile(mask, cols, rows);
  for (const hollow of [false, true]) {
    assertSolid(buildRevolve(profile, { size: 120, smoothing: 1, hollow, wall: 2, floor: 2, detail: 1 }, { luma, mask, cols, rows }));
  }
});

test('bottles are told apart from open containers', () => {
  assert.equal(opensWide(cylinder(0).radii), true);
  assert.equal(opensWide(extractProfile(vase(), 40, 80).radii), false);
  const cols = 40;
  const rows = 80;
  const bottle = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const w = r < 20 ? 4 : 16;
    for (let c = 0; c < cols; c++) if (Math.abs(c + 0.5 - cols / 2) < w) bottle[r * cols + c] = 1;
  }
  assert.equal(opensWide(extractProfile(bottle, cols, rows).radii), false);
});

test('3mf is a valid zip with the mesh inside', () => {
  const mesh = buildRevolve(extractProfile(vase(), 40, 80), { size: 80, smoothing: 1, hollow: true, wall: 2, floor: 2 });
  const bytes = toThreeMf(mesh, 'test');
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  let o = view.getUint32(end + 16, true);
  const names = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(o, true), 0x02014b50);
    const size = view.getUint32(o + 24, true);
    const nameLength = view.getUint16(o + 28, true);
    const local = view.getUint32(o + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(view.getUint32(o + 16, true), crc32(data));
    if (name === '3D/3dmodel.model') {
      const xml = new TextDecoder().decode(data);
      assert.equal((xml.match(/<triangle /g) ?? []).length, mesh.indices.length / 3);
    }
    names.push(name);
    o += 46 + nameLength;
  }
  assert.deepEqual(names, ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
});

test('round cutout trims an open hook handle', () => {
  const sample = image(120, 110, (c, r) => {
    if (r >= 5 && r < 105 && c >= 10 && c < 80) return [40, 45, 50];
    if (r >= 20 && r < 28 && c >= 80 && c < 100) return [40, 45, 50];
    if (r >= 20 && r < 60 && c >= 94 && c < 100) return [40, 45, 50];
    return null;
  });
  const mask = buildMask(sample, { cutout: true, tolerance: 0.15, solid: true });
  const widths = Array.from({ length: 110 }, (_, r) => mask.subarray(r * 120, r * 120 + 120).reduce((a, b) => a + b, 0));
  assert.ok(Math.max(...widths) <= 74, `hook kept: ${Math.max(...widths)}`);
});
