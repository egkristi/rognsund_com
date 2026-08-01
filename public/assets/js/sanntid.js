/* ==========================================================================
   sanntid.js — viser levende data der siden ber om det.
   Alt hentes fra /api/* på rognsund.com; nettleseren snakker aldri med
   tredjepart. Månefasen regnes ut lokalt, uten datakilde i det hele tatt.
   Elementer melder seg på med data-attributter:
     data-avganger   neste båtavganger og avvik
     data-vaer       værvarsel for sundet
     data-tidevann   flo og fjære
     data-nordlys    Kp-indeks nå og i natt
     data-maane      månefase (regnes lokalt)
     data-nytt       nyhetssaker som nevner bygda
     data-baater     fartøy i sundet (AIS)
   ========================================================================== */
(function () {
  "use strict";

  var SONE = "Europe/Oslo";
  var UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

  /* Rutesider hos Havspor, med kart og sanntidsposisjon for båtene. */
  var RUTELENKER = {
    B310: "https://havspor.no/rute/altafjordxpressen",
    B330: "https://havspor.no/rute/vargsundxpressen",
    B340: "https://havspor.no/rute/skyssbaat-rognsund"
  };

  /* --- Små hjelpere -------------------------------------------------------- */

  function hent(sti, vis, vert) {
    fetch(sti)
      .then(function (r) {
        if (!r.ok) throw new Error(sti + " svarte " + r.status);
        return r.json();
      })
      .then(function (data) { vis(vert, data); })
      .catch(function () {
        vert.innerHTML = "";
        var p = document.createElement("p");
        p.className = "dempet";
        p.textContent = "Dataene lot seg ikke hente akkurat nå. " +
          "Prøv å laste siden på nytt, eller bruk lenken til kilden.";
        vert.appendChild(p);
      });
  }

  function klokke(iso) {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      timeZone: SONE, hour: "2-digit", minute: "2-digit"
    });
  }

  function datoStubb(dato) {
    return dato.toLocaleDateString("sv-SE", { timeZone: SONE });
  }

  function dagNavn(iso) {
    var d = new Date(iso);
    var iDag = new Date();
    if (datoStubb(d) === datoStubb(iDag)) return "";
    var iMorgen = new Date(iDag.getTime() + 86400000);
    if (datoStubb(d) === datoStubb(iMorgen)) return "i morgen";
    return UKEDAG[d.getDay()];
  }

  function tidMedDag(iso) {
    var dag = dagNavn(iso);
    return klokke(iso) + (dag ? " " + dag : "");
  }

  function himmelretning(grader) {
    var navn = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
    return navn[Math.round(grader / 45) % 8];
  }

  function tall(verdi) {
    return String(verdi).replace(".", ",");
  }

  function el(navn, klasse, tekst) {
    var n = document.createElement(navn);
    if (klasse) n.className = klasse;
    if (tekst) n.textContent = tekst;
    return n;
  }

  function liste(vert) {
    vert.innerHTML = "";
    var ul = el("ul", "sanntidsliste");
    vert.appendChild(ul);
    return ul;
  }

  function rad(ul, tid, tekst, klasse) {
    var li = el("li", klasse);
    li.appendChild(el("span", "tid", tid));
    li.appendChild(el("span", null, tekst));
    ul.appendChild(li);
    return li;
  }

  /* --- Avganger ------------------------------------------------------------ */

  function visAvganger(vert, data) {
    vert.innerHTML = "";
    (data.avvik || []).forEach(function (tekst) {
      var avvik = el("p", "melding", null);
      avvik.textContent = "Avvik: " + tekst;
      vert.appendChild(avvik);
    });
    var noe = false;
    (data.kaier || []).forEach(function (kai) {
      if (!kai.avganger.length) return;
      noe = true;
      vert.appendChild(el("h4", "sanntid-kai", kai.navn));
      var ul = el("ul", "sanntidsliste");
      kai.avganger.slice(0, 3).forEach(function (a) {
        var hale = " mot " + a.mot;
        if (a.innstilt) hale += " — innstilt";
        else if (a.sanntid && a.ventet !== a.planlagt) {
          hale += " (rutetid " + klokke(a.planlagt) + ")";
        }
        var li = el("li", a.innstilt ? "innstilt" : null);
        li.appendChild(el("span", "tid", tidMedDag(a.ventet || a.planlagt)));
        var tekst = el("span");
        if (RUTELENKER[a.linje]) {
          var lenke = el("a", null, a.linje);
          lenke.href = RUTELENKER[a.linje];
          lenke.title = "Rutekart og sanntid hos Havspor";
          tekst.appendChild(lenke);
          tekst.appendChild(document.createTextNode(hale));
        } else {
          tekst.textContent = a.linje + hale;
        }
        li.appendChild(tekst);
        ul.appendChild(li);
      });
      vert.appendChild(ul);
    });
    if (!noe) {
      vert.appendChild(el("p", "dempet",
        "Ingen avganger er lagt inn hos Entur for den kommende uka."));
    }
  }

  /* --- Vær ------------------------------------------------------------------ */

  function visVaer(vert, data) {
    var timer = data.timer || [];
    if (!timer.length) throw new Error("tomt værvarsel");
    vert.innerHTML = "";

    var naa = timer[0];
    vert.appendChild(el("p", "sanntid-naa",
      Math.round(naa.temperatur) + " °C · vind " + Math.round(naa.vind) +
      " m/s fra " + himmelretning(naa.vindretning)));

    var ul = el("ul", "sanntidsliste");
    [3, 6, 9, 12].forEach(function (i) {
      var t = timer[i];
      if (!t) return;
      var tekst = Math.round(t.temperatur) + " °C · " + Math.round(t.vind) + " m/s";
      if (t.nedbør > 0) tekst += " · " + tall(t.nedbør) + " mm";
      rad(ul, tidMedDag(t.tid), tekst);
    });
    vert.appendChild(ul);
  }

  /* --- Tidevann ------------------------------------------------------------- */

  function visTidevann(vert, data) {
    var naa = Date.now();
    var kommende = (data.vannstander || []).filter(function (v) {
      return new Date(v.tid).getTime() > naa;
    });
    if (!kommende.length) throw new Error("ingen kommende tidevann");
    vert.innerHTML = "";
    var ul = el("ul", "sanntidsliste");
    kommende.slice(0, 4).forEach(function (v) {
      rad(ul, tidMedDag(v.tid),
          (v.type === "flo" ? "Flo" : "Fjære") + " · " + v.cm + " cm");
    });
    vert.appendChild(ul);
    if (data.justering) vert.appendChild(el("p", "dempet", data.justering + "."));
  }

  /* --- Nordlys -------------------------------------------------------------- */

  function visNordlys(vert, data) {
    vert.innerHTML = "";
    if (data.naa) {
      vert.appendChild(el("p", "sanntid-naa", "Kp " + tall(data.naa.kp) + " nå"));
    }
    var maks = 0;
    (data.varsel || []).slice(0, 8).forEach(function (p) {
      if (p.kp > maks) maks = p.kp;
    });
    var tekst;
    if (maks >= 5) tekst = "Varselet melder sterk aktivitet (Kp opp mot " +
      tall(maks) + ") det nærmeste døgnet.";
    else if (maks >= 3) tekst = "Varselet melder god aktivitet (Kp opp mot " +
      tall(maks) + ") det nærmeste døgnet.";
    else tekst = "Varselet melder rolige forhold (Kp opp mot " + tall(maks) +
      ") det nærmeste døgnet.";
    vert.appendChild(el("p", null, tekst + " Ved 70 grader nord kan nordlys " +
      "ses selv ved lav Kp — det som trengs, er mørk og klar himmel."));
  }

  /* --- Månen: regnes lokalt, som lysåret ------------------------------------ */

  var SYNODISK = 29.530588853;                    // døgn fra nymåne til nymåne
  var KJENT_NYMAANE = Date.UTC(2000, 0, 6, 18, 14); // nymåne 6. januar 2000

  function visMaane(vert) {
    var alder = ((Date.now() - KJENT_NYMAANE) / 86400000) % SYNODISK;
    var opplyst = Math.round((1 - Math.cos(2 * Math.PI * alder / SYNODISK)) * 50);
    var fase;
    if (alder < 1 || alder > SYNODISK - 1) fase = "nymåne";
    else if (Math.abs(alder - SYNODISK / 2) < 1) fase = "fullmåne";
    else if (alder < SYNODISK / 2) fase = "voksende måne";
    else fase = "minkende måne";
    var tilFull = (SYNODISK / 2 - alder + SYNODISK) % SYNODISK;
    vert.textContent = "Omtrent " + fase + " i natt, " + opplyst +
      " prosent opplyst" +
      (fase === "fullmåne" ? "." : " — " + Math.round(tilFull) +
        " døgn til neste fullmåne.") +
      " Lite måne gir mørkere himmel og tydeligere nordlys.";
  }

  /* --- Nyheter --------------------------------------------------------------- */

  function visNytt(vert, data) {
    vert.innerHTML = "";
    if (!data.saker || !data.saker.length) {
      vert.appendChild(el("p", "dempet",
        "Ingen ferske saker hos " + (data.kilder || []).join(" eller ") +
        " nevner området akkurat nå."));
      return;
    }
    var ul = el("ul", "sanntidsliste");
    data.saker.forEach(function (sak) {
      var li = el("li");
      var a = el("a", null, sak.tittel);
      a.href = sak.lenke;
      li.appendChild(a);
      var d = new Date(sak.dato);
      li.appendChild(el("span", "tid", sak.kilde +
        (isNaN(d) ? "" : " · " + d.toLocaleDateString("nb-NO",
          { timeZone: SONE, day: "numeric", month: "short" }))));
      ul.appendChild(li);
    });
    vert.appendChild(ul);
  }

  /* --- Båter i sundet ---------------------------------------------------------- */

  function visBaater(vert, data) {
    vert.innerHTML = "";
    if (!data.konfigurert) {
      var p = el("p", "dempet", "Posisjonsdata er ikke koblet til ennå. ");
      var lenke = el("a", null, "Følg båtene på kart hos Havspor");
      lenke.href = RUTELENKER.B340;
      p.appendChild(lenke);
      p.appendChild(document.createTextNode("."));
      vert.appendChild(p);
      return;
    }
    if (!data.baater.length) {
      vert.appendChild(el("p", "dempet",
        "Ingen fartøy med AIS-sender i sundet akkurat nå."));
      return;
    }
    var ul = el("ul", "sanntidsliste");
    data.baater.slice(0, 8).forEach(function (b) {
      var tekst = typeof b.fart === "number" ?
        Math.round(b.fart) + " knop" : "";
      if (b.destinasjon) tekst += (tekst ? " · mot " : "Mot ") + b.destinasjon;
      rad(ul, b.navn, tekst || "ligger i ro");
    });
    vert.appendChild(ul);
  }

  /* --- Påmelding ---------------------------------------------------------------- */

  var deler = [
    ["[data-avganger]", "/api/avganger", visAvganger],
    ["[data-vaer]", "/api/vaer", visVaer],
    ["[data-tidevann]", "/api/tidevann", visTidevann],
    ["[data-nordlys]", "/api/nordlys", visNordlys],
    ["[data-nytt]", "/api/nytt", visNytt],
    ["[data-baater]", "/api/baater", visBaater]
  ];
  deler.forEach(function (del) {
    var vert = document.querySelector(del[0]);
    if (vert) hent(del[1], del[2], vert);
  });

  var maane = document.querySelector("[data-maane]");
  if (maane) visMaane(maane);
})();
