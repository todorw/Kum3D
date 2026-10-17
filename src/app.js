import { Viewer } from './viewer.js';
import { sampleImage, buildHeightmap } from './heightmap.js';
import { buildMesh } from './mesh.js';
import { toBinaryStl } from './stl.js';

const $ = (id) => document.getElementById(id);
const fields = ['width', 'base', 'depth', 'resolution', 'smoothing', 'contrast', 'border'];
const presets = {
  relief: { base: 2, depth: 4, border: 0, smoothing: 1, invert: false },
  lithophane: { base: 0.8, depth: 2.4, border: 3, smoothing: 0, invert: true }
};

const viewer = new Viewer($('stage'));
const state = { image: null, thumbUrl: null, name: 'model', sample: null, mesh: null, frame: 0 };

const setStatus = (text) => {
  $('status').textContent = text;
};

function params() {
  const p = Object.fromEntries(fields.map((f) => [f, Number($(f).value)]));
  p.invert = $('invert').checked;
  return p;
}

function syncOutputs() {
  for (const f of fields) document.querySelector(`output[for="${f}"]`).value = $(f).value;
}

function rebuild(refit = false) {
  if (!state.image) return;
  const p = params();
  if (!state.sample || state.sample.resolution !== p.resolution) {
    state.sample = { ...sampleImage(state.image, p.resolution), resolution: p.resolution };
  }
  const step = p.width / (state.sample.cols - 1);
  const map = buildHeightmap(state.sample, {
    invert: p.invert,
    contrast: p.contrast,
    smoothing: p.smoothing,
    border: Math.round(p.border / step)
  });
  state.mesh = buildMesh(map, p);
  viewer.setMesh(state.mesh);
  if (refit) viewer.frame(state.mesh.size);
  const [w, l, h] = state.mesh.size;
  $('statSize').textContent = `${w.toFixed(1)} × ${l.toFixed(1)} × ${h.toFixed(1)} mm`;
  $('statTris').textContent = (state.mesh.indices.length / 3).toLocaleString();
}

function schedule(refit = false) {
  syncOutputs();
  cancelAnimationFrame(state.frame);
  state.frame = requestAnimationFrame(() => rebuild(refit));
}

async function loadFile(file) {
  if (!file?.type.startsWith('image/')) return setStatus('That file is not an image');
  try {
    const image = await createImageBitmap(file);
    state.image?.close();
    state.image = image;
    state.sample = null;
    state.name = file.name.replace(/\.[^.]+$/, '') || 'model';
    if (state.thumbUrl) URL.revokeObjectURL(state.thumbUrl);
    state.thumbUrl = URL.createObjectURL(file);
    $('thumb').src = state.thumbUrl;
    $('thumb').hidden = false;
    $('dropText').hidden = true;
    $('empty').hidden = true;
    $('export').disabled = false;
    setStatus('');
    rebuild(true);
  } catch {
    setStatus('Could not read that image');
  }
}

function applyMode(mode) {
  for (const btn of $('mode').querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  const { invert, ...values } = presets[mode];
  for (const [key, value] of Object.entries(values)) $(key).value = value;
  $('invert').checked = invert;
  schedule();
}

async function exportStl() {
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

for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault());
$('drop').addEventListener('dragenter', () => $('drop').classList.add('over'));
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('over'));
$('drop').addEventListener('drop', (e) => {
  $('drop').classList.remove('over');
  loadFile(e.dataTransfer.files[0]);
});

document.addEventListener('paste', (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

$('mode').addEventListener('click', (e) => {
  const mode = e.target.closest('button')?.dataset.mode;
  if (mode) applyMode(mode);
});

for (const f of fields) $(f).addEventListener('input', () => schedule());
$('width').addEventListener('change', () => schedule(true));
$('invert').addEventListener('change', () => schedule());
$('export').addEventListener('click', exportStl);

syncOutputs();
