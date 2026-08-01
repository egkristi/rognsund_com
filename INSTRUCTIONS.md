# INSTRUCTIONS.md

Driftshåndbok for **rognsund.com**. Fra tom maskin til publisert nettsted, og
det du trenger for å holde det gående etterpå.

Er du her for å redigere tekst eller legge inn et arrangement, hopp til
[INNHOLD.md](INNHOLD.md) i stedet. Denne fila er for den som drifter.

---

## 1. Forutsetninger

| Du trenger | Merknad |
| --- | --- |
| Node 20 eller nyere | `node -v`. Wrangler krever ikke mer enn dette. |
| En Cloudflare-konto | Gratisplanen holder rikelig for dette nettstedet. |
| Git | Repoet: `github.com/egkristi/rognsund_com` |
| Tilgang til domenet | Hos registraren der `rognsund.com` er kjøpt. |

Nettstedet har ingen byggeprosess. Det er ferdige HTML-, CSS- og JS-filer i
`public/`, pluss én liten worker i `src/index.js`. Alt `npm install` gjør, er å
hente wrangler.

---

## 2. Første gang

```bash
git clone git@github.com:egkristi/rognsund_com.git
cd rognsund_com
npm install
npx wrangler login          # åpner nettleseren, godkjenn tilgangen
npm run dev                 # http://localhost:8787
```

`npm run dev` kjører den ekte kjøretiden lokalt (workerd), ikke en simulering.
Det du ser der, er det som blir publisert.

Sjekk at disse virker før du går videre:

- Forsiden viser lysdiagrammet, ikke en tom boks
- `/om-bygda`, `/natur`, `/praktisk` osv. laster uten `.html` i adressen
- `/finnes-ikke` gir 404-sida
- `http://localhost:8787/api/helse` svarer `{"status":"ok", …}`

---

## 3. Publisere

```bash
npm run deploy
```

Første gang havner nettstedet på `rognsund.<konto>.workers.dev`. Det er en fin
adresse å teste på før domenet kobles på.

Se hva som skjer i produksjon:

```bash
npm run tail                # strømmer logger og feil fra workeren
```

---

## 4. Koble på rognsund.com

**Steg 1 — legg domenet inn i Cloudflare.**
Cloudflare-dashbordet → *Add a domain* → `rognsund.com`. Velg gratisplanen.
Cloudflare gir deg to navneservere.

**Steg 2 — pek navneserverne dit.**
Hos registraren der domenet er kjøpt, bytt navneservere til de to du fikk.
Dette kan ta fra minutter til et døgn. Cloudflare sier fra når sonen er aktiv.

**Steg 3 — skru på rutene.**
I `wrangler.jsonc`, fjern kommentartegnene:

```jsonc
"routes": [
  { "pattern": "rognsund.com", "custom_domain": true },
  { "pattern": "www.rognsund.com", "custom_domain": true }
],
```

**Steg 4 — publiser på nytt.**

```bash
npm run deploy
```

Wrangler oppretter DNS-oppføringene selv. `www.rognsund.com` sendes videre til
`rognsund.com` med 301 av workeren, så begge adressene virker.

> Gjør du steg 3 før sonen er aktiv i Cloudflare, feiler `deploy` med at ruten
> ikke finnes. Da er det bare å vente på navneserverne og prøve igjen.

---

## 5. Kontaktskjemaet

Skjemaet på `/kontakt` sender til `POST /api/kontakt`. Uten oppsett validerer
workeren innsendingen og logger den — den forsvinner altså når du ikke ser på
`npm run tail`. Velg ett av alternativene under.

