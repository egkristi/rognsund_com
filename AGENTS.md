# AGENTS.md

Instruksjoner for kodeagenter som jobber i dette repoet. Les hele fila før du
endrer noe.

## Hva dette er

`rognsund.com` — nettstedet til bygda Rognsund i Alta kommune, Finnmark.
Publisert med Cloudflare Workers med statiske filer. Målgruppa er folk som bor
i bygda eller har røtter der, og besøkende som skal finne ut hvordan de kommer
seg hit.

**Repoet heter `rognsund_no`, men domenet er `rognsund.com`.** Ikke «rett» URL-er
til `.no` — det er ikke en feil.

## Kommandoer

```bash
npm install        # henter wrangler, ingenting annet
npm run dev        # workerd lokalt på http://localhost:8787
npm run deploy     # publiserer til Cloudflare
npm run tail       # logger fra produksjon
```

Det finnes **ingen byggeprosess, ingen bundler og ingen tester**. Filene i
`public/` serveres nøyaktig som de ligger. Ikke innfør et byggesteg uten at det
er bedt om.

## Struktur

```
public/                  serveres som det er
  *.html                 sju sider + 404. Vanlig HTML, ingen mal-motor
  data/arrangementer.json    kalenderen
  assets/css/rognsund.css    ett stilark for hele nettstedet
  assets/js/lysaret.js       regner ut og tegner lysåret på forsiden
  assets/js/nettsted.js      meny, kalender, kontaktskjema
  assets/fonts/              selvhostet, med OFL-lisensene
  _headers, _redirects       sikkerhetshoder, bufring, gamle adresser
src/index.js             worker: /api/kontakt, /api/helse, www→apex
wrangler.jsonc           Cloudflare-oppsett
```

## Konvensjoner

**Norsk i koden.** CSS-klasser, JS-funksjoner og variabler er på norsk:
`omslag`, `bolk`, `kort`, `merkelapp`, `etapper`, `tidslinje`, `hendelse`,
`knapp`, `skjema`, `dagslys`, `skumring`, `soneforskjell`, `håndterKontakt`,
`svar`. Følg mønsteret. Ikke innfør engelske navn i eksisterende filer, og ikke
døp om det som finnes.

**Farger kommer fra tokens.** Alle farger er CSS-variabler i `:root` øverst i
`rognsund.css`. Ikke skriv heksadesimale verdier ute i reglene. To unntak, som
er bevisste: SVG-en som tegnes i `lysaret.js`, og det innlagte kartet i
`om-bygda.html` — SVG-attributter kan ikke arve `var()` på samme måte.

**Topp og bunn er duplisert i alle åtte HTML-filene.** Det er en villet
avveining for at folk uten utviklerbakgrunn skal kunne redigere. Endrer du
menyen, bunnteksten eller `<head>`, må endringen gjøres i **alle** filene, og
`aria-current="page"` skal stå på lenken til sida du er på.

**Vanlig JavaScript, ingen rammeverk.** Nettleserfilene er skrevet i konservativ
ES5-stil (`var`, funksjonsuttrykk, ingen moduler) fordi de lastes direkte uten
transpilering. Workeren i `src/index.js` bruker ES-moduler og moderne syntaks.
Ikke bland de to stilene.

**Ingen avhengigheter.** `wrangler` er den eneste pakken, og den er kun
utviklingsverktøy. Ikke legg til npm-pakker i nettstedet.

## Absolutte krav

**Ingenting skal lastes fra tredjepart.** Ingen Google Fonts, ingen CDN, ingen
analyse, ingen sporingspiksler, ingen informasjonskapsler. Nettstedet lover
dette eksplisitt på kontaktsida, og `Content-Security-Policy` i `public/_headers`
håndhever det med `'self'`. Trenger du noe utenfra, selvhost det — og endrer du
CSP-en, forklar hvorfor.

**Ikke dikt opp fakta om bygda.** Dette handler om et virkelig sted der virkelige
folk bor. Rutetider, telefonnumre, navn på personer og bedrifter, innbyggertall
og åpningstider skal ikke gjettes eller fylles ut med noe som «ser rimelig ut».
Mangler du opplysninger, legg inn en markør i stedet:

```html
<!-- FYLL INN: navn og telefonnummer til overnattingsstedene -->
```

Rutetider skal aldri hardkodes. Lenk til Snelandia. Dette er et bevisst valg som
står forklart på `praktisk.html` — ikke overstyr det.

**Ikke lag falskt innhold i `arrangementer.json`.** Eksemplene som ligger der nå,
er merket som eksempler i `_les_meg`-feltet og skal erstattes av bygda, ikke av
en agent.

