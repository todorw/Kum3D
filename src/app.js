import { Viewer } from './viewer.js';
import { sampleImage } from './image.js';
import { buildMask, maskBounds } from './mask.js';
import { buildHeightmap } from './heightmap.js';
import { buildRelief } from './mesh.js';
import { extractProfile, buildRevolve } from './revolve.js';
import { toBinaryStl } from './stl.js';

const $ = (id) => document.getElementById(id);
const fields = ['size', 'resolution', 'smoothing', 'tolerance', 'base', 'depth', 'contrast', 'border', 'wall', 'floor'];
const toggles = ['cutout', 'invert', 'hollow'];
const presets = {
  relief: { base: 2, depth: 4, border: 0, smoothing: 1, invert: false, cutout: true },
  lithophane: { base: 0.8, depth: 2.4, border: 3, smoothing: 0, invert: true, cutout: false },
  round: { smoothing: 2 }
};
const hints = {
  relief: 'Raised picture. Bright areas stand tallest, the background gets cut away.',
  lithophane: 'Thin panel that reveals the photo when you hold it up to light.',
  round: 'For round things like bottles, vases, cups and glasses. Use a straight side-on photo.'
};

const viewer = new Viewer($('stage'));
const state = { mode: 'relief', image: null, thumbUrl: null, name: 'model', prepared: null, mesh: null, frame: 0, refit: false };

const setStatus = (text) => {
  $('status').textContent = text;
};

function params() {
  const p = Object.fromEntries(fields.map((f) => [f, Number($(f).value)]));
  for (const t of toggles) p[t] = $(t).checked;
  p.cutout ||= state.mode === 'round';
  return p;
}

function syncOutputs() {
  for (const f of fields) document.querySelector(`output[for="${f}"]`).value = $(f).value;
}

function refreshVisibility() {
  for (const el of document.querySelectorAll('[data-modes]')) {
    el.hidden = !el.dataset.modes.split(' ').includes(state.mode);
  }
  $('toleranceField').hidden = state.mode !== 'round' && !$('cutout').checked;
  $('wallField').hidden = $('floorField').hidden = state.mode !== 'round' || !$('hollow').checked;
}

function cropRegion({ x0, y0, x1, y1 }, sample) {
  const s = 1 / sample.scale;
  const pad = Math.max(2, Math.round(Math.max(sample.cols, sample.rows) * 0.03));
  const { width, height } = state.image;
  const x = Math.max(0, (x0 - pad) * s);
  const y = Math.max(0, (y0 - pad) * s);
  return { x, y, w: Math.min(width, (x1 + 1 + pad) * s) - x, h: Math.min(height, (y1 + 1 + pad) * s) - y };
}

function prepare({ resolution, cutout, tolerance }) {
  const solid = state.mode === 'round';
  const key = `${resolution}|${cutout}|${tolerance}|${solid}`;
  if (state.prepared?.key === key) return state.prepared;
  const options = { cutout, tolerance: tolerance / 100, solid };
  let sample = sampleImage(state.image, resolution);
  let mask = buildMask(sample, options);
  let bounds = cutout && maskBounds(mask, sample.cols, sample.rows);
  if (bounds && solid) {
    const raw = maskBounds(buildMask(sample, { ...options, solid: false }), sample.cols, sample.rows) ?? bounds;
    bounds = {
      x0: Math.min(bounds.x0, raw.x0),
      y0: Math.min(bounds.y0, raw.y0),
      x1: Math.max(bounds.x1, raw.x1),
      y1: Math.max(bounds.y1, raw.y1)
    };
  }
  if (bounds) {
    sample = sampleImage(state.image, resolution, cropRegion(bounds, sample));
    mask = buildMask(sample, options);
  }
  state.prepared = { key, sample, mask };
  return state.prepared;
}

