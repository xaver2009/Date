const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { JSDOM, VirtualConsole, ResourceLoader } = require("jsdom");

// Lädt Skripte der Live-Adresse aus dem lokalen Ordner statt aus dem Internet
class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    const m = url.match(/^https:\/\/xaver2009\.github\.io\/Date\/([\w.-]+)(\?.*)?$/);
    if (m) return Promise.resolve(fs.readFileSync(path.join(__dirname, "..", m[1])));
    return Promise.reject(new Error("Test darf nicht ins Internet: " + url));
  }
}

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
  const { doc, calls, win } = await loadPage(() => jsonResponse({ success: true }));
  fillUntilConfirm(doc);
  await tick(50);
  assert.equal(calls.length, 0);
  win.close();
});

test("Nach Bestätigung geht genau eine Mail mit allen Angaben an Web3Forms", async () => {
  const { doc, calls, win } = await loadPage(() => jsonResponse({ success: true }));
  fillUntilConfirm(doc);
  click($(doc, "#confirmBtn"));
  await waitFor(() => activeStep(doc) === "step-done");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.web3forms.com/submit");
  assert.equal(calls[0].opts.method, "POST");
  const b = calls[0].body;
  assert.match(b.access_key, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "In index.html ist kein echter Web3Forms-Zugangsschlüssel eingetragen");
  assert.equal(b["Was"], "Kino");
  assert.equal(b["Genauer"], "Komödie");
  assert.equal(b["Tageszeit"], "Abends");
  assert.equal(b["Sonstige Wünsche"], "Popcorn");
  assert.match(b["Datum"], /12\..*Oktober.*2030/);
  assert.match(b["Zum Kalender hinzufügen"], /kalender\.html\?.*date=2030-10-12/);
  // Nur ein Link in der Mail – mehrere Links hält Web3Forms teils lange zurück
  const links = Object.values(b).filter(v => /[a-z]+:\/\//.test(v));
  assert.equal(links.length, 1);
  win.close();
});

test("Fertig-Seite hat keinen SMS-Knopf, Kalender-Links funktionieren weiter", async () => {
  const { doc, win } = await loadPage(() => jsonResponse({ success: true }));
  fillUntilConfirm(doc);
  click($(doc, "#confirmBtn"));
  await waitFor(() => activeStep(doc) === "step-done");
  assert.equal(doc.querySelector('a[href^="sms:"], #smsBtn'), null);
  assert.doesNotMatch(doc.getElementById("step-done").textContent, /Bescheid geben/);
  assert.match($(doc, "#gcalLink").href, /^https:\/\/calendar\.google\.com/);
  assert.ok($(doc, "#icsBtn"));
  win.close();
});

test("Mehrfach auf Bestätigen tippen → trotzdem nur eine Mail", async () => {
  const { doc, calls, win } = await loadPage(async () => { await tick(100); return jsonResponse({ success: true }); });
  fillUntilConfirm(doc);
  const btn = $(doc, "#confirmBtn");
  click(btn); click(btn); click(btn);
  await waitFor(() => activeStep(doc) === "step-done");
  assert.equal(calls.length, 1);
  win.close();
});

test("Versand schlägt fehl → Fehlermeldung, bleibt auf der Seite, erneuter Versuch klappt", async () => {
  const { doc, calls, win } = await loadPage((n) =>
    n === 1 ? jsonResponse({ success: false, message: "Invalid access key" }) : jsonResponse({ success: true })
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

// ---------- kalender.html (Link "Zum Kalender hinzufügen" aus der Mail) ----------

const CAL_PAGE = path.join(__dirname, "..", "kalender.html");

async function loadCalendarPage(query) {
  const blobs = [];
  const dom = await JSDOM.fromFile(CAL_PAGE, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    resources: new LocalLoader(),
    url: "https://xaver2009.github.io/Date/kalender.html" + query,
    beforeParse(window) {
      window.URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:test"; };
      window.URL.revokeObjectURL = () => {};
    }
  });
  await new Promise(r => dom.window.addEventListener("load", r));
  return { dom, win: dom.window, doc: dom.window.document, blobs };
}

function blobText(win, blob) {
  return new Promise(r => { const fr = new win.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blob); });
}

test("Kalender-Link aus der Mail öffnet kalender.html mit Apple- und Google-Knopf", async () => {
  // Link genau so, wie er in der Mail landet
  const { doc: page, calls, win: pageWin } = await loadPage(() => jsonResponse({ success: true }));
  fillUntilConfirm(page);
  click($(page, "#confirmBtn"));
  await waitFor(() => activeStep(page) === "step-done");
  const query = new URL(calls[0].body["Zum Kalender hinzufügen"]).search;
  pageWin.close();

  const { doc, win, blobs } = await loadCalendarPage(query);
  assert.match($(doc, "#title").textContent, /Kino \(Komödie\)/);
  assert.match($(doc, "#when").textContent, /12\. Oktober 2030.*Abends/);
  const g = $(doc, "#gcalBtn");
  assert.ok(g && !g.hidden, "Google-Knopf fehlt");
  const gu = new URL(g.href);
  assert.equal(gu.hostname, "calendar.google.com");
  assert.equal(gu.searchParams.get("dates"), "20301012T180000/20301013T000000");

  const before = blobs.length;
  click($(doc, "#addBtn"));
  assert.equal(blobs.length, before + 1);
  const ics = await blobText(win, blobs[blobs.length - 1]);
  assert.match(ics, /DTSTART:20301012T180000/);
  assert.match(ics, /SUMMARY:❤️ Date: Kino \(Komödie\)/);
  win.close();
});

test("kalender.html mit kaputtem Link zeigt Hinweis statt Absturz", async () => {
  const { doc, win, blobs } = await loadCalendarPage("?what=Kino");
  assert.match($(doc, "#error").textContent, /nicht/);
  assert.equal($(doc, "#addBtn").hidden, true);
  assert.equal(blobs.length, 0);
  win.close();
});

test("kalender.html zeigt Text aus dem Link nie als HTML an", async () => {
  const q = "?what=" + encodeURIComponent("<img src=x onerror=alert(1)>") + "&date=2030-10-12&time=Abends";
  const { doc, win } = await loadCalendarPage(q);
  assert.equal(doc.querySelector("img"), null);
  win.close();
});
