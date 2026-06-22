const departments = [
  { id: "hot", name: "热厨", tone: "hot" },
  { id: "drink", name: "水吧", tone: "drink" },
  { id: "bake", name: "烘焙", tone: "bake" },
];

const runtimeConfig = window.DEJI_CONFIG || {};
const sharedStateRowId = "product-change-dashboard-state-v1";
const sharedDataRevision = "2026-06-hot-drink-actual-v3";

const defaultProductChanges = [
  {
    id: "hot-optimize-20260628-steak",
    department: "hot",
    type: "optimize",
    name: "168-188 牛排",
    time: "2026-06-28",
    reviewer: "",
    opinion: "",
    followUp: true,
  },
  {
    id: "hot-launch-20260610-longgang-wanlinghui",
    department: "hot",
    type: "launch",
    name: "照烧鸡腿、烧汁牛腩排/委外物料",
    time: "2026-06-10",
    reviewer: "部分门店（龙岗、万菱汇）",
    opinion: "",
    followUp: true,
  },
  {
    id: "hot-launch-20260629-shenye-ccp",
    department: "hot",
    type: "launch",
    name: "照烧鸡腿、烧汁牛腩排/委外物料",
    time: "2026-06-29",
    reviewer: "部分门店（深业、CCP）",
    opinion: "",
    followUp: true,
  },
  {
    id: "hot-launch-20260629-tomato-meat-sauce",
    department: "hot",
    type: "launch",
    name: "番茄肉酱/委外物料",
    time: "2026-06-29",
    reviewer: "总部店测试",
    opinion: "",
    followUp: true,
  },
  {
    id: "drink-launch-20260630-jasmine-mango-kombucha",
    department: "drink",
    type: "launch",
    name: "茉莉青芒康普茶/配餐神器",
    time: "2026-06-30",
    reviewer: "",
    opinion: "",
    followUp: true,
  },
  {
    id: "drink-optimize-20260630-mung-bean-sparkling-water",
    department: "drink",
    type: "optimize",
    name: "绿豆汽泡水/配餐神器",
    time: "2026-06-30",
    reviewer: "",
    opinion: "",
    followUp: true,
  },
  {
    id: "bake-launch-1",
    department: "bake",
    type: "launch",
    name: "开心果覆盆子可颂",
    time: "2026-06-03 08:00",
    reviewer: "研发部 / 门店训练",
    opinion: "同意上新。需补充切面标准图，训练部同步制作陈列动作卡。",
    followUp: true,
  },
  {
    id: "bake-retire-1",
    department: "bake",
    type: "retire",
    name: "榛子巧克力软欧",
    time: "2026-06-07 20:30",
    reviewer: "财务部 / 运营部",
    opinion: "同意下架。销量低于保留线，建议释放陈列位给高转化新品。",
    followUp: false,
  },
];

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
const reviewStorageKey = "product-change-dashboard-review-opinions-v1";
const productStorageKey = "product-change-dashboard-product-changes-v3";

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
const exportPdfButton = document.querySelector("#exportPdfButton");
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

function loadSavedProducts() {
  if (storageMode === "shared") return {};
  try {
    return JSON.parse(localStorage.getItem(productStorageKey)) || {};
  } catch {
    return {};
  }
}

function getCurrentProductChanges() {
  if (storageMode === "shared") return productChanges;
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

  if (storageMode === "shared") {
    queueSharedSave();
    setSaveState(statusText === "已保存" ? "正在同步" : statusText);
  } else {
    localStorage.setItem(productStorageKey, JSON.stringify(productChanges));
    setSaveState(statusText);
  }
}

function getVisibleItems(departmentId) {
  return getCurrentProductChanges().filter((item) => {
    const departmentMatches = item.department === departmentId;
    const typeMatches = activeType === "all" || item.type === activeType;
    return departmentMatches && typeMatches;
  });
}

