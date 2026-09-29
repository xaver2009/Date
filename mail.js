// E-Mail-Versand über FormSubmit (https://formsubmit.co) – kein eigener Server nötig.
// Läuft im Browser (window.DateMail) und in Node für die Tests (module.exports).
(function (root) {
  const FORMSUBMIT_URL = "https://formsubmit.co/ajax/";

  function buildMailFields(state, { prettyDate, tries, calendarUrl }) {
    return {
      _subject: "Sie hat JA gesagt! Date-Anfrage ausgefüllt",
      _template: "table",
      _captcha: "false",
      "Was": state.what,
      "Genauer": state.detail || "-",
      "Datum": prettyDate,
      "Tageszeit": state.time,
      "Sonstige Wünsche": state.wishes || "-",
      "Nein-Versuche": String(tries),
      "In Kalender eintragen": calendarUrl
    };
  }

  // send() liefert immer { ok: true } oder { ok: false, reason } – wirft nie.
  // Solange ein Versand läuft oder einer geklappt hat, wird nicht erneut gesendet.
  function createMailer({ email, fetch, timeoutMs = 15000 }) {
    let pending = null;
    let sent = false;

    async function post(fields) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const res = await fetch(FORMSUBMIT_URL + email, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(fields),
          signal: controller.signal
        });
        if (!res.ok) return { ok: false, reason: "HTTP " + res.status };
        const data = await res.json();
        if (data && (data.success === true || data.success === "true")) return { ok: true };
        return { ok: false, reason: (data && data.message) || "Unbekannte Antwort" };
      } catch (err) {
        return { ok: false, reason: timedOut ? "Zeitüberschreitung" : String(err && err.message || err) };
      } finally {
        clearTimeout(timer);
      }
    }

    function send(fields) {
      if (sent) return Promise.resolve({ ok: true });
      if (!pending) {
        pending = post(fields).then(result => {
          if (result.ok) sent = true;
          pending = null;
          return result;
        });
      }
      return pending;
    }

    return { send };
  }

  const api = { buildMailFields, createMailer, FORMSUBMIT_URL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DateMail = api;
})(this);
