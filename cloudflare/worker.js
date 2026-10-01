/**
 * ONEX Cloudflare Edge Adapter
 *
 * This is the safe Cloudflare layer for the existing ONEX Python application.
 * It does NOT reimplement the ONEX/Xray/sing-box tunnel core inside Workers.
 * Instead, Cloudflare handles the public edge URL and forwards normal HTTP
 * requests to a separately hosted ONEX origin.
 *
 * The D1 helpers are adapted from the useful persistence pattern in Nahan:
 * a tiny key/value table for edge metadata/configuration.
 */

const KV_TABLE = "kv_store";

async function initDb(env) {
  if (!env.ONEX_DB || env.__ONEX_DB_READY) return;
  await env.ONEX_DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${KV_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ).run();
  env.__ONEX_DB_READY = true;
}

async function d1Get(env, key) {
  if (!env.ONEX_DB) return null;
  await initDb(env);
  const row = await env.ONEX_DB.prepare(
    `SELECT value FROM ${KV_TABLE} WHERE key = ?`,
  ).bind(key).first();
  return row?.value ?? null;
}

async function d1Put(env, key, value) {
  if (!env.ONEX_DB) throw new Error("ONEX_DB is not configured");
  await initDb(env);
  await env.ONEX_DB.prepare(
    `INSERT INTO ${KV_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).bind(key, value).run();
}

function originFromEnv(env) {
  const raw = String(env.ONEX_ORIGIN || "").trim().replace(/\/$/, "");
  if (!raw || raw.includes("YOUR-ONEX-ORIGIN")) return null;
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error("ONEX_ORIGIN must use http or https");
  return url;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function edgeStatus(request, env) {
  const origin = originFromEnv(env);
  let originStatus = "not-configured";
  let originHttpStatus = null;

  if (origin) {
    try {
      const health = new URL(origin.href);
      health.pathname = "/health";
      health.search = "";
      const res = await fetch(health, {
        method: "GET",
        headers: { "accept": "application/json" },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      originHttpStatus = res.status;
      originStatus = res.ok ? "ok" : "unhealthy";
    } catch (e) {
      originStatus = "unreachable";
    }
  }

  const deployedAt = await d1Get(env, "deployed_at").catch(() => null);
  return json({
    service: "ONEX Edge",
    edge: "Cloudflare Workers",
    origin: origin ? origin.origin : null,
    origin_status: originStatus,
    origin_http_status: originHttpStatus,
    d1: Boolean(env.ONEX_DB),
    deployed_at: deployedAt,
  });
}

async function proxyToOrigin(request, env) {
  const origin = originFromEnv(env);
  if (!origin) {
    return json({
      error: "ONEX_ORIGIN is not configured",
      hint: "Set the ONEX_ORIGIN Worker secret/variable to the URL of the ONEX Python service.",
    }, 503);
  }

  const incoming = new URL(request.url);
  const target = new URL(origin.href);
  target.pathname = incoming.pathname;
  target.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.set("x-onex-edge", "cloudflare-workers");
  headers.delete("host");

  const forwarded = new Request(target.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  });

  return fetch(forwarded, { cf: { cacheTtl: 0, cacheEverything: false } });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/__onex/status") {
        return edgeStatus(request, env);
      }

      if (url.pathname === "/__onex/init" && request.method === "POST") {
        await initDb(env);
        await d1Put(env, "deployed_at", new Date().toISOString());
        return json({ ok: true, message: "ONEX Edge initialized" });
      }

      return proxyToOrigin(request, env);
    } catch (error) {
      return json({
        error: "ONEX edge adapter error",
        detail: String(error?.message || error),
      }, 500);
    }
  },
};
