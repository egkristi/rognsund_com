# Kart på rognsund.com — vurdering og muligheter

Dette dokumentet svarer på om det er mulig og hensiktsmessig å lage en egen
side `Kart` med mange lag (sjøkart, topo, eiendomsgrenser, BarentsWatch, AIS,
stedsnavn og mer), og hvilken kartløsning som fungerer på Cloudflare
Workers & Pages.

## Kort svar

- **Mulig:** ja.
- **Hensiktsmessig:** ja — nettstedet har allerede kartinnhold (innebygd SVG
  på `praktisk.html` og `om-bygda.html`, pluss AIS-overlegg i `sanntid.js`).
  En dedikert side samler dette og gir rom for flere lag.
- **Viktigste forbehold:** CSP-en tillater bare `'self'` i dag. Kartsida er
  et bevisst unntak: den laster fliser (raster/vektor) direkte fra eksterne
  fliseservere (Kartverket/Geonorge). Se «Arkitekturen» under.

## Arkitekturen — det som må avklares først

`public/_headers` håndhever i dag:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self';
  frame-ancestors 'none'; base-uri 'self'
```

Et interaktivt kart laster fliser (raster eller vektor) fra
`cache.kartverket.no`/`opencache.statkart.no` eller Geonorge. Dette er en
**bevisst, godkjent unntak** fra regelen om «ingenting fra tredjepart»: å
selvhoste hele flisekatalogen er ikke praktisk, og flisene er åpne data
(CC BY 4.0/NLOD). Det betyr at CSP-en må åpnes for fliser.

Tre måter ble vurdert:

1. **Proxy via workeren.** Nytt endepunkt som henter fliser på serversiden og
   serverer dem fra samme opphav. CSP forblir `'self'`, men gir ekstra kode og
   Cloudflare-kvote.
2. **Åpne CSP for flisevertene (valgt).** `img-src` og `connect-src` åpnes for
   de konkrete flisevertene — ikke `*`. Enklest, og flisene er åpne data.
3. **Hybrid.** Tungt grunnkart direkte, bare det som trenger egen behandling
   via proxy.

Beslutningen er **2**: fliser lastes direkte fra eksterne fliseservere, og
CSP-en åpnes kun for de aktuelle vertene. All annen ressurslastning (skript,
CSS, skrift, bilder) forblir `'self'`.

## Biblioteker — vurdering

| Bibliotek | Lisens | WMS/WMTS/WFS (Geonorge) | Vektortiles | Vurdering |
| --- | --- | --- | --- | --- |
| **OpenLayers** | BSD-2 | Nativ støtte for alle tre | Ja | **Best for «all geodata».** Geonorge er i hovedsak WMS/WMTS/WFS. |
| **MapLibre GL JS** | BSD-3 | WMS/WMTS som raster; WFS via worker | Ja, førsteklasses | **Best ytelse og rendering.** Det Kartverkets Norgeskart bygger på. |
| **Leaflet** | BSD-2 | WMS via plugin | Via plugin | Lett (~42 kB), men for tynt for lagtung katalog. |
| **CesiumJS** | Apache-2.0 | Nei | Ja (3D) | **Uegnet.** 3D-globus, 1–2 MB+, overkill for lokalt 2D-kart. |

**Anbefaling:** OpenLayers om målet er bredest mulig dekning av
Geonorge-katalogen; MapLibre GL JS om målet er best utseende og fart med
Kartverkets vektor-/Norgeskart-stil. Begge er BSD-lisensert og kompatible med
prosjektets MIT-lisens.

Alle er tredjepartskode og må **selvhostes** (lastes ned og legges i
`public/assets/js/`) for å overholde «ingen CDN». Ingen av dem trenger
byggeprosess — de finnes som ferdige minifiserte filer.

## Andre alternativer

- **Kartverket-embed** — offisiell innbygging uten egen kode. Lavest innsats,
  men liten kontroll og en iframe som bryter dagens CSP (`frame-ancestors`).
- **TerriaMap / TerriaJS** — rammeverk for katalogdrevne kartportaler (brukt i
  offentlige geodataportaler). Riktig konsept for «mange lag med lagvelger»,
  men overkill for dette nettstedet.
- **Statisk WMS-bilde** — ett `GetMap`-bilde per visning. Null interaktivitet,
  men trivielt og CSP-vennlig.
- **deck.gl** — for storskala datavisualisering, ikke grunnkart.
- **Google Maps / Mapbox / TomTom** — utelukket: kommersielle SDK-er, sporing,
  strider mot prosjektets prinsipper.

## Cloudflare Workers & Pages

- Dette prosjektet kjører som **Workers med statiske filer** (ikke Pages).
  Statiske filer i `public/` serveres som de er — derfor kan et selvhostet
  kartbibliotek legges der uten videre.
- **Tile-proxy** er et velkjent Workers-mønster: `fetch()` mot
  `cache.kartverket.no` og `ctx.waitUntil(caches.default.put(...))`. Cache-hit
  på kanten er billig, og kilden belastes lite — samme mønster som `/api/*`
  allerede bruker.
- **Kvote å være klar over (gratisplan):** 100 000 forespørsler/døgn og 10 ms
  CPU per kall. Et kartvisning laster typisk 20–50 fliser. Med cache- og
  `Cache-Control`-oppsett holder det fint for et lavtrafikk-nettsted, men en
  aggressiv `immutable`-bufring på fliser er fornuftig (fliser endrer seg ikke).
- Fliser er små (typisk 10–50 kB), godt under Workers' 100 MB-responsgrense.

## Kartlag og Geonorge-katalogen

Kartkatalogen på `kartkatalog.geonorge.no` dekker hele spekteret av norske
geodata. De fleste leveres som WMS/WMTS/WFS. Relevante lag for Rognsund:

| Lag | Tjeneste | Åpenhet |
| --- | --- | --- |
| Sjøkart (raster/vektor) | Kartverket WMTS/WMS | Åpent, CC BY 4.0/NLOD — krediter «Kartverket» |
| Topografisk norgeskart | Kartverket WMTS (`cache.kartverket.no/v1/wmts/.../topo/...`) | Åpent, CC BY 4.0 |
| Stedsnavn (Sentralt stedsnavnregister, SSR) | WFS | Åpent, NLOD |
| Terreng/høyde | Kartverket WMS/WCS | Åpent |
| Eiendomsgrenser (Matrikkelen) | WMS | **Begrenset** — krever Geovekst-/kommunal avtale |
| AIS / fartøy | BarentsWatch (allerede på serversiden) | Krever `BW_AIS_CLIENT_ID`/`SECRET` |
| Bølgevarsel, FishInfo | BarentsWatch (scope `api`) | Krever `BW_CLIENT_ID`/`SECRET` |
| Fyrlykter/sjømerker | Kystverkets WFS (allerede tegnet inn statisk) | NLOD |

**Viktig:** Eiendomsgrenser er ikke fritt åpent. Ikke lov det som et gratis
lag uten at tilgangsavtale foreligger.

Kartutsnittet som allerede brukes i `src/index.js` (`SUNDET`) og `sanntid.js`
(`KART`) er 22,55–23,45 °Ø / 70,17–70,52 °N — gjenbruk det på kartsida.

## Beslutning og anbefaling

Basert på prioriteringene **fremtidig utvidbarhet, gratis og brukervennlig**
er anbefalingen:

> **OpenLayers + fliser direkte fra Kartverket/Geonorge, med et
> konfigurasjonsdrevet lagregister.**

- **Bibliotek:** OpenLayers (BSD-2, gratis). Støtter WMS/WMTS/WFS nativt,
  som er nettopp det Geonorge-katalogen leverer. Fremtidig utvidbarhet
  vinner over MapLibre GL JS' glatthet, fordi nye Geonorge-lag kan legges til
  uten ny kode.
- **Strategi:** fliser lastes direkte fra eksterne fliseservere (strategi 2).
  CSP-en åpnes kun for flisevertene; alt annet forblir `'self'`.
- **Brukervennlighet:** løses i UI-et (enkel lagvelger med av/på, zoom,
  «finn meg»), ikke i biblioteket.

### Konfigurasjonsdrevet lagregister

Kjernen i fremtidig utvidbarhet: alle lag deklareres i én liste. Et nytt lag
fra kartkatalogen = én ny oppføring, ingen endring i kartlogikken.

```js
var LAG = [
  { navn: "Sjøkart",   type: "wmts",  url: "…",  lag: "…",  paa: true },
  { navn: "Topo",      type: "wmts",  url: "…",  lag: "…",  paa: true },
  { navn: "Stedsnavn", type: "wfs",   url: "…",  typenavn: "…" },
  { navn: "AIS",       type: "geojson", url: "/api/baater" },
  { navn: "Eiendom",   type: "wms",   url: "…",  lag: "…" } // krever avtale
];
```

Støttede typer i registeret: `wmts`, `wms`, `wfs` og `geojson`. AIS og
BarentsWatch-data kommer som `geojson`/`json` fra egne `/api/*`-endepunkter —
samme opphav, ingen CSP-endring.

### Foreslått første versjon (MVP)

| Lag | Tjeneste | Åpenhet |
| --- | --- | --- |
| Sjøkart | Kartverket WMTS | CC BY 4.0 — krediter «Kartverket» |
| Topografisk norgeskart | Kartverket WMTS | CC BY 4.0 |
| Stedsnavn (SSR) | WFS | NLOD |
| AIS (fartøy + slepespor) | egen `/api/baater` | krever `BW_AIS_CLIENT_ID`/`SECRET` |

Eiendomsgrenser og bølgevarsel står klare som neste utvidelse når behovet
oppstår (henholdsvis avtale og `BW_CLIENT_ID`/`SECRET`).

## Neste steg

1. Selvhost OpenLayers i `public/assets/js/` (minifisert fil, ingen CDN).
2. Legg til `/kart`-side (HTML + CSS + JS) og menypunkt i alle åtte filene,
   med `aria-current="page"` på den nye lenka.
3. Åpne `img-src` og `connect-src` i `public/_headers` for de konkrete
   flisevertene (Kartverket/Geonorge) — ikke `*` — og forklar hvorfor.
4. Lagregisteret over som enkel, utvidbar liste i kart-JS-en.
5. Krediter kildene synlig (Kartverket, NLOD-lag).
