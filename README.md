# rognsund.com

Nettstedet til bygda Rognsund i Alta kommune, Finnmark — sundet mellom Seiland
og Stjernøya, og grendene langs det.

Statisk nettsted uten byggesteg, publisert med **Cloudflare Workers med statiske
filer**. En liten worker håndterer kontaktskjemaet; alt annet er ferdige filer.

Er du her for å redigere tekst eller legge inn et arrangement, hopp til
[Slik redigerer du sidene](#slik-redigerer-du-sidene).

---

## Forutsetninger

| Du trenger | Merknad |
| --- | --- |
| Node 20 eller nyere | `node -v`. Wrangler krever ikke mer enn dette. |
| En Cloudflare-konto | Gratisplanen holder rikelig for dette nettstedet. |
| Git | Repoet: `github.com/egkristi/rognsund_com` |
| Tilgang til domenet | Hos registraren der `rognsund.com` er kjøpt. |

Nettstedet har ingen byggeprosess. Det er ferdige HTML-, CSS- og JS-filer i
`public/`, pluss én liten worker i `src/index.js`. Alt `npm install` gjør, er å
hente wrangler.

## Første gang

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

## Publisere

```bash
npm run deploy
```

Første gang havner nettstedet på `rognsund.<konto>.workers.dev`. Det er en fin
adresse å teste på før domenet kobles på.

Se hva som skjer i produksjon:

```bash
npm run tail                # strømmer logger og feil fra workeren
```

## Koble på rognsund.com

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

## Publisering fra GitHub

`.github/workflows/deploy.yml` publiserer ved push til `main`. Legg inn to
hemmeligheter i repoet (Settings → Secrets and variables → Actions):

| Hemmelighet | Hvor du finner den |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens, mal «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | Vises i URL-en i Cloudflare-dashbordet |

## Kontaktskjemaet

Skjemaet på `/kontakt` sender til `POST /api/kontakt`. Uten oppsett validerer
workeren innsendingen og logger den — den forsvinner altså når du ikke ser på
`npm run tail`. Velg ett av alternativene under.

### Alternativ A — e-post via Resend (anbefalt)

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put KONTAKT_TIL       # f.eks. post@rognsund.no
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

## Levende data

Workeren henter åpne data på serversiden og bufrer dem, slik at nettleseren
aldri snakker med tredjepart og CSP-en kan forbli `'self'`:

| Endepunkt | Innhold | Kilde | Buffer |
| --- | --- | --- | --- |
| `/api/avganger` | Neste båtavganger og avvik | Entur (Snelandia) | 1 min |
| `/api/vaer` | Værvarsel for sundet | Meteorologisk institutt | 30 min |
| `/api/tidevann` | Flo og fjære | Kartverket | 6 t |
| `/api/nordlys` | Kp-indeks nå og varsel | NOAA SWPC | 30 min |
| `/api/nytt` | Saker som nevner området | NRK og Altaposten (RSS) | 30 min |
| `/api/baater` | Fartøy i sundet (AIS) | Kystverket via BarentsWatch | 2 min |
| `/api/baatlogg` | Fartøy innom siste uka | Egen logg (cron hvert 10. min + KV) | 10 min |

Alt virker uten oppsett, bortsett fra de to nederste.

### Båter i sundet (AIS)

Trenger gratis API-tilgang fra BarentsWatch:

1. Registrer deg på [barentswatch.no](https://www.barentswatch.no/) og opprett
   en API-klient med tilgangen «AIS» (se «Application registration and
   authentication» i dokumentasjonen deres).
2. Legg inn hemmelighetene:

```bash
npx wrangler secret put BW_CLIENT_ID
npx wrangler secret put BW_CLIENT_SECRET
```

Uten dem svarer endepunktet `{"konfigurert": false}`, og siden skjuler
innholdet pent. For lokal testing kan de også ligge i `.dev.vars`.

### Båtloggen («innom sundet siste uka»)

Trenger i tillegg lagringsplass:

```bash
npx wrangler kv namespace create BAATLOGG
# lim inn id-en i wrangler.jsonc der kommentaren viser, og publiser på nytt
```

Cron-jobben (hvert tiende minutt, satt opp i `wrangler.jsonc`) logger da
fartøyene i sundet, og lista fyller seg dag for dag. Det finnes ingen åpen
kilde å hente ukeshistorikk fra i etterkant — Kystdatahusets historiske
AIS-base ligger flere måneder på etterskudd — så loggen starter tom.

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

---

## Slik er det satt sammen

```
public/                  alt som serveres som det er
  index.html             forsiden, med lysdiagrammet
  om-bygda.html          bygdene, skole, kirke, næring
  historie.html          tidslinje og kilder
  natur.html             nasjonalpark, turer, fiske, lys
  praktisk.html          reise hit, overnatting, beredskap
  det-som-skjer.html     kalender
  kontakt.html           skjema og personvern
  404.html
  data/arrangementer.json    ← kalenderen redigeres her
  assets/css/rognsund.css    ett stilark, alle farger som variabler øverst
  assets/js/lysaret.js       regner ut og tegner lysåret
  assets/js/nettsted.js      meny, kalender, skjema
  assets/js/sanntid.js       avganger, vær, tidevann, nordlys, måne, nytt, båter
  assets/fonts/              selvhostet, med lisenser
  _headers                   sikkerhetshoder og hurtigbufring
  _redirects                 gamle adresser
src/index.js             worker: /api/kontakt, /api/helse, levende data, www-redirect
wrangler.jsonc           Cloudflare-oppsett
```

Sidene er vanlig HTML uten byggesteg. Topp- og bunnteksten er lik i alle filene
— endrer du menyen, må den endres i alle sju. Det er en bevisst avveining:
enklere for folk uten utviklerbakgrunn å redigere, på bekostning av litt
duplisering. Vokser nettstedet, er Eleventy eller Astro naturlige neste steg.

### Lysdiagrammet

Signaturelementet på forsiden regner ut soloppgang, solnedgang og borgerlig
tussmørke for hver dag i året med NOAAs solalgoritme, direkte i nettleseren.
Ingen data hentes utenfra. Posisjonen står øverst i `assets/js/lysaret.js`:

```js
var BREDDE = 70.39;   // grader nord
var LENGDE = 23.07;   // grader øst
```

Kontrollverdier for 70,39 °N: midnattssol ca. 15. mai – 28. juli (75 døgn),
mørketid ca. 24. november – 18. januar (56 døgn).

### Design

Retningen er sjøkartet: kaldt kartpapir, dyp nattblå trykkfarge og
kartmagenta til det som er levende. Nordlysgrønt brukes bare inne i
lysdiagrammet, der det betyr noe.

Skrift: Schibsted Grotesk (overskrifter), Literata (brødtekst), IBM Plex Mono
(tall, klokkeslett, koordinater). Alle selvhostet under
`public/assets/fonts/` med OFL-lisensene ved siden av. Ingen Google Fonts,
ingen sporing, ingen informasjonskapsler — nettstedet laster ingenting fra
tredjepart, og `Content-Security-Policy` i `_headers` håndhever det.

---

## Innhold som må fylles inn lokalt

Teksten er skrevet ut fra det som lar seg dokumentere om Rognsund. Dette bør
folk i bygda rette og fylle på:

- [ ] Navn, telefon og nettside til overnatting, servering og båtutleie (`praktisk.html`)
- [ ] Bygdelag, kontaktpersoner og eventuell Facebook-gruppe (`kontakt.html`)
- [ ] Ekte arrangementer i `data/arrangementer.json` — eksemplene der nå er oppdiktede
- [ ] Faste årlige begivenheter (`det-som-skjer.html`)
- [ ] Bilder fra bygda. Legg dem i `assets/img/` og lenk dem inn
- [ ] Gå gjennom historiesida med noen som kan lokalhistorien
- [ ] Sett riktig e-postadresse på kontaktsida (nå: `post@rognsund.no`)
- [ ] Samiske stedsnavn — `Seiland/Sievju` er med, resten bør sjekkes med noen som kan språket

---

## Slik redigerer du sidene

Denne delen er for deg som vil endre tekst eller legge inn arrangementer, uten
å kunne programmere. Alt innholdet ligger som vanlige filer, og du kan redigere
dem rett i nettleseren på GitHub.

### Legge inn et arrangement

Åpne fila `public/data/arrangementer.json` og legg til en blokk i lista:

```json
{
  "dato": "2027-06-23",
  "tittel": "Sankthans på kaia",
  "tid": "20:00",
  "sted": "Altneset",
  "arrangor": "Bygdelaget",
  "beskrivelse": "Bål, kaffe og vafler i midnattssola."
}
```

Regler som er verdt å vite:

- Datoen må skrives `ÅÅÅÅ-MM-DD`, altså år først.
- `dato` og `tittel` må være med. Resten kan du droppe.
- Hver blokk skilles med komma. Den siste i lista skal **ikke** ha komma etter
  seg — det er den vanligste feilen.
- Rekkefølgen i fila spiller ingen rolle. Sidene sorterer selv, og flytter det
  som har vært, nederst.

### Rette en tekst

Sidene ligger som `.html`-filer i mappa `public/`:

| Fil | Side |
| --- | --- |
| `index.html` | Forsiden |
| `om-bygda.html` | Om bygda |
| `historie.html` | Historie |
| `natur.html` | Natur og friluftsliv |
| `praktisk.html` | Praktisk info |
| `det-som-skjer.html` | Det som skjer |
| `kontakt.html` | Kontakt |

Teksten står mellom taggene. Vil du endre et avsnitt, skriver du bare om det
som står mellom `<p>` og `</p>`:

```html
<p>
  Her ligger Rognsund skole og kaia der kombibåten legger til.
</p>
```

La taggene stå som de er. Trenger du et nytt avsnitt, kopier et helt
`<p>…</p>` og skriv om innholdet.

Steder som venter på lokal kunnskap er merket slik i fila:

```html
<!-- FYLL INN: navn og telefonnummer til overnattingsstedene -->
```

Det som står mellom `<!--` og `-->` vises ikke på nettsida.

### Legge inn et bilde

1. Last bildet opp i mappa `public/assets/img/`. Bruk små bokstaver og
   bindestrek i filnavnet, for eksempel `kaia-altneset.jpg`.
2. Sett det inn der du vil ha det:

```html
<figure class="kartfigur">
  <img src="/assets/img/kaia-altneset.jpg" alt="Kaia på Altneset en vinterdag">
  <figcaption>Kaia på Altneset. Foto: Navn Navnesen</figcaption>
</figure>
```

`alt`-teksten beskriver bildet for dem som ikke ser det. Skriv den kort og
konkret. Krymp gjerne bildet til rundt 1600 piksler bredde før du laster det
opp, så går sidene raskere.

Spør alltid fotografen først, og folk som er med på bildet.

### Tall som oppdaterer seg selv

Avgangene, været, flo og fjære, nordlysvarselet og nyhetslista henter seg selv
fra Snelandia/Entur, Meteorologisk institutt, Kartverket, NOAA og avisene.
De skal **ikke** redigeres i filene — de er alltid ferske. Stemmer ikke en
avgang, er det Snelandia som eier ruta; gi beskjed til dem.

### Endre menyen

Menyen står i alle sju HTML-filene, likt hver gang. Endrer du den ett sted, må
du endre den samme snutten i de andre også. Se etter `<nav class="meny"`.

### Slik ser du at det ble riktig

Etter at endringen er lagret på `main`, publiserer GitHub sidene automatisk.
Det tar et par minutter. Last siden på nytt — hold gjerne inne Skift mens du
oppdaterer, så du får den nye versjonen og ikke den nettleseren har lagret.

Gikk noe galt, kan alt rulles tilbake: alle endringer er lagret i historikken.

### Er du usikker?

Send det du vil ha inn via [kontaktskjemaet](https://rognsund.com/kontakt), så
legger noen andre det inn. Det er bedre at stoffet kommer fram enn at det blir
liggende fordi teknikken var i veien.

---

## Lisens

Kode: MIT. Tekst og bilder: rettighetene tilhører bidragsyterne. Avklar med
fotograf før du legger ut bilder av folk.

