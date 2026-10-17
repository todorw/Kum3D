# Kum3D

Turn any picture into a printable 3D model and export it as STL. Runs on Windows, macOS and Linux.

## Features

- Drop, paste or browse for PNG, JPG, WebP, BMP or GIF images
- Relief and lithophane modes
- Adjustable width, base thickness, relief height, detail, smoothing, contrast and border
- Live 3D preview
- Watertight binary STL export in millimetres, ready for any slicer

## Run

```bash
npm install
npm start
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
- Lithophane: print upright with 100% infill and hold it against a light.
- High-contrast images with simple shapes give the cleanest results.
