import { getStore } from "@netlify/blobs";

const STORE_NAME = "deji-product-board-state";
const STATE_KEY = "dashboard-state";
const ACCEPTED_CLIENT_REVISIONS = new Set(["reliable-save-queue-v2"]);
const ALLOWED_ORIGINS = new Set([
  "https://galenwu962-hub.github.io",
  "http://localhost:4176",
  "http://127.0.0.1:4176",
]);

function responseHeaders(request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://galenwu962-hub.github.io";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function jsonResponse(request, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(request),
  });
}

function emptyState() {
  return {
    products: [],
    reviews: [],
    dataRevision: "2026-06-empty-reset-v1",
    emptyIntent: true,
    updatedAt: new Date().toISOString(),
    source: "netlify-empty-state",
  };
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request),
    });
  }

  const store = getStore(STORE_NAME, { consistency: "strong" });

  try {
    if (request.method === "GET") {
      const state = await store.get(STATE_KEY, { type: "json" });
      return jsonResponse(request, 200, state || emptyState());
    }

    if (request.method === "PUT") {
      const payload = await request.json();
      if (!ACCEPTED_CLIENT_REVISIONS.has(payload.clientRevision)) {
        return jsonResponse(request, 409, {
          error: "stale_client_revision",
          acceptedClientRevisions: Array.from(ACCEPTED_CLIENT_REVISIONS),
        });
      }
      await store.setJSON(STATE_KEY, {
        ...payload,
        updatedAt: payload.updatedAt || new Date().toISOString(),
        source: "netlify-blobs",
      });
      return jsonResponse(request, 200, { ok: true, updatedAt: payload.updatedAt || new Date().toISOString() });
    }

    return jsonResponse(request, 405, { error: "method_not_allowed" });
  } catch (error) {
    return jsonResponse(request, 500, { error: String(error?.message || error) });
  }
};

export const config = {
  path: "/state",
};
