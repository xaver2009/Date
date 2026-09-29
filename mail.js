// E-Mail-Versand über Web3Forms (https://web3forms.com) – kein eigener Server nötig.
// Der Zugangsschlüssel ist für den Einsatz im Browser gedacht und darf öffentlich sein.
// Läuft im Browser (window.DateMail) und in Node für die Tests (module.exports).
(function (root) {
  const WEB3FORMS_URL = "https://api.web3forms.com/submit";

  function buildMailFields(state, { prettyDate, tries, calendarUrl }) {
    return {
      subject: "Sie hat JA gesagt! Date-Anfrage ausgefüllt",
      from_name: "Date-Webseite",
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
  function createMailer({ accessKey, fetch, timeoutMs = 15000 }) {
    let pending = null;
    let sent = false;

    async function post(fields) {
      if (!accessKey) return { ok: false, reason: "Kein Zugangsschlüssel eingetragen" };
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const res = await fetch(WEB3FORMS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ access_key: accessKey, ...fields }),
          signal: controller.signal
        });
        let data = null;
        try { data = await res.json(); } catch (e) { if (res.ok) throw e; }
        const message = data && data.message;
        if (!res.ok) return { ok: false, reason: message || "HTTP " + res.status };
        if (data && (data.success === true || data.success === "true")) return { ok: true };
        return { ok: false, reason: message || "Unbekannte Antwort" };
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

  const api = { buildMailFields, createMailer, WEB3FORMS_URL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DateMail = api;
})(this);
