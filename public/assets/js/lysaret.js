/* ==========================================================================
   lysaret.js — tegner lysåret ved Rognsundet.
   Regner ut soloppgang, solnedgang og tussmørke for hver dag i året med
   NOAAs solalgoritme, og tegner det som et SVG-diagram. Ingen data hentes
   utenfra — alt regnes i nettleseren.
   ========================================================================== */
(function () {
  "use strict";

  /* Posisjonen diagrammet regnes for. Juster om du vil bruke et annet
     punkt i bygda (f.eks. kaia på Altneset eller Hakkstabben). */
  var BREDDE = 70.39;      // grader nord
  var LENGDE = 23.07;      // grader øst
  var SONE = "Europe/Oslo";

  var MND = ["jan", "feb", "mar", "apr", "mai", "jun",
             "jul", "aug", "sep", "okt", "nov", "des"];
  var MND_LANG = ["januar", "februar", "mars", "april", "mai", "juni",
                  "juli", "august", "september", "oktober", "november", "desember"];

  var rad = Math.PI / 180;
  function grad(x) { return x / rad; }

  /* --- Tidssone: hvor mange minutter Norge ligger foran UTC den dagen --- */
  function soneforskjell(dato) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: SONE, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    var d = {};
    f.formatToParts(dato).forEach(function (p) { d[p.type] = p.value; });
    var lokalSomUtc = Date.UTC(+d.year, d.month - 1, +d.day,
                               (+d.hour) % 24, +d.minute, +d.second);
    return Math.round((lokalSomUtc - dato.getTime()) / 60000);
  }

  /* --- NOAAs solalgoritme ------------------------------------------------ */
  function julianskDag(aar, mnd, dag) {
    if (mnd <= 2) { aar -= 1; mnd += 12; }
    var A = Math.floor(aar / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (aar + 4716)) +
           Math.floor(30.6001 * (mnd + 1)) + dag + B - 1524.5;
  }

  function solposisjon(jd) {
    var T = (jd - 2451545) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) +
            Math.sin(3 * M * rad) * 0.000289;
    var sann = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lambda = sann - 0.00569 - 0.00478 * Math.sin(omega * rad);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * rad);
    var dekl = grad(Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)));
    var y = Math.tan(eps / 2 * rad) * Math.tan(eps / 2 * rad);
    var tidsligning = 4 * grad(
      y * Math.sin(2 * L0 * rad) -
      2 * e * Math.sin(M * rad) +
      4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
      0.5 * y * y * Math.sin(4 * L0 * rad) -
      1.25 * e * e * Math.sin(2 * M * rad)
    );
    return { dekl: dekl, tidsligning: tidsligning };
  }

  /* Klokkeslett (minutter etter midnatt, lokal tid) for en gitt solhøyde.
     senit 90.833 = soloppgang/-nedgang, 96 = borgerlig tussmørke.
     Returnerer null når sola aldri når den høyden det døgnet. */
  function tider(dato, senit) {
    var jd = julianskDag(dato.getFullYear(), dato.getMonth() + 1, dato.getDate()) + 0.5;
    var s = solposisjon(jd);
    var offset = soneforskjell(dato);
    var midt = 720 - 4 * LENGDE - s.tidsligning + offset;
    var arg = Math.cos(senit * rad) /
              (Math.cos(BREDDE * rad) * Math.cos(s.dekl * rad)) -
              Math.tan(BREDDE * rad) * Math.tan(s.dekl * rad);
    if (arg > 1) return { over: false, hele: false, midt: midt };   // aldri over
    if (arg < -1) return { over: false, hele: true, midt: midt };   // hele døgnet
    var ha = grad(Math.acos(arg));
    return { over: true, hele: false, midt: midt, fra: midt - 4 * ha, til: midt + 4 * ha };
  }

  function dagslys(dato) { return tider(dato, 90.833); }
  function skumring(dato) { return tider(dato, 96); }

  /* Nær midnattssola kan sola gå ned etter midnatt. Del opp i biter som
     ligger innenfor døgnet, slik at diagrammet ikke får falske hull. */
  function biter(fra, til) {
    var ut = [];
    if (til > 1440) { ut.push([0, til - 1440]); til = 1440; }
    if (fra < 0) { ut.push([1440 + fra, 1440]); fra = 0; }
    if (til > fra) ut.push([fra, til]);
    return ut;
  }

  function klokke(minutter) {
    var m = ((Math.round(minutter) % 1440) + 1440) % 1440;
    var t = Math.floor(m / 60);
    return (t < 10 ? "0" : "") + t + ":" + (m % 60 < 10 ? "0" : "") + (m % 60);
  }

  function varighet(minutter) {
    var m = Math.max(0, Math.round(minutter));
    return Math.floor(m / 60) + " t " + (m % 60) + " min";
  }

  function dagerIAar(aar) {
    return (aar % 4 === 0 && aar % 100 !== 0) || aar % 400 === 0 ? 366 : 365;
  }

  /* --- Tegning ----------------------------------------------------------- */
  var NS = "http://www.w3.org/2000/svg";
  function el(navn, attr) {
    var n = document.createElementNS(NS, navn);
    for (var k in attr) { if (attr[k] !== null) n.setAttribute(k, attr[k]); }
    return n;
  }

  function tegn(vert, iDag) {
    var aar = iDag.getFullYear();
    var antall = dagerIAar(aar);

    var B = 960, H = 300;                 // tegneflate
    var mv = 34, mh = 26, mo = 14, mu = 30;  // marger: venstre, høyre, opp, ned
    var teg = { x: mv, y: mo, b: B - mv - mh, h: H - mo - mu };

    var svg = el("svg", {
      viewBox: "0 0 " + B + " " + H,
      role: "img",
      "aria-label": "Diagram over lyset gjennom året ved Rognsundet: " +
        "mørketid rundt årsskiftet, midnattssol om sommeren."
    });

    var xForDag = function (i) { return teg.x + (i / antall) * teg.b; };
    var yForTime = function (min) { return teg.y + (min / 1440) * teg.h; };

    /* natt = bunnfargen på flata */
    svg.appendChild(el("rect", {
      x: teg.x, y: teg.y, width: teg.b, height: teg.h,
      fill: "#0a1a26", rx: 4
    }));

    /* timelinjer */
    [0, 6, 12, 18, 24].forEach(function (t) {
      var y = yForTime(t * 60);
      svg.appendChild(el("line", {
        x1: teg.x, x2: teg.x + teg.b, y1: y, y2: y,
        stroke: "#1c3a4e", "stroke-width": 1
      }));
      var m = el("text", {
        x: teg.x - 8, y: y + 3.5, "text-anchor": "end",
        fill: "#5d7f95", "font-size": 9.5,
        "font-family": "IBM Plex Mono, monospace"
      });
      m.textContent = (t < 10 ? "0" : "") + t;
      svg.appendChild(m);
    });

    /* to lag: skumring bak, dagslys foran */
    var lag = el("g", { class: "lysaret-sveip" });
    var dSkum = [], dDag = [];

    for (var i = 0; i < antall; i++) {
      var d = new Date(aar, 0, 1 + i);
      var x = (xForDag(i) + xForDag(i + 1)) / 2;
      var bredde = teg.b / antall;

      var sk = skumring(d);
      if (sk.hele) {
        dSkum.push("M" + x.toFixed(2) + "," + teg.y + "V" + (teg.y + teg.h));
      } else if (sk.over) {
        biter(sk.fra, sk.til).forEach(function (b) {
          dSkum.push("M" + x.toFixed(2) + "," + yForTime(b[0]).toFixed(2) +
                     "V" + yForTime(b[1]).toFixed(2));
        });
      }

      var dl = dagslys(d);
      if (dl.hele) {
        dDag.push("M" + x.toFixed(2) + "," + teg.y + "V" + (teg.y + teg.h));
      } else if (dl.over) {
        biter(dl.fra, dl.til).forEach(function (b) {
          dDag.push("M" + x.toFixed(2) + "," + yForTime(b[0]).toFixed(2) +
                    "V" + yForTime(b[1]).toFixed(2));
        });
      }
      void bredde;
    }

    lag.appendChild(el("path", {
      d: dSkum.join(""), stroke: "#2f5f7d",
      "stroke-width": (teg.b / antall) + 0.35, fill: "none"
    }));
    lag.appendChild(el("path", {
      d: dDag.join(""), stroke: "#f7e6bd",
      "stroke-width": (teg.b / antall) + 0.35, fill: "none"
    }));
    svg.appendChild(lag);

    /* månedsmerker */
    for (var m2 = 0; m2 < 12; m2++) {
      var start = Math.round((new Date(aar, m2, 1) - new Date(aar, 0, 1)) / 86400000);
      var mx = xForDag(start);
      if (m2 > 0) {
        svg.appendChild(el("line", {
          x1: mx, x2: mx, y1: teg.y, y2: teg.y + teg.h,
          stroke: "#ffffff", "stroke-opacity": 0.09, "stroke-width": 1
        }));
      }
      var t2 = el("text", {
        x: mx + 3, y: teg.y + teg.h + 15,
        fill: "#5d7f95", "font-size": 9.5,
        "font-family": "IBM Plex Mono, monospace"
      });
      t2.textContent = MND[m2];
      svg.appendChild(t2);
    }

    /* dagens dato */
    var iDagIndeks = Math.round((new Date(aar, iDag.getMonth(), iDag.getDate()) -
                                 new Date(aar, 0, 1)) / 86400000);
    var dx = xForDag(iDagIndeks + 0.5);
    svg.appendChild(el("line", {
      x1: dx, x2: dx, y1: teg.y - 4, y2: teg.y + teg.h + 4,
      stroke: "#d6006e", "stroke-width": 1.6
    }));
    var flagg = el("g");
    var lapp = el("text", {
      x: dx + (iDagIndeks / antall > 0.82 ? -6 : 6), y: teg.y + 12,
      fill: "#ff5fa8", "font-size": 10, "font-weight": 500,
      "text-anchor": iDagIndeks / antall > 0.82 ? "end" : "start",
      "font-family": "IBM Plex Mono, monospace"
    });
    lapp.textContent = "i dag";
    flagg.appendChild(lapp);
    svg.appendChild(flagg);

    vert.innerHTML = "";
    vert.appendChild(svg);
  }

  /* --- Dagens tall ------------------------------------------------------- */
  function nesteOvergang(fra, test) {
    var d = new Date(fra.getFullYear(), fra.getMonth(), fra.getDate());
    for (var i = 1; i <= 220; i++) {
      d.setDate(d.getDate() + 1);
      if (test(d)) return { dager: i, dato: new Date(d) };
    }
    return null;
  }

  function datoTekst(d) {
    return d.getDate() + ". " + MND_LANG[d.getMonth()];
  }

  function status(vert, iDag) {
    var dl = dagslys(iDag);
    var sk = skumring(iDag);
    var felt = [];

    if (dl.hele) {
      var slutt = nesteOvergang(iDag, function (d) { return !dagslys(d).hele; });
      felt.push(["Lyset nå", "Midnattssol", "sola går ikke ned"]);
      felt.push(["Soloppgang", "—", "sola er oppe hele døgnet"]);
      felt.push(["Solnedgang", "—", slutt
        ? "første solnedgang " + datoTekst(slutt.dato) : ""]);
      felt.push(["Dagslengde", "24 t 0 min", slutt
        ? slutt.dager + " døgn igjen med midnattssol" : ""]);
    } else if (!dl.over) {
      var opp = nesteOvergang(iDag, function (d) { return dagslys(d).over || dagslys(d).hele; });
      var skumTekst = sk.over
        ? klokke(sk.fra) + "–" + klokke(sk.til)
        : "ingen";
      felt.push(["Lyset nå", "Mørketid", "sola er under horisonten"]);
      felt.push(["Skumring", skumTekst, "lyseste timene midt på dagen"]);
      felt.push(["Sola er tilbake", opp ? datoTekst(opp.dato) : "—", opp
        ? "om " + opp.dager + " døgn" : ""]);
      felt.push(["Nordlys", "Sesong", "mørket gir de beste sjansene"]);
    } else {
      var lengde = dl.til - dl.fra;
      felt.push(["Soloppgang", klokke(dl.fra), "over Rognsundet"]);
      felt.push(["Solnedgang", klokke(dl.til),
        dl.til > 1440 ? "natt til neste dag" : "lokal tid"]);
      felt.push(["Dagslengde", varighet(lengde), ""]);
      var iMorgen = new Date(iDag.getFullYear(), iDag.getMonth(), iDag.getDate() + 1);
      var dm = dagslys(iMorgen);
      var endring = dm.hele ? null : (dm.over ? (dm.til - dm.fra) - lengde : null);
      felt.push(["I morgen", endring === null ? "—" :
        (endring >= 0 ? "+" : "−") + Math.abs(Math.round(endring)) + " min",
        endring === null ? "" : (endring >= 0 ? "lysere" : "mørkere")]);
    }

    vert.innerHTML = "";
    felt.forEach(function (f) {
      var boks = document.createElement("div");
      var dt = document.createElement("dt");
      dt.textContent = f[0];
      var dd = document.createElement("dd");
      dd.appendChild(document.createTextNode(f[1]));
      if (f[2]) {
        var s = document.createElement("small");
        s.textContent = f[2];
        dd.appendChild(s);
      }
      boks.appendChild(dt);
      boks.appendChild(dd);
      vert.appendChild(boks);
    });
  }

  /* --- Start ------------------------------------------------------------- */
  function start() {
    var diagram = document.getElementById("lysaret-diagram");
    var tall = document.getElementById("lysaret-tall");
    if (!diagram && !tall) return;
    var iDag = new Date();
    try {
      if (diagram) tegn(diagram, iDag);
      if (tall) status(tall, iDag);
    } catch (e) {
      if (diagram) diagram.remove();
      if (tall) tall.remove();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
