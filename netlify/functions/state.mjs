import { getStore } from "@netlify/blobs";

const STORE_NAME = "deji-product-board-state";
const STATE_KEY = "dashboard-state";
const ACCEPTED_CLIENT_REVISIONS = new Set(["reliable-save-queue-v2", "server-merge-v3"]);
const TOMBSTONE_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 删除墓碑保留 3 天，防止旧页面把已删项目重新加回来
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
    deletedProductIds: {},
    revision: 0,
    updatedAt: new Date().toISOString(),
    source: "netlify-empty-state",
  };
}

function toTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

// 把多种形态的删除墓碑（数组或对象）归一成 { id: isoTime }
function normalizeTombstones(value) {
  const result = {};
  if (Array.isArray(value)) {
    const now = new Date().toISOString();
    value.forEach((id) => {
      if (id) result[String(id)] = now;
    });
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([id, time]) => {
      if (id) result[String(id)] = typeof time === "string" ? time : new Date().toISOString();
    });
  }
  return result;
}

function pruneTombstones(tombstones) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const result = {};
  Object.entries(tombstones || {}).forEach(([id, time]) => {
    if (toTimestamp(time) >= cutoff) result[id] = time;
  });
  return result;
}

// 评审意见按部门 id 合并：客户端有内容则采用，客户端为空但服务端有内容则保留服务端，
// 避免并发时某个页面用默认空值把别人刚写的意见抹掉。
export function mergeReviews(currentReviews, incomingReviews) {
  if (!Array.isArray(incomingReviews) || !incomingReviews.length) {
    return Array.isArray(currentReviews) ? currentReviews : [];
  }
  const currentMap = new Map((currentReviews || []).map((item) => [item.id, item]));
  return incomingReviews.map((incoming) => {
    const current = currentMap.get(incoming.id);
    if (!current) return incoming;
    const incomingText = typeof incoming.text === "string" ? incoming.text : "";
    const currentText = typeof current.text === "string" ? current.text : "";
    if (incomingText.trim() === "" && currentText.trim() !== "") {
      return { ...incoming, text: currentText };
    }
    return incoming;
  });
}

// 产品按 id 合并：服务端现有 + 客户端提交并集，客户端的编辑/新增覆盖同 id，
// 应用删除墓碑后输出。保证任何一方的新增都不会被另一方的全量覆盖丢掉。
export function mergeProducts(currentProducts, incomingProducts, tombstones) {
  const map = new Map();
  (currentProducts || []).forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  (incomingProducts || []).forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  return [...map.values()].filter((item) => !tombstones[item.id]);
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
      const state = await store.get(STATE_KEY, { type: "json", consistency: "strong" });
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

      const current = (await store.get(STATE_KEY, { type: "json", consistency: "strong" })) || emptyState();
      const now = new Date().toISOString();
      const nextRevision = (Number(current.revision) || 0) + 1;

      const incomingEmptyIntent = payload.emptyIntent === true && (payload.products?.length ?? 0) === 0;
      // 只有“写入者看到的是当前最新状态”时才允许清空，挡掉旧页面/残留 clearIntent 把新数据清掉。
      const clearIsFresh = toTimestamp(payload.clearedAt) >= toTimestamp(current.updatedAt);

      if (incomingEmptyIntent && clearIsFresh) {
        const cleared = {
          products: [],
          reviews: mergeReviews([], payload.reviews),
          dataRevision: payload.dataRevision || current.dataRevision,
          emptyIntent: true,
          clearedAt: payload.clearedAt || now,
          baseClearedAt: payload.clearedAt || now,
          deletedProductIds: {},
          revision: nextRevision,
          updatedAt: now,
          source: "netlify-blobs-merge",
        };
        await store.setJSON(STATE_KEY, cleared);
        return jsonResponse(request, 200, cleared);
      }

      const tombstones = pruneTombstones({
        ...normalizeTombstones(current.deletedProductIds),
        ...normalizeTombstones(payload.deletedProductIds),
      });

      const mergedProducts = mergeProducts(current.products, payload.products, tombstones);
      const merged = {
        products: mergedProducts,
        reviews: mergeReviews(current.reviews, payload.reviews),
        dataRevision: payload.dataRevision || current.dataRevision || "2026-06-empty-reset-v1",
        emptyIntent: false,
        deletedProductIds: tombstones,
        revision: nextRevision,
        updatedAt: now,
        source: "netlify-blobs-merge",
      };

      // 合并后还有产品就彻底丢弃历史清空标记；产品为空但本次不是清空意图，
      // 说明云端本就为空，保留 emptyIntent 让前端按空态渲染。
      if (mergedProducts.length === 0) {
        merged.emptyIntent = Boolean(current.emptyIntent);
        if (current.clearedAt) merged.clearedAt = current.clearedAt;
        if (current.baseClearedAt) merged.baseClearedAt = current.baseClearedAt;
      }

      await store.setJSON(STATE_KEY, merged);
      return jsonResponse(request, 200, merged);
    }

    return jsonResponse(request, 405, { error: "method_not_allowed" });
  } catch (error) {
    return jsonResponse(request, 500, { error: String(error?.message || error) });
  }
};

export const config = {
  path: "/state",
};
