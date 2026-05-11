const seedPayload = window.__DEJI_DATA__;
const runtimeConfig = window.DEJI_CONFIG || { dataMode: "local" };

const LOCAL_TASKS_KEY = "deji-opening-shared-tasks-v2";
const LOCAL_META_KEY = "deji-opening-shared-meta-v2";
const DEPARTMENT_OPTIONS = ["运营部", "采购部", "训练部", "厨政部", "市场部", "研发部", "人资部", "食安部"];
const DEPARTMENT_ALIASES = {
  "运营": "运营部",
  "营运": "运营部",
  "运营部": "运营部",
  "采购": "采购部",
  "采购部": "采购部",
  "训练": "训练部",
  "训练部": "训练部",
  "厨政": "厨政部",
  "厨政部": "厨政部",
  "市场": "市场部",
  "市场部": "市场部",
  "研发": "研发部",
  "研发部": "研发部",
  "HR": "人资部",
  "人资": "人资部",
  "人资部": "人资部",
  "食安": "食安部",
  "食安部": "食安部",
};
const FORM_FIELDS = [
  "title",
  "description",
  "department",
  "owner",
  "collaborators",
  "reviewer",
  "notes",
  "date_label",
  "start_date",
  "end_date",
  "phase",
  "status_hint",
  "risk_level",
];

const state = {
  tasks: [],
  sourceMode: runtimeConfig.dataMode || "local",
  sourceLabel: "",
  lastSyncedAt: "",
  editorTaskId: null,
  search: "",
  filters: {
    department: "",
    phase: "",
    risk: "",
    status: "",
  },
};

