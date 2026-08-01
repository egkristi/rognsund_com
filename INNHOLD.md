# Slik redigerer du sidene

Denne veiledningen er for deg som vil endre tekst eller legge inn
arrangementer, uten å kunne programmere. Alt innholdet ligger som vanlige
filer, og du kan redigere dem rett i nettleseren på GitHub.

## Legge inn et arrangement

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

## Rette en tekst

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

## Legge inn et bilde

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

## Tall som oppdaterer seg selv

Avgangene, været, flo og fjære, nordlysvarselet og nyhetslista henter seg selv
fra Snelandia/Entur, Meteorologisk institutt, Kartverket, NOAA og avisene.
De skal **ikke** redigeres i filene — de er alltid ferske. Stemmer ikke en
avgang, er det Snelandia som eier ruta; gi beskjed til dem.

## Endre menyen

Menyen står i alle sju HTML-filene, likt hver gang. Endrer du den ett sted, må
du endre den samme snutten i de andre også. Se etter `<nav class="meny"`.

## Slik ser du at det ble riktig

Etter at endringen er lagret på `main`, publiserer GitHub sidene automatisk.
Det tar et par minutter. Last siden på nytt — hold gjerne inne Skift mens du
oppdaterer, så du får den nye versjonen og ikke den nettleseren har lagret.

Gikk noe galt, kan alt rulles tilbake: alle endringer er lagret i historikken.

## Er du usikker?

Send det du vil ha inn via [kontaktskjemaet](https://rognsund.com/kontakt), så
legger noen andre det inn. Det er bedre at stoffet kommer fram enn at det blir
liggende fordi teknikken var i veien.
