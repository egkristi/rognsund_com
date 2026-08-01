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
