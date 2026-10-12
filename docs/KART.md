# Kart på rognsund.com — vurdering og muligheter

Dette dokumentet svarer på om det er mulig og hensiktsmessig å lage en egen
side `Kart` med mange lag (sjøkart, topo, eiendomsgrenser, BarentsWatch, AIS,
stedsnavn og mer), om den kan vise det som finnes i
[Kartkatalogen](https://kartkatalog.geonorge.no), og hvilken kartløsning som
fungerer på Cloudflare Workers & Pages.

Ingenting av dette er bygd ennå. Dokumentet er grunnlaget for beslutningen.

## Kort svar

- **Mulig:** ja. Et kartbibliotek er bare statiske JS- og CSS-filer. De kan
  ligge i `public/assets/` og serveres av Workers uten byggesteg.
- **Hensiktsmessig:** ja. Nettstedet har allerede kartinnhold (innebygd SVG
  på `praktisk.html` og `om-bygda.html`, AIS-overlegg i `sanntid.js`, og
  `/api/baater` med slepespor). En egen side samler dette og gir plass til
  flere lag uten å gjøre de andre sidene tyngre.
- **Bibliotek:** OpenLayers. Det støtter WMS, WMTS og WFS direkte, og det
  støtter UTM-projeksjonene (EPSG:25833/25835) som mange norske tjenester
  bruker. MapLibre GL JS er et godt alternativ hvis utseende og fart betyr
  mer enn bredden i katalogen.
- **Viktigste forbehold:** CSP-en tillater bare `'self'` i dag. Kartsida
  krever enten at CSP-en åpnes for noen få kjente fliseverter, eller at
  workeren mellomlagrer flisene. «All geodata fra Kartkatalogen» lar seg ikke
  løse med en fast liste over verter. Det krever en avgrenset proxy i
  workeren (se «Hele Kartkatalogen»).
- **Ikke alt i katalogen er åpent.** En del datasett i Norge digitalt krever
  innlogging eller avtale. Kartsida kan bare vise åpne tjenester.

## Arkitekturen — det som må avklares først

`public/_headers` håndhever i dag:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self';
  frame-ancestors 'none'; base-uri 'self'
```

Et interaktivt kart henter fliser (raster eller vektor) fra
`cache.kartverket.no` og andre tjenester i Geonorge. Kartsida er derfor et
**bevisst unntak** fra regelen om at ingenting lastes fra tredjepart (se
AGENTS.md). Å selvhoste hele flisekatalogen er ikke praktisk, og flisene er
åpne data (CC BY 4.0/NLOD).

Tre måter ble vurdert:

1. **Proxy via workeren.** Et nytt endepunkt, for eksempel `/fliser/...`,
   henter fliser på serversiden og serverer dem fra samme opphav. CSP-en
   forblir `'self'`, og nettleseren kontakter aldri kildene. Det koster mer
   kode og bruker Workers-kvote (se under).
2. **Åpne CSP-en for flisevertene (valgt for grunnkartene).** `img-src` åpnes
   for de konkrete vertene, aldri `*`. Det er det enkleste, og flisene er åpne
   data.
3. **Hybrid.** Grunnkart direkte (2), og alt som ikke står på en fast liste
   går via en avgrenset proxy (1).

Beslutningen er **2** for de faste grunnkartene. Hvis kartsida skal kunne
vise vilkårlige lag fra Kartkatalogen, må den utvides til **3**. Se «Hele
Kartkatalogen».

Detaljer som er lette å overse:

- **Rasterfliser** (WMTS, WMS) lastes som bilder og trenger bare `img-src`.
- **Vektorfliser, WFS, GeoJSON og GetCapabilities** hentes med `fetch` og
  trenger `connect-src`. Kildene må også sende CORS-hoder. Mange norske WMS-
  og WFS-tjenester gjør ikke det. Da er proxy via workeren eneste løsning.
- **OpenLayers med `crossOrigin: 'anonymous'`** (nødvendig for å lese
  pikselverdier, skrive ut eller eksportere kartet) krever også CORS fra
  flisekilden.
- **MapLibre GL JS** bruker en Web Worker. Er biblioteket selvhostet, holder
  det med `worker-src 'self'`. Lastes det fra et annet opphav, kreves
  `worker-src blob:`. MapLibre v6 leveres bare som ES-modul (ingen UMD og
  ingen egen CSP-bygging lenger). Det passer dårlig med ES5-stilen i
  nettleserfilene, men kan lastes med `<script type="module">` uten bundler.
- **Kartverket-innbygging (iframe)** stoppes av `default-src 'self'` fordi
  `frame-src` ikke er satt. `frame-ancestors` styrer hvem som kan ramme inn
  *oss*, ikke hva vi kan ramme inn.

## Biblioteker — vurdering

| Bibliotek | Lisens | WMS/WMTS/WFS | UTM (EPSG:25833/35) | Vektorfliser | Størrelse (min., ca.) | Vurdering |
| --- | --- | --- | --- | --- | --- | --- |
| **OpenLayers** | BSD-2 | Alle tre innebygd, også GetCapabilities-tolking | Ja, med proj4 | Ja (MVT) | ~1 MB / ~250 kB gzip | **Best for «all geodata».** Geonorge leverer i hovedsak WMS/WMTS/WFS, ofte i UTM. |
| **MapLibre GL JS** | BSD-3 | WMS/WMTS bare som raster i Web Mercator; WFS må hentes og gjøres om til GeoJSON selv | Nei, bare Web Mercator | Førsteklasses, WebGL | ~800 kB / ~230 kB gzip | **Best utseende og fart.** Svakere mot WMS-tunge kataloger og UTM-tjenester. |
| **Leaflet** | BSD-2 | WMS innebygd; WMTS og WFS via utvidelser | Via Proj4Leaflet | Via utvidelser | ~150 kB / ~42 kB gzip | Lett og enkelt. Blir et lappeteppe av utvidelser når lagene blir mange. |
| **CesiumJS** | Apache-2.0 | WMS og WMTS innebygd (bildekilder) | Begrenset | 3D Tiles | flere MB | **Uegnet her.** 3D-globus. Standardoppsettet bruker Cesium ion (token, tredjepart), så det må skrus av. |

Merknader:

- **Projeksjon betyr noe på 70 °N.** Web Mercator strekker kartet omtrent
  tre ganger i høyden og bredden på denne breddegraden. Det går bra visuelt,
  men mange Geonorge-tjenester leveres best, eller bare, i EPSG:25833
  (UTM 33) eller EPSG:25835 (UTM 35, som dekker Finnmark). OpenLayers kan
  vise kartet i UTM. MapLibre kan ikke det.
- **Kartverket leverer WMTS i både Web Mercator og UTM.** Lag- og
  flisematrisenavn har endret seg (se «Kjente fallgruver»). Les dem fra
  GetCapabilities i stedet for å hardkode dem fra gamle eksempler.
- **Alle bibliotekene må selvhostes** i `public/assets/js/` for å overholde
  «ingen CDN». OpenLayers kommer også som en ferdig samlet fil som setter
  `ol` globalt. Den passer ES5-stilen, men sjekk at fila fortsatt følger med
  i versjonen dere velger.
- Alle fire er åpen kildekode under tillatende lisenser og forenlige med
  prosjektet.

## Andre alternativer

| Alternativ | Hva det er | Vurdering |
| --- | --- | --- |
| **Protomaps / PMTiles** | Én fil med vektorfliser lagt i Cloudflare R2 og servert av workeren | **Svært godt egnet for Cloudflare.** Gjør det mulig å selvhoste et eget grunnkart (OSM eller Kartverket N50) for området, så CSP-en kan bli `'self'`. Brukes med MapLibre eller OpenLayers. |
| **Origo** | Rammeverk på OpenLayers der lagene styres av én JSON-konfigurasjon (laget av svenske kommuner) | Samme idé som lagregisteret under, men ferdig bygd. Krever byggesteg ved tilpasning, så bruk det heller som forbilde. |
| **Kartverkets Norgeskart** (åpen kildekode) | Kartverkets egen kartklient | Nyttig å se på for lagoppsett og URL-er. Ikke laget for innbygging. |
| **Masterportal, MapStore, TerriaJS** | Komplette geoportaler med katalogsøk | Riktig konsept for «mange lag med lagvelger», men alt for tunge for et bygdenettsted, og de trenger byggesteg. |
| **Kartverket-innbygging / lenke til norgeskart.no** | Iframe eller lenke med koordinater | Lenke koster ingenting og er greit som tillegg. Iframe krever åpning av `frame-src`. |
| **Statisk WMS-bilde** | Ett `GetMap`-bilde per visning, gjerne via workeren | Null interaktivitet, men trivielt og CSP-vennlig. Kan være `<noscript>`-alternativet. |
| **deck.gl** | Visualisering av store datamengder oppå et grunnkart | Ikke behov for det her. |
| **Google Maps, Mapbox GL JS (v2+), ArcGIS JS, TomTom** | Kommersielle SDK-er | **Utelukket.** Nøkler, sporing og proprietære lisenser strider mot prosjektets prinsipper. |

## Cloudflare Workers & Pages

- Prosjektet kjører som **Workers med statiske filer** (ikke Pages).
  Statiske filer i `public/` serveres som de er, og forespørsler etter dem er
  gratis og ubegrenset. Et selvhostet kartbibliotek koster derfor ingenting
  ekstra.
- **Fliseproxy** er et kjent Workers-mønster: `fetch()` mot kilden og
  `ctx.waitUntil(caches.default.put(...))`. Det er det samme mønsteret som
  `medBuffer` allerede bruker for `/api/*`. Treff i cachen på kanten er
  billige, og kilden belastes lite.
- **Kvote på gratisplanen:** 100 000 workerkall per døgn og 10 ms CPU per
  kall. Statiske filer teller ikke. En kartvisning henter typisk 20–50
  fliser, og panorering henter mange flere. Går flisene via workeren, kan
  rundt 2 000–5 000 kartvisninger i døgnet bruke opp kvoten. Henter
  nettleseren flisene direkte (strategi 2), teller de ikke i det hele tatt.
  Det taler for strategi 2 for grunnkartene.
- **R2** (objektlager) passer for PMTiles og for egne datasett, som
  stedsnavn, stier og kulturminner digitalisert av bygda. Gratisnivået er
  10 GB lagring, og trafikk ut er gratis.
- **KV** brukes allerede til båtloggen og kan lagre forhåndsberegnede
  GeoJSON-utdrag (for eksempel stedsnavn i utsnittet), slik at de ikke må
  hentes fra kilden ved hvert kall.
- Fliser er små (10–50 kB), langt under grensene for responsstørrelse.

## Kartlag — hva som finnes

Kartutsnittet som allerede brukes i `src/index.js` (`SUNDET`) og
`sanntid.js` (`KART`), er 22,55–23,45 °Ø / 70,17–70,52 °N. Gjenbruk det på
kartsida.

### Grunnkart

| Lag | Kilde og tjeneste | Åpenhet |
| --- | --- | --- |
| Topografisk norgeskart (farge og gråtone) | Kartverket WMTS, `cache.kartverket.no` | CC BY 4.0 — krediter «Kartverket» |
| Sjøkart (raster) | Kartverket WMTS, samme vert | CC BY 4.0. Ikke til navigasjon |
| Flyfoto / ortofoto | Norge i bilder (WMTS) | **Sjekk vilkår.** Deler er åpne, men ikke alt |
| Terrengskygge / høydekurver | Kartverket WMS (DTM, høydekurver) | Åpent |
| OpenStreetMap | Egne PMTiles i R2 (ikke tile.openstreetmap.org, som ikke er ment for slik bruk) | ODbL |

### Overlegg fra Geonorge og etatene

| Lag | Kilde | Åpenhet | Relevans for Rognsund |
| --- | --- | --- | --- |
| Stedsnavn (SSR) | Kartverket: stedsnavn-API (REST/JSON), WMS og WFS | NLOD / CC BY 4.0 | Høy. Lokale navn, også samiske og kvenske skrivemåter |
| Eiendomsgrenser (Matrikkelkart / Eiendomskart Teig) | Kartverket WMS (`openwms.statkart.no`) og WFS (`wfs.geonorge.no`) | **Åpent, CC BY 4.0.** Eier (hjemmelshaver) er *ikke* med og skal ikke vises | Middels. Oppdateres daglig, så endringer kan ta noen dager |
| Adresser og bygningspunkt | Matrikkelkart WMS / adresse-API | Åpent | Middels |
| Fyr, sjømerker, farleder, havner | Kystverket WMS/WFS (Kystinfo) | NLOD | Høy. I dag tegnet statisk i SVG |
| Verneområder (Seiland nasjonalpark m.m.) | Miljødirektoratet, Naturbase WMS | Åpent | Høy |
| Kulturminner | Riksantikvaren (Askeladden/Kulturminnesøk) WMS | Åpent, men lokalisering av sårbare minner kan være skjult | Høy (se historie.html) |
| Akvakulturlokaliteter | Fiskeridirektoratet WMS | Åpent | Middels |
| Fiskeri: redskap, felt, gyteområder | BarentsWatch FiskInfo / Fiskeridirektoratet | Åpent / scope `api` | Middels |
| Skredfare, kvikkleire, flomsoner | NVE WMS | Åpent | Middels |
| Berggrunn og løsmasser | NGU WMS | Åpent | Lav–middels (Stjernøya) |
| Artsobservasjoner | Artsdatabanken WMS | Åpent | Lav–middels |
| Dybdedata | Kartverket WMS (dybdedata/terrengmodell sjø) | Delvis åpent | Middels |
| Turstier og friluftsruter | Kartverket WMS / WFS (Turrutebasen) | Åpent | Høy |

Alle URL-er, lagnavn og vilkår må kontrolleres i Kartkatalogen før laget
legges inn. Tabellen sier hva som finnes, ikke de endelige adressene.

### Levende data (via workeren, samme opphav)

| Lag | Endepunkt | Krav |
| --- | --- | --- |
| AIS: fartøy med skipstype og slepespor | `/api/baater` (finnes) | `BW_AIS_CLIENT_ID` / `BW_AIS_CLIENT_SECRET` |
| Fartøy innom sundet siste uka | `/api/baatlogg` (finnes) | AIS-nøklene + KV `BAATLOGG` |
| Skyssbåtens posisjon og avganger | `/api/avganger` (Entur) | — |
| Bølgevarsel | BarentsWatch Waveforecast (ny) | `BW_CLIENT_ID` / `BW_CLIENT_SECRET` |
| Vær i punkt (klikk i kartet) | MET Locationforecast (som `/api/vaer`) | — |
| Vannstand | Kartverket (som `/api/tidevann`) | — |

**Fartøy i kartet:** klikk på en båt for navn, type, fart, kurs og tid for
siste posisjon, og en lenke ut for mer. Gode mål for lenka er BarentsWatch'
eget AIS-kart og Kystverkets Kystinfo. Unngå kommersielle sporingstjenester
som eneste lenke. En utgående lenke er ikke et brudd på CSP-en eller på
personvernløftet, fordi ingenting lastes før brukeren klikker. Vurder å
skjule fritidsbåter under en viss lengde. AIS er offentlig, men det å vise
hvor naboens båt ligger, er et valg bygda bør ta.

## Hele Kartkatalogen

Kartkatalogen har et åpent søke-API (`kartkatalog.geonorge.no/api/search`)
som returnerer datasett med tjeneste-URL-er (WMS/WMTS/WFS). Det gjør det
mulig å lage en «Legg til lag fra Kartkatalogen»-funksjon:

1. Brukeren søker. Workeren spør katalog-API-et og returnerer treff.
2. Brukeren velger et lag. Workeren henter GetCapabilities fra tjenesten og
   gir kartet lagene som kan vises.
3. Kartet viser laget. WMS- og WMTS-bilder kan hentes direkte hvis verten
   står i CSP-en, ellers via `/fliser?kilde=...`-proxyen.

Forutsetninger og begrensninger:

- **CSP-en kan ikke være åpen for alle verter**, og katalogen peker på mange
  ulike (Kartverket, NGU, NVE, Miljødirektoratet, Fiskeridirektoratet,
  Kystverket, kommuner). Proxyen må ha en **tillatelsesliste** over verter,
  ellers blir den en åpen proxy som andre kan misbruke.
- **Bare åpne tjenester.** Datasett med tilgangsbegrensning i Norge digitalt
  krever pålogging (BAAT/token) og skal ikke eksponeres gjennom workeren.
- **Proxy-trafikk teller i Workers-kvoten.** Sett en lang `Cache-Control` på
  fliser og en kortere på GetCapabilities.
- **Projeksjoner varierer.** En del tjenester tilbyr ikke Web Mercator. Det
  er hovedgrunnen til å velge OpenLayers.

Anbefalingen er å vente med denne funksjonen. Start med et kuratert
lagregister. Et fritt katalogsøk gir mye tekniske støy for folk i bygda,
mens 10–15 velvalgte lag dekker det de fleste trenger.

## Kjente fallgruver

- **`opencache.statkart.no` er erstattet av `cache.kartverket.no`.** Kartverket
  har slått sammen WMTS-tjenestene (topo farge, topo gråtone, toporaster og
  sjøkart raster) under én vert. Gamle lagnavn som `topo4` gjelder ikke
  lenger. Bruk GetCapabilities:
  `https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml`.
  Følg varslene i [Geonorge-registeret](https://register.geonorge.no/varsler).
- **Kreditering er et lisenskrav** (CC BY 4.0): «© Kartverket» og eventuelle
  andre kilder skal synes i kartet hele tiden, ikke bare i bunnteksten.
- **Ikke til navigasjon.** Sjøkartlaget skal ha samme forbehold som SVG-kartet
  på `praktisk.html`.
- **Mørk modus:** rasterfliser har faste farger. Gråtonekartet fungerer
  bedre i mørk modus. Kontroller, tegnforklaring og popup-er skal bruke
  tokens fra `rognsund.css`.
- **Tilgjengelighet:** et interaktivt kart er vanskelig med skjermleser. Gi
  lagvelgeren vanlige avkrysningsbokser, la kartet få fokus med synlig
  markering, og legg AIS-tabellen ved siden av (som i dag), ikke bare i
  kartet.
- **Uten JavaScript:** `<noscript>` med det eksisterende SVG-kartet, eller
  et statisk WMS-bilde, og lenke til norgeskart.no.

## Beslutning og anbefaling

Basert på prioriteringene **fremtidig utvidbarhet, gratis og brukervennlig**:

> **OpenLayers, selvhostet. Grunnkart direkte fra `cache.kartverket.no`,
> og et lagregister i én konfigurasjonsliste. Proxy via workeren bare for lag
> som mangler CORS, eller når katalogsøk legges til.**

- **Bibliotek:** OpenLayers (BSD-2). Det støtter WMS/WMTS/WFS og UTM, og det
  er det Geonorge-katalogen leverer. Utvidbarhet veier tyngre enn
  glattheten i MapLibre.
- **Fliser:** strategi 2 for grunnkartene. CSP-en åpnes i `img-src` bare for
  `cache.kartverket.no` (og de få andre faste vertene i registeret).
  Skript, CSS og skrift forblir `'self'`.
- **Levende data:** som i dag, via `/api/*` fra samme opphav, levert som
  GeoJSON slik at kartet kan bruke dem direkte.
- **Brukervennlighet:** løses i grensesnittet med en enkel lagvelger,
  zoom, «vis hele sundet» og klikk for informasjon. Det ligger ikke i
  biblioteket.

### Lagregister i én liste

Kjernen i utvidbarheten er at alle lag deklareres i én liste. Et nytt lag fra
Kartkatalogen krever én ny oppføring og ingen endring i kartlogikken.

```js
var LAG = [
  { navn: "Topografisk kart", type: "wmts", url: "…", lag: "…", grunnkart: true, paa: true },
  { navn: "Sjøkart",          type: "wmts", url: "…", lag: "…", grunnkart: true },
  { navn: "Stedsnavn",        type: "wms",  url: "…", lag: "…" },
  { navn: "Eiendomsgrenser",  type: "wms",  url: "…", lag: "…", minZoom: 13 },
  { navn: "Fartøy (AIS)",     type: "geojson", url: "/api/baater", oppdater: 120 },
  { navn: "Nasjonalpark",     type: "wms",  url: "…", lag: "…" }
];
```

Hver oppføring bør også ha `kilde` og `lisens` (vist i krediteringen) og
eventuelt `proxy: true` for verter uten CORS eller utenfor CSP-en. Støttede
typer: `wmts`, `wms`, `wfs` og `geojson`.

### Første versjon (MVP)

| Lag | Tjeneste | Åpenhet |
| --- | --- | --- |
| Topografisk norgeskart (farge/gråtone) | Kartverket WMTS | CC BY 4.0 |
| Sjøkart | Kartverket WMTS | CC BY 4.0 — ikke til navigasjon |
| Stedsnavn | Kartverket WMS | CC BY 4.0 |
| Eiendomsgrenser | Matrikkelkart WMS | CC BY 4.0 — vis bare ved høy zoom |
| Fyr og sjømerker | Kystverket WMS | NLOD |
| AIS (fartøy + slepespor + lenke ut) | `/api/baater` | AIS-nøklene |

Neste utvidelser: verneområder, kulturminner, turstier, bølgevarsel
(`BW_CLIENT_ID`/`SECRET`), og til slutt katalogsøk med proxy.

## Neste steg

1. Selvhost OpenLayers (og proj4 for UTM) i `public/assets/js/`. Legg ved
   lisensfilene, som for skriftene.
2. Lag `kart.html` og `assets/js/kart.js`, og legg menypunktet «Kart» inn i
   alle HTML-filene med `aria-current="page"` på riktig side.
3. Åpne `img-src` (og `connect-src` om nødvendig) i `public/_headers` bare
   for de konkrete vertene. Skriv begrunnelsen i en kommentar i fila.
   Vurder å gi `/kart` sin egen CSP-blokk, slik at resten av nettstedet
   beholder `'self'`.
4. Gjør om `/api/baater` (eller lag en variant) til GeoJSON med
   slepespor som `LineString`.
5. Les lagnavn fra GetCapabilities og legg dem inn i registeret.
6. Synlig kreditering, «ikke til navigasjon» og `<noscript>`-alternativ.
7. Test i 360 px bredde, mørk modus og med tastatur.

## Kilder

- Kartverket, WMTS-varsel og ny adresse:
  [register.geonorge.no — Topografisk norgeskart WMTS/cache](https://register.geonorge.no/varsler/topografisk-norgeskart-wmts-cache/63a7a1b9-e9c0-49d8-ac58-4657d66e8123)
- Matrikkelkart WMS (CC BY 4.0):
  [Geonorge metadata](https://geonorge.no/geonetworktest/srv/api/records/30dda4c6-2cba-4378-b2e7-26f644df9d99)
- Matrikkelen Eiendomskart Teig:
  [data.norge.no](https://data.norge.no/en/datasets/50393160-7ad9-31cc-89b5-f1318dd64ca4/matrikkelen-eiendomskart-teig-historiske-data-2025)
- MapLibre v6 og CSP:
  [v5 → v6 migreringsguide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
- [OpenLayers](https://openlayers.org) · [MapLibre](https://maplibre.org) ·
  [Leaflet](https://leafletjs.com) · [CesiumJS](https://cesium.com/platform/cesiumjs/) ·
  [Protomaps/PMTiles](https://protomaps.com) · [Kartkatalogen](https://kartkatalog.geonorge.no)