const els = {
  countdownDays: document.getElementById("countdownDays"),
  dateRangeText: document.getElementById("dateRangeText"),
  kpiGrid: document.getElementById("kpiGrid"),
  phaseChips: document.getElementById("phaseChips"),
  timelineBars: document.getElementById("timelineBars"),
  riskList: document.getElementById("riskList"),
  departmentFilter: document.getElementById("departmentFilter"),
  phaseFilter: document.getElementById("phaseFilter"),
  riskFilter: document.getElementById("riskFilter"),
  statusFilter: document.getElementById("statusFilter"),
  keywordInput: document.getElementById("keywordInput"),
  taskBoard: document.getElementById("taskBoard"),
  departmentChart: document.getElementById("departmentChart"),
  missingDateList: document.getElementById("missingDateList"),
  sourceBadge: document.getElementById("sourceBadge"),
  lastSyncText: document.getElementById("lastSyncText"),
  addTaskButton: document.getElementById("addTaskButton"),
  seedCloudButton: document.getElementById("seedCloudButton"),
  syncCloudButton: document.getElementById("syncCloudButton"),
  modal: document.getElementById("taskModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalCloseButton: document.getElementById("modalCloseButton"),
  modalCancelButton: document.getElementById("modalCancelButton"),
  taskForm: document.getElementById("taskForm"),
  saveTaskButton: document.getElementById("saveTaskButton"),
  deleteTaskButton: document.getElementById("deleteTaskButton"),
};

function toIsoDate(input) {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function isSupabaseMode() {
  return Boolean(runtimeConfig.dataMode === "supabase" && runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);
}

function normalizeDepartment(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const primary = raw.split(/[\/、,，\s]+/).find(Boolean) || raw;
  return DEPARTMENT_ALIASES[primary] || raw;
}

function slug(text) {
  return (text || "task")
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "task";
}

function asDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toDateLabel(input) {
  return `${input.getMonth() + 1}/${input.getDate()}`;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function inferPhase(endDate) {
  if (!endDate) return "待补日期";
  const end = asDate(endDate);
  if (!end) return "待补日期";
  const phases = [
    ["团队与训练", "2026-05-08", "2026-05-31"],
    ["迁店与基础交付", "2026-06-01", "2026-06-07"],
    ["物料与系统到店", "2026-06-08", "2026-06-12"],
    ["联调与开业冲刺", "2026-06-13", "2026-06-17"],
    ["正式开业", "2026-06-18", "2026-06-18"],
  ];
  const hit = phases.find(([, start, finish]) => end >= asDate(start) && end <= asDate(finish));
  return hit ? hit[0] : "其他";
}

function inferStatus(task) {
  if (task.manual_status) return task.manual_status;
  if (!task.end_date) return "待补日期";
  const today = getToday();
  const start = asDate(task.start_date || task.end_date);
  const end = asDate(task.end_date);
  if (!today || !start || !end) return "未开始";
  if (end < today) return "已逾期";
  if (start <= today && today <= end) return "进行中";
  if (daysBetween(today, start) <= 3) return "临近开始";
  return "未开始";
}

function inferRisk(task) {
  if (!task.owner || !task.department) return "高";
  if (!task.has_confirmed_date) return "高";
  const status = inferStatus(task);
  if (status === "已逾期" || status === "临近开始") return "高";
  if (!task.reviewer || !task.collaborators) return "中";
  return task.risk_level || "低";
}

function normalizeTask(task, index) {
  const normalized = { ...task };
  normalized.id = task.id || `task-${Date.now()}-${index}-${slug(task.title)}`;
  normalized.row_number = task.row_number || index + 1;
  normalized.department = normalizeDepartment(task.department);
  normalized.start_date = toIsoDate(task.start_date);
  normalized.end_date = toIsoDate(task.end_date);
  normalized.has_confirmed_date = Boolean(normalized.start_date || normalized.end_date);
  normalized.needs_date_confirmation = !normalized.has_confirmed_date;
  normalized.phase = task.phase || inferPhase(normalized.end_date);
  normalized.manual_status = task.manual_status || "";
  normalized.status_hint = inferStatus(normalized);
  normalized.risk_level = task.risk_level || inferRisk(normalized);
  normalized.date_label =
    task.date_label ||
    (normalized.start_date && normalized.end_date
      ? normalized.start_date === normalized.end_date
        ? normalized.start_date
        : `${normalized.start_date} ~ ${normalized.end_date}`
      : "待确认");
  normalized.created_at = task.created_at || new Date().toISOString();
  normalized.updated_at = task.updated_at || new Date().toISOString();
  return normalized;
}

function getLocalTasks() {
  const raw = localStorage.getItem(LOCAL_TASKS_KEY);
  if (raw) {
    return JSON.parse(raw).map(normalizeTask);
  }
  const seeded = seedPayload.tasks.map((task, index) =>
    normalizeTask(
      {
        ...task,
        manual_status: task.status_hint,
      },
      index
    )
  );
  localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(seeded));
  localStorage.setItem(
    LOCAL_META_KEY,
    JSON.stringify({ lastSyncAt: new Date().toISOString(), source: "本地浏览器存储" })
  );
  return seeded;
}

function setLocalTasks(tasks) {
  localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
  localStorage.setItem(
    LOCAL_META_KEY,
    JSON.stringify({ lastSyncAt: new Date().toISOString(), source: "本地浏览器存储" })
  );
}

async function fetchSupabaseTasks() {
  const { supabaseUrl, supabaseAnonKey, supabaseTable = "opening_tasks" } = runtimeConfig;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${supabaseTable}?select=*&order=end_date.asc.nullslast,created_at.asc`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    }
  );
  if (!response.ok) throw new Error(`Supabase fetch failed: ${response.status}`);
  const rows = await response.json();
  return rows.map((task, index) => normalizeTask(task, index));
}

async function createSupabaseTask(task) {
  const { supabaseUrl, supabaseAnonKey, supabaseTable = "opening_tasks" } = runtimeConfig;
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([task]),
  });
  if (!response.ok) throw new Error(`Supabase create failed: ${response.status}`);
  const rows = await response.json();
  return rows[0];
}

async function upsertSupabaseTasks(tasks) {
  const { supabaseUrl, supabaseAnonKey, supabaseTable = "opening_tasks" } = runtimeConfig;
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(tasks),
  });
  if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status}`);
  return response.json();
}

async function updateSupabaseTask(id, patch) {
  const { supabaseUrl, supabaseAnonKey, supabaseTable = "opening_tasks" } = runtimeConfig;
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Supabase update failed: ${response.status}`);
  const rows = await response.json();
  return rows[0];
}

async function deleteSupabaseTask(id) {
  const { supabaseUrl, supabaseAnonKey, supabaseTable = "opening_tasks" } = runtimeConfig;
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status}`);
}

