const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const background = (html) => {
  const m = html.match(/body::before\s*\{[^}]*background:\s*([^;]+);/);
  return m && m[1].trim();
};

test("Date-Seite und Kalender-Seite haben denselben Rosen-Hintergrund", () => {
  const main = background(read("index.html"));
  const cal = background(read("kalender.html"));
  assert.ok(main, "index.html hat keinen Hintergrund");
  assert.match(main, /url\("rosen\.jpg"\)/);
  assert.equal(cal, main);
});

test("rosen.jpg ist ein echtes JPEG-Bild", () => {
  const img = fs.readFileSync(path.join(__dirname, "..", "rosen.jpg"));
  assert.ok(img.length > 1000);
  assert.equal(img.subarray(0, 3).toString("hex"), "ffd8ff");
});
