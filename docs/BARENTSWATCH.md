# BarentsWatch — API-integrasjon i rognsund.com

Dokumentasjon av hvilke BarentsWatch-API-er som brukes (eller kan brukes) på
rognsund.com, og hvordan tilgangen er satt opp.

## Navnekonvensjon

- **AIS** → `BW_AIS_CLIENT_ID` / `BW_AIS_CLIENT_SECRET`
- **BarentsWatch API (generelt, scope `api`)** → `BW_CLIENT_ID` / `BW_CLIENT_SECRET`

## To klienttyper

BarentsWatch har to separate API-klienter med ulik scope. Du trenger én klient
per type, begge opprettes under [barentswatch.no/minside](https://www.barentswatch.no/minside)
→ «Utviklertilganger»:

| Klient | Scope | Cloudflare-navn | Innhold |
| --- | --- | --- | --- |
| **AIS API** | `ais` | `BW_AIS_CLIENT_ID` / `BW_AIS_CLIENT_SECRET` | Sanntids fartøyposisjoner (Kystverket) |
| **BarentsWatch API** | `api` | `BW_CLIENT_ID` / `BW_CLIENT_SECRET` | Fiskehelse, AkvaInfo, FiskInfo, bølgevarsel, polare lavtrykk m.m. |

## AIS API — i bruk

Viser fartøy i sundet:

- `GET /api/baater` — fartøy i sundet nå (`https://live.ais.barentswatch.no/v1/latest/combined`)
- `GET /api/baatlogg` — fartøy innom siste uka (cron hvert 10. min + KV-navnerommet `BAATLOGG`)

Cloudflare-hemmeligheter: `BW_AIS_CLIENT_ID`, `BW_AIS_CLIENT_SECRET`.
Autentisering: OAuth2 client credentials mot `https://id.barentswatch.no/connect/token` med `scope=ais`.

### Implementert i koden

- **Ikoner per fartøystype** — `/api/baater` tar med skipstype (`shipType`,
  AIS-kode 0–99). I kartet tegnes fire former: fiskebåt (trekant, gul),
  passasjer/hurtigbåt (rombe, magenta), lasteskip/tanker (firkant, havblå) og
  annet (sirkel, grønn). Fartøy som ligger i ro (fart < 0,5 knop) tegnes som
  kontur i stedet for fylt. Skipstypen vises også som tekst i tabellen.
- **60 minutters slepespor** — `/api/baater` henter i tillegg siste times spor
  per fartøy fra den historiske AIS-databasen
  (`https://historic.ais.barentswatch.no/v1/historic/trackslast24hours/{mmsi}`),
  og `sanntid.js` tegner sporet som en linje på kartet.

### Ikke tilgjengelig

- **AtoN** (bøyer, merker, fyr) leveres ikke av `combined`-endepunktet, som kun
  inneholder fartøy. Faste sjømerker og fyrlykter er i stedet tegnet inn statisk
  i kartet (hentet fra Kystverkets WFS).

## BarentsWatch API (scope `api`) — mulige bruksområder

Den generelle API-klienten gir tilgang til disse datasettene. Relevans for
rognsund.com er vurdert under.

### Bølgevarsel (Waveforecast API) — mest relevant
Prognoser for bølgehøyde og vind for forhåndsdefinerte farleder/punkt langs
kysten, og for egendefinert rute. Kilder: NORCE og Meteorologisk institutt.

- **Bruk:** «Vind og bølger avgjør om båten går.» Et bølgevarsel for Rognsundet
  ville komplettert værvarslet på `/praktisk`. Forutsetter at sundet dekkes av
  farledene/punktene, eller at man bruker egendefinert rute.
- OpenAPI: https://www.barentswatch.no/bwapi/openapi/index.html?urls.primaryName=Waveforecast%20API

### FiskInfo API — relevant for fiskesiden
J-meldinger og fiskerireguleringer, navigasjonsvarsler, seismikkaktivitet og
fartøyinfo (MMSI-oppslag). Kilder: Fiskeridirektoratet, Sokkeldirektoratet, Kystverket.

- **Bruk:** gjeldende fiskerireguleringer og navigasjonsvarsler for Altafjorden
  på `/natur` (sjøfiske er fritt, men reguleringer og varsler endrer seg).
- OpenAPI: https://www.barentswatch.no/bwapi/openapi/index.html?urls.primaryName=FishInfo%20API

### Polare lavtrykk (Polar Lows API) — mindre relevant
Meldinger om polare lavtrykk fra Meteorologisk institutt.

- **Bruk:** kystværvarsel. Lav prioritet — MET-varslet på `/api/vaer` dekker mye.
- OpenAPI: https://www.barentswatch.no/bwapi/openapi/index.html?urls.primaryName=Polar%20Lows%20API

### Fiskehelse / AkvaInfo — lite relevant
Oppdrettsanlegg, lakselus, biomasse, sysselsetting m.m. (Fiskeridirektoratet,
Mattilsynet, Veterinærinstituttet, SSB). Historikk fra 2012.

- **Bruk:** statistikk per kommune (Alta) kunne vises, men er nisje. Ikke prioritert.

### Ikke relevant
- **Saltstraumen API** — Saltstraumen ligger ved Bodø, langt unna Rognsund.
- **FiskInfo Reporting API** — innmelding av faststående redskap; ikke åpne data (krever egen avtale).

## Autentisering (BarentsWatch API, scope `api`)

Samme OAuth2 client credentials-flyt som AIS, men med `scope=api`:

```
POST https://id.barentswatch.no/connect/token
  grant_type=client_credentials
  client_id=<epost>:<klientnavn>
  client_secret=<secret>
  scope=api
```

Deretter: `Authorization: Bearer <access_token>` mot
`https://www.barentswatch.no/bwapi/v1/...`.

## Lisens og kreditering

Dataene er lisensiert under **NLOD** (Norsk lisens for offentlige data). Krav:

- Krediter tydelig: **«Data levert av BarentsWatch»** (godt synlig for brukeren).
- Lenk til kilden der mulig (f.eks. barentswatch.no/fiskinfo for FiskInfo).
- Oppgi dataeier der det kreves (f.eks. Mattilsynet for lakselusdata).
- Ikke framstill tjenesten som om den er laget av BarentsWatch.
- Ikke endre innholdet i dataene.

Fullstendige vilkår: https://www.barentswatch.no/artikler/api-vilkar/

## Kilder

- https://www.barentswatch.no/artikler/apnedata/ — oversikt over åpne data
- https://developer.barentswatch.no — teknisk dokumentasjon
- https://www.barentswatch.no/artikler/api-vilkar/ — vilkår for bruk