const taskStore = {
  async load() {
    if (isSupabaseMode()) {
      state.sourceLabel = "Supabase 云端表";
      state.lastSyncedAt = new Date().toISOString();
      return fetchSupabaseTasks();
    }
    state.sourceLabel = "本地浏览器存储";
    state.lastSyncedAt = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "{}").lastSyncAt || "";
    return getLocalTasks();
  },
  async save(task) {
    const normalized = normalizeTask(task, state.tasks.length + 1);
    if (isSupabaseMode()) {
      const saved = normalizeTask(await createSupabaseTask(normalized), state.tasks.length + 1);
      state.lastSyncedAt = new Date().toISOString();
      return saved;
    }
    const next = [...state.tasks, normalized];
    setLocalTasks(next);
    state.lastSyncedAt = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "{}").lastSyncAt || "";
    return normalized;
  },
  async update(id, patch) {
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error("Task not found");
    const merged = normalizeTask(
      {
        ...state.tasks[index],
        ...patch,
        updated_at: new Date().toISOString(),
      },
      index
    );
    if (isSupabaseMode()) {
      const updated = normalizeTask(await updateSupabaseTask(id, merged), index);
      state.lastSyncedAt = new Date().toISOString();
      return updated;
    }
    const next = [...state.tasks];
    next[index] = merged;
    setLocalTasks(next);
    state.lastSyncedAt = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "{}").lastSyncAt || "";
    return merged;
  },
  async seedCloud() {
    if (!isSupabaseMode()) {
      return;
    }
    const tasks = seedPayload.tasks.map((task, index) =>
      normalizeTask({ ...task, manual_status: task.status_hint }, index)
    );
    await upsertSupabaseTasks(tasks);
    state.lastSyncedAt = new Date().toISOString();
  },
  async delete(id) {
    if (isSupabaseMode()) {
      await deleteSupabaseTask(id);
      state.lastSyncedAt = new Date().toISOString();
      return;
    }
    const next = state.tasks.filter((task) => task.id !== id);
    setLocalTasks(next);
    state.lastSyncedAt = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "{}").lastSyncAt || "";
  },
};

function formatDateRange() {
  const opening = asDate(seedPayload.openingDay);
  const today = getToday();
  if (!opening || !today) return "--";
  return `${toDateLabel(today)} - ${toDateLabel(opening)}`;
}

