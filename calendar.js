// Kalender-Termin fürs Date: Google-Link, ICS-Datei (Apple) und Link auf kalender.html.
// Läuft im Browser (window.DateCalendar) und in Node für die Tests (module.exports).
(function (root) {
  const TIMES = {
    "Vormittags": ["090000", "120000"],
    "Mittags": ["130000", "170000"],
    "Abends": ["180000", "000000", true]
  };
  const ACT_NAME = {
    "Sauna": "Sauna", "Essen gehen": "Essen gehen", "Aktiv": "Aktiv sein",
    "Kino": "Kino", "Gemütlich": "Gemütlich", "Überraschung": "Überraschung"
  };

  function eventData(state) {
    const day = state.date.replace(/-/g, "");
    const [y, m, d] = state.date.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    const nextDay = next.getFullYear() + String(next.getMonth() + 1).padStart(2, "0") + String(next.getDate()).padStart(2, "0");
    const t = TIMES[state.time];
    const name = ACT_NAME[state.what] || state.what;
    const title = "❤️ Date: " + name + (state.detail ? " (" + state.detail + ")" : "");
    let desc = "Unser Date ❤️ " + name + (state.detail ? ", " + state.detail : "") + ".";
    if (state.wishes) desc += " Wünsche: " + state.wishes;
    return { day, nextDay, t, title, desc };
  }

  function gcalUrl(state) {
    const c = eventData(state);
    const dates = c.t ? c.day + "T" + c.t[0] + "/" + (c.t[2] ? c.nextDay : c.day) + "T" + c.t[1] : c.day + "/" + c.nextDay;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(c.title) +
      "&dates=" + dates +
      "&details=" + encodeURIComponent(c.desc);
  }

  function icsEscape(str) {
    return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function icsText(state, { uid = Date.now() + "@date", now = new Date() } = {}) {
    const c = eventData(state);
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Date//DE", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
      c.t ? "DTSTART:" + c.day + "T" + c.t[0] : "DTSTART;VALUE=DATE:" + c.day,
      c.t ? "DTEND:" + (c.t[2] ? c.nextDay : c.day) + "T" + c.t[1] : "DTEND;VALUE=DATE:" + c.nextDay,
      "SUMMARY:" + icsEscape(c.title),
      "DESCRIPTION:" + icsEscape(c.desc),
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Morgen ist unser Date ❤️", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
  }

  // Link auf kalender.html (liegt neben der Date-Seite): dort Apple (ICS) oder Google wählen
  function calendarPageUrl(state, baseHref) {
    const u = new URL("kalender.html", baseHref);
    u.search = new URLSearchParams({
      what: state.what, detail: state.detail || "", wishes: state.wishes || "", date: state.date, time: state.time
    }).toString();
    return u.toString();
  }

  function stateFromQuery(search) {
    const p = new URLSearchParams(search);
    const state = {
      what: p.get("what") || "", detail: p.get("detail") || "", wishes: p.get("wishes") || "",
      date: p.get("date") || "", time: p.get("time") || ""
    };
    if (!state.what || !state.time || !/^\d{4}-\d{2}-\d{2}$/.test(state.date)) return null;
    return state;
  }

  // Lädt die ICS-Datei herunter; Apple-Geräte bieten dann "Zum Kalender hinzufügen" an
  function downloadIcs(state, doc) {
    const blob = new Blob([icsText(state)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url; a.download = "unser-date.ics";
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const api = { eventData, gcalUrl, icsText, calendarPageUrl, stateFromQuery, downloadIcs };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DateCalendar = api;
})(this);
