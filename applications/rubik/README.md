# rubik

A Rubik's cube in pavlus: the cube in **3D** (the new `canvas3d` plugin) next to its **flat net**
(the unfolded cross, on the plain `canvas` plugin). Turn faces with the buttons, drag the 3D view
to look around, scramble, undo, reset.

```sh
npm install            # from the workspace root
cd applications/rubik
npm run dev            # http://localhost:5191
npm test
```

```
app/cube.ts     the model: 54 stickers (cubie position + face normal); a move rotates one layer
app/scene.ts    the drawings: the 3D scene (polygons) and the net (canvas ops), pure
app/app.ts      the component: messages (turn, scramble, undo, reset, tick, mouse) -> effects
app/app.pavlus  the template: two canvases and the controls; it only reads
frontend/       the wiring: store, dom, time, canvas, canvas3d
```

The application is pure: a `tick` message from the canvas plugin's animation frames advances the
turn in flight, and the answer is the new state plus two drawing effects. The 3D projection lives in
the plugin ([`framework/client/src/plugins/canvas3d`](../../framework/client/src/plugins/canvas3d)),
so a turning layer is nothing more than rotated polygons in the scene.
