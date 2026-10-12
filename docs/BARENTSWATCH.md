# BarentsWatch — API-integrasjon i rognsund.com

Dokumentasjon av hvilke BarentsWatch-API-er som brukes (eller kan brukes) på
rognsund.com, og hvordan tilgangen er satt opp.

## Navnekonvensjon

Alle BarentsWatch-hemmeligheter legges i Cloudflare som **`BW_CLIENT_ID`** og
**`BW_CLIENT_SECRET`** — uavhengig av hvilken BarentsWatch-klient som er i bruk.

## To klienttyper

BarentsWatch har to separate API-klienter med ulik scope. Du trenger én klient
per type, begge opprettes under [barentswatch.no/minside](https://www.barentswatch.no/minside)
→ «Utviklertilganger»:

| Klient | Scope | Innhold |
| --- | --- | --- |
| **AIS API** | `ais` | Sanntids fartøyposisjoner (Kystverket) |
| **BarentsWatch API** | `api` | Fiskehelse, AkvaInfo, FiskInfo, bølgevarsel, polare lavtrykk m.m. |

Merk: én klient kan ikke ha begge scopes — trenger du begge, må du ha to
klienter. `BW_CLIENT_ID`/`BW_CLIENT_SECRET` peker på den klienten som er i bruk
(i dag: AIS-klienten). Skal vi senere ta i bruk «BarentsWatch API» (scope
`api`), må vi opprette en andre klient og legge den under et eget navnepar
(f.eks. `BW_API_CLIENT_ID`/`BW_API_CLIENT_SECRET`).

## AIS API — i bruk

Viser fartøy i sundet:

- `GET /api/baater` — fartøy i sundet nå (`https://live.ais.barentswatch.no/v1/latest/combined`)
- `GET /api/baatlogg` — fartøy innom siste uka (cron hvert 10. min + KV-navnerommet `BAATLOGG`)

Cloudflare-hemmeligheter: `BW_CLIENT_ID`, `BW_CLIENT_SECRET`.
Autentisering: OAuth2 client credentials mot `https://id.barentswatch.no/connect/token` med `scope=ais`.

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
