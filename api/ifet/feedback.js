/**
 * Vercel Function (Edge runtime)
 * Receives feedback from static pages and forwards to Telegram (message + optional attachment).
 *
 * Required env vars (set in Vercel Project Settings):
 * - BOT_TOKEN
 * - CHAT_ID
 *
 * Optional env vars:
 * - ALLOWED_ORIGINS (comma-separated origins) OR ALLOWED_ORIGIN (single origin) OR "*" to allow any
 */
export const config = {
  runtime: "edge",
};

function corsHeaders(requestOrigin, allowedOrigins) {
  const allow = allowedOrigins.length === 0
    ? "*"
    : allowedOrigins.includes("*")
      ? "*"
      : (allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]);

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function safeStr(v, max = 4000) {
  const s = (v == null ? "" : String(v)).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatMessage(payload) {
  const lines = [];
  lines.push(`📝 IFET feedback: ${safeStr(payload.type || "unknown", 40)}`);

  if (payload.lang) lines.push(`🌐 lang: ${safeStr(payload.lang, 20)}`);
  if (payload.email) lines.push(`✉️ email: ${safeStr(payload.email, 200)}`);
  if (payload.userAgent) lines.push(`🧭 ua: ${safeStr(payload.userAgent, 240)}`);
  if (payload.message) lines.push(`\n${safeStr(payload.message, 3500)}`);
  if (payload.timestamp) lines.push(`\n⏱ ${safeStr(payload.timestamp, 80)}`);

  return lines.join("\n");
}

async function tgSendMessage(env, text) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}

async function tgSendDocument(env, file, caption) {
  // Telegram caption limit is smaller than message; keep it safe.
  const safeCaption = safeStr(caption, 950);
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`;
  const fd = new FormData();
  fd.append("chat_id", env.CHAT_ID);
  fd.append("caption", safeCaption);
  fd.append("disable_web_page_preview", "true");
  fd.append("document", file, file?.name || "attachment");

  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Telegram sendDocument failed: ${res.status} ${await res.text()}`);
}

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "*").trim();
  if (!raw || raw === "*") return ["*"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function handler(request) {
  const env = {
    BOT_TOKEN: typeof process !== "undefined" ? process.env.BOT_TOKEN : undefined,
    CHAT_ID: typeof process !== "undefined" ? process.env.CHAT_ID : undefined,
    ALLOWED_ORIGIN: typeof process !== "undefined" ? process.env.ALLOWED_ORIGIN : undefined,
    ALLOWED_ORIGINS: typeof process !== "undefined" ? process.env.ALLOWED_ORIGINS : undefined,
  };

  const origin = request.headers.get("origin") || "";
  const allowedOrigins = getAllowedOrigins(env);
  const cors = corsHeaders(origin, allowedOrigins);

  // Health-check / diagnostics (does not expose secrets)
  if (request.method === "GET") {
    return json(
      {
        ok: true,
        service: "ifet-feedback",
        runtime: "vercel-edge",
        hasBotToken: Boolean(env.BOT_TOKEN),
        hasChatId: Boolean(env.CHAT_ID),
        allowedOrigins,
      },
      cors,
      200
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, cors, 405);
  }
  if (!env.BOT_TOKEN || !env.CHAT_ID) {
    return json({ ok: false, error: "Server not configured (missing BOT_TOKEN/CHAT_ID)" }, cors, 500);
  }

  try {
    const ct = request.headers.get("content-type") || "";

    /** @type {{type?:string,lang?:string,email?:string,message?:string,timestamp?:string,userAgent?:string}} */
    let payload = {};
    /** @type {File|null} */
    let attachment = null;

    if (ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      payload = {
        type: safeStr(fd.get("type") || "", 50),
        lang: safeStr(fd.get("lang") || "", 10),
        email: safeStr(fd.get("email") || "", 250),
        message: safeStr(fd.get("message") || "", 6000),
        timestamp: safeStr(fd.get("timestamp") || "", 80),
        userAgent: safeStr(fd.get("userAgent") || "", 400),
      };
      const maybeFile = fd.get("attachment");
      if (maybeFile && typeof maybeFile === "object" && "arrayBuffer" in maybeFile) {
        attachment = /** @type {File} */ (maybeFile);
        if (attachment.size === 0) attachment = null;
      }
    } else {
      const body = await request.json();
      payload = {
        type: safeStr(body?.type || "", 50),
        lang: safeStr(body?.lang || "", 10),
        email: safeStr(body?.email || "", 250),
        message: safeStr(body?.message || "", 6000),
        timestamp: safeStr(body?.timestamp || "", 80),
        userAgent: safeStr(body?.userAgent || "", 400),
      };
    }

    const text = formatMessage(payload);

    if (attachment) {
      await tgSendDocument(env, attachment, text);
    } else {
      await tgSendMessage(env, text);
    }

    return json({ ok: true }, cors, 200);
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, cors, 500);
  }
}