function build(p) {
  const { sample, mask } = prepare(p);
  const { cols, rows } = sample;
  const bounds = maskBounds(mask, cols, rows);
  if (!bounds) return null;
  const step = p.size / Math.max(bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
  if (state.mode === 'round') {
    return buildRevolve(extractProfile(mask, cols, rows), {
      step,
      smoothing: p.smoothing,
      hollow: p.hollow,
      wall: p.wall,
      floor: p.floor
    });
  }
  const values = buildHeightmap(sample, mask, {
    invert: p.invert,
    contrast: p.contrast,
    smoothing: p.smoothing,
    border: Math.round(p.border / step)
  });
  return buildRelief({ cols, rows, values, mask }, { step, base: p.base, depth: p.depth });
}

function rebuild(refit = false) {
  if (!state.image) return;
  try {
    state.mesh = build(params());
  } catch (err) {
    console.error(err);
    state.mesh = null;
    $('export').disabled = true;
    setStatus(`Could not build the model: ${err.message}`);
    return;
  }
  $('export').disabled = !state.mesh;
  if (!state.mesh) {
    viewer.clear();
    $('statSize').textContent = $('statTris').textContent = '–';
    setStatus('Nothing left after cutting out the background. Try a lower tolerance.');
    return;
  }
  setStatus('');
  viewer.setMesh(state.mesh);
  if (refit) viewer.frame(state.mesh.size);
  const [w, l, h] = state.mesh.size;
  $('statSize').textContent = `${w.toFixed(1)} × ${l.toFixed(1)} × ${h.toFixed(1)} mm`;
  $('statTris').textContent = (state.mesh.indices.length / 3).toLocaleString();
}

function schedule(refit = false) {
  syncOutputs();
  cancelAnimationFrame(state.frame);
  state.refit ||= refit;
  state.frame = requestAnimationFrame(flush);
}

function flush() {
  cancelAnimationFrame(state.frame);
  const refit = state.refit;
  state.refit = false;
  rebuild(refit);
}

async function loadFile(file) {
  if (!file?.type.startsWith('image/')) return setStatus('That file is not an image');
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    return setStatus('Could not read that image');
  }
  state.image?.close();
  state.image = image;
  state.prepared = null;
  state.name = file.name.replace(/\.[^.]+$/, '') || 'model';
  if (state.thumbUrl) URL.revokeObjectURL(state.thumbUrl);
  state.thumbUrl = URL.createObjectURL(file);
  $('thumb').src = state.thumbUrl;
  $('thumb').hidden = false;
  $('dropText').hidden = true;
  $('empty').hidden = true;
  schedule(true);
  flush();
}

function applyMode(mode) {
  state.mode = mode;
  for (const btn of $('mode').querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  for (const [key, value] of Object.entries(presets[mode])) {
    if (typeof value === 'boolean') $(key).checked = value;
    else $(key).value = value;
  }
  $('hint').textContent = hints[mode];
  refreshVisibility();
  schedule(true);
}

async function exportStl() {
  flush();
  if (!state.mesh) return;
  $('export').disabled = true;
  setStatus('Exporting…');
  try {
    const saved = await window.kum3d.saveStl(state.name, toBinaryStl(state.mesh));
    setStatus(saved ? `Saved to ${saved}` : '');
  } catch (err) {
    setStatus(`Export failed: ${err.message}`);
  } finally {
    $('export').disabled = false;
  }
}

$('file').addEventListener('change', (e) => {
  loadFile(e.target.files[0]);
  e.target.value = '';
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('over');
  if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
});
$('drop').addEventListener('dragenter', () => $('drop').classList.add('over'));
$('drop').addEventListener('dragleave', (e) => {
  if (!$('drop').contains(e.relatedTarget)) $('drop').classList.remove('over');
});

document.addEventListener('paste', (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

$('mode').addEventListener('click', (e) => {
  const mode = e.target.closest('button')?.dataset.mode;
  if (mode && mode !== state.mode) applyMode(mode);
});

for (const f of fields) $(f).addEventListener('input', () => schedule());
$('size').addEventListener('change', () => schedule(true));
for (const t of toggles) {
  $(t).addEventListener('change', () => {
    refreshVisibility();
    schedule();
  });
}
$('export').addEventListener('click', exportStl);

applyMode('relief');
