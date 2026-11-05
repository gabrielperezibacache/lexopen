import assert from "node:assert/strict";
import { desktopPoint } from "./coordinates";
// Same remote field centre under fitted, natural and 150% views, including scroll.
const image = { width: 1280, height: 800 };
assert.deepEqual(desktopPoint({ x: 180, y: 225 }, { left: 20, top: 150, width: 320, height: 200 }, image), { x: 640, y: 300 });
assert.deepEqual(desktopPoint({ x: 240, y: 220 }, { left: -400, top: -80, width: 1280, height: 800 }, image), { x: 640, y: 300 });
assert.deepEqual(desktopPoint({ x: 210, y: 250 }, { left: -750, top: -200, width: 1920, height: 1200 }, image), { x: 640, y: 300 });
assert.equal(desktopPoint({ x: -1, y: 10 }, { left: 0, top: 0, width: 320, height: 200 }, image), null);
assert.equal(desktopPoint({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 }, image), null);
assert.deepEqual(desktopPoint({ x: 1280, y: 800 }, { left: 0, top: 0, ...image }, image), { x: 1279, y: 799 });
console.log("Desktop coordinates preserve the remote field through fit, zoom and scrolling.");
