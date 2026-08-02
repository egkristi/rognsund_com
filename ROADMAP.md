# Veikart — rognsund.com

Planlagte endringer sortert etter prioritet. Hver oppgave er merket med omfang:
🟢 liten, 🟡 middels, 🔴 større.

## 1. Feil som må fikses

### 🟢 Tøm `arrangementer.json`
Eksempeldataene («Dugnad på kaia», «Mørketidskveld i forsamlingshuset» og
«Juletrefest») ligger ute som ekte arrangementer. Folk kan møte opp på kaia.
Tøm arrangementer-lista og legg inn en `<!-- FYLL INN -->`-markør på sida
i stedet. _Dette er eneste hasteoppgave._

### ✅ ~~`KONTAKT_FRA` har feil domene~~
`post@rognsund.no` er riktig — domenet er satt opp hos ProISP og
epostadressa er verifisert. Ingen endring nødvendig.

### 🟢 Utdatert kommentar over `routes` i `wrangler.jsonc`
Rutene er aktive og fungerer, men kommentaren sier «Slå på når rognsund.com
 er lagt inn som sone». Fjern eller oppdater kommentaren så den beskriver
faktisk tilstand.

## 2. Robusthet i sanntidslaget

### 🟡 Timeout på alle oppstrømskall
Ingen av `fetch()`-kallene i `src/index.js` har timeout. En treg kilde
holder på workeren til den gir opp av seg selv. Legg til `signal:
AbortSignal.timeout(5000)` på alle hent.

### 🔴 KV-fallback for `/api/avganger` når Entur er nede
Når Entur svarer med feil, får brukeren «Kilden svarte ikke». Båtavgangene
er det mest brukte innholdet på nettstedet. Legg siste vellykkede svar i KV
og server det med et «sist oppdatert»-stempel ved feil. Gammel rutetabell
slår ingen rutetabell.

### 🟡 Sjekk geografisk filter for `/api/baater`
`hentAisPosisjoner()` henter hele Norges AIS-bilde hvert andre minutt og
filtrerer i workeren. Sjekk om BarentsWatch tilbyr geografisk avgrensning
på `latest/combined`-endepunktet. Hvis ikke, vurder å sette opp levetiden
fra 120 sekunder.

### 🟢 Ratebegrensning på `/api/kontakt`
Honningfeltet stopper de enkleste botene, men ruta har ingen
ratebegrensning. Legg til en WAF-regel i Cloudflare-dashbordet eller bruk
en `RateLimit`-binding i workeren.

## 3. Tilgjengelighet

### 🟢 `aria-live="polite"` på sanntidsbokser
Sanntidsboksene (`data-avganger`, `data-vaer`, `data-tidevann` osv.) får
innholdet sitt etter innlasting uten at en skjermleser får beskjed. Legg
til `aria-live="polite"` på alle beholderne.

### 🟢 `<time datetime="…">` på klokkeslett
Klokkeslettene i sanntidsdata og arrangementer bør pakkes i
`<time datetime="…">`-elementer. Maskinlesbare tidspunkt er bra for både
skjermlesere og søkemotorer.

## 4. Prosess og verktøy

### 🟡 CI-validering på pull requests
Workers Builds publiserer blindt — en kommafeil i `arrangementer.json` tar
ned kalenderen. Legg til en GitHub Actions-arbeidsflyt som kjører på PR:

```yaml
- run: node --check src/index.js public/assets/js/*.js
- run: python3 -c "import json;json.load(open('public/data/arrangementer.json'))"
- run: python3 -c "import json;json.load(open('public/manifest.webmanifest'))"
```

Behold Workers Builds som eneste deploy-vei — denne sjekken er kun for å
oppdage feil før de når produksjon.

### 🔴 Tester for datakildene
Workeren er over 600 linjer med regex-parsing av RSS og Kartverkets XML.
Noen få tester med `@cloudflare/vitest-pool-workers` og lagrede
eksempelsvar fra hver kilde ville fanget formatendringer før brukerne
gjør det.

- [ ] Lagre eksempelsvar fra Entur, MET, Kartverket, NOAA, NRK RSS
- [ ] Test at hver `hent*`-funksjon parser eksempelsvaret korrekt
- [ ] Test at `/api/kontakt` validerer påkrevde felt

## 5. Småting

### 🟢 `robots.txt`: `Disallow: /api/`
API-endepunktene skal ikke indekseres. Legg til `Disallow: /api/`.

### 🟢 HSTS-header
Legg til `Strict-Transport-Security: max-age=31536000; includeSubDomains` i
`public/_headers`. Cloudflare håndterer HTTPS automatisk, men headeren
forteller nettlesere at de aldri skal prøve HTTP.

### 🟡 JSON-LD på forsiden
Forsiden ville hatt nytte av litt strukturert data — en `Place` med
koordinater hjelper Google med å forstå at dette er et sted, ikke bare en
tekstside.

```json
{
  "@context": "https://schema.org",
  "@type": "Place",
  "name": "Rognsund",
  "description": "Sundet mellom Seiland og Stjernøya i Alta kommune, Finnmark",
  "geo": { "@type": "GeoCoordinates", "latitude": 70.39, "longitude": 23.07 }
}
```

## Prioritert rekkefølge

1. 🟢 Tøm `arrangementer.json` — **haster**, folk kan møte opp på oppdiktede ting
2. 🟢 `KONTAKT_FRA` — kontaktskjemaet virker ikke uten
3. 🟢 Ratebegrensning på `/api/kontakt` — enkelt, stort utbytte
4. 🟢 `routes`-opprydding — deklarativ konfigurasjon
5. 🟡 Timeout på oppstrømskall — hindrer at workeren henger
6. 🟢 `aria-live`, `<time>`, `robots.txt`, HSTS — tilgjengelighet og sikkerhet
7. 🔴 KV-fallback for Entur — viktig for brukeropplevelsen, men krever KV-oppsett
8. 🟡 CI-validering — fanger feil før de når produksjon
9. 🟡 JSON-LD — synlighet i søkemotorer
10. 🔴 Tester for datakildene — langsiktig trygghet