function renderDepartmentPanels() {
  departmentGrid.innerHTML = departments
    .map((department) => {
      const visibleItems = getVisibleItems(department.id);
      const allDepartmentItems = getCurrentProductChanges().filter((item) => item.department === department.id);
      const launchCount = allDepartmentItems.filter((item) => item.type === "launch").length;
      const retireCount = allDepartmentItems.filter((item) => item.type === "retire").length;
      const optimizeCount = allDepartmentItems.filter((item) => item.type === "optimize").length;

      const itemCards = visibleItems.length
        ? visibleItems
            .map(
              (item) => `
                <article class="product-card ${item.type}">
                  <div class="change-badge">${typeLabel[item.type]}</div>
                  <div class="product-edit-grid" data-product-id="${item.id}">
                    <div class="product-edit-head">
                      <label class="product-field product-field-name">
                        <span>菜品</span>
                        <input class="product-input product-name-input" data-product-field="name" value="${escapeHtml(item.name)}" aria-label="${department.name}${typeText[item.type]}菜品名称" />
                      </label>
                      <button class="delete-product-button" type="button" data-delete-product="${item.id}" aria-label="删除${item.name}">删除</button>
                    </div>
                    <div class="product-meta-edit">
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
              `,
            )
            .join("")
        : `<div class="empty-state">当前筛选下暂无菜品</div>`;

      return `
        <section class="department-panel">
          <header class="department-head ${department.tone}">
            <div class="department-head-main">
              <div class="department-title">${department.name}</div>
              <div class="department-counts">
                <span>上架 ${launchCount}</span>
                <span>下架 ${retireCount}</span>
                <span>调优 ${optimizeCount}</span>
              </div>
            </div>
            <div class="department-actions">
              <button class="department-add-button" type="button" data-add-product="${department.id}">新增事项</button>
            </div>
          </header>
          <div class="item-list">${itemCards}</div>
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
          <strong>${item.title}</strong>
          <textarea class="review-editor" data-review-editor="${item.id}" aria-label="${item.title}会审意见">${savedReviews[item.id] ?? item.text}</textarea>
          <span class="review-status ${item.tone}">${item.status}</span>
        </article>
      `,
    )
    .join("");
}

function loadSavedReviews() {
  if (storageMode === "shared") return {};
  try {
    return JSON.parse(localStorage.getItem(reviewStorageKey)) || {};
  } catch {
    return {};
  }
}

function getCurrentReviews() {
  if (storageMode === "shared") return reviewDepartments;
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

  if (storageMode === "shared") {
    reviewDepartments = reviewDepartments.map((item) => ({
      ...item,
      text: nextReviews[item.id] ?? item.text,
    }));
    queueSharedSave();
    setSaveState("正在同步");
  } else {
    localStorage.setItem(reviewStorageKey, JSON.stringify(nextReviews));
    setSaveState("已保存");
  }
}

function setActiveType(nextType) {
  activeType = nextType;
  typeFilter.value = activeType;
}

function addProductChange(departmentId) {
  saveProductDrafts();

  const department = departments.find((item) => item.id === departmentId);
  const type = activeType === "all" ? "launch" : activeType;
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
  if (activeType !== "all" && activeType !== type) setActiveType(type);
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

function setSaveState(text) {
  saveState.textContent = text;
  window.clearTimeout(setSaveState.timer);
  setSaveState.timer = window.setTimeout(() => {
    saveState.textContent = storageMode === "shared" ? "线上共享，内容自动同步" : "内容自动保存";
  }, 1600);
}

function mergeById(defaultItems, incomingItems) {
  const incomingMap = new Map((incomingItems || []).map((item) => [item.id, item]));
  const mergedItems = defaultItems.map((item) => ({ ...item, ...(incomingMap.get(item.id) || {}) }));
  const defaultIds = new Set(defaultItems.map((item) => item.id));
  const extraItems = (incomingItems || []).filter((item) => !defaultIds.has(item.id));
  return [...mergedItems, ...extraItems];
}

async function loadSharedState() {
  try {
    const { sharedApiUrl } = runtimeConfig;
    if (!sharedApiUrl) throw new Error("缺少阿里云共享接口配置");

    const response = await fetch(sharedApiUrl, { cache: "no-store" });
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
    const state = response.status === 404 ? null : await response.json();
    const requiresDataMigration = Boolean(state && state.dataRevision !== sharedDataRevision);
    const actualDepartments = new Set(["hot", "drink"]);
    const incomingProducts = requiresDataMigration
      ? [
          ...defaultProductChanges.filter((item) => actualDepartments.has(item.department)),
          ...(state.products || []).filter((item) => !actualDepartments.has(item.department)),
        ]
      : state?.products;

    productChanges = state
      ? (incomingProducts || []).map((item) => ({ ...item }))
      : defaultProductChanges.map((item) => ({ ...item }));
    reviewDepartments = mergeById(defaultReviewDepartments, state?.reviews);
    storageMode = "shared";
    setSaveState(requiresDataMigration ? "正在更新热厨数据" : state ? "阿里云共享模式" : "正在初始化云端数据");

    if (!state || requiresDataMigration) await saveSharedState();
  } catch {
    storageMode = "local";
    setSaveState("本地保存模式");
  }
}

function getSharedPayload() {
  return {
    products: getCurrentProductChanges(),
    reviews: getCurrentReviews(),
    dataRevision: sharedDataRevision,
    updatedAt: new Date().toISOString(),
  };
}

function queueSharedSave() {
  if (storageMode !== "shared") return;
  window.clearTimeout(queueSharedSave.timer);
  queueSharedSave.pending = true;
  queueSharedSave.timer = window.setTimeout(async () => {
    try {
      await saveSharedState();
    } finally {
      queueSharedSave.pending = false;
      queueSharedSave.timer = null;
    }
  }, 520);
}

async function saveSharedState() {
  if (storageMode !== "shared") return;

  try {
    const { sharedApiUrl } = runtimeConfig;
    if (!sharedApiUrl) throw new Error("缺少阿里云共享接口配置");
    const response = await fetch(sharedApiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getSharedPayload()),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setSaveState("已同步到云端");
  } catch (error) {
    console.error(error);
    setSaveState("云端同步失败");
  }
}

async function syncFromCloud() {
  if (storageMode !== "shared" || queueSharedSave.pending) return;
  await loadSharedState();
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
  const visibleItems = currentProducts.filter((item) => activeType === "all" || item.type === activeType);
  const reviews = getCurrentReviews();
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="__HEIGHT__" viewBox="0 0 ${width} __HEIGHT__">`,
    `<rect width="${width}" height="__HEIGHT__" fill="${brandColors.paper}"/>`,
    `<rect x="0" y="0" width="${width}" height="132" fill="#ffffff"/>`,
  ];

  parts.push(svgText(margin, 58, "Product Change Review Board", { size: 24, weight: 800, fill: brandColors.blue, maxChars: 80 }).markup);
  parts.push(svgText(margin, 112, "产品调整会审仪表盘", { size: 58, weight: 950, maxChars: 80 }).markup);
  parts.push(svgText(1260, 80, `导出日期：${new Intl.DateTimeFormat("zh-CN").format(new Date())}`, { size: 24, weight: 800, fill: brandColors.muted, maxChars: 30 }).markup);

  const departmentY = 170;
  const departmentW = (width - margin * 2 - gap * 2) / 3;
  const departmentBottoms = departments.map((department, index) => {
    const x = margin + index * (departmentW + gap);
    const color = { hot: brandColors.blue, drink: brandColors.blueDeep, bake: brandColors.blueDark }[department.tone];
    const items = visibleItems.filter((item) => item.department === department.id);
    let y = departmentY;
    parts.push(`<rect x="${x}" y="${y}" width="${departmentW}" height="86" rx="${cardRadius}" fill="${color}"/>`);
    parts.push(svgText(x + 22, y + 57, department.name, { size: 44, weight: 950, fill: "#ffffff", maxChars: 8 }).markup);
    y += 106;

    if (!items.length) {
      parts.push(`<rect x="${x}" y="${y}" width="${departmentW}" height="114" rx="${cardRadius}" fill="#ffffff" stroke="${brandColors.line}"/>`);
      parts.push(svgText(x + 110, y + 70, "当前筛选下暂无菜品", { size: 28, weight: 850, fill: brandColors.muted, maxChars: 18 }).markup);
      return y + 136;
    }

    items.forEach((item) => {
      const typeColor = item.type === "launch" ? brandColors.blue : item.type === "retire" ? brandColors.orange : brandColors.optimize;
      const titleBlock = svgText(x + 112, y + 44, item.name, {
        size: 30,
        weight: 950,
        maxChars: 12,
        lineHeight: 38,
      });
      const timeY = y + 44 + titleBlock.height + 8;
      const reviewerY = timeY + 32;
      const opinionY = reviewerY + 38;
      const opinionBlock = svgText(x + 24, opinionY, item.opinion, {
        size: 22,
        weight: 750,
        fill: brandColors.ink,
        maxChars: 19,
        lineHeight: 32,
      });
      const height = Math.max(188, opinionY + opinionBlock.height - y + 28);

      parts.push(`<rect x="${x}" y="${y}" width="${departmentW}" height="${height}" rx="${cardRadius}" fill="#ffffff" stroke="${brandColors.line}"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="10" height="${height}" rx="5" fill="${typeColor}"/>`);
      parts.push(`<rect x="${x + 24}" y="${y + 24}" width="70" height="70" rx="12" fill="${typeColor}"/>`);
      parts.push(svgText(x + 44, y + 70, typeLabel[item.type], { size: 34, weight: 950, fill: "#ffffff", maxChars: 2 }).markup);
      parts.push(titleBlock.markup);
      parts.push(svgText(x + 112, timeY, `执行时间：${formatDateTime(item.time)}`, { size: 21, weight: 850, fill: brandColors.muted, maxChars: 17 }).markup);
      parts.push(svgText(x + 112, reviewerY, `会审：${item.reviewer}`, { size: 21, weight: 850, fill: brandColors.muted, maxChars: 17 }).markup);
      parts.push(opinionBlock.markup);
      y += height + 20;
    });

    return y + 8;
  });

  let reviewY = Math.max(...departmentBottoms) + 48;
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

async function exportDashboardPdf() {
  saveProductDrafts();
  saveReviewDrafts();
  exportPdfButton.disabled = true;
  exportPdfButton.textContent = "正在生成 PDF";
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

    const pdfBlob = createPdfBlob(canvas.toDataURL("image/jpeg", 0.92), canvas.width, canvas.height);
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `产品调整会审仪表盘-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
    setSaveState("PDF 已生成");
  } catch (error) {
    console.error(error);
    window.print();
    setSaveState("已打开打印");
  } finally {
    document.querySelector(".dashboard-shell").classList.remove("is-exporting");
    exportPdfButton.disabled = false;
    exportPdfButton.textContent = "一键导出 PDF";
  }
}

typeFilter.addEventListener("change", (event) => {
  saveProductDrafts();
  setActiveType(event.target.value);
  renderDepartmentPanels();
});

reviewGrid.addEventListener("input", (event) => {
  if (!event.target.matches("[data-review-editor]")) return;
  setSaveState("正在保存");
  window.clearTimeout(reviewGrid.saveTimer);
  reviewGrid.saveTimer = window.setTimeout(saveReviewDrafts, 420);
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
    addProductChange(addButton.dataset.addProduct);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-product]");
  if (deleteButton) {
    deleteProductChange(deleteButton.dataset.deleteProduct);
  }
});

exportPdfButton.addEventListener("click", exportDashboardPdf);

async function initDashboard() {
  renderDepartmentPanels();
  renderReviewHighlights();
  loadSharedState()
    .then(() => {
      renderDepartmentPanels();
      renderReviewHighlights();
    })
    .catch((error) => console.error("初始化云端数据失败", error));

  window.setInterval(() => {
    syncFromCloud().catch((error) => console.error("自动同步失败", error));
  }, runtimeConfig.sharedAutoSyncMs || 15000);

  window.addEventListener("focus", () => {
    syncFromCloud().catch((error) => console.error("焦点同步失败", error));
  });
}

initDashboard();