### Alternativ A — e-post via Resend (anbefalt)

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put KONTAKT_TIL       # f.eks. post@rognsund.com
```

Avsenderadressen står som `KONTAKT_FRA` i `wrangler.jsonc`. Domenet i den
adressen må være verifisert hos Resend, ellers avvises sendingen. Svar-til
settes automatisk til den som fylte ut skjemaet.

### Alternativ B — lagre i KV

```bash
npx wrangler kv namespace create KONTAKT
```

Lim inn ID-en du får, i `wrangler.jsonc`, og fjern kommentartegnene rundt
`kv_namespaces`. Meldingene ligger da ett år og kan hentes med:

```bash
npx wrangler kv key list --binding KONTAKT
npx wrangler kv key get "melding:2026-08-01T…" --binding KONTAKT
```

### Valgfritt — Turnstile mot søppelpost

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Da må du også legge Turnstile-widgeten inn i skjemaet i `kontakt.html`, og
utvide `script-src` og `frame-src` i `public/_headers` med
`https://challenges.cloudflare.com`. Skjemaet har allerede et skjult
honningfelt som stopper de enkleste robotene, så dette haster ikke.

### Teste lokalt

Lag `.dev.vars` i rota (ligger allerede i `.gitignore`):

```
RESEND_API_KEY=re_xxx
KONTAKT_TIL=deg@example.com
```

`npm run dev` plukker den opp automatisk. **Ikke** sjekk den inn.

---

## 5b. Levende data

Workeren henter avganger (Entur/Snelandia), vær (MET), tidevann (Kartverket),
nordlysvarsel (NOAA) og nyheter (RSS) på serversiden — se tabellen i
`README.md`. Alt dette virker uten oppsett.

**Båter i sundet (AIS)** trenger gratis API-tilgang fra BarentsWatch:

