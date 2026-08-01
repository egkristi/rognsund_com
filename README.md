# rognsund.com

Nettstedet til bygda Rognsund i Alta kommune, Finnmark — sundet mellom Seiland
og Stjernøya, og grendene langs det.

Statisk nettsted uten byggesteg, publisert med **Cloudflare Workers med statiske
filer**. En liten worker håndterer kontaktskjemaet; alt annet er ferdige filer.

---

## Kom i gang

```bash
npm install
npm run dev        # kjører lokalt på http://localhost:8787
npm run deploy     # publiserer til Cloudflare
```

Første gang må du logge inn: `npx wrangler login`.

Fram til domenet er koblet på, havner nettstedet på
`rognsund.<konto>.workers.dev`.

## Koble på rognsund.com

1. Legg `rognsund.com` inn som sone i Cloudflare (Websites → Add a domain), og
   pek navneserverne dit hos registraren.
2. Fjern kommentartegnene foran `routes` i `wrangler.jsonc`.
3. `npm run deploy`

Workeren sender `www.rognsund.com` videre til `rognsund.com` med 301.

## Publisering fra GitHub

`.github/workflows/deploy.yml` publiserer ved push til `main`. Legg inn to
hemmeligheter i repoet (Settings → Secrets and variables → Actions):

| Hemmelighet | Hvor du finner den |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens, mal «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | Vises i URL-en i Cloudflare-dashbordet |

## Kontaktskjemaet

Skjemaet på `/kontakt` sender til `POST /api/kontakt`. Uten oppsett logges
meldingen bare (synlig med `npm run tail`). Velg én av disse:

**E-post via Resend**

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put KONTAKT_TIL      # f.eks. post@rognsund.com
```

**Lagre i KV i stedet**

```bash
npx wrangler kv namespace create KONTAKT
# lim inn id-en i wrangler.jsonc og fjern kommentartegnene
```

**Turnstile mot søppelpost (valgfritt)**

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Skjemaet har allerede et skjult honningfelt som fanger de enkleste robotene.

For lokal testing: legg hemmelighetene i `.dev.vars` (ligger i `.gitignore`).

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
  assets/fonts/              selvhostet, med lisenser
  _headers                   sikkerhetshoder og hurtigbufring
  _redirects                 gamle adresser
src/index.js             worker: /api/kontakt, /api/helse, www-redirect
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
- [ ] Sett riktig e-postadresse på kontaktsida (nå: `post@rognsund.com`)
- [ ] Samiske stedsnavn — `Seiland/Sievju` er med, resten bør sjekkes med noen som kan språket

Se `INNHOLD.md` for hvordan man redigerer uten å kunne kode.

## Lisens

Kode: MIT. Tekst og bilder: rettighetene tilhører bidragsyterne. Avklar med
fotograf før du legger ut bilder av folk.
