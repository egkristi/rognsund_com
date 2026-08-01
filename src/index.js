/**
 * rognsund.com — Cloudflare Worker
 *
 * Alt av sider, bilder og skrifttyper ligger som statiske filer i /public og
 * serveres av Cloudflare (ASSETS-bindingen). Denne workeren håndterer bare det
 * som må skje på serversiden:
 *
 *   POST /api/kontakt   tar imot kontaktskjemaet
 *   GET  /api/helse     enkel statussjekk
 *   www.rognsund.com    videresendes til rognsund.com
 *
 * I tillegg henter workeren åpne data på serversiden, slik at nettleseren
 * aldri snakker med tredjepart (CSP-en forblir 'self'):
 *
 *   GET /api/avganger   neste båtavganger og avvik      Entur / Snelandia
 *   GET /api/vaer       værvarsel for Rognsundet        Meteorologisk institutt
 *   GET /api/tidevann   flo og fjære                    Kartverket
 *   GET /api/nordlys    Kp-indeks nå og varsel          NOAA SWPC
 *   GET /api/nytt       nyhetssaker som nevner bygda    NRK og Altaposten (RSS)
 *   GET /api/baater     fartøy i sundet (AIS)           Kystverket via BarentsWatch
 *
 * Alt bufres i Cloudflares cache, så kildene belastes lite. Endepunktene
 * virker uten oppsett, bortsett fra /api/baater som trenger hemmelighetene
 * BW_CLIENT_ID og BW_CLIENT_SECRET (gratis registrering hos BarentsWatch).
 *
 * Kontaktskjemaet fungerer uten oppsett (meldingen logges), men blir først
 * nyttig når du setter én av disse:
 *
 *   RESEND_API_KEY + KONTAKT_TIL   sender meldingen som e-post via Resend
 *   KONTAKT (KV namespace)         lagrer meldingen i KV
 *   TURNSTILE_SECRET               slår på Cloudflare Turnstile-sjekk
 *
 * Se README.md for kommandoene.
 */

const MAKS_LENGDE = {
  navn: 120,
  epost: 200,
  emne: 60,
  melding: 5000,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // www → uten www
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/kontakt") {
      return håndterKontakt(request, env, ctx);
    }

    if (url.pathname === "/api/helse") {
      return svar(200, { status: "ok", tid: new Date().toISOString() });
    }

    const datakilde = DATAKILDER[url.pathname];
    if (datakilde) {
      return medBuffer(request, ctx, datakilde.levetid, () => datakilde.hent(env));
    }

    // Alt annet er statiske filer
    return env.ASSETS.fetch(request);
  },
};

/* ------------------------------------------------------------------ */

async function håndterKontakt(request, env, ctx) {
  if (request.method !== "POST") {
    return svar(405, { melding: "Bruk POST." });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return svar(400, { melding: "Klarte ikke lese skjemaet." });
  }

  // Skjult felt som bare roboter fyller ut. Vi later som alt gikk bra.
  if (typeof data.nettsted === "string" && data.nettsted.trim() !== "") {
    return svar(200, { melding: "Takk, meldingen er mottatt." });
  }

  const navn = tekst(data.navn, MAKS_LENGDE.navn);
  const epost = tekst(data.epost, MAKS_LENGDE.epost);
  const emne = tekst(data.emne, MAKS_LENGDE.emne) || "annet";
  const melding = tekst(data.melding, MAKS_LENGDE.melding);

  const mangler = [];
  if (navn.length < 2) mangler.push("navn");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(epost)) mangler.push("e-post");
  if (melding.length < 5) mangler.push("melding");
  if (mangler.length) {
    return svar(400, {
      melding: "Sjekk disse feltene: " + mangler.join(", ") + ".",
    });
  }

  if (env.TURNSTILE_SECRET) {
    const ok = await sjekkTurnstile(env.TURNSTILE_SECRET, data["cf-turnstile-response"], request);
    if (!ok) {
      return svar(400, { melding: "Vi fikk ikke bekreftet at du er et menneske. Prøv igjen." });
    }
  }

  const innsending = {
    navn,
    epost,
    emne,
    melding,
    mottatt: new Date().toISOString(),
    land: request.headers.get("cf-ipcountry") || null,
  };

  try {
    if (env.RESEND_API_KEY && env.KONTAKT_TIL) {
      await sendEpost(env, innsending);
    } else if (env.KONTAKT) {
      const nøkkel = `melding:${innsending.mottatt}:${crypto.randomUUID().slice(0, 8)}`;
      ctx.waitUntil(env.KONTAKT.put(nøkkel, JSON.stringify(innsending), {
        expirationTtl: 60 * 60 * 24 * 365,
      }));
    } else {
      console.log("Kontaktskjema (ingen levering satt opp):", JSON.stringify(innsending));
    }
  } catch (feil) {
    console.error("Kontaktskjema feilet:", feil);
    return svar(502, {
      melding: "Meldingen kom ikke fram. Prøv igjen, eller send e-post direkte.",
    });
  }

  return svar(200, {
    melding: "Takk! Meldingen er sendt, og vi svarer så fort noen får sett på den.",
  });
}

