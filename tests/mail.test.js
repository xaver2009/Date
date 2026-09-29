const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMailFields, createMailer, WEB3FORMS_URL } = require("../mail.js");

const STATE = { what: "Kino", detail: "Komödie", wishes: "Popcorn <süß>", date: "2026-10-10", time: "Abends" };

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(opts) : r;
  };
  fn.calls = calls;
  return fn;
}

// ---------- buildMailFields ----------

test("Mail enthält alle Angaben aus dem Formular", () => {
  const f = buildMailFields(STATE, { prettyDate: "Samstag, 10. Oktober 2026", tries: 3, googleUrl: "https://g", appleUrl: "https://a" });
  assert.equal(f["Was"], "Kino");
  assert.equal(f["Genauer"], "Komödie");
  assert.equal(f["Datum"], "Samstag, 10. Oktober 2026");
  assert.equal(f["Tageszeit"], "Abends");
  assert.equal(f["Sonstige Wünsche"], "Popcorn <süß>");
  assert.equal(f["Nein-Versuche"], "3");
  assert.equal(f["Google Kalender"], "https://g");
  assert.equal(f["Apple Kalender"], "https://a");
  assert.equal(f["In Kalender eintragen"], undefined);
});

test("Mail hat Betreff und Absendername", () => {
  const f = buildMailFields(STATE, { prettyDate: "x", tries: 0, googleUrl: "", appleUrl: "" });
  assert.match(f.subject, /JA/);
  assert.equal(f.from_name, "Date-Webseite");
});

test("Leere Felder werden als '-' angezeigt", () => {
  const f = buildMailFields({ ...STATE, detail: "", wishes: "" }, { prettyDate: "x", tries: 0, googleUrl: "", appleUrl: "" });
  assert.equal(f["Genauer"], "-");
  assert.equal(f["Sonstige Wünsche"], "-");
});

// ---------- createMailer ----------

test("sendet genau einen POST an Web3Forms mit Zugangsschlüssel", async () => {
  const fetch = fakeFetch(jsonResponse({ success: true }));
  const mailer = createMailer({ accessKey: "KEY-123", fetch });
  const res = await mailer.send({ Was: "Kino" });

  assert.deepEqual(res, { ok: true });
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, WEB3FORMS_URL);
  assert.equal(fetch.calls[0].opts.method, "POST");
  assert.equal(fetch.calls[0].opts.headers["Content-Type"], "application/json");
  assert.equal(fetch.calls[0].opts.headers["Accept"], "application/json");
  assert.deepEqual(fetch.calls[0].body, { access_key: "KEY-123", Was: "Kino" });
});

test("akzeptiert success auch als String", async () => {
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(jsonResponse({ success: true })) });
  assert.equal((await mailer.send({})).ok, true);
});

test("Ohne Zugangsschlüssel wird gar nicht erst gesendet", async () => {
  const fetch = fakeFetch(jsonResponse({ success: true }));
  const res = await createMailer({ accessKey: "", fetch }).send({});
  assert.equal(res.ok, false);
  assert.match(res.reason, /Zugangsschlüssel/);
  assert.equal(fetch.calls.length, 0);
});

test("Web3Forms-Fehler mit HTTP-Status (z. B. falscher Schlüssel) → Meldung von Web3Forms", async () => {
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(jsonResponse({ success: false, message: "Invalid access key" }, 400)) });
  const res = await mailer.send({});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "Invalid access key");
});

test("Dienst meldet Fehler → ok:false mit Grund", async () => {
  const msg = "Something went wrong";
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(jsonResponse({ success: "false", message: msg })) });
  const res = await mailer.send({});
  assert.equal(res.ok, false);
  assert.equal(res.reason, msg);
});

test("HTTP-Fehler → ok:false", async () => {
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(jsonResponse({}, 500)) });
  const res = await mailer.send({});
  assert.equal(res.ok, false);
  assert.match(res.reason, /500/);
});

test("Netzwerkfehler → ok:false statt Absturz", async () => {
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(new TypeError("Failed to fetch")) });
  const res = await mailer.send({});
  assert.equal(res.ok, false);
  assert.match(res.reason, /Failed to fetch/);
});

test("Kaputte Antwort (kein JSON) → ok:false", async () => {
  const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(bad) });
  assert.equal((await mailer.send({})).ok, false);
});

test("Zeitüberschreitung → ok:false, Anfrage wird abgebrochen", async () => {
  let aborted = false;
  const hang = (opts) => new Promise((_, reject) => {
    opts.signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
  });
  const mailer = createMailer({ accessKey: "k", fetch: fakeFetch(hang), timeoutMs: 20 });
  const res = await mailer.send({});
  assert.equal(res.ok, false);
  assert.equal(aborted, true);
  assert.match(res.reason, /Zeit/);
});

test("Doppelklick während des Sendens → nur eine Mail", async () => {
  let resolve;
  const slow = () => new Promise(r => { resolve = r; });
  const fetch = fakeFetch(slow);
  const mailer = createMailer({ accessKey: "k", fetch });
  const p1 = mailer.send({ n: 1 });
  const p2 = mailer.send({ n: 2 });
  resolve(jsonResponse({ success: true }));
  assert.deepEqual(await p1, { ok: true });
  assert.deepEqual(await p2, { ok: true });
  assert.equal(fetch.calls.length, 1);
});

test("Nach erfolgreichem Versand wird nicht nochmal gesendet", async () => {
  const fetch = fakeFetch(jsonResponse({ success: true }));
  const mailer = createMailer({ accessKey: "k", fetch });
  await mailer.send({});
  assert.deepEqual(await mailer.send({}), { ok: true });
  assert.equal(fetch.calls.length, 1);
});

test("Nach einem Fehler ist ein neuer Versuch möglich", async () => {
  const fetch = fakeFetch(new TypeError("offline"), jsonResponse({ success: true }));
  const mailer = createMailer({ accessKey: "k", fetch });
  assert.equal((await mailer.send({})).ok, false);
  assert.equal((await mailer.send({})).ok, true);
  assert.equal(fetch.calls.length, 2);
});
