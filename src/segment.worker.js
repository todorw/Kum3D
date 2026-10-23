import * as ort from 'onnxruntime-web/wasm';

const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
let session = null;

async function init({ runtime, model }) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmBinary = runtime;
  session = await ort.InferenceSession.create(model);
}

async function segment(bitmap) {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  let peak = 1;
  for (let i = 0; i < data.length; i++) {
    if ((i & 3) !== 3 && data[i] > peak) peak = data[i];
  }
  const plane = SIZE * SIZE;
  const input = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let ch = 0; ch < 3; ch++) input[ch * plane + i] = (data[i * 4 + ch] / peak - MEAN[ch]) / STD[ch];
  }
  const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const prediction = output[session.outputNames[0]].data;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of prediction) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const matte = new Uint8ClampedArray(plane);
  for (let i = 0; i < plane; i++) matte[i] = ((prediction[i] - lo) / (hi - lo || 1)) * 255;
  return matte;
}

self.onmessage = async ({ data: { type, id, payload } }) => {
  try {
    if (type === 'init') {
      await init(payload);
      self.postMessage({ id });
    } else {
      const matte = await segment(payload);
      self.postMessage({ id, matte }, [matte.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
