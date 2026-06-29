const departments = [
  { id: "hot", name: "热厨", tone: "hot" },
  { id: "drink", name: "水吧", tone: "drink" },
  { id: "bake", name: "烘焙", tone: "bake" },
];

const runtimeConfig = window.DEJI_CONFIG || {};
const hasSharedSync = Boolean(runtimeConfig.sharedApiUrl);
const urlParams = new URLSearchParams(window.location.search);
const recoveryMode = urlParams.get("recoverLocal") === "1";
const recoveryPinnedKey = "product-change-dashboard-local-recovery-pinned-v1";
const sharedStateRowId = "product-change-dashboard-state-v1";
const sharedDataRevision = "2026-06-empty-reset-v1";
const sharedFallbackUrl = "./data/shared-state-fallback.json";

const defaultProductChanges = [];

const defaultReviewDepartments = [
  {
    id: "research",
    title: "研发",
    text: "新品配方与出品标准通过初审；上线前补充标准克重、摆盘图与关键风味描述。",
    status: "标准待补齐",
    tone: "warning",
  },
  {
    id: "marketing",
    title: "市场",
    text: "菜单命名、图片风格与宣传话术需保持一致；新品主推标签建议同步到门店物料。",
    status: "物料待复核",
    tone: "warning",
  },
  {
    id: "operation",
    title: "营运",
    text: "同意按计划执行。门店需在上新首周每日反馈销量、客诉、出餐效率与备货波动。",
    status: "按计划推进",
    tone: "approved",
  },
  {
    id: "chef",
    title: "厨政",
    text: "热厨与烘焙产品需完成操作 SOP 复核；下架菜品在停止售卖前完成半成品消耗安排。",
    status: "SOP 待确认",
    tone: "warning",
  },
  {
    id: "procurement",
    title: "采购",
    text: "同意物料切换节奏。新品核心原料需确认供应周期，下架菜品停止新增采购。",
    status: "通过",
    tone: "approved",
  },
];

let activeType = "all";
let productChanges = defaultProductChanges.map((item) => ({ ...item }));
let reviewDepartments = defaultReviewDepartments.map((item) => ({ ...item }));
let storageMode = "local";
let localEditVersion = 0;
let explicitClearAt = null;
let lastKnownClearedAt = null;
const reviewStorageKey = "product-change-dashboard-review-opinions-v1";
const productStorageKey = "product-change-dashboard-product-changes-v3";
const clearIntentStorageKey = "product-change-dashboard-clear-intent-v1";

const typeText = {
  launch: "上架",
  retire: "下架",
  optimize: "调优",
};

const typeLabel = {
  launch: "上",
  retire: "下",
  optimize: "优",
};

const typeOrder = ["launch", "retire", "optimize"];
const departmentById = Object.fromEntries(departments.map((department) => [department.id, department]));

const brandColors = {
  blue: "#0072CE",
  blueDeep: "#0057A3",
  blueDark: "#003F78",
  blueSoft: "#E8F3FF",
  orange: "#FF8F1C",
  orangeDeep: "#D96D00",
  orangeSoft: "#FFF3E4",
  optimize: "#5F7790",
  optimizeSoft: "#EDF2F7",
  ink: "#14324D",
  muted: "#5F7790",
  line: "#CFE0EF",
  paper: "#F4F8FC",
};

const departmentGrid = document.querySelector("#departmentGrid");
const reviewGrid = document.querySelector("#reviewGrid");
const typeFilter = document.querySelector("#typeFilter");
const exportImageButton = document.querySelector("#exportImageButton");
const exportMarkdownButton = document.querySelector("#exportMarkdownButton");
const clearAllButton = document.querySelector("#clearAllButton");
const exportActions = document.querySelector(".export-actions");
const saveState = document.querySelector("#saveState");

function formatDateTime(value) {
  if (!value || value === "待定") return "待定";
  const dateValue = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(`${dateValue}T00:00:00`));
}

