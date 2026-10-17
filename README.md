# Kum3D

Turn any picture into a printable 3D model and export it as STL. Runs on Windows, macOS and Linux.

## Features

- Drop, paste or browse for PNG, JPG, WebP, BMP or GIF images
- Background cutout: transparent or plain backgrounds are removed so only the object gets printed
- Relief mode: raised picture shaped like the object
- Lithophane mode: thin panel that shows the photo when backlit
- Vase mode: spins a side view of a vase, cup or bottle into a real 3D body, solid or hollow
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
- Cutout works best on PNGs with transparency or photos on a plain background. Raise the tolerance if background bits remain, lower it if the object gets eaten.
- Lithophane: print upright with 100% infill and hold it against a light.
- Vase: use a straight side-on photo. Each row is measured through the centre line, so handles and gaps beside the body are ignored.
