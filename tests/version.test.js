const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Browser speichern Skripte zwischen. Ohne Versionsnummer kann eine neue Seite
// mit einem alten mail.js/calendar.js laufen (z. B. fehlen dann die Kalender-Links).
const pages = ["index.html", "kalender.html"];

test("Alle eigenen Skripte werden mit derselben Versionsnummer geladen", () => {
  const versions = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(srcs.length > 0, page + " lädt keine Skripte");
    for (const src of srcs) {
      const m = src.match(/^(mail|calendar)\.js\?v=(\w+)$/);
      assert.ok(m, page + ": " + src + " hat keine Versionsnummer (?v=...)");
      versions.add(m[2]);
    }
  }
  assert.equal(versions.size, 1, "Unterschiedliche Versionsnummern: " + [...versions].join(", "));
});
