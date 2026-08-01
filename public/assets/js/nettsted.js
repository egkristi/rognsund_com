/* ==========================================================================
   nettsted.js — meny, arrangementsliste og kontaktskjema.
   ========================================================================== */
(function () {
  "use strict";

  /* --- Meny på liten skjerm ---------------------------------------------- */
  var knapp = document.querySelector(".meny-knapp");
  var meny = document.getElementById("hovedmeny");
  if (knapp && meny) {
    knapp.addEventListener("click", function () {
      var apen = meny.classList.toggle("er-apen");
      knapp.setAttribute("aria-expanded", apen ? "true" : "false");
      knapp.textContent = apen ? "Lukk" : "Meny";
    });
  }

  /* --- Arrangementer ------------------------------------------------------ */
  var MND = ["jan", "feb", "mar", "apr", "mai", "jun",
             "jul", "aug", "sep", "okt", "nov", "des"];

  function lagHendelse(h, erForbi) {
    var d = new Date(h.dato + "T00:00:00");
    var li = document.createElement("li");
    li.className = "hendelse" + (erForbi ? " hendelse--forbi" : "");

    var dato = document.createElement("div");
    dato.className = "hendelse-dato";
    var tall = document.createElement("b");
    tall.textContent = isNaN(d) ? "" : d.getDate();
    dato.appendChild(tall);
    dato.appendChild(document.createTextNode(
      isNaN(d) ? h.dato : MND[d.getMonth()] + " " + d.getFullYear()
    ));

    var tekst = document.createElement("div");
    var h3 = document.createElement("h3");
    h3.textContent = h.tittel;
    tekst.appendChild(h3);
    if (h.beskrivelse) {
      var p = document.createElement("p");
      p.textContent = h.beskrivelse;
      tekst.appendChild(p);
    }
    var linje = [];
    if (h.tid) linje.push(h.tid);
    if (h.sted) linje.push(h.sted);
    if (h.arrangor) linje.push(h.arrangor);
    if (linje.length) {
      var sted = document.createElement("div");
      sted.className = "hendelse-sted";
      sted.textContent = linje.join(" · ");
      tekst.appendChild(sted);
    }

    li.appendChild(dato);
    li.appendChild(tekst);
    return li;
  }

  function visHendelser() {
    var vert = document.querySelector("[data-hendelser]");
    if (!vert) return;
    var maks = parseInt(vert.getAttribute("data-hendelser"), 10) || 0;
    var visForbi = vert.hasAttribute("data-vis-forbi");

    fetch("/data/arrangementer.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("Fant ikke arrangementene");
        return r.json();
      })
      .then(function (data) {
        var liste = (data.arrangementer || []).slice().sort(function (a, b) {
          return a.dato < b.dato ? -1 : a.dato > b.dato ? 1 : 0;
        });
        var idag = new Date().toISOString().slice(0, 10);
        var kommende = liste.filter(function (h) { return h.dato >= idag; });
        var forbi = liste.filter(function (h) { return h.dato < idag; }).reverse();

        vert.innerHTML = "";
        if (!kommende.length && !(visForbi && forbi.length)) {
          var tom = document.createElement("p");
          tom.className = "dempet";
          tom.textContent = "Ingen arrangementer er lagt inn ennå. " +
            "Har du noe på gang? Send det inn, så legger vi det ut.";
          vert.replaceWith(tom);
          return;
        }

        var ul = document.createElement("ul");
        ul.className = "hendelser";
        (maks ? kommende.slice(0, maks) : kommende).forEach(function (h) {
          ul.appendChild(lagHendelse(h, false));
        });
        if (visForbi) {
          forbi.slice(0, 8).forEach(function (h) {
            ul.appendChild(lagHendelse(h, true));
          });
        }
        vert.innerHTML = "";
        vert.appendChild(ul);
      })
      .catch(function () {
        vert.innerHTML = "";
        var feil = document.createElement("p");
        feil.className = "dempet";
        feil.textContent = "Arrangementene lot seg ikke hente akkurat nå. " +
          "Prøv å laste siden på nytt.";
        vert.appendChild(feil);
      });
  }
  visHendelser();

  /* --- Kontaktskjema ------------------------------------------------------ */
  var skjema = document.getElementById("kontaktskjema");
  if (skjema) {
    var svar = document.getElementById("skjemasvar");
    skjema.addEventListener("submit", function (e) {
      e.preventDefault();
      var knappen = skjema.querySelector("button[type=submit]");
      var data = {};
      new FormData(skjema).forEach(function (v, k) { data[k] = v; });

      knappen.disabled = true;
      knappen.textContent = "Sender …";
      svar.className = "melding skjult";

      fetch("/api/kontakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            skjema.reset();
            svar.className = "melding melding--ok";
            svar.textContent = res.j.melding ||
              "Meldingen er sendt. Vi svarer så fort noen får sett på den.";
          } else {
            svar.className = "melding";
            svar.textContent = res.j.melding ||
              "Meldingen gikk ikke igjennom. Sjekk feltene og prøv igjen.";
          }
        })
        .catch(function () {
          svar.className = "melding";
          svar.textContent = "Ingen kontakt med serveren. Prøv igjen, " +
            "eller send en e-post direkte.";
        })
        .then(function () {
          knappen.disabled = false;
          knappen.textContent = "Send melding";
          svar.focus();
        });
    });
  }

  /* --- Årstall i bunnteksten ---------------------------------------------- */
  var aar = document.querySelector("[data-aar]");
  if (aar) aar.textContent = new Date().getFullYear();
})();
