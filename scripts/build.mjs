import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('build', { recursive: true });
await build({
  entryPoints: ['src/app.js', 'src/segment.worker.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  outdir: 'build',
  logLevel: 'info'
});
await copyFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'build/ort.wasm');
