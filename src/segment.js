export const MATTE_SIZE = 320;

const pending = new Map();
let worker = null;
let ready = null;
let nextId = 0;

function call(type, payload, transfer = []) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type, id, payload }, transfer);
  });
}

function start() {
  worker = new Worker('../build/segment.worker.js', { type: 'module' });
  worker.onmessage = ({ data: { id, matte, error } }) => {
    const job = pending.get(id);
    pending.delete(id);
    if (error) job.reject(new Error(error));
    else job.resolve(matte);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    for (const job of pending.values()) job.reject(new Error(event.message || 'Segmentation worker failed'));
    pending.clear();
  };
  ready = Promise.all([window.kum3d.readAsset('runtime'), window.kum3d.readAsset('model')]).then(([runtime, model]) =>
    call('init', { runtime, model }, [runtime.buffer, model.buffer])
  );
}

export async function findObject(image) {
  if (!worker) start();
  await ready;
  const bitmap = await createImageBitmap(image);
  const matte = await call('segment', bitmap, [bitmap]);
  const canvas = new OffscreenCanvas(MATTE_SIZE, MATTE_SIZE);
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(MATTE_SIZE, MATTE_SIZE);
  for (let i = 0; i < matte.length; i++) pixels.data[i * 4 + 3] = matte[i];
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