function toDateInputValue(value) {
  if (!value || value === "待定") return "";
  const dateValue = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : "";
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultTimeValue() {
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function usesInMemoryState() {
  return storageMode === "shared" || storageMode === "fallback" || (hasSharedSync && !recoveryMode);
}

function loadSavedProducts() {
  if (usesInMemoryState()) return {};
  try {
    return JSON.parse(localStorage.getItem(productStorageKey)) || {};
  } catch {
    return {};
  }
}

function getCurrentProductChanges() {
  if (usesInMemoryState()) return productChanges;
  const savedProducts = loadSavedProducts();
  if (Array.isArray(savedProducts)) return savedProducts;
  return productChanges.map((item) => ({
    ...item,
    ...(savedProducts[item.id] || {}),
  }));
}

function collectRenderedProductChanges() {
  const renderedProducts = new Map();

  document.querySelectorAll("[data-product-id]").forEach((card) => {
    const id = card.dataset.productId;
    const product = { ...(getCurrentProductChanges().find((item) => item.id === id) || {}) };

    card.querySelectorAll("[data-product-field]").forEach((field) => {
      product[field.dataset.productField] = field.value.trim();
    });

    if (card.querySelector("[data-time-tentative]")?.checked) product.time = "待定";

    renderedProducts.set(id, product);
  });

  return getCurrentProductChanges().map((item) => renderedProducts.get(item.id) || item);
}

function persistProductChanges(nextProducts, statusText = "已保存") {
  productChanges = nextProducts;
  if (productChanges.length) {
    explicitClearAt = null;
  }

  if (hasSharedSync && sessionStorage.getItem(recoveryPinnedKey) !== "true") {
    storageMode = "shared";
    queueSharedSave();
    setSaveState(statusText === "已保存" ? "正在同步" : statusText);
  } else {
    localStorage.setItem(productStorageKey, JSON.stringify(productChanges));
    setSaveState(statusText);
  }
}

function getVisibleItems() {
  return getCurrentProductChanges()
    .filter((item) => activeType === "all" || item.type === activeType)
    .sort((first, second) => {
      const typeDiff = typeOrder.indexOf(first.type) - typeOrder.indexOf(second.type);
      if (typeDiff) return typeDiff;
      const departmentDiff =
        departments.findIndex((department) => department.id === first.department) -
        departments.findIndex((department) => department.id === second.department);
      if (departmentDiff) return departmentDiff;
      return String(first.time || "").localeCompare(String(second.time || ""));
    });
}

function renderProductCard(item) {
  const department = departmentById[item.department] || departments[0];

  return `
    <article class="product-card ${item.type}">
      <div class="change-badge">${department.name}</div>
      <div class="product-edit-grid" data-product-id="${item.id}">
        <div class="product-edit-head">
          <label class="product-field product-field-name">
            <span>菜品</span>
            <input class="product-input product-name-input" data-product-field="name" value="${escapeHtml(item.name)}" aria-label="${department.name}${typeText[item.type]}菜品名称" />
          </label>
          <button class="delete-product-button" type="button" data-delete-product="${item.id}" aria-label="删除${item.name}">删除</button>
        </div>
        <div class="product-meta-edit">
          <label class="product-field product-department-field">
            <span>部门</span>
            <select class="product-input" data-product-field="department" aria-label="${item.name}所属部门">
              ${departments.map((option) => `<option value="${option.id}" ${item.department === option.id ? "selected" : ""}>${option.name}</option>`).join("")}
            </select>
          </label>
          <label class="product-field product-type-field">
            <span>事项类别</span>
            <select class="product-input product-type-select" data-product-field="type" aria-label="${item.name}事项类别">
              ${Object.entries(typeText).map(([value, label]) => `<option value="${value}" ${item.type === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label class="product-field product-time-field">
            <span>执行时间</span>
            <div class="product-time-editor">
              <input class="product-input" data-product-field="time" type="date" value="${toDateInputValue(item.time)}" ${item.time === "待定" ? "disabled" : ""} aria-label="${item.name}执行日期" />
              <label class="tentative-toggle">
                <input type="checkbox" data-time-tentative ${item.time === "待定" ? "checked" : ""} aria-label="${item.name}执行时间待定" />
                <span>待定</span>
              </label>
            </div>
          </label>
          <label class="product-field product-reviewer-field">
            <span>类别补充 / 执行范围</span>
            <input class="product-input" data-product-field="reviewer" value="${escapeHtml(item.reviewer)}" aria-label="${item.name}类别补充或执行范围" />
          </label>
        </div>
        <label class="product-field">
          <span>执行说明</span>
          <textarea class="product-opinion-editor" data-product-field="opinion" aria-label="${item.name}执行说明">${escapeHtml(item.opinion)}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderDepartmentPanels() {
  const visibleItems = getVisibleItems();
  const visibleTypes = typeOrder.filter((type) => activeType === "all" || activeType === type);

  departmentGrid.innerHTML = visibleTypes
    .map((type) => {
      const typeItems = visibleItems.filter((item) => item.type === type);
      const typeTone = type === "launch" ? "hot" : type === "retire" ? "retire" : "optimize";
      const addButtons = departments
        .map((department) => `<button class="department-add-button" type="button" data-add-product="${department.id}" data-add-type="${type}">新增${department.name}</button>`)
        .join("");

      return `
        <section class="change-section ${type}">
          <header class="change-section-head ${typeTone}">
            <div class="change-section-title">
              <span class="change-section-badge">${typeLabel[type]}</span>
              <div>
                <div class="department-title">${typeText[type]}</div>
                <div class="department-counts">
                  ${departments
                    .map((department) => {
                      const count = typeItems.filter((item) => item.department === department.id).length;
                      return `<span>${department.name} ${count}</span>`;
                    })
                    .join("")}
                </div>
              </div>
            </div>
            <div class="department-actions">${addButtons}</div>
          </header>
          <div class="item-list">${typeItems.length ? typeItems.map(renderProductCard).join("") : `<div class="empty-state">当前筛选下暂无事项</div>`}</div>
        </section>
      `;
    })
    .join("");
}

function renderReviewHighlights() {
  const savedReviews = loadSavedReviews();

  reviewGrid.innerHTML = reviewDepartments
    .map(
      (item) => `
        <article class="review-card" data-review-id="${item.id}">
          <div class="review-card-head">
            <strong>${item.title}</strong>
            <span class="review-status ${item.tone}">${item.status}</span>
          </div>
          <textarea class="review-editor" data-review-editor="${item.id}" aria-label="${item.title}会审意见">${savedReviews[item.id] ?? item.text}</textarea>
        </article>
      `,
    )
    .join("");
}

function loadSavedReviews() {
  if (usesInMemoryState()) return {};
  try {
    return JSON.parse(localStorage.getItem(reviewStorageKey)) || {};
  } catch {
    return {};
  }
}

function getCurrentReviews() {
  if (usesInMemoryState()) return reviewDepartments;
  const savedReviews = loadSavedReviews();
  return reviewDepartments.map((item) => ({
    ...item,
    text: savedReviews[item.id] ?? item.text,
  }));
}

function saveProductDrafts() {
  persistProductChanges(collectRenderedProductChanges());
}

function saveReviewDrafts() {
  const nextReviews = {};
  document.querySelectorAll("[data-review-editor]").forEach((editor) => {
    nextReviews[editor.dataset.reviewEditor] = editor.value.trim();
  });

  if (storageMode === "shared" || storageMode === "fallback" || hasSharedSync) {
    reviewDepartments = reviewDepartments.map((item) => ({
      ...item,
      text: nextReviews[item.id] ?? item.text,
    }));
    if (hasSharedSync && sessionStorage.getItem(recoveryPinnedKey) !== "true") {
      storageMode = "shared";
      queueSharedSave();
      setSaveState("正在同步");
    } else {
      localStorage.setItem(reviewStorageKey, JSON.stringify(nextReviews));
      setSaveState("已保存到本机");
    }
  } else {
    localStorage.setItem(reviewStorageKey, JSON.stringify(nextReviews));
    setSaveState("已保存");
  }
}

function setActiveType(nextType) {
  activeType = nextType;
  typeFilter.value = activeType;
}

function addProductChange(departmentId, forcedType) {
  saveProductDrafts();

  const type = forcedType || (activeType === "all" ? "launch" : activeType);
  const nextProduct = {
    id: createId(`${departmentId}-${type}`),
    department: departmentId,
    type,
    name: `新${typeText[type]}事项`,
    time: getDefaultTimeValue(),
    reviewer: "研发 / 市场 / 营运 / 厨政 / 采购",
    opinion: "请填写本菜品的会审意见和执行要求。",
    followUp: true,
  };

  persistProductChanges([...getCurrentProductChanges(), nextProduct], "已新增");
  renderDepartmentPanels();
}

function deleteProductChange(productId) {
  saveProductDrafts();
  persistProductChanges(
    getCurrentProductChanges().filter((item) => item.id !== productId),
    "已删除",
  );
  renderDepartmentPanels();
}

function getIdleSaveStateText() {
  if (storageMode === "shared") return "线上共享，内容自动同步";
  if (hasSharedSync) return "云端连接失败，等待重新同步";
  return "内容自动保存";
}

function setSaveState(text) {
  saveState.textContent = text;
  window.clearTimeout(setSaveState.timer);
  setSaveState.timer = window.setTimeout(() => {
    saveState.textContent = getIdleSaveStateText();
  }, 1600);
}

function mergeById(defaultItems, incomingItems) {
  const incomingMap = new Map((incomingItems || []).map((item) => [item.id, item]));
  const mergedItems = defaultItems.map((item) => ({ ...item, ...(incomingMap.get(item.id) || {}) }));
  const defaultIds = new Set(defaultItems.map((item) => item.id));
  const extraItems = (incomingItems || []).filter((item) => !defaultIds.has(item.id));
  return [...mergedItems, ...extraItems];
}

function readLocalRecoveryState() {
  try {
    const products = JSON.parse(localStorage.getItem(productStorageKey) || "[]");
    const savedReviews = JSON.parse(localStorage.getItem(reviewStorageKey) || "{}");
    const reviews = Array.isArray(savedReviews)
      ? mergeById(defaultReviewDepartments, savedReviews)
      : defaultReviewDepartments.map((item) => ({
          ...item,
          text: savedReviews[item.id] ?? item.text,
        }));

    return {
      products: Array.isArray(products) ? products : [],
      reviews,
    };
  } catch (error) {
    console.error("读取本机缓存失败", error);
    return { products: [], reviews: defaultReviewDepartments.map((item) => ({ ...item })) };
  }
}

function applyLocalRecoveryState(statusText) {
  const recoveredState = readLocalRecoveryState();
  if (!recoveredState.products.length) return false;
  productChanges = recoveredState.products.map((item) => ({ ...item }));
  reviewDepartments = recoveredState.reviews.map((item) => ({ ...item }));
  storageMode = "local";
  if (statusText) setSaveState(statusText);
  return true;
}

function applySharedState(state) {
  const requiresDataMigration = Boolean(state && state.dataRevision !== sharedDataRevision);
  const incomingProducts = requiresDataMigration ? [] : state?.products;
  const incomingReviews = requiresDataMigration || state?.emptyIntent
    ? defaultReviewDepartments.map((item) => ({ ...item, text: "" }))
    : state?.reviews;
  const resetClearAt = requiresDataMigration ? new Date().toISOString() : null;

  productChanges = state
    ? (incomingProducts || []).map((item) => ({ ...item }))
    : defaultProductChanges.map((item) => ({ ...item }));
  reviewDepartments = mergeById(defaultReviewDepartments, incomingReviews);
  explicitClearAt = resetClearAt || (state?.emptyIntent ? state.clearedAt || new Date().toISOString() : null);
  lastKnownClearedAt = explicitClearAt || state?.clearedAt || lastKnownClearedAt;
  if (explicitClearAt) localStorage.setItem(clearIntentStorageKey, explicitClearAt);
  else localStorage.removeItem(clearIntentStorageKey);
  return requiresDataMigration;
}

function applyPendingClearIntent() {
  const pendingClearAt = localStorage.getItem(clearIntentStorageKey);
  if (!pendingClearAt) return false;
  productChanges = [];
  reviewDepartments = defaultReviewDepartments.map((item) => ({ ...item, text: "" }));
  explicitClearAt = pendingClearAt;
  lastKnownClearedAt = pendingClearAt;
  storageMode = hasSharedSync ? "shared" : "local";
  setSaveState(hasSharedSync ? "清空已保留，等待云端同步" : "已清空");
  return true;
}

async function loadFallbackState() {
  const response = await fetch(sharedFallbackUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Fallback HTTP ${response.status}`);
  const state = await response.json();
  applySharedState(state);
  storageMode = "fallback";
  setSaveState("云端连接失败，已加载兜底数据");
  return true;
}

function shouldKeepCurrentFallbackState(state) {
  return false;
}

async function fetchSharedState(sharedApiUrl) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4200);
  try {
    return await fetch(sharedApiUrl, { cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadSharedState() {
  const editVersionAtStart = localEditVersion;

  try {
    const { sharedApiUrl } = runtimeConfig;
    if (!sharedApiUrl) throw new Error("缺少阿里云共享接口配置");
    if (storageMode === "shared" && explicitClearAt && productChanges.length === 0) {
      const saved = await saveSharedState();
      if (saved) localStorage.removeItem(clearIntentStorageKey);
      return true;
    }

    const response = await fetchSharedState(sharedApiUrl);
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
    const state = response.status === 404 ? null : await response.json();
    if (shouldKeepCurrentFallbackState(state)) {
      storageMode = "shared";
      setSaveState("云端为空，正在恢复兜底数据");
      const saved = await saveSharedState();
      if (!saved) storageMode = "fallback";
      return true;
    }
    if (storageMode === "shared" && editVersionAtStart !== localEditVersion) return false;
    const requiresDataMigration = applySharedState(state);
    storageMode = "shared";
    sessionStorage.removeItem(recoveryPinnedKey);
    setSaveState(requiresDataMigration ? "正在清理旧云端数据" : state ? "阿里云共享模式" : "正在初始化云端数据");

    if (!state || requiresDataMigration) await saveSharedState();
    return true;
  } catch (error) {
    console.error("云端同步失败", error);
    if (explicitClearAt && productChanges.length === 0) {
      storageMode = "shared";
      setSaveState("清空已保留，等待云端同步");
      return false;
    }
    const recovered = recoveryMode && hasSharedSync && applyLocalRecoveryState("云端连接失败，已显示本机缓存");
    if (!recovered && hasSharedSync) {
      try {
        return await loadFallbackState();
      } catch (fallbackError) {
        console.error("兜底数据加载失败", fallbackError);
      }
    }
    if (!recovered) {
      storageMode = "local";
      setSaveState(hasSharedSync ? "云端连接失败，请刷新或稍后重试" : "本地保存模式");
    }
    return false;
  }
}

function getSharedPayload(options = {}) {
  const products = getCurrentProductChanges();
  const isRestoringAfterClear = products.length > 0 && Boolean(lastKnownClearedAt);
  return {
    products,
    reviews: getCurrentReviews(),
    dataRevision: sharedDataRevision,
    emptyIntent: products.length === 0 && Boolean(explicitClearAt),
    clearedAt: explicitClearAt || undefined,
    baseClearedAt: lastKnownClearedAt || undefined,
    restoreIntent: Boolean(options.restoreIntent || isRestoringAfterClear),
    clientRevision: "reliable-save-queue-v1",
    updatedAt: new Date().toISOString(),
  };
}

function queueSharedSave() {
  if (!hasSharedSync || sessionStorage.getItem(recoveryPinnedKey) === "true") return;
  storageMode = "shared";
  queueSharedSave.dirty = true;
  window.clearTimeout(queueSharedSave.timer);
  queueSharedSave.timer = window.setTimeout(runSharedSaveQueue, 520);
}

async function runSharedSaveQueue() {
  if (queueSharedSave.inFlight) return;
  window.clearTimeout(queueSharedSave.timer);
  queueSharedSave.timer = null;
  queueSharedSave.pending = true;

  while (queueSharedSave.dirty) {
    queueSharedSave.dirty = false;
    queueSharedSave.inFlight = true;
    const saved = await saveSharedState();
    queueSharedSave.inFlight = false;
    if (!saved && !queueSharedSave.dirty) break;
  }

  queueSharedSave.pending = false;
}

async function saveSharedState(options = {}) {
  if (!hasSharedSync || sessionStorage.getItem(recoveryPinnedKey) === "true") return false;
  storageMode = "shared";

  try {
    const { sharedApiUrl } = runtimeConfig;
    if (!sharedApiUrl) throw new Error("缺少阿里云共享接口配置");
    const response = await fetch(sharedApiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getSharedPayload(options)),
    });
    if (response.status === 409) {
      const conflict = await response.json().catch(() => ({}));
      const hasProductsToRestore = getCurrentProductChanges().length > 0;
      if (hasProductsToRestore && conflict.clearedAt) {
        lastKnownClearedAt = conflict.clearedAt;
        const retryResponse = await fetch(sharedApiUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(getSharedPayload({ restoreIntent: true })),
        });
        if (retryResponse.ok) {
          lastKnownClearedAt = null;
          localStorage.removeItem(clearIntentStorageKey);
          setSaveState("已同步到云端");
          return true;
        }
      }
      setSaveState("云端已清空，请刷新后再写入");
      return false;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (getCurrentProductChanges().length > 0) {
      lastKnownClearedAt = null;
      localStorage.removeItem(clearIntentStorageKey);
    }
    setSaveState("已同步到云端");
    return true;
  } catch (error) {
    console.error(error);
    setSaveState("云端同步失败");
    return false;
  }
}

function shouldSkipCloudSync() {
  return (
    sessionStorage.getItem(recoveryPinnedKey) === "true" ||
    queueSharedSave.pending ||
    document.activeElement?.matches("[data-review-editor], [data-product-field], [data-time-tentative]")
  );
}

async function syncFromCloud() {
  if (!hasSharedSync || shouldSkipCloudSync()) return;
  const stateApplied = await loadSharedState();
  if (!stateApplied && storageMode === "local") {
    renderDepartmentPanels();
    renderReviewHighlights();
    return;
  }
  renderDepartmentPanels();
  renderReviewHighlights();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[match];
  });
}

function wrapText(value, maxChars) {
  const text = String(value).replace(/\s+/g, " ").trim();
  const lines = [];
  let line = "";

  Array.from(text).forEach((char) => {
    line += char;
    if (line.length >= maxChars || /[。；;！!？?]/.test(char)) {
      lines.push(line);
      line = "";
    }
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function svgText(x, y, value, options = {}) {
  const size = options.size || 28;
  const weight = options.weight || 700;
  const fill = options.fill || brandColors.ink;
  const maxChars = options.maxChars || 20;
  const lineHeight = options.lineHeight || Math.round(size * 1.36);
  const lines = wrapText(value, maxChars);
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`,
    )
    .join("");
  return {
    markup: `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif">${tspans}</text>`,
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

function renderExportSvg() {
  const width = 1600;
  const margin = 44;
  const gap = 16;
  const cardRadius = 14;
  const currentProducts = getCurrentProductChanges();
  const visibleItems = getVisibleItems();
  const reviews = getCurrentReviews();
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="__HEIGHT__" viewBox="0 0 ${width} __HEIGHT__">`,
    `<rect width="${width}" height="__HEIGHT__" fill="${brandColors.paper}"/>`,
    `<rect x="0" y="0" width="${width}" height="132" fill="#ffffff"/>`,
  ];

  parts.push(svgText(margin, 58, "Product Change Review Board", { size: 24, weight: 800, fill: brandColors.blue, maxChars: 80 }).markup);
  parts.push(svgText(margin, 112, "产品调整会审仪表盘", { size: 58, weight: 950, maxChars: 80 }).markup);
  parts.push(svgText(1260, 80, `导出日期：${new Intl.DateTimeFormat("zh-CN").format(new Date())}`, { size: 24, weight: 800, fill: brandColors.muted, maxChars: 30 }).markup);

  let sectionY = 170;
  const sectionW = width - margin * 2;
  const columnGap = 18;
  const cardW = (sectionW - columnGap) / 2;
  const typeColors = {
    launch: brandColors.blue,
    retire: brandColors.orange,
    optimize: brandColors.optimize,
  };
  const visibleTypes = typeOrder.filter((type) => activeType === "all" || activeType === type);

  function renderExportCard(item, x, y) {
    const department = departmentById[item.department] || departments[0];
    const typeColor = typeColors[item.type];
    const textX = x + 112;
    const titleBlock = svgText(textX, y + 42, item.name, {
      size: 30,
      weight: 950,
      maxChars: 24,
      lineHeight: 38,
    });
    const metaY = y + 42 + titleBlock.height + 8;
    const scopeText = item.reviewer ? `范围：${item.reviewer}` : "范围：全部门店";
    const opinionY = metaY + 70;
    const opinionBlock = svgText(x + 24, opinionY, item.opinion || "待补充执行说明", {
      size: 22,
      weight: 750,
      fill: brandColors.ink,
      maxChars: 32,
      lineHeight: 32,
    });
    const height = Math.max(190, opinionY + opinionBlock.height - y + 28);

    parts.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${height}" rx="${cardRadius}" fill="#ffffff" stroke="${brandColors.line}"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="10" height="${height}" rx="5" fill="${typeColor}"/>`);
    parts.push(`<rect x="${x + 24}" y="${y + 24}" width="70" height="70" rx="12" fill="${typeColor}"/>`);
    parts.push(svgText(x + 44, y + 70, typeLabel[item.type], { size: 34, weight: 950, fill: "#ffffff", maxChars: 2 }).markup);
    parts.push(titleBlock.markup);
    parts.push(svgText(textX, metaY, `部门：${department.name}    执行时间：${formatDateTime(item.time)}`, { size: 21, weight: 850, fill: brandColors.muted, maxChars: 32 }).markup);
    parts.push(svgText(textX, metaY + 34, scopeText, { size: 21, weight: 850, fill: brandColors.muted, maxChars: 32 }).markup);
    parts.push(opinionBlock.markup);
    return height;
  }

  visibleTypes.forEach((type) => {
    const typeItems = visibleItems.filter((item) => item.type === type);
    const color = typeColors[type];
    const counts = departments
      .map((department) => `${department.name} ${typeItems.filter((item) => item.department === department.id).length}`)
      .join("  ");

    parts.push(`<rect x="${margin}" y="${sectionY}" width="${sectionW}" height="86" rx="${cardRadius}" fill="${color}"/>`);
    parts.push(`<rect x="${margin + 22}" y="${sectionY + 16}" width="54" height="54" rx="10" fill="rgba(255,255,255,0.22)"/>`);
    parts.push(svgText(margin + 38, sectionY + 53, typeLabel[type], { size: 30, weight: 950, fill: "#ffffff", maxChars: 2 }).markup);
    parts.push(svgText(margin + 94, sectionY + 58, typeText[type], { size: 44, weight: 950, fill: "#ffffff", maxChars: 8 }).markup);
    parts.push(svgText(width - margin - 420, sectionY + 55, counts, { size: 22, weight: 850, fill: "#ffffff", maxChars: 34 }).markup);
    sectionY += 106;

    if (!typeItems.length) {
      parts.push(`<rect x="${margin}" y="${sectionY}" width="${sectionW}" height="116" rx="${cardRadius}" fill="#ffffff" stroke="${brandColors.line}"/>`);
      parts.push(svgText(margin + 34, sectionY + 72, "当前筛选下暂无事项", { size: 28, weight: 850, fill: brandColors.muted, maxChars: 24 }).markup);
      sectionY += 142;
      return;
    }

    const columnYs = [sectionY, sectionY];
    typeItems.forEach((item) => {
      const columnIndex = columnYs[0] <= columnYs[1] ? 0 : 1;
      const x = margin + columnIndex * (cardW + columnGap);
      const cardH = renderExportCard(item, x, columnYs[columnIndex]);
      columnYs[columnIndex] += cardH + 18;
    });
    sectionY = Math.max(...columnYs) + 30;
  });

  let reviewY = sectionY + 18;
  parts.push(svgText(margin, reviewY, "会审部门意见", { size: 42, weight: 950, maxChars: 20 }).markup);
  reviewY += 34;

  const reviewW = (width - margin * 2 - gap * 4) / 5;
  const reviewLayouts = reviews.map((item, index) => {
    const x = margin + index * (reviewW + gap);
    const titleBlock = svgText(x + 20, reviewY + 48, item.title, {
      size: 34,
      weight: 950,
      maxChars: 6,
      lineHeight: 42,
    });
    const textY = reviewY + 48 + titleBlock.height + 16;
    const textBlock = svgText(x + 20, textY, item.text, {
      size: 22,
      weight: 760,
      fill: brandColors.ink,
      maxChars: 10,
      lineHeight: 33,
    });
    const statusY = textY + textBlock.height + 22;
    const height = Math.max(244, statusY - reviewY + 52);

    return { height, statusY, textBlock, titleBlock, x, item };
  });
  const reviewH = Math.max(...reviewLayouts.map((item) => item.height));
  reviewLayouts.forEach(({ item, statusY, textBlock, titleBlock, x }) => {
    parts.push(`<rect x="${x}" y="${reviewY}" width="${reviewW}" height="${reviewH}" rx="${cardRadius}" fill="#ffffff" stroke="${brandColors.line}"/>`);
    parts.push(titleBlock.markup);
    parts.push(textBlock.markup);
    parts.push(`<rect x="${x + 20}" y="${statusY}" width="146" height="36" rx="8" fill="${item.tone === "approved" ? brandColors.blueSoft : brandColors.orangeSoft}"/>`);
    parts.push(svgText(x + 34, statusY + 24, item.status, { size: 18, weight: 900, fill: item.tone === "approved" ? brandColors.blueDeep : brandColors.orangeDeep, maxChars: 10 }).markup);
  });

  const height = reviewY + reviewH + 54;
  parts.push("</svg>");
  return parts.join("").replaceAll("__HEIGHT__", String(height));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createPdfBlob(jpegDataUrl, imageWidth, imageHeight) {
  const jpegBytes = dataUrlToBytes(jpegDataUrl);
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let position = 0;
  const pageWidth = Math.round(imageWidth * 0.48);
  const pageHeight = Math.round(imageHeight * 0.48);

  function writeString(value) {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    position += bytes.length;
  }

  function writeBytes(bytes) {
    chunks.push(bytes);
    position += bytes.length;
  }

  function startObject(id) {
    offsets[id] = position;
    writeString(`${id} 0 obj\n`);
  }

  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;

  writeString("%PDF-1.4\n% Generated by dashboard\n");
  startObject(1);
  writeString("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  writeString("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  startObject(3);
  writeString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  startObject(4);
  writeString(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  writeBytes(jpegBytes);
  writeString("\nendstream\nendobj\n");
  startObject(5);
  writeString(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefPosition = position;
  writeString(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id += 1) {
    writeString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  writeString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`);

  return new Blob(chunks, { type: "application/pdf" });
}

function getFullDate(value) {
  if (!value || value === "待定") return "待定";
  const dateValue = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : String(value);
}

function normalizeMarkdownText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDashboardMarkdown() {
  const products = getCurrentProductChanges()
    .slice()
    .sort((first, second) => {
      const typeDiff = typeOrder.indexOf(first.type) - typeOrder.indexOf(second.type);
      if (typeDiff) return typeDiff;
      const departmentDiff =
        departments.findIndex((department) => department.id === first.department) -
        departments.findIndex((department) => department.id === second.department);
      if (departmentDiff) return departmentDiff;
      return getFullDate(first.time).localeCompare(getFullDate(second.time));
    });
  const reviews = getCurrentReviews();
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const lines = [
    "# 产品调整会审仪表盘",
    "",
    `导出时间：${exportedAt}`,
    `数据模式：${storageMode === "shared" ? "线上共享" : "本地保存"}`,
    "",
    "## 给 AI 的任务",
    "",
    "请基于以下产品上新、下架、调优事项和会审部门意见，提炼一份会议议程。议程需包含：需要决策的问题、需要追踪的风险、各部门待确认事项、建议讨论顺序和会后待办。",
    "",
    "## 事项汇总",
    "",
  ];

  typeOrder.forEach((type) => {
    const typeItems = products.filter((item) => item.type === type);
    lines.push(`### ${typeText[type]}（${typeItems.length}项）`, "");

    if (!typeItems.length) {
      lines.push("暂无事项。", "");
      return;
    }

    typeItems.forEach((item, index) => {
      const department = departmentById[item.department]?.name || item.department || "未指定";
      const scope = normalizeMarkdownText(item.reviewer) || "全部门店";
      const note = normalizeMarkdownText(item.opinion) || "待补充执行说明";
      lines.push(`#### ${index + 1}. ${item.name || "未命名事项"}`);
      lines.push(`- 部门：${department}`);
      lines.push(`- 事项类别：${typeText[item.type] || item.type}`);
      lines.push(`- 执行时间：${getFullDate(item.time)}`);
      lines.push(`- 类别补充 / 执行范围：${scope}`);
      lines.push("- 执行说明：");
      lines.push(note);
      lines.push("");
    });
  });

  lines.push("## 会审部门意见", "");
  reviews.forEach((item) => {
    lines.push(`### ${item.title}`);
    lines.push(`- 状态：${item.status}`);
    lines.push("- 意见：");
    lines.push(normalizeMarkdownText(item.text) || "待补充意见");
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDashboardMarkdown() {
  saveProductDrafts();
  saveReviewDrafts();
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`产品调整会审仪表盘-${date}.md`, buildDashboardMarkdown(), "text/markdown;charset=utf-8");
  setSaveState("MD 已生成");
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片生成失败"));
    }, type, quality);
  });
}

async function exportDashboardImage() {
  saveProductDrafts();
  saveReviewDrafts();
  exportImageButton.disabled = true;
  exportImageButton.textContent = "正在生成";
  document.querySelector(".dashboard-shell").classList.add("is-exporting");

  try {
    const svg = renderExportSvg();
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);

    const imageBlob = await canvasToBlob(canvas, "image/png");
    downloadBlob(`产品调整会审仪表盘-${new Date().toISOString().slice(0, 10)}.png`, imageBlob);
    setSaveState("图片已生成");
  } catch (error) {
    console.error(error);
    setSaveState("图片生成失败");
  } finally {
    document.querySelector(".dashboard-shell").classList.remove("is-exporting");
    exportImageButton.disabled = false;
    exportImageButton.textContent = "保存图片";
  }
}

function resetClearAllButton() {
  clearAllButton.classList.remove("is-confirming");
  clearAllButton.textContent = "清空全部";
  clearAllButton.dataset.confirming = "";
}

function hasLocalRecoveryState() {
  return readLocalRecoveryState().products.length > 0;
}

async function recoverFromLocalCache() {
  const recoveryButton = document.querySelector("#localRecoveryButton");
  const recoveredState = readLocalRecoveryState();
  if (!recoveredState.products.length) {
    setSaveState("本机没有可恢复内容");
    return;
  }

  if (recoveryButton) {
    recoveryButton.disabled = true;
    recoveryButton.textContent = "正在恢复";
  }

  productChanges = recoveredState.products.map((item) => ({ ...item }));
  reviewDepartments = recoveredState.reviews.map((item) => ({ ...item }));
  storageMode = hasSharedSync ? "shared" : "local";
  setActiveType("all");
  renderDepartmentPanels();
  renderReviewHighlights();

  if (hasSharedSync) {
    const saved = await saveSharedState({ restoreIntent: true });
    if (!saved) {
      storageMode = "local";
      sessionStorage.setItem(recoveryPinnedKey, "true");
      setSaveState("已恢复本机缓存，云端仍连接失败");
    } else {
      sessionStorage.removeItem(recoveryPinnedKey);
    }
  } else {
    localStorage.setItem(productStorageKey, JSON.stringify(productChanges));
    localStorage.setItem(reviewStorageKey, JSON.stringify(Object.fromEntries(reviewDepartments.map((item) => [item.id, item.text]))));
    setSaveState("已恢复本机缓存");
  }

  if (recoveryButton) {
    recoveryButton.disabled = false;
    recoveryButton.textContent = "恢复本机缓存";
  }
}

async function publishLocalCacheToCloud() {
  if (!recoveryMode || !hasSharedSync || !applyLocalRecoveryState("正在发布本机缓存到云端")) return false;
  storageMode = "shared";
  setActiveType("all");
  renderDepartmentPanels();
  renderReviewHighlights();

  const saved = await saveSharedState({ restoreIntent: true });
  if (saved) {
    sessionStorage.removeItem(recoveryPinnedKey);
    setSaveState("已发布到云端，常规链接可查看");
    return true;
  }

  storageMode = "local";
  sessionStorage.setItem(recoveryPinnedKey, "true");
  setSaveState("本机内容已显示，云端发布失败");
  return false;
}

function setupLocalRecovery() {
  if (!recoveryMode || !exportActions) return;
  const recoveryButton = document.createElement("button");
  recoveryButton.className = "export-button export-button-secondary";
  recoveryButton.id = "localRecoveryButton";
  recoveryButton.type = "button";
  recoveryButton.textContent = "恢复本机缓存";
  recoveryButton.disabled = !hasLocalRecoveryState();
  recoveryButton.addEventListener("click", recoverFromLocalCache);
  exportActions.prepend(recoveryButton);
}

function clearAllContent() {
  localEditVersion += 1;
  productChanges = [];
  reviewDepartments = reviewDepartments.map((item) => ({ ...item, text: "" }));
  explicitClearAt = new Date().toISOString();
  lastKnownClearedAt = explicitClearAt;
  localStorage.setItem(clearIntentStorageKey, explicitClearAt);

  if (hasSharedSync) {
    storageMode = "shared";
    queueSharedSave();
    setSaveState("正在同步清空");
  } else {
    localStorage.setItem(productStorageKey, JSON.stringify(productChanges));
    localStorage.setItem(reviewStorageKey, JSON.stringify(Object.fromEntries(reviewDepartments.map((item) => [item.id, ""]))));
    setSaveState("已清空");
  }

  setActiveType("all");
  renderDepartmentPanels();
  renderReviewHighlights();
}

function requestClearAll() {
  if (clearAllButton.dataset.confirming === "true") {
    window.clearTimeout(requestClearAll.timer);
    clearAllContent();
    resetClearAllButton();
    return;
  }

  clearAllButton.dataset.confirming = "true";
  clearAllButton.classList.add("is-confirming");
  clearAllButton.textContent = "再次点击确认清空";
  setSaveState("再次点击确认清空");
  window.clearTimeout(requestClearAll.timer);
  requestClearAll.timer = window.setTimeout(resetClearAllButton, 5000);
}

typeFilter.addEventListener("change", (event) => {
  saveProductDrafts();
  setActiveType(event.target.value);
  renderDepartmentPanels();
});

reviewGrid.addEventListener("input", (event) => {
  if (!event.target.matches("[data-review-editor]")) return;
  localEditVersion += 1;
  setSaveState("正在保存");
  saveReviewDrafts();
});

reviewGrid.addEventListener("change", (event) => {
  if (!event.target.matches("[data-review-editor]")) return;
  saveReviewDrafts();
});

departmentGrid.addEventListener("input", (event) => {
  if (!event.target.matches("[data-product-field]")) return;
  setSaveState("正在保存");
  window.clearTimeout(departmentGrid.saveTimer);
  departmentGrid.saveTimer = window.setTimeout(saveProductDrafts, 420);
});

departmentGrid.addEventListener("change", (event) => {
  if (event.target.matches("[data-time-tentative]")) {
    const dateInput = event.target.closest(".product-time-editor").querySelector('[data-product-field="time"]');
    dateInput.disabled = event.target.checked;
    dateInput.value = event.target.checked ? "" : getDefaultTimeValue();
    saveProductDrafts();
    renderDepartmentPanels();
    return;
  }

  if (!event.target.matches("[data-product-field]")) return;
  saveProductDrafts();
  renderDepartmentPanels();
});

departmentGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-product]");
  if (addButton) {
    addProductChange(addButton.dataset.addProduct, addButton.dataset.addType);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-product]");
  if (deleteButton) {
    deleteProductChange(deleteButton.dataset.deleteProduct);
  }
});

exportImageButton.addEventListener("click", exportDashboardImage);
exportMarkdownButton.addEventListener("click", exportDashboardMarkdown);
clearAllButton.addEventListener("click", requestClearAll);
setupLocalRecovery();

async function initDashboard() {
  const hasPendingClear = applyPendingClearIntent();
  if (hasSharedSync && !recoveryMode && !hasPendingClear) {
    try {
      await loadFallbackState();
    } catch (error) {
      console.error("首屏兜底数据加载失败", error);
      productChanges = [];
      reviewDepartments = defaultReviewDepartments.map((item) => ({ ...item, text: "" }));
      storageMode = "fallback";
      setSaveState("兜底数据加载失败");
    }
  } else if (hasSharedSync && !hasPendingClear) {
    setSaveState("正在连接云端数据");
  }

  renderDepartmentPanels();
  renderReviewHighlights();
  if (await publishLocalCacheToCloud()) return;
  if (hasSharedSync) {
    syncFromCloud().catch((error) => console.error("初始化云端数据失败", error));
  }

  window.setInterval(() => {
    syncFromCloud().catch((error) => console.error("自动同步失败", error));
  }, runtimeConfig.sharedAutoSyncMs || 15000);

  window.addEventListener("focus", () => {
    syncFromCloud().catch((error) => console.error("焦点同步失败", error));
  });
}

initDashboard();