function buildDerived(tasks) {
  const datedTasks = tasks.filter((task) => task.end_date);
  const overdue = tasks.filter((task) => inferStatus(task) === "已逾期");
  const dueThisWeek = tasks.filter((task) => {
    const end = asDate(task.end_date);
    const today = getToday();
    return end && today && daysBetween(today, end) >= 0 && daysBetween(today, end) <= 7;
  });
  const highRisk = tasks.filter((task) => inferRisk(task) === "高");
  const departmentCounts = tasks.reduce((acc, task) => {
    const key = task.department || "待补部门";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const phaseCounts = tasks.reduce((acc, task) => {
    const key = task.phase || "待补日期";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const timeline = [];
  if (datedTasks.length) {
    let cursor = asDate(
      datedTasks
        .map((task) => task.start_date || task.end_date)
        .sort()[0]
    );
    const max = asDate(datedTasks.map((task) => task.end_date).sort().slice(-1)[0]);
    while (cursor && max && cursor <= max) {
      const iso = cursor.toISOString().slice(0, 10);
      const activeTasks = datedTasks.filter((task) => {
        const start = task.start_date || task.end_date;
        return start <= iso && task.end_date >= iso;
      }).length;
      timeline.push({ date: iso, activeTasks });
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }
  return {
    taskCount: tasks.length,
    datedTaskCount: datedTasks.length,
    missingDateCount: tasks.length - datedTasks.length,
    overdueCount: overdue.length,
    dueThisWeekCount: dueThisWeek.length,
    highRiskCount: highRisk.length,
    departmentCounts,
    phaseCounts,
    timeline,
  };
}

function renderHero() {
  const opening = asDate(seedPayload.openingDay);
  const today = getToday();
  const countdownDays = opening && today ? daysBetween(today, opening) : "--";
  els.countdownDays.textContent = countdownDays;
  els.dateRangeText.textContent = `项目周期 ${seedPayload.projectSpanDays} 天 ｜ 当前窗口 ${formatDateRange()}`;
}

function renderSourceStatus() {
  els.sourceBadge.textContent = state.sourceMode === "supabase" ? "团队共享模式" : "本地演示模式";
  const lastSyncAt = state.lastSyncedAt ? new Date(state.lastSyncedAt).toLocaleString("zh-CN") : "首次载入";
  els.lastSyncText.textContent = `${state.sourceLabel || "未连接"} ｜ 最后同步 ${lastSyncAt}`;
  if (state.sourceMode === "supabase") {
    els.seedCloudButton.removeAttribute("hidden");
    els.syncCloudButton.removeAttribute("hidden");
  } else {
    els.seedCloudButton.setAttribute("hidden", "hidden");
    els.syncCloudButton.setAttribute("hidden", "hidden");
  }
}

function renderKpis(derived) {
  const entries = [
    ["总任务数", derived.taskCount, "支持在线新增与编辑，已经不是单纯静态看板。"],
    ["已排期任务", derived.datedTaskCount, "这些任务已进入时间轴和冲刺阶段管理。"],
    ["待补日期", derived.missingDateCount, "建议在团队周会上优先补齐这部分口径。"],
    ["本周到期", derived.dueThisWeekCount, "未来 7 天是最该盯紧的动作集合。"],
    ["已逾期", derived.overdueCount, "默认按当前日期自动识别，便于立即复盘。"],
    ["高风险", derived.highRiskCount, "缺日期、缺负责人、临期、逾期都会进入雷达。"],
  ];
  els.kpiGrid.innerHTML = entries
    .map(
      ([label, value, copy]) => `
        <article class="kpi-card">
          <p>${label}</p>
          <strong>${value}</strong>
          <p>${copy}</p>
        </article>
      `
    )
    .join("");
}

function renderPhaseChips(derived) {
  els.phaseChips.innerHTML = Object.entries(derived.phaseCounts)
    .map(([phase, count]) => `<span class="phase-chip">${phase} ${count}</span>`)
    .join("");
}

function renderTimeline(derived) {
  const peak = Math.max(...derived.timeline.map((item) => item.activeTasks), 1);
  els.timelineBars.innerHTML = derived.timeline
    .map((item) => {
      const short = item.date.slice(5).replace("-", "/");
      return `
        <div class="timeline-row">
          <span>${short}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (item.activeTasks / peak) * 100)}%"></div></div>
          <span>${item.activeTasks}</span>
        </div>
      `;
    })
    .join("");
}

function renderRiskList() {
  els.riskList.innerHTML = state.tasks
    .filter((task) => inferRisk(task) === "高")
    .sort((a, b) => (a.end_date || "9999").localeCompare(b.end_date || "9999"))
    .slice(0, 8)
    .map(
      (task) => `
        <article class="risk-item">
          <h3>${task.title}</h3>
          <p class="risk-meta">${task.date_label} ｜ ${task.department || "待补部门"} ｜ ${task.owner || "待补负责人"}</p>
          <p class="risk-meta">${task.needs_date_confirmation ? "需要补时间节点" : inferStatus(task)}</p>
        </article>
      `
    )
    .join("");
}

function renderDepartmentChart(derived) {
  const entries = Object.entries(derived.departmentCounts).sort((a, b) => b[1] - a[1]);
  const peak = Math.max(...entries.map((entry) => entry[1]), 1);
  els.departmentChart.innerHTML = entries
    .map(
      ([department, count]) => `
        <div class="department-row">
          <span>${department}</span>
          <div class="mini-track"><div class="mini-fill" style="width:${(count / peak) * 100}%"></div></div>
          <span>${count}</span>
        </div>
      `
    )
    .join("");
}

function renderMissingDateList() {
  els.missingDateList.innerHTML = state.tasks
    .filter((task) => !task.has_confirmed_date)
    .map(
      (task) => `
        <article class="missing-item">
          <h3>${task.title}</h3>
          <p>${task.department || "待补部门"} ｜ ${task.owner || "待补负责人"}</p>
          <p>${task.date_label}</p>
        </article>
      `
    )
    .join("");
}

function buildTag(label, className) {
  return `<span class="tag ${className}">${label}</span>`;
}

function renderFilterOptions() {
  const presentDepartments = new Set(state.tasks.map((task) => task.department).filter(Boolean));
  const departments = DEPARTMENT_OPTIONS.filter((department) => presentDepartments.has(department));
  const phases = [...new Set(state.tasks.map((task) => task.phase).filter(Boolean))].sort();
  els.departmentFilter.innerHTML =
    '<option value="">全部部门</option>' + departments.map((value) => `<option value="${value}">${value}</option>`).join("");
  els.phaseFilter.innerHTML =
    '<option value="">全部阶段</option>' + phases.map((value) => `<option value="${value}">${value}</option>`).join("");
  els.departmentFilter.value = state.filters.department;
  els.phaseFilter.value = state.filters.phase;
  els.riskFilter.value = state.filters.risk;
  els.statusFilter.value = state.filters.status;
}

function filteredTasks() {
  const keyword = state.search.trim().toLowerCase();
  return state.tasks
    .filter((task) => {
      const haystack = [task.title, task.description, task.owner, task.department, task.collaborators]
        .join(" ")
        .toLowerCase();
      return (
        (!state.filters.department || task.department === state.filters.department) &&
        (!state.filters.phase || task.phase === state.filters.phase) &&
        (!state.filters.risk || inferRisk(task) === state.filters.risk) &&
        (!state.filters.status || inferStatus(task) === state.filters.status) &&
        (!keyword || haystack.includes(keyword))
      );
    })
    .sort((a, b) => (a.end_date || "9999").localeCompare(b.end_date || "9999") || a.row_number - b.row_number);
}

function renderTasks() {
  const tasks = filteredTasks();
  if (!tasks.length) {
    els.taskBoard.innerHTML = `
      <article class="task-card empty-card">
        <h3>当前筛选下没有任务</h3>
        <p class="task-meta">可以清空筛选条件，或者直接新增一条任务。</p>
      </article>
    `;
    return;
  }

  els.taskBoard.innerHTML = tasks
    .map((task) => {
      const status = inferStatus(task);
      const statusClass =
        status === "已完成" ? "done" : status === "进行中" || status === "临近开始" ? "progress" : "pending";
      const risk = inferRisk(task);
      const riskClass = risk === "高" ? "high" : risk === "中" ? "medium" : "low";
      return `
        <article class="task-card">
          <div class="task-topline">
            <div>
              <h3>${task.title}</h3>
              <p class="task-meta">${task.date_label} ｜ ${task.department || "待补部门"} ｜ ${task.owner || "待补负责人"}</p>
            </div>
            <div class="task-actions">
              <select data-task-status="${task.id}">
                ${["未开始", "进行中", "临近开始", "已完成", "已逾期", "待补日期"]
                  .map((option) => `<option value="${option}" ${option === status ? "selected" : ""}>${option}</option>`)
                  .join("")}
              </select>
              <button class="ghost-button" data-edit-task="${task.id}" type="button">编辑</button>
              <button class="ghost-button danger-button" data-delete-task="${task.id}" type="button">删除</button>
            </div>
          </div>
          <p class="task-meta">${task.description || "暂无任务说明"}</p>
          <div class="task-tags">
            ${buildTag(task.phase, "phase")}
            ${buildTag(status, statusClass)}
            ${buildTag(`${risk}风险`, riskClass)}
          </div>
          <div class="task-footer">
            ${buildTag(`协同：${task.collaborators || "待补"}`, "pending")}
            ${buildTag(`审核：${task.reviewer || "待补"}`, "pending")}
          </div>
        </article>
      `;
    })
    .join("");

  els.taskBoard.querySelectorAll("[data-task-status]").forEach((select) => {
    select.addEventListener("change", async (event) => {
      try {
        const id = event.target.dataset.taskStatus;
        const updated = await taskStore.update(id, { manual_status: event.target.value });
        state.tasks = state.tasks.map((task) => (task.id === id ? updated : task));
        rerender();
      } catch (error) {
        alert(`状态更新失败：${error.message}`);
      }
    });
  });

  els.taskBoard.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => openTaskModal(button.dataset.editTask));
  });

  els.taskBoard.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = state.tasks.find((item) => item.id === button.dataset.deleteTask);
      if (!task || !window.confirm(`确认删除任务「${task.title}」吗？`)) return;
      try {
        await taskStore.delete(task.id);
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        rerender();
      } catch (error) {
        alert(`删除失败：${error.message}`);
      }
    });
  });
}