async function sendEpost(env, m) {
  const fra = env.KONTAKT_FRA || "Rognsund <post@rognsund.com>";
  const svarTil = m.epost;
  const respons = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fra,
      to: env.KONTAKT_TIL.split(",").map((s) => s.trim()),
      reply_to: svarTil,
      subject: `rognsund.com — ${m.emne} — fra ${m.navn}`,
      text:
        `Navn:    ${m.navn}\n` +
        `E-post:  ${m.epost}\n` +
        `Emne:    ${m.emne}\n` +
        `Mottatt: ${m.mottatt}\n\n` +
        m.melding,
    }),
  });
  if (!respons.ok) {
    throw new Error("Resend svarte " + respons.status + ": " + (await respons.text()));
  }
}

async function sjekkTurnstile(hemmelighet, token, request) {
  if (!token) return false;
  const skjema = new FormData();
  skjema.append("secret", hemmelighet);
  skjema.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) skjema.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: skjema,
  });
  const j = await r.json();
  return j.success === true;
}

function tekst(verdi, maks) {
  if (typeof verdi !== "string") return "";
  return verdi.trim().slice(0, maks);
}

function svar(status, kropp) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* ==================================================================== */
/* Åpne datakilder, hentet på serversiden og bufret i Cloudflare        */
/* ==================================================================== */

// Samme punkt som lysåret på forsiden regnes for.
const BREDDE = 70.39;
const LENGDE = 23.07;

// Identifikasjon Entur og MET krever av alle som bruker API-ene deres.
const KLIENTNAVN = "rognsundcom-nettsted";
const BRUKERAGENT = "rognsund.com post@rognsund.com";

// Kaiene i og rundt sundet, fra Enturs nasjonale stoppestedsregister.
const KAIER = [
  { id: "NSR:StopPlace:57114", navn: "Storekorsnes" },
  { id: "NSR:StopPlace:57099", navn: "Altneset" },
  { id: "NSR:StopPlace:57103", navn: "Kvalfjord" },
  { id: "NSR:StopPlace:57110", navn: "Pollen" },
  { id: "NSR:StopPlace:57106", navn: "Bia" },
];

// Ord som avgjør om en nyhetssak handler om området.
const NYHETSORD = [
  "rognsund", "hakkstabben", "altneset", "kvalfjord", "storekorsnes",
  "seiland", "stjernøy", "sievju", "stierdná",
];

const DATAKILDER = {
  "/api/avganger": { levetid: 60, hent: hentAvganger },
  "/api/vaer": { levetid: 1800, hent: hentVaer },
  "/api/tidevann": { levetid: 21600, hent: hentTidevann },
  "/api/nordlys": { levetid: 1800, hent: hentNordlys },
  "/api/nytt": { levetid: 1800, hent: hentNytt },
  "/api/baater": { levetid: 120, hent: hentBaater },
};

/* Svarer fra Cloudflares cache når mulig, ellers hentes kilden på nytt.
   Feil bufres aldri. HEAD besvares som GET, bare uten kropp. */
