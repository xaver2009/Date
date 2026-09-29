const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const PAGE = path.join(__dirname, "..", "index.html");

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Lädt die echte index.html (inkl. mail.js) mit einem gefälschten fetch.
async function loadPage(respond) {
  const calls = [];
  const virtualConsole = new VirtualConsole(); // Konsolen-Ausgaben der Seite stumm schalten
  const dom = await JSDOM.fromFile(PAGE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = async (url, opts) => {
        calls.push({ url, opts, body: JSON.parse(opts.body) });
        return respond(calls.length, opts);
      };
    }
  });
  await new Promise(r => dom.window.addEventListener("load", r));
  return { dom, win: dom.window, doc: dom.window.document, calls };
}

const $ = (doc, sel) => doc.querySelector(sel);
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true }));
const activeStep = (doc) => $(doc, ".step.active").id;
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await tick(20); }
  throw new Error("Timeout beim Warten");
}

// Klickt sich bis zur Zusammenfassung ("Passt alles so?") durch.
function fillUntilConfirm(doc) {
  const win = doc.defaultView;
  click($(doc, "#yesBtn"));
  click($(doc, '#whatOptions .opt[data-value="Kino"]'));
  click($(doc, "#whatNext"));
  click([...doc.querySelectorAll('.detail-block[data-for="Kino"] .opt')].find(o => o.textContent.includes("Komödie")));
  $(doc, "#wishes").value = "Popcorn";
  click($(doc, "#detailsNext"));
  const date = $(doc, "#dateInput");
  date.value = "2030-10-12";
  date.dispatchEvent(new win.Event("input", { bubbles: true }));
  const time = $(doc, "#timeInput");
  time.value = "Abends";
  time.dispatchEvent(new win.Event("change", { bubbles: true }));
  click($(doc, "#whenNext"));
  assert.equal(activeStep(doc), "step-confirm");
}

test("Ohne Bestätigung wird keine Mail gesendet", async () => {
  const { doc, calls, win } = await loadPage(() => jsonResponse({ success: "true" }));
  fillUntilConfirm(doc);
  await tick(50);
  assert.equal(calls.length, 0);
  win.close();
});

test("Nach Bestätigung geht genau eine Mail mit allen Angaben an FormSubmit", async () => {
  const { doc, calls, win } = await loadPage(() => jsonResponse({ success: "true" }));
  fillUntilConfirm(doc);
  click($(doc, "#confirmBtn"));
  await waitFor(() => activeStep(doc) === "step-done");

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/formsubmit\.co\/ajax\/[^@\/]+@[^@\/]+$/);
  assert.equal(calls[0].opts.method, "POST");
  const b = calls[0].body;
  assert.equal(b["Was"], "Kino");
  assert.equal(b["Genauer"], "Komödie");
  assert.equal(b["Tageszeit"], "Abends");
  assert.equal(b["Sonstige Wünsche"], "Popcorn");
  assert.match(b["Datum"], /12\..*Oktober.*2030/);
  assert.match(b["In Kalender eintragen"], /^https:\/\/calendar\.google\.com/);
  win.close();
});

test("Mehrfach auf Bestätigen tippen → trotzdem nur eine Mail", async () => {
  const { doc, calls, win } = await loadPage(async () => { await tick(100); return jsonResponse({ success: "true" }); });
  fillUntilConfirm(doc);
  const btn = $(doc, "#confirmBtn");
  click(btn); click(btn); click(btn);
  await waitFor(() => activeStep(doc) === "step-done");
  assert.equal(calls.length, 1);
  win.close();
});

test("Versand schlägt fehl → Fehlermeldung, bleibt auf der Seite, erneuter Versuch klappt", async () => {
  const { doc, calls, win } = await loadPage((n) =>
    n === 1 ? jsonResponse({ success: "false", message: "This form needs Activation." }) : jsonResponse({ success: "true" })
  );
  fillUntilConfirm(doc);
  const btn = $(doc, "#confirmBtn");
  const err = $(doc, "#sendError");

  click(btn);
  await waitFor(() => err.style.display === "block");
  assert.equal(activeStep(doc), "step-confirm");
  assert.equal(btn.disabled, false);

  click(btn);
  await waitFor(() => activeStep(doc) === "step-done");
  assert.equal(err.style.display, "none");
  assert.equal(calls.length, 2);
  win.close();
});

test("Netzwerkfehler → Fehlermeldung statt Absturz", async () => {
  const { doc, win } = await loadPage(() => { throw new TypeError("Failed to fetch"); });
  fillUntilConfirm(doc);
  click($(doc, "#confirmBtn"));
  await waitFor(() => $(doc, "#sendError").style.display === "block");
  assert.equal(activeStep(doc), "step-confirm");
  win.close();
});