function rerender() {
  const derived = buildDerived(state.tasks);
  renderSourceStatus();
  renderKpis(derived);
  renderPhaseChips(derived);
  renderTimeline(derived);
  renderRiskList();
  renderDepartmentChart(derived);
  renderMissingDateList();
  renderFilterOptions();
  renderTasks();
}

function openTaskModal(taskId = null) {
  state.editorTaskId = taskId;
  const task =
    taskId !== null
      ? state.tasks.find((item) => item.id === taskId)
      : {
          title: "",
          description: "",
          department: "",
          owner: "",
          collaborators: "",
          reviewer: "",
          notes: "",
          date_label: "",
          start_date: "",
          end_date: "",
          phase: "",
          status_hint: "未开始",
          risk_level: "中",
        };
  els.modalTitle.textContent = taskId ? "编辑任务" : "新增任务";
  FORM_FIELDS.forEach((field) => {
    const input = els.taskForm.elements.namedItem(field);
    if (input) input.value = task?.[field] || "";
  });
  els.deleteTaskButton.hidden = !taskId;
  els.modal.showModal();
}

function closeTaskModal() {
  els.taskForm.reset();
  els.modal.close();
  state.editorTaskId = null;
}

function collectFormData() {
  const formData = new FormData(els.taskForm);
  const payload = Object.fromEntries(formData.entries());
  payload.department = normalizeDepartment(payload.department);
  payload.start_date = toIsoDate(payload.start_date);
  payload.end_date = toIsoDate(payload.end_date);
  payload.phase = payload.phase || inferPhase(payload.end_date);
  payload.has_confirmed_date = Boolean(payload.start_date || payload.end_date);
  payload.needs_date_confirmation = !payload.has_confirmed_date;
  payload.date_label =
    payload.date_label ||
    (payload.start_date && payload.end_date
      ? payload.start_date === payload.end_date
        ? payload.start_date
        : `${payload.start_date} ~ ${payload.end_date}`
      : "待确认");
  payload.manual_status = payload.status_hint || "未开始";
  delete payload.status_hint;
  return payload;
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  els.saveTaskButton.disabled = true;
  try {
    const payload = collectFormData();
    if (state.editorTaskId) {
      const updated = await taskStore.update(state.editorTaskId, payload);
      state.tasks = state.tasks.map((task) => (task.id === state.editorTaskId ? updated : task));
    } else {
      const created = await taskStore.save(payload);
      state.tasks = [...state.tasks, created];
    }
    closeTaskModal();
    rerender();
  } catch (error) {
    alert(`保存失败：${error.message}`);
  } finally {
    els.saveTaskButton.disabled = false;
  }
}

