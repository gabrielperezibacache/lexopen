const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "renderer", "setup.html"), "utf8");
const css = fs.readFileSync(path.join(root, "renderer", "setup.css"), "utf8");
const js = fs.readFileSync(path.join(root, "renderer", "setup.js"), "utf8");
const main = fs.readFileSync(path.join(root, "main.cjs"), "utf8");
const builder = fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8");

assert.doesNotMatch(
  html,
  /<link[^>]+rel=["']stylesheet["']/,
  "setup.html must not load CSS via file:// (packaged Chromium blocks CSP 'self')"
);
assert.doesNotMatch(
  html,
  /<script[^>]+src=/,
  "setup.html must not load JS via file:// (packaged Chromium blocks CSP 'self')"
);
assert.match(html, /style-src 'unsafe-inline'/);
assert.match(html, /script-src 'unsafe-inline'/);
assert.match(html, /<!--SETUP_CSS-->/);
assert.match(html, /<!--SETUP_JS-->/);
assert.match(css, /\.shell\s*\{/);
assert.match(js, /lexopenDesktop/);

assert.match(main, /<!--SETUP_CSS-->/);
assert.match(main, /<!--SETUP_JS-->/);
assert.match(main, /<style>/);
assert.match(main, /<script>/);
assert.match(main, /rendererPath\("setup\.css"\)/);
assert.match(main, /rendererPath\("setup\.js"\)/);
assert.match(main, /backgroundColor:\s*"#f7f2e8"/);

assert.match(builder, /standalone\/\.next/);
assert.match(builder, /\.next\/static/);
assert.match(builder, /"\*\*\/\.\*"/);

console.log("desktop/renderer.test.cjs OK");
