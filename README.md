# WHITE ROOM

A Three.js prototype for the endless white-room escape concept.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL, select **ENTER THE ROOM**, move with `WASD` or the arrow keys, and use the mouse to look around. Click the scene again if the mouse leaves pointer lock.

## Prototype structure

- `src/main.js` creates the room, lighting, placeholder player, movement, collision bounds, camera, and HUD state.
- `src/style.css` contains the restrained white-room interface and atmosphere.
- `spider_fully_rigged.glb` is loaded as the player, normalized to the room, and animated from its first embedded clip when available.

## Current objective

Run to the front wall and you will enter **The Loop**. The real escape appears as a thin black line on the back wall after 30 seconds; reach it to win.