async function init() {
  renderHero();
  try {
    state.tasks = await taskStore.load();
  } catch (error) {
    console.error(error);
    state.sourceMode = "local";
    state.sourceLabel = "本地浏览器存储（云端连接失败后回退）";
    state.tasks = getLocalTasks();
  }
  rerender();
}

async function syncFromCloud() {
  if (!isSupabaseMode()) return;
  state.tasks = await taskStore.load();
  rerender();
}

function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const delay = nextMidnight.getTime() - now.getTime();
  window.setTimeout(() => {
    renderHero();
    rerender();
    scheduleMidnightRefresh();
  }, delay);
}

function startAutoSync() {
  if (!isSupabaseMode()) return;
  window.setInterval(() => {
    syncFromCloud().catch((error) => console.error("Auto sync failed", error));
  }, runtimeConfig.supabaseAutoSyncMs || 30000);
  window.addEventListener("focus", () => {
    syncFromCloud().catch((error) => console.error("Focus sync failed", error));
  });
}

function bindEvents() {
  els.departmentFilter.addEventListener("input", (event) => {
    state.filters.department = event.target.value;
    renderTasks();
  });
  els.phaseFilter.addEventListener("input", (event) => {
    state.filters.phase = event.target.value;
    renderTasks();
  });
  els.riskFilter.addEventListener("input", (event) => {
    state.filters.risk = event.target.value;
    renderTasks();
  });
  els.statusFilter.addEventListener("input", (event) => {
    state.filters.status = event.target.value;
    renderTasks();
  });
  els.keywordInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTasks();
  });
  els.addTaskButton.addEventListener("click", () => openTaskModal());
  els.modalCloseButton.addEventListener("click", closeTaskModal);
  els.modalCancelButton.addEventListener("click", closeTaskModal);
  els.taskForm.addEventListener("submit", handleTaskSubmit);
  els.deleteTaskButton.addEventListener("click", async () => {
    if (!state.editorTaskId) return;
    const task = state.tasks.find((item) => item.id === state.editorTaskId);
    if (!task || !window.confirm(`确认删除任务「${task.title}」吗？`)) return;
    els.deleteTaskButton.disabled = true;
    try {
      await taskStore.delete(task.id);
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      closeTaskModal();
      rerender();
    } catch (error) {
      alert(`删除失败：${error.message}`);
    } finally {
      els.deleteTaskButton.disabled = false;
    }
  });
  els.seedCloudButton.addEventListener("click", async () => {
    els.seedCloudButton.disabled = true;
    try {
      await taskStore.seedCloud();
      state.tasks = await taskStore.load();
      rerender();
    } catch (error) {
      alert(`初始化云端失败：${error.message}`);
    } finally {
      els.seedCloudButton.disabled = false;
    }
  });
  els.syncCloudButton.addEventListener("click", async () => {
    els.syncCloudButton.disabled = true;
    try {
      await syncFromCloud();
    } catch (error) {
      alert(`同步失败：${error.message}`);
    } finally {
      els.syncCloudButton.disabled = false;
    }
  });
}

bindEvents();
init();
scheduleMidnightRefresh();
startAutoSync();