1. Registrer deg på [barentswatch.no](https://www.barentswatch.no/) og opprett
   en API-klient med tilgangen «AIS» (se «Application registration and
   authentication» i dokumentasjonen deres).
2. Legg inn hemmelighetene:

```bash
npx wrangler secret put BW_CLIENT_ID
npx wrangler secret put BW_CLIENT_SECRET
```

Uten dem viser praktisk-siden «Posisjonsdata er ikke koblet til ennå» — alt
annet virker som normalt. For lokal testing kan de også ligge i `.dev.vars`.

Er en kilde nede, svarer endepunktet 502 og siden viser en rolig feilmelding
med lenke til kilden. Ingenting av dette bufres, så det retter seg selv når
kilden kommer tilbake.

### Kartet over sundet

Kartet på praktisk-sida er en innebygd SVG i `praktisk.html` med tre lag som
er hentet én gang og selvhostet (ingen kartfliser, ingen tredjepart):

| Lag | Kilde | Lisens |
| --- | --- | --- |
| Kystlinje | OpenStreetMap via Overpass (`natural=coastline`), forenklet | ODbL |
| Fyrlykter og sjømerker | Kystverkets WFS `nfs_sistop_ekstern_prod` (lagene `Lys` og `Fast_sjømerke`) | NLOD |
| Kaier og steder | Enturs stoppestedsregister og OSM-stedsnavn | — |

Kartutsnittet er 22,55–23,45 °Ø og 70,17–70,52 °N, viewBox 700 × 810 —
samme tall står i `SUNDET` i `src/index.js` og `KART` i `sanntid.js`.
Endrer du utsnittet, må alle tre oppdateres. Dataene endrer seg sjelden;
skal de friskes opp, hent dem på nytt fra kildene over og regenerer
punktene med samme projeksjon (lineær lengde/bredde til piksler).

Farledene (hoved- og biled) lå nede hos Geonorge da kartet ble laget
(`wfs.geonorge.no/skwms1/wfs.farled` ga 500) — de kan legges til som eget
lag når tjenesten svarer igjen.

---

## 6. Automatisk publisering fra GitHub

`.github/workflows/deploy.yml` publiserer ved hver push til `main`.

Legg inn to hemmeligheter under *Settings → Secrets and variables → Actions*:

| Navn | Hvor |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Create Token* → malen «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | Står i adresselinja i Cloudflare-dashbordet |

Skal tokenet også kunne sette opp egendefinerte domener, må det ha
`Zone → Workers Routes → Edit` og `Zone → Zone → Read` for `rognsund.com` i
tillegg til `Account → Workers Scripts → Edit`.

Etter dette er arbeidsflyten: rediger, commit, push. Publisert etter et par
minutter.

---

## 7. Daglige oppgaver

**Legge inn et arrangement** — rediger `public/data/arrangementer.json`. Ingen
kodekunnskap nødvendig, se [INNHOLD.md](INNHOLD.md). Kalenderen sorterer selv
og flytter det som har vært, nederst.

**Rette en tekst** — filene ligger i `public/`, én per side. Husk at topp- og
bunnteksten er lik i alle sju: endrer du menyen, må den endres i alle.

**Legge inn et bilde** — legg fila i `public/assets/img/`, helst under 300 kB og
maks rundt 1600 piksler bred. Alltid med `alt`-tekst og fotograf i
`<figcaption>`.

**Flytte lysdiagrammet til et annet punkt i bygda** — øverst i
`public/assets/js/lysaret.js`:

```js
var BREDDE = 70.39;   // grader nord
var LENGDE = 23.07;   // grader øst
```

**Bytte farger** — alle farger er variabler øverst i
`public/assets/css/rognsund.css`, under `:root`. Endre der, ikke ute i reglene.
Husk at `@media (prefers-color-scheme: dark)` overstyrer noen av dem.

---

## 8. Sjekkliste før du publiserer

```bash
node --check public/assets/js/lysaret.js
node --check public/assets/js/nettsted.js
node --check src/index.js
python3 -c "import json;json.load(open('public/data/arrangementer.json'))"
npm run dev
```

Og i nettleseren:

- [ ] Forsiden: lysdiagrammet tegnes, og tallene under stemmer med årstida
- [ ] Menyen virker på smal skjerm (under 860 piksler)
- [ ] Sida du endret, ser riktig ut både i lys og mørk modus
- [ ] Ingen feil i konsollen — særlig ikke CSP-advarsler
- [ ] Tabulator gjennom sida gir synlig fokusmarkering

---

## 9. Feilsøking

| Symptom | Årsak og løsning |
| --- | --- |
| `deploy` feiler med at ruten ikke finnes | Sonen `rognsund.com` er ikke aktiv i Cloudflare ennå. Kommenter ut `routes`, publiser, vent på navneserverne. |
| Undersider gir 404 uten `.html` | `html_handling` i `wrangler.jsonc` må stå på `auto-trailing-slash`. |
| Skriftene laster ikke, alt ser ut som Times | Filene under `public/assets/fonts/` mangler, eller stien i `@font-face` er endret. Den skal være relativ: `../fonts/…`. |
| Konsollen klager på Content Security Policy | Noe laster fra en annen tjeneste. Enten fjern det, eller selvhost det. Reglene ligger i `public/_headers`. |
| Skjemaet svarer 502 | Resend avviser sendingen. `npm run tail` viser feilmeldingen — som regel uverifisert avsenderdomene eller feil API-nøkkel. |
| Skjemaet svarer 200, men ingen e-post kommer | Verken `RESEND_API_KEY`/`KONTAKT_TIL` eller KV er satt opp. Meldingen ble bare logget. Se punkt 5. |
| Endringer i `_headers` slår ikke inn | Publiser på nytt, og hardoppdater nettleseren. Bufring på fonter er satt til ett år. |
| Kalenderen er tom | JSON-feil, oftest et komma for mye etter siste blokk. Valider fila før du pusher. |

---

## 10. Rulle tilbake

```bash
npx wrangler deployments list
npx wrangler rollback [versjons-id]
```

Alternativt: revertér committen i git og push. Da publiserer arbeidsflyten den
forrige versjonen på nytt.

---

## 11. Ikke satt opp ennå

- Ekte innhold på plassene merket `<!-- FYLL INN: … -->` i HTML-filene
- Riktig e-postadresse på kontaktsida (står nå som `post@rognsund.com`)
- Bilder fra bygda — nettstedet har foreløpig bare tegnet grafikk
- Levering av skjemainnsendinger (punkt 5)
- Domenet koblet på (punkt 4)

Full liste ligger nederst i [README.md](README.md).
