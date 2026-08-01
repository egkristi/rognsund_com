var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var MAKS_LENGDE = {
  navn: 120,
  epost: 200,
  emne: 60,
  melding: 5e3
};
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/api/kontakt") {
      return h\u00E5ndterKontakt(request, env, ctx);
    }
    if (url.pathname === "/api/helse") {
      return svar(200, { status: "ok", tid: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const datakilde = DATAKILDER[url.pathname];
    if (datakilde) {
      return medBuffer(request, ctx, datakilde.levetid, () => datakilde.hent(env));
    }
    return env.ASSETS.fetch(request);
  }
};
async function h\u00E5ndterKontakt(request, env, ctx) {
  if (request.method !== "POST") {
    return svar(405, { melding: "Bruk POST." });
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return svar(400, { melding: "Klarte ikke lese skjemaet." });
  }
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
      melding: "Sjekk disse feltene: " + mangler.join(", ") + "."
    });
  }
  if (env.TURNSTILE_SECRET) {
    const ok = await sjekkTurnstile(env.TURNSTILE_SECRET, data["cf-turnstile-response"], request);
    if (!ok) {
      return svar(400, { melding: "Vi fikk ikke bekreftet at du er et menneske. Pr\xF8v igjen." });
    }
  }
  const innsending = {
    navn,
    epost,
    emne,
    melding,
    mottatt: (/* @__PURE__ */ new Date()).toISOString(),
    land: request.headers.get("cf-ipcountry") || null
  };
  try {
    if (env.RESEND_API_KEY && env.KONTAKT_TIL) {
      await sendEpost(env, innsending);
    } else if (env.KONTAKT) {
      const n\u00F8kkel = `melding:${innsending.mottatt}:${crypto.randomUUID().slice(0, 8)}`;
      ctx.waitUntil(env.KONTAKT.put(n\u00F8kkel, JSON.stringify(innsending), {
        expirationTtl: 60 * 60 * 24 * 365
      }));
    } else {
      console.log("Kontaktskjema (ingen levering satt opp):", JSON.stringify(innsending));
    }
  } catch (feil) {
    console.error("Kontaktskjema feilet:", feil);
    return svar(502, {
      melding: "Meldingen kom ikke fram. Pr\xF8v igjen, eller send e-post direkte."
    });
  }
  return svar(200, {
    melding: "Takk! Meldingen er sendt, og vi svarer s\xE5 fort noen f\xE5r sett p\xE5 den."
  });
}
__name(h\u00E5ndterKontakt, "h\xE5ndterKontakt");
async function sendEpost(env, m) {
  const fra = env.KONTAKT_FRA || "Rognsund <post@rognsund.com>";
  const svarTil = m.epost;
  const respons = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fra,
      to: env.KONTAKT_TIL.split(",").map((s) => s.trim()),
      reply_to: svarTil,
      subject: `rognsund.com \u2014 ${m.emne} \u2014 fra ${m.navn}`,
      text: `Navn:    ${m.navn}
E-post:  ${m.epost}
Emne:    ${m.emne}
Mottatt: ${m.mottatt}

` + m.melding
    })
  });
  if (!respons.ok) {
    throw new Error("Resend svarte " + respons.status + ": " + await respons.text());
  }
}
__name(sendEpost, "sendEpost");
async function sjekkTurnstile(hemmelighet, token, request) {
  if (!token) return false;
  const skjema = new FormData();
  skjema.append("secret", hemmelighet);
  skjema.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) skjema.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: skjema
  });
  const j = await r.json();
  return j.success === true;
}
__name(sjekkTurnstile, "sjekkTurnstile");
function tekst(verdi, maks) {
  if (typeof verdi !== "string") return "";
  return verdi.trim().slice(0, maks);
}
__name(tekst, "tekst");
function svar(status, kropp) {
  return new Response(JSON.stringify(kropp), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(svar, "svar");
var BREDDE = 70.39;
var LENGDE = 23.07;
var KLIENTNAVN = "rognsundcom-nettsted";
var BRUKERAGENT = "rognsund.com post@rognsund.com";
var KAIER = [
  { id: "NSR:StopPlace:57114", navn: "Storekorsnes" },
  { id: "NSR:StopPlace:57099", navn: "Altneset" },
  { id: "NSR:StopPlace:57103", navn: "Kvalfjord" },
  { id: "NSR:StopPlace:57110", navn: "Pollen" },
  { id: "NSR:StopPlace:57106", navn: "Bia" }
];
var NYHETSORD = [
  "rognsund",
  "hakkstabben",
  "altneset",
  "kvalfjord",
  "storekorsnes",
  "seiland",
  "stjern\xF8y",
  "sievju",
  "stierdn\xE1"
];
var DATAKILDER = {
  "/api/avganger": { levetid: 60, hent: hentAvganger },
  "/api/vaer": { levetid: 1800, hent: hentVaer },
  "/api/tidevann": { levetid: 21600, hent: hentTidevann },
  "/api/nordlys": { levetid: 1800, hent: hentNordlys },
  "/api/nytt": { levetid: 1800, hent: hentNytt },
  "/api/baater": { levetid: 120, hent: hentBaater }
};
async function medBuffer(request, ctx, levetid, hent) {
  if (request.method !== "GET") return svar(405, { melding: "Bruk GET." });
  const buffer = caches.default;
  const n\u00F8kkel = new Request(new URL(request.url).toString());
  const lagret = await buffer.match(n\u00F8kkel);
  if (lagret) return lagret;
  let kropp;
  try {
    kropp = await hent();
  } catch (feil) {
    console.error("Datakilde feilet:", n\u00F8kkel.url, feil);
    return svar(502, { melding: "Kilden svarte ikke akkurat n\xE5. Pr\xF8v igjen om litt." });
  }
  const respons = new Response(JSON.stringify(kropp), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${levetid}`
    }
  });
  ctx.waitUntil(buffer.put(n\u00F8kkel, respons.clone()));
  return respons;
}
__name(medBuffer, "medBuffer");
async function hentJson(url, valg) {
  const respons = await fetch(url, valg);
  if (!respons.ok) throw new Error(`${url} svarte ${respons.status}`);
  return respons.json();
}
__name(hentJson, "hentJson");
async function hentAvganger() {
  const felter = `
    estimatedCalls(numberOfDepartures: 5, timeRange: 604800) {
      aimedDepartureTime expectedDepartureTime realtime cancellation
      destinationDisplay { frontText }
      serviceJourney { line { publicCode } }
      situations { summary { value language } }
    }
    situations { summary { value language } }`;
  const sp\u00F8rring = "{" + KAIER.map(
    (kai, i) => `k${i}: stopPlace(id: "${kai.id}") {${felter}}`
  ).join("\n") + "}";
  const data = await hentJson("https://api.entur.io/journey-planner/v3/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": KLIENTNAVN
    },
    body: JSON.stringify({ query: sp\u00F8rring })
  });
  const avvik = /* @__PURE__ */ new Set();
  const norsk = /* @__PURE__ */ __name((oppsummeringer) => {
    if (!Array.isArray(oppsummeringer)) return;
    const valgt = oppsummeringer.find((s) => s.language === "no" || s.language === "nb") || oppsummeringer[0];
    if (valgt && valgt.value) avvik.add(valgt.value);
  }, "norsk");
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
        innstilt: anlop.cancellation === true
      };
    });
    return { navn: kai.navn, avganger };
  });
  return {
    hentet: (/* @__PURE__ */ new Date()).toISOString(),
    kaier,
    avvik: [...avvik],
    kilde: "Entur / Snelandia"
  };
}
__name(hentAvganger, "hentAvganger");
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
      nedb\u00F8r: nesteTime ? nesteTime.details?.precipitation_amount : null,
      symbol: nesteTime ? nesteTime.summary?.symbol_code : null
    };
  });
  const utsikt = serie.filter((punkt) => punkt.time.endsWith("T12:00:00Z") && punkt.data?.next_6_hours).slice(0, 4).map((punkt) => ({
    tid: punkt.time,
    temperatur: punkt.data.instant?.details?.air_temperature,
    symbol: punkt.data.next_6_hours.summary?.symbol_code
  }));
  return {
    oppdatert: data.properties?.meta?.updated_at,
    timer,
    utsikt,
    kilde: "Meteorologisk institutt (CC BY 4.0)"
  };
}
__name(hentVaer, "hentVaer");
async function hentTidevann() {
  const fra = /* @__PURE__ */ new Date();
  const til = new Date(fra.getTime() + 2 * 864e5);
  const stubb = /* @__PURE__ */ __name((d) => d.toISOString().slice(0, 16), "stubb");
  const adresse = `https://vannstand.kartverket.no/tideapi.php?tide_request=locationdata&lat=${BREDDE}&lon=${LENGDE}&datatype=tab&refcode=cd&lang=nb&tzone=0&dst=0&fromtime=${stubb(fra)}&totime=${stubb(til)}`;
  const respons = await fetch(adresse, { headers: { "User-Agent": BRUKERAGENT } });
  if (!respons.ok) throw new Error(`Kartverket svarte ${respons.status}`);
  const xml = await respons.text();
  const justering = xml.match(/<location [^>]*descr="([^"]*)"/)?.[1] || null;
  const vannstander = [...xml.matchAll(
    /<waterlevel value="([\d.]+)" time="([^"]+)" flag="(high|low)"\s*\/>/g
  )].map((treff) => ({
    tid: treff[2],
    cm: Math.round(parseFloat(treff[1])),
    type: treff[3] === "high" ? "flo" : "fj\xE6re"
  }));
  if (!vannstander.length) throw new Error("Fikk ingen tidevannsdata fra Kartverket");
  return {
    hentet: (/* @__PURE__ */ new Date()).toISOString(),
    justering,
    vannstander,
    kilde: "Kartverket (CC BY 4.0)"
  };
}
__name(hentTidevann, "hentTidevann");
async function hentNordlys() {
  const rader = await hentJson(
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
  );
  const punkter = rader.map((rad) => Array.isArray(rad) ? { tid: rad[0], kp: parseFloat(rad[1]), status: rad[2] } : { tid: rad.time_tag, kp: parseFloat(rad.kp), status: rad.observed }).filter((p) => p.tid !== "time_tag" && !Number.isNaN(p.kp));
  const observert = punkter.filter((p) => p.status === "observed");
  const varslet = punkter.filter((p) => p.status !== "observed");
  const naa = observert[observert.length - 1] || null;
  return {
    hentet: (/* @__PURE__ */ new Date()).toISOString(),
    naa: naa ? { tid: naa.tid + "Z", kp: naa.kp } : null,
    varsel: varslet.slice(0, 16).map((p) => ({ tid: p.tid + "Z", kp: p.kp })),
    kilde: "NOAA SWPC"
  };
}
__name(hentNordlys, "hentNordlys");
var NYHETSKILDER = [
  { navn: "NRK", adresse: "https://www.nrk.no/tromsogfinnmark/toppsaker.rss" },
  { navn: "Altaposten", adresse: "https://www.altaposten.no/rss" }
];
function avXml(verdi) {
  return verdi.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").trim();
}
__name(avXml, "avXml");
function lesRss(xml, kilde) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((treff) => {
    const felt = /* @__PURE__ */ __name((navn) => {
      const t = treff[1].match(new RegExp(`<${navn}[^>]*>([\\s\\S]*?)</${navn}>`));
      return t ? avXml(t[1].trim()) : "";
    }, "felt");
    return {
      tittel: felt("title"),
      lenke: felt("link"),
      sammendrag: felt("description"),
      dato: felt("pubDate"),
      kilde
    };
  });
}
__name(lesRss, "lesRss");
async function hentNytt() {
  const svarene = await Promise.allSettled(NYHETSKILDER.map(async (kilde) => {
    const respons = await fetch(kilde.adresse, { headers: { "User-Agent": BRUKERAGENT } });
    if (!respons.ok) throw new Error(`${kilde.navn} svarte ${respons.status}`);
    return lesRss(await respons.text(), kilde.navn);
  }));
  const saker = svarene.flatMap((s) => s.status === "fulfilled" ? s.value : []).filter((sak) => {
    const tekst2 = (sak.tittel + " " + sak.sammendrag).toLowerCase();
    return NYHETSORD.some((ord) => tekst2.includes(ord));
  }).sort((a, b) => new Date(b.dato) - new Date(a.dato)).slice(0, 10).map((sak) => ({
    tittel: sak.tittel,
    lenke: sak.lenke,
    dato: sak.dato,
    kilde: sak.kilde
  }));
  return {
    hentet: (/* @__PURE__ */ new Date()).toISOString(),
    saker,
    kilder: NYHETSKILDER.map((k) => k.navn)
  };
}
__name(hentNytt, "hentNytt");
var SUNDET = { s\u00F8r: 70.25, nord: 70.55, vest: 22.6, \u00F8st: 23.5 };
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
      grant_type: "client_credentials"
    })
  });
  const alle = await hentJson("https://live.ais.barentswatch.no/v1/latest/combined", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const baater = (Array.isArray(alle) ? alle : []).filter((b) => typeof b.latitude === "number" && typeof b.longitude === "number" && b.latitude >= SUNDET.s\u00F8r && b.latitude <= SUNDET.nord && b.longitude >= SUNDET.vest && b.longitude <= SUNDET.\u00F8st).map((b) => ({
    navn: b.name || "Ukjent fart\xF8y",
    mmsi: b.mmsi,
    fart: b.speedOverGround,
    kurs: b.courseOverGround,
    destinasjon: b.destination || null,
    bredde: b.latitude,
    lengde: b.longitude,
    tid: b.msgtime
  }));
  return {
    konfigurert: true,
    hentet: (/* @__PURE__ */ new Date()).toISOString(),
    baater,
    kilde: "Kystverket via BarentsWatch"
  };
}
__name(hentBaater, "hentBaater");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ehn46o/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ehn46o/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
