const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gcalUrl, icsText, appleUrl, stateFromQuery } = require("../calendar.js");

const EVENING = { what: "Kino", detail: "Komödie", wishes: "Popcorn, süß; bitte", date: "2030-10-12", time: "Abends" };
const ALLDAY = { what: "Aktiv", detail: "", wishes: "", date: "2030-12-31", time: "Den ganzen Tag 🥹" };

// ---------- Google ----------

test("Google-Link: Abends 18–24 Uhr, Titel und Beschreibung", () => {
  const u = new URL(gcalUrl(EVENING));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("dates"), "20301012T180000/20301013T000000");
  assert.equal(u.searchParams.get("text"), "❤️ Date: Kino (Komödie)");
  assert.match(u.searchParams.get("details"), /Wünsche: Popcorn, süß; bitte/);
});

test("Google-Link: ganzer Tag, über den Jahreswechsel", () => {
  const u = new URL(gcalUrl(ALLDAY));
  assert.equal(u.searchParams.get("dates"), "20301231/20310101");
  assert.equal(u.searchParams.get("text"), "❤️ Date: Aktiv sein");
});

// ---------- ICS (Apple) ----------

test("ICS: gültiger Termin mit Zeiten, Erinnerung und Escaping", () => {
  const ics = icsText(EVENING, { uid: "abc@date", now: new Date("2026-09-29T12:00:00Z") });
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines[lines.length - 1], "END:VCALENDAR");
  assert.ok(lines.includes("UID:abc@date"));
  assert.ok(lines.includes("DTSTAMP:20260929T120000Z"));
  assert.ok(lines.includes("DTSTART:20301012T180000"));
  assert.ok(lines.includes("DTEND:20301013T000000"));
  assert.ok(lines.includes("SUMMARY:❤️ Date: Kino (Komödie)"));
  assert.ok(lines.some(l => l.startsWith("DESCRIPTION:") && l.includes("Popcorn\\, süß\\; bitte")));
  assert.ok(lines.includes("TRIGGER:-P1D"));
});

test("ICS: ganzer Tag als Datums-Termin", () => {
  const lines = icsText(ALLDAY, { uid: "x", now: new Date() }).split("\r\n");
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20301231"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20310101"));
});

// ---------- Apple-Link und Rückweg ----------

test("Apple-Link zeigt auf kalender.html neben der Seite und enthält alle Angaben", () => {
  const u = new URL(appleUrl(EVENING, "https://xaver2009.github.io/Date/?x=1"));
  assert.equal(u.origin + u.pathname, "https://xaver2009.github.io/Date/kalender.html");
  assert.equal(u.searchParams.get("what"), "Kino");
  assert.equal(u.searchParams.get("date"), "2030-10-12");
  assert.equal(u.searchParams.get("time"), "Abends");
});

test("Apple-Link → stateFromQuery ergibt wieder denselben Termin", () => {
  const u = new URL(appleUrl(EVENING, "https://example.com/Date/"));
  assert.deepEqual(stateFromQuery(u.search), EVENING);
  const u2 = new URL(appleUrl(ALLDAY, "https://example.com/Date/"));
  assert.deepEqual(stateFromQuery(u2.search), ALLDAY);
});

test("stateFromQuery lehnt kaputte oder fehlende Angaben ab", () => {
  assert.equal(stateFromQuery(""), null);
  assert.equal(stateFromQuery("?what=Kino&time=Abends"), null);
  assert.equal(stateFromQuery("?what=Kino&date=12.10.2030&time=Abends"), null);
  assert.equal(stateFromQuery("?what=Kino&date=2030-10-12"), null);
});
