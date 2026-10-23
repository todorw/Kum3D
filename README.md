# Kum3D

Turn any picture into a printable 3D model and export it as STL or 3MF. Runs on Windows, macOS and Linux.

## Features

- Drop, paste or browse for PNG, JPG, WebP, BMP or GIF images
- Smart background removal with an AI model that runs offline on your computer, with a colour based fallback
- Relief mode: raised picture shaped like the object
- Lithophane mode: thin panel that shows the photo when backlit
- Round mode: turns a side view of a bottle, vase, cup or glass into a real 3D body
  - solid or hollow, picked automatically for bottles and open containers
  - mug and jug handles are removed, open hooks too
  - camera tilt correction for photos taken from above, detected automatically
  - surface detail embosses labels, logos and patterns from the photo onto the model
- Live 3D preview
- Watertight STL and 3MF export in millimetres, ready for any slicer
- Remembers your settings, Ctrl/Cmd+O opens an image and Ctrl/Cmd+S exports

## Run

```bash
npm install
npm start
```

## Test

```bash
npm test
```

## Build installers

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output goes to `dist/`. Build each platform on its own OS for best results (macOS builds need a Mac).

## Tips

- Relief: bright areas end up raised. Tick invert for the opposite.
- Smart removal picks the main object. If it misses, switch Background removal to By colour and adjust the tolerance.
- Lithophane: print upright with 100% infill and hold it against a light.
- Round: use a side-on photo of a single object. Overlapping objects get merged into one.
- Surface detail: raise it for crisp logos, set it to 0 for a smooth body. Invert swaps raised and engraved.

## Credits

Background removal uses [U²-Net](https://github.com/xuebinqin/U-2-Net) (u2netp, Apache-2.0) running on [ONNX Runtime Web](https://github.com/microsoft/onnxruntime).