async function medBuffer(request, ctx, levetid, hent) {
  const erHead = request.method === "HEAD";
  if (request.method !== "GET" && !erHead) {
    return svar(405, { melding: "Bruk GET." });
  }
  const utenKropp = (r) => (erHead ? new Response(null, r) : r);

  const buffer = caches.default;
  const nøkkel = new Request(new URL(request.url).toString());
  const lagret = await buffer.match(nøkkel);
  if (lagret) return utenKropp(lagret);

  let kropp;
  try {
    kropp = await hent();
  } catch (feil) {
    console.error("Datakilde feilet:", nøkkel.url, feil);
    return utenKropp(svar(502, { melding: "Kilden svarte ikke akkurat nå. Prøv igjen om litt." }));
  }

  const respons = new Response(JSON.stringify(kropp), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${levetid}`,
    },
  });
  ctx.waitUntil(buffer.put(nøkkel, respons.clone()));
  return utenKropp(respons);
}

async function hentJson(url, valg) {
  const respons = await fetch(url, valg);
  if (!respons.ok) throw new Error(`${url} svarte ${respons.status}`);
  return respons.json();
}

/* --- Avganger: Entur (Snelandia leverer rutedata og sanntid dit) ------- */

async function hentAvganger() {
  const felter = `
    estimatedCalls(numberOfDepartures: 5, timeRange: 604800) {
      aimedDepartureTime expectedDepartureTime realtime cancellation
      destinationDisplay { frontText }
      serviceJourney { line { publicCode } }
      situations { summary { value language } }
    }
    situations { summary { value language } }`;
  const spørring = "{" + KAIER.map(
    (kai, i) => `k${i}: stopPlace(id: "${kai.id}") {${felter}}`
  ).join("\n") + "}";

  const data = await hentJson("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": KLIENTNAVN,
    },
    body: JSON.stringify({ query: spørring }),
  });

  const avvik = new Set();
  const norsk = (oppsummeringer) => {
    if (!Array.isArray(oppsummeringer)) return;
    const valgt = oppsummeringer.find((s) => s.language === "no" || s.language === "nb")
      || oppsummeringer[0];
    if (valgt && valgt.value) avvik.add(valgt.value);
  };

  const kaier = KAIER.map((kai, i) => {
    const sted = data.data && data.data[`k${i}`];
    if (!sted) return { navn: kai.navn, avganger: [] };
    (sted.situations || []).forEach((s) => norsk(s.summary));
    const avganger = (sted.estimatedCalls || []).map((anlop) => {
      (anlop.situations || []).forEach((s) => norsk(s.summary));
      return {
        linje: anlop.serviceJourney?.line?.publicCode || "",
        mot: anlop.destinationDisplay?.frontText || "",
        planlagt: anlop.aimedDepartureTime,
        ventet: anlop.expectedDepartureTime,
        sanntid: anlop.realtime === true,
        innstilt: anlop.cancellation === true,
      };
    });
    return { navn: kai.navn, avganger };
  });

  return {
    hentet: new Date().toISOString(),
    kaier,
    avvik: [...avvik],
    kilde: "Entur / Snelandia",
  };
}

/* --- Vær: Meteorologisk institutt (CC BY 4.0) --------------------------- */

async function hentVaer() {
  const data = await hentJson(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${BREDDE}&lon=${LENGDE}`,
    { headers: { "User-Agent": BRUKERAGENT } }
  );

  const serie = data.properties?.timeseries || [];
  const timer = serie.slice(0, 18).map((punkt) => {
    const naa = punkt.data?.instant?.details || {};
    const nesteTime = punkt.data?.next_1_hours;
    return {
      tid: punkt.time,
      temperatur: naa.air_temperature,
      vind: naa.wind_speed,
      vindretning: naa.wind_from_direction,
      nedbør: nesteTime ? nesteTime.details?.precipitation_amount : null,
      symbol: nesteTime ? nesteTime.summary?.symbol_code : null,
    };
  });

  const utsikt = serie
    .filter((punkt) => punkt.time.endsWith("T12:00:00Z") && punkt.data?.next_6_hours)
    .slice(0, 4)
    .map((punkt) => ({
      tid: punkt.time,
      temperatur: punkt.data.instant?.details?.air_temperature,
      symbol: punkt.data.next_6_hours.summary?.symbol_code,
    }));

  return {
    oppdatert: data.properties?.meta?.updated_at,
    timer,
    utsikt,
    kilde: "Meteorologisk institutt (CC BY 4.0)",
  };
}

/* --- Tidevann: Kartverket (CC BY 4.0) ----------------------------------- */

async function hentTidevann() {
  const fra = new Date();
  const til = new Date(fra.getTime() + 2 * 86400000);
  const stubb = (d) => d.toISOString().slice(0, 16);
  const adresse = "https://vannstand.kartverket.no/tideapi.php" +
    `?tide_request=locationdata&lat=${BREDDE}&lon=${LENGDE}` +
    `&datatype=tab&refcode=cd&lang=nb&tzone=0&dst=0` +
    `&fromtime=${stubb(fra)}&totime=${stubb(til)}`;

  const respons = await fetch(adresse, { headers: { "User-Agent": BRUKERAGENT } });
  if (!respons.ok) throw new Error(`Kartverket svarte ${respons.status}`);
  const xml = await respons.text();

  const justering = xml.match(/<location [^>]*descr="([^"]*)"/)?.[1] || null;
  const vannstander = [...xml.matchAll(
    /<waterlevel value="([\d.]+)" time="([^"]+)" flag="(high|low)"\s*\/>/g
  )].map((treff) => ({
    tid: treff[2],
    cm: Math.round(parseFloat(treff[1])),
    type: treff[3] === "high" ? "flo" : "fjære",
  }));
  if (!vannstander.length) throw new Error("Fikk ingen tidevannsdata fra Kartverket");

  return {
    hentet: new Date().toISOString(),
    justering,
    vannstander,
    kilde: "Kartverket (CC BY 4.0)",
  };
}

