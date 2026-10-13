/* ==========================================================================
   kart.js — kartsida.
   Tegner sjøkart og topografisk kart fra Kartverket (WMTS-fliser), stedsnavn
   fra Kartverkets stedsnavnregister (selvhostet GeoJSON) og AIS-fartøy fra
   /api/baater. Alle lag deklareres i LAG-lista under — et nytt lag er én ny
   oppføring, ingen endring i kartlogikken.
   ========================================================================== */
(function () {
  "use strict";

  var ramme = document.getElementById("kart");
  if (!ramme || typeof ol === "undefined") return;

  // Samme utsnitt som kartet på praktisk-sida og filteret i workeren.
  var UTSNITT = { vest: 22.55, ost: 23.45, sor: 70.17, nord: 70.52 };

  /* --- Lagregister -------------------------------------------------------
     type "base" vises ett om gangen (radio). "overlegg" skrus av og på.
     kind forteller hvordan laget bygges:
       wmts     rasterfliser fra Kartverket
       geojson  statisk GeoJSON fra /data
       ais      levende fartøy fra /api/baater                            */
  var LAG = [
    { navn: "Sjøkart", type: "base", kind: "wmts", paa: true,
      url: "https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png",
      kilde: "Sjøkart © Kartverket" },
    { navn: "Topografisk kart", type: "base", kind: "wmts", paa: false,
      url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
      kilde: "Kartverket (CC BY 4.0)" },
    { navn: "Stedsnavn", type: "overlegg", kind: "geojson", paa: true,
      url: "/data/stedsnavn.json", kilde: "Stedsnavn: Kartverket (NLOD)" },
    { navn: "Båter i sundet", type: "overlegg", kind: "ais", paa: true,
      kilde: "AIS: Kystverket via BarentsWatch" }
  ];

  /* --- Fartøystype og farge (samme farger som sanntid.js) ---------------- */
  function fartoyFarge(type) {
    if (type === 30) return "#f2b441";                                              // fiskebåt
    if ((type >= 40 && type <= 49) || (type >= 60 && type <= 69)) return "#d6006e"; // passasjer/hurtigbåt
    if (type >= 70 && type <= 89) return "#17475c";                                 // last/tank
    return "#3fbf8f";                                                               // annet
  }

  /* --- Stil for stedsnavn -------------------------------------------------- */
  function stedsnavnStil(f) {
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 3,
        fill: new ol.style.Fill({ color: "#0b1d2a" }),
        stroke: new ol.style.Stroke({ color: "#ffffff", width: 1 })
      }),
      text: new ol.style.Text({
        text: f.get("navn"),
        font: "500 13px 'IBM Plex Mono', monospace",
        fill: new ol.style.Fill({ color: "#0b1d2a" }),
        stroke: new ol.style.Stroke({ color: "rgba(255,255,255,0.85)", width: 3 }),
        offsetY: -12
      })
    });
  }

  /* --- Stil for AIS-fartøy og slepespor ------------------------------------ */
  function aisStil(f) {
    if (f.getGeometry().getType() === "LineString") {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "#8ba7b4", width: 1.5, lineDash: [3, 5] })
      });
    }
    var farge = f.get("farge") || "#3fbf8f";
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: farge }),
        stroke: new ol.style.Stroke({ color: "#0b1d2a", width: 1.5 })
      }),
      text: new ol.style.Text({
        text: f.get("navn"),
        font: "500 12px 'IBM Plex Mono', monospace",
        fill: new ol.style.Fill({ color: farge }),
        stroke: new ol.style.Stroke({ color: "rgba(255,255,255,0.9)", width: 3 }),
        offsetY: -14
      })
    });
  }

  /* --- Bygg et OpenLayers-lag fra en LAG-oppføring ------------------------- */
  function lagFra(o) {
    if (o.kind === "wmts") {
      return new ol.layer.Tile({
        source: new ol.source.XYZ({ url: o.url, maxZoom: 20, attributions: o.kilde }),
        visible: o.paa
      });
    }
    if (o.kind === "geojson") {
      return new ol.layer.Vector({
        source: new ol.source.Vector({
          url: o.url,
          format: new ol.format.GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" })
        }),
        style: stedsnavnStil,
        visible: o.paa
      });
    }
    if (o.kind === "ais") {
      return lagBater(o);
    }
    throw new Error("Ukjent lagtype: " + o.kind);
  }

  /* --- AIS: levende fartøy fra /api/baater --------------------------------- */
  function lagBater(o) {
    var kilde = new ol.source.Vector();
    hentBater(kilde);
    return new ol.layer.Vector({ source: kilde, style: aisStil, visible: o.paa });
  }

  function hentBater(kilde) {
    fetch("/api/baater")
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        if (!data.konfigurert || !data.baater) {
          settStatus("Posisjonsdata er ikke koblet til ennå — båtene vises ikke.");
          return;
        }
        tegnSpor(kilde, data.spor);
        data.baater.forEach(function (b) {
          kilde.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([b.lengde, b.bredde])),
            navn: b.navn || "Ukjent fartøy",
            farge: fartoyFarge(b.type)
          }));
        });
        settStatus(data.baater.length
          ? data.baater.length + " fartøy med AIS-sender i sundet akkurat nå."
          : "Ingen fartøy med AIS-sender i sundet akkurat nå.");
      })
      .catch(function () {
        settStatus("Fartøysdataene lot seg ikke hente akkurat nå.");
      });
  }

  function tegnSpor(kilde, spor) {
    (spor || []).forEach(function (s) {
      var punkter = (s.spor || []).map(function (p) {
        return ol.proj.fromLonLat([p.l, p.b]);
      });
      if (punkter.length < 2) return;
      kilde.addFeature(new ol.Feature({ geometry: new ol.geom.LineString(punkter) }));
    });
  }

  function settStatus(tekst) {
    var el = document.getElementById("kart-status");
    if (el) el.textContent = tekst;
  }

  /* --- Kartet -------------------------------------------------------------- */
  var lagene = [];
  LAG.forEach(function (o) { lagene.push(lagFra(o)); });

  var kart = new ol.Map({
    target: "kart",
    layers: lagene,
    controls: [
      new ol.control.Zoom(),
      new ol.control.Attribution({ collapsible: true }),
      new ol.control.ScaleLine()
    ],
    view: new ol.View({
      projection: "EPSG:3857",
      center: ol.proj.fromLonLat([(UTSNITT.vest + UTSNITT.ost) / 2, (UTSNITT.sor + UTSNITT.nord) / 2]),
      zoom: 10,
      minZoom: 5,
      maxZoom: 20
    })
  });

  // Vis hele sundet når sida åpnes, uansett skjermstørrelse.
  kart.getView().fit(
    ol.proj.transformExtent(
      [UTSNITT.vest, UTSNITT.sor, UTSNITT.ost, UTSNITT.nord],
      "EPSG:4326", "EPSG:3857"
    ),
    { padding: [30, 30, 30, 30] }
  );

  /* --- Lagvelger ----------------------------------------------------------- */
  var vert = document.getElementById("kart-verktoy");
  if (vert) byggKontroll(vert, lagene, LAG);

  function byggKontroll(vert, lagene, oppforinger) {
    var felt = document.createElement("fieldset");
    felt.className = "kart-kontroll-felt";

    var legend = document.createElement("legend");
    legend.textContent = "Kartlag";
    felt.appendChild(legend);

    oppforinger.forEach(function (o, i) {
      var lag = lagene[i];
      var rad = document.createElement("label");
      rad.className = "kart-kontroll-rad";

      var boks = document.createElement("input");
      boks.type = o.type === "base" ? "radio" : "checkbox";
      boks.name = o.type === "base" ? "grunnkart" : "overlegg";
      boks.checked = o.paa;
      boks.addEventListener("change", function () {
        if (o.type === "base") {
          oppforinger.forEach(function (oo, j) {
            if (oo.type === "base") lagene[j].setVisible(oo === o);
          });
        } else {
          lag.setVisible(boks.checked);
        }
      });

      rad.appendChild(boks);
      rad.appendChild(document.createTextNode(" " + o.navn));
      felt.appendChild(rad);
    });

    vert.appendChild(felt);
  }
})();