## Kvalitetsgulv

Alt du legger til, skal oppfylle det som allerede gjelder:

- Responsivt ned til 360 piksler bredde
- Synlig `:focus-visible`-markering på alt som kan få fokus
- `prefers-reduced-motion` respekteres (håndteres globalt i `rognsund.css`)
- `prefers-color-scheme: dark` støttes via tokens — sjekk begge modusene
- `alt`-tekst på alle bilder, `aria-label` på meningsbærende SVG
- Semantisk HTML: én `<h1>` per side, overskriftsnivåene i rekkefølge
- Sidene skal virke uten JavaScript, bortsett fra lysdiagrammet og kalenderen,
  som begge har `<noscript>`-alternativ

## Lysdiagrammet

Signaturelementet på forsiden. `lysaret.js` regner ut soloppgang, solnedgang og
borgerlig tussmørke for hver dag i året med NOAAs solalgoritme, lokalt i
nettleseren. Det finnes ingen datakilde og ingen API-nøkkel — ikke innfør en.

Endrer du matematikken, kontroller mot disse verdiene for 70,39 °N / 23,07 °Ø:

| | Forventet |
| --- | --- |
| Midnattssol | ca. 15. mai – 28. juli (75 døgn) |
| Mørketid | ca. 24. november – 18. januar (56 døgn) |
| Jevndøgn 20. mars | ca. 05:26 – 17:45 |
| Sommersolverv | 24 timer |

Slik kjører du funksjonene uten nettleser:

```bash
node -e '
const fs=require("fs");
let s=fs.readFileSync("public/assets/js/lysaret.js","utf8");
s=s.replace(/\}\)\(\);\s*$/,"globalThis.__t={dagslys,skumring,klokke};})();");
global.document={readyState:"complete",getElementById:()=>null,addEventListener(){}};
eval(s);
const d=globalThis.__t.dagslys(new Date(2026,5,21));
console.log(d.hele ? "midnattssol" : globalThis.__t.klokke(d.fra));
'
```

## Slik verifiserer du før du er ferdig

```bash
node --check public/assets/js/lysaret.js
node --check public/assets/js/nettsted.js
node --check src/index.js
python3 -c "import json;json.load(open('public/data/arrangementer.json'))"
python3 -c "import json;json.load(open('public/manifest.webmanifest'))"
npm run dev
```

Har du rørt HTML, sjekk også at interne lenker peker på filer som finnes, og at
taggene er balansert. Har du rørt workeren, test endepunktene:

```bash
curl -s localhost:8787/api/helse
curl -s -X POST localhost:8787/api/kontakt \
  -H 'Content-Type: application/json' \
  -d '{"navn":"Test Testesen","epost":"test@example.com","melding":"Prøvemelding"}'
```

Forventet: gyldig innsending gir 200, manglende felt gir 400 med hvilke felt som
mangler, utfylt honningfelt (`nettsted`) gir 200 uten at noe sendes.

## Ikke gjør dette

- Ikke innfør byggesteg, rammeverk eller CSS-preprosessor
- Ikke bytt ut de selvhostede skriftene med Google Fonts
- Ikke legg til analyse eller informasjonskapsler
- Ikke fjern eller løsne på CSP-en i `public/_headers`
- Ikke sjekk inn `.dev.vars`, API-nøkler eller kontonumre
- Ikke skru på `routes` i `wrangler.jsonc` før sonen finnes i Cloudflare —
  publiseringen feiler
- Ikke skriv om tekst til markedsføringsspråk. Tonen er nøktern og konkret:
  aktive verb, vanlige ord, ingen superlativer

## Tekst og tone

Bokmål. Punktum og små bokstaver i overskrifter, ikke Store Forbokstaver I Hver
Setning. Skriv fra leserens side av skjermen: si hva noe er og hva som skjer,
ikke hvordan det er bygd. En knapp heter det den gjør — «Send melding», ikke
«Send inn». Feilmeldinger forklarer hva som gikk galt og hva man gjør nå, uten å
be om unnskyldning.

Faguttrykk brukes bare der de er riktige. Stedsnavn skrives som lokalt: Rognsund,
Rognsundet, Seiland (nordsamisk *Sievju*), Stjernøya, Altneset, Hakkstabben,
Kvalfjord, Storekorsnes.

## Videre lesing

- [README.md](README.md) — oversikt og oppsett
- [INSTRUCTIONS.md](INSTRUCTIONS.md) — driftshåndbok, domene, hemmeligheter, feilsøking
- [INNHOLD.md](INNHOLD.md) — redigeringsveiledning for folk i bygda