/* --- Nordlys: Kp-indeksen fra NOAA Space Weather Prediction Center ------ */

async function hentNordlys() {
  const rader = await hentJson(
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
  );

  // Formatet har vekslet mellom rad-lister og objekter; håndter begge.
  const punkter = rader
    .map((rad) => Array.isArray(rad)
      ? { tid: rad[0], kp: parseFloat(rad[1]), status: rad[2] }
      : { tid: rad.time_tag, kp: parseFloat(rad.kp), status: rad.observed })
    .filter((p) => p.tid !== "time_tag" && !Number.isNaN(p.kp));

  const observert = punkter.filter((p) => p.status === "observed");
  const varslet = punkter.filter((p) => p.status !== "observed");
  const naa = observert[observert.length - 1] || null;

  return {
    hentet: new Date().toISOString(),
    naa: naa ? { tid: naa.tid + "Z", kp: naa.kp } : null,
    varsel: varslet.slice(0, 16).map((p) => ({ tid: p.tid + "Z", kp: p.kp })),
    kilde: "NOAA SWPC",
  };
}

/* --- Nyheter: RSS fra NRK og Altaposten, silt på stedsnavn -------------- */

const NYHETSKILDER = [
  { navn: "NRK", adresse: "https://www.nrk.no/tromsogfinnmark/toppsaker.rss" },
  { navn: "Altaposten", adresse: "https://www.altaposten.no/rss" },
];

function avXml(verdi) {
  return verdi
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .trim();
}

function lesRss(xml, kilde) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((treff) => {
    const felt = (navn) => {
      const t = treff[1].match(new RegExp(`<${navn}[^>]*>([\\s\\S]*?)</${navn}>`));
      return t ? avXml(t[1].trim()) : "";
    };
    return {
      tittel: felt("title"),
      lenke: felt("link"),
      sammendrag: felt("description"),
      dato: felt("pubDate"),
      kilde,
    };
  });
}

async function hentNytt() {
  const svarene = await Promise.allSettled(NYHETSKILDER.map(async (kilde) => {
    const respons = await fetch(kilde.adresse, { headers: { "User-Agent": BRUKERAGENT } });
    if (!respons.ok) throw new Error(`${kilde.navn} svarte ${respons.status}`);
    return lesRss(await respons.text(), kilde.navn);
  }));

  const saker = svarene
    .flatMap((s) => (s.status === "fulfilled" ? s.value : []))
    .filter((sak) => {
      const tekst = (sak.tittel + " " + sak.sammendrag).toLowerCase();
      return NYHETSORD.some((ord) => tekst.includes(ord));
    })
    .sort((a, b) => new Date(b.dato) - new Date(a.dato))
    .slice(0, 10)
    .map((sak) => ({
      tittel: sak.tittel, lenke: sak.lenke, dato: sak.dato, kilde: sak.kilde,
    }));

  return {
    hentet: new Date().toISOString(),
    saker,
    kilder: NYHETSKILDER.map((k) => k.navn),
  };
}

/* --- Båter i sundet: AIS fra Kystverket via BarentsWatch ----------------
   Trenger BW_CLIENT_ID og BW_CLIENT_SECRET (gratis: barentswatch.no).
   Uten dem svarer endepunktet ærlig at det ikke er satt opp.             */

// Samme utsnitt som kartet på praktisk-sida.
const SUNDET = { sør: 70.17, nord: 70.52, vest: 22.55, øst: 23.45 };

async function hentBaater(env) {
  if (!env.BW_CLIENT_ID || !env.BW_CLIENT_SECRET) {
    return { konfigurert: false, baater: [] };
  }

  const token = await hentJson("https://id.barentswatch.no/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.BW_CLIENT_ID,
      client_secret: env.BW_CLIENT_SECRET,
      scope: "ais",
      grant_type: "client_credentials",
    }),
  });

  const alle = await hentJson("https://live.ais.barentswatch.no/v1/latest/combined", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  const baater = (Array.isArray(alle) ? alle : [])
    .filter((b) =>
      typeof b.latitude === "number" && typeof b.longitude === "number" &&
      b.latitude >= SUNDET.sør && b.latitude <= SUNDET.nord &&
      b.longitude >= SUNDET.vest && b.longitude <= SUNDET.øst)
    .map((b) => ({
      navn: b.name || "Ukjent fartøy",
      mmsi: b.mmsi,
      fart: b.speedOverGround,
      kurs: b.courseOverGround,
      destinasjon: b.destination || null,
      bredde: b.latitude,
      lengde: b.longitude,
      tid: b.msgtime,
    }));

  return {
    konfigurert: true,
    hentet: new Date().toISOString(),
    baater,
    kilde: "Kystverket via BarentsWatch",
  };
}
