/* ============================================================
   ESAM-DO 2026 — Sistema Administrativo conectado a Supabase
   ============================================================ */

"use strict";

/* ============================================================
   SUPABASE CONFIG
   ============================================================ */
const SUPABASE_URL = "https://nfimyyufuiyyyiigsgkz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5maW15eXVmdWl5eXlpaWdzZ2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzE2ODUsImV4cCI6MjA5MjgwNzY4NX0.Jdp9tV2C0YzromLFGMeL-5279BtotRRQTzHne3Kada8";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let activeTab = "dashboard";
let editingId = null;
let chartInstances = {};
let isBooted = false;

let branches = [];
let students = [];
let schedules = [];
let attendance = [];
let payments = [];
let inventory = [];
let sales = [];
let cashBoxes = [];
let cashMovements = [];
let activityLog = [];

const filters = {
  branchId: "all",
  discipline: "all",
  scheduleId: "all",
  studentPayment: "all",
  studentStatus: "all",
  attendanceDate: getTodayIso(),
  cashType: "all",
  saleMethod: "all",
  stock: "all",
  scheduleView: "week",
  scheduleShift: "all"
};

const SHIFTS = ["Mañana", "Tarde", "Noche"];
const WEEK_DAYS = [
  { full: "Lunes",     short: "Lun", mini: "Lu" },
  { full: "Martes",    short: "Mar", mini: "Ma" },
  { full: "Miércoles", short: "Mié", mini: "Mi" },
  { full: "Jueves",    short: "Jue", mini: "Ju" },
  { full: "Viernes",   short: "Vie", mini: "Vi" },
  { full: "Sábado",    short: "Sáb", mini: "Sá" },
  { full: "Domingo",   short: "Dom", mini: "Do" }
];

const DISCIPLINE_THEMES = {
  "Karate":           { class: "disc-karate" },
  "Kickboxing":       { class: "disc-kickboxing" },
  "MMA":              { class: "disc-mma" },
  "Defensa Personal": { class: "disc-defensa" }
};

/* ============================================================
   RENOMBRADO VISUAL DE SEDES
   - El nombre real en BD se mantiene tal cual.
   - Acá podemos sobreescribir cómo se muestra en pantalla.
   - Si la sede no está en este mapa, se usa el nombre original.
   ============================================================ */
const BRANCH_DISPLAY_OVERRIDES = {
  // claves: nombre exacto como está guardado en tu tabla `branches`
  // valor: cómo se debe mostrar en toda la app
  "Sede Principal": "Sede Principal (Hoyos Rubio)",
  "Sede Centro":    "Sede Principal (Hoyos Rubio)",
  "Sede 2":         "Sede Sucursal (Jr. Angamos)",
  "Sede Sucursal":  "Sede Sucursal (Jr. Angamos)",
  "Sede Norte":     "Sede Sucursal (Jr. Angamos)"
};

function getDisciplineClass(discipline) {
  return DISCIPLINE_THEMES[discipline]?.class || "disc-default";
}

function normalizeDayName(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map = {
    "lu": "Lunes", "lun": "Lunes", "lunes": "Lunes",
    "ma": "Martes", "mar": "Martes", "martes": "Martes",
    "mi": "Miércoles", "mie": "Miércoles", "miercoles": "Miércoles",
    "ju": "Jueves", "jue": "Jueves", "jueves": "Jueves",
    "vi": "Viernes", "vie": "Viernes", "viernes": "Viernes",
    "sa": "Sábado", "sab": "Sábado", "sabado": "Sábado",
    "do": "Domingo", "dom": "Domingo", "domingo": "Domingo"
  };
  return map[clean] || null;
}

function getScheduleOccupancy(s) {
  const enrolled = students.filter(st => st.schedule_id === s.id && st.status !== "retirado").length;
  const capacity = Number(s.capacity) || 0;
  const ratio = capacity > 0 ? Math.min(enrolled / capacity, 1) : 0;
  return { enrolled, capacity, ratio, percent: Math.round(ratio * 100) };
}

function getOccupancyState(o) {
  if (o.capacity === 0) return "neutral";
  if (o.ratio >= 1) return "full";
  if (o.ratio >= 0.8) return "high";
  if (o.ratio >= 0.4) return "mid";
  return "low";
}

const titles = {
  dashboard:  { title:"Resumen",    subtitle:"Vista general de ESAM-DO 2026" },
  students:   { title:"Alumnos",    subtitle:"Matrículas, horarios, pagos y seguimiento" },
  schedules:  { title:"Horarios",   subtitle:"Turnos por sede, disciplina y edad" },
  attendance: { title:"Asistencia", subtitle:"Control diario por sede y horario" },
  payments:   { title:"Pagos",      subtitle:"Matrículas, mensualidades y abonos" },
  cash:       { title:"Caja",       subtitle:"Ingresos, egresos, gastos y saldo por sede" },
  inventory:  { title:"Inventario", subtitle:"Control de productos y stock" },
  sales:      { title:"Ventas",     subtitle:"Ventas, boletas, efectivo y stock" },
  reports:    { title:"Reportes",   subtitle:"Indicadores financieros y operativos" }
};

const DISCIPLINES = ["Karate", "Kickboxing", "MMA", "Defensa Personal"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Yape", "Plin"];
const PAYMENT_CONCEPTS = ["Matrícula", "Mensualidad", "Abono", "Otros"];
const ATTENDANCE_STATUSES = ["presente", "falta", "tardanza", "justificado"];
const EXPENSE_CATEGORIES = ["Alquiler", "Servicios", "Limpieza", "Sueldos", "Equipamiento", "Marketing", "Transporte", "Otros"];

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  updateClock();
  setInterval(updateClock, 1000);

  const search = document.getElementById("search");
  if (search) search.addEventListener("input", render);

  document.getElementById("loginPassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  await initAuth();
});

async function initAuth() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    if (data.session) {
      showApp();
      await loadInitialData();
    } else {
      showLogin();
    }

    db.auth.onAuthStateChange(async (_event, session) => {
      if (session && !isBooted) {
        showApp();
        await loadInitialData();
      }
      if (!session) showLogin();
    });
  } catch (error) {
    console.error(error);
    showLogin();
    setLoginError("No se pudo conectar con Supabase. Revisa URL y ANON KEY.");
  }
}

async function login() {
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value || "";
  const btn = document.getElementById("loginBtn");

  setLoginError("");
  if (!email || !password) {
    setLoginError("Ingresa correo y contraseña.");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Ingresando...";
    }

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    showApp();
    await loadInitialData();
  } catch (error) {
    console.error(error);
    setLoginError("Credenciales incorrectas o usuario no creado en Supabase Auth.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Ingresar";
    }
  }
}

async function logout() {
  await db.auth.signOut();
  isBooted = false;
  showLogin();
}

function showLogin() {
  document.getElementById("login-screen")?.classList.remove("hidden");
  document.querySelector(".app")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("login-screen")?.classList.add("hidden");
  document.querySelector(".app")?.classList.remove("hidden");
}

function setLoginError(msg) {
  const box = document.getElementById("login-error");
  if (!box) return;
  box.textContent = msg || "";
  box.classList.toggle("hidden", !msg);
}

/* ============================================================
   SUPABASE DATA
   ============================================================ */
async function loadInitialData() {
  try {
    showToast("Cargando datos...", "info");
    await refreshData();
    isBooted = true;
    updateHeader();
    render();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Error cargando datos.", "error");
  }
}

async function refreshData() {
  const [
    b, sc, st, at, py, inv, sl, cb, cm, logs
  ] = await Promise.all([
    selectTable("branches", "*", { column:"name" }),
    selectTable("schedules", "*, branches(name)", { column:"start_time" }),
    selectTable("students", "*, branches(name), schedules(discipline, age_group, days, shift, start_time, end_time)", { column:"created_at", ascending:false }),
    selectTable("attendance", "*, students(name, registration_code), branches(name), schedules(discipline, age_group, days, shift, start_time, end_time)", { column:"date", ascending:false }),
    selectTable("payments", "*, students(name, registration_code, document_number), branches(name)", { column:"date", ascending:false }),
    selectTable("inventory_products", "*", { column:"name" }),
    selectTable("sales", "*, branches(name), sale_items(*)", { column:"date", ascending:false }),
    selectTable("cash_boxes", "*, branches(name)", { column:"created_at" }),
    selectTable("cash_movements", "*, branches(name)", { column:"date", ascending:false }),
    selectTable("activity_logs", "*", { column:"created_at", ascending:false }).catch(() => [])
  ]);

  branches = b;
  schedules = sc;
  students = st;
  attendance = at;
  payments = py;
  inventory = inv;
  sales = sl;
  cashBoxes = cb;
  cashMovements = cm;
  activityLog = logs;
}

async function selectTable(table, fields = "*", order = null) {
  let query = db.from(table).select(fields);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function safeAction(fn, successMsg = "Operación realizada.") {
  try {
    await fn();
    await refreshData();
    closeModal();
    render();
    showToast(successMsg, "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Ocurrió un error.", "error");
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function escape(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(String(value).slice(0,10) + "T00:00:00")
      .toLocaleDateString("es-PE", { day:"2-digit", month:"short", year:"numeric" });
  } catch {
    return "—";
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-PE", {
      day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"
    });
  } catch {
    return "—";
  }
}

function formatTime(value) {
  if (!value) return "—";
  const raw = String(value).slice(0,5);
  const [h, m] = raw.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return raw;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function getTodayIso() {
  return new Date().toISOString().split("T")[0];
}

function getCurrentCycle(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildNextPaymentDate(paymentDay, baseDate = null) {
  const base = baseDate ? new Date(baseDate + "T00:00:00") : new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, Number(paymentDay || 1));
  return next.toISOString().split("T")[0];
}

function daysUntil(dateString) {
  if (!dateString) return 9999;
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(dateString + "T00:00:00");
  return Math.ceil((target - todayOnly) / 86400000);
}

function getSearchValue() {
  return (document.getElementById("search")?.value || "").trim().toLowerCase();
}

function getBranchName(id) {
  const b = branches.find(b => b.id === id);
  if (!b) return "—";
  return BRANCH_DISPLAY_OVERRIDES[b.name] || b.name;
}

function getSchedule(id) {
  return schedules.find(s => s.id === id);
}

function getScheduleLabel(id) {
  const s = getSchedule(id);
  if (!s) return "Sin horario";
  return `${s.discipline} · ${s.age_group} · ${(s.days || []).join("-")} · ${formatTime(s.start_time)}-${formatTime(s.end_time)}`;
}

function getStudent(id) {
  return students.find(s => s.id === id);
}

function getProduct(id) {
  return inventory.find(p => p.id === id);
}

function getPaymentStatusLabel(status) {
  if (status === "paid") return "Pagado";
  if (status === "partial") return "Parcial";
  return "Pendiente";
}

function getPaymentStatusClass(status) {
  if (status === "paid") return "ok";
  if (status === "partial") return "warning";
  return "pending";
}

function isDueWithinWeek(student) {
  if (student.payment_status === "paid") return false;
  const diff = daysUntil(student.next_payment_date);
  return diff >= 0 && diff <= 7;
}

function isOverdue(student) {
  if (student.payment_status === "paid") return false;
  return daysUntil(student.next_payment_date) < 0;
}

function isLowStock(product) {
  return Number(product.stock || 0) <= Number(product.min_stock || 0);
}

function filterByBranch(row) {
  return filters.branchId === "all" || row.branch_id === filters.branchId;
}

function branchOptions(selected = "") {
  return branches.map(b => `<option value="${b.id}" ${selected === b.id ? "selected" : ""}>${escape(getBranchName(b.id))}</option>`).join("");
}

function disciplineOptions(selected = "") {
  return DISCIPLINES.map(d => `<option value="${d}" ${selected === d ? "selected" : ""}>${escape(d)}</option>`).join("");
}

function scheduleOptions(selected = "", branchId = "", discipline = "") {
  let list = schedules.filter(s => s.active !== false);
  if (branchId) list = list.filter(s => s.branch_id === branchId);
  if (discipline) list = list.filter(s => s.discipline === discipline);
  return `<option value="">Sin horario asignado</option>` +
    list.map(s => `<option value="${s.id}" ${selected === s.id ? "selected" : ""}>${escape(getScheduleLabel(s.id))}</option>`).join("");
}

function branchFilterHtml() {
  return `
    <select class="filter-select" onchange="setFilter('branchId', this.value)">
      <option value="all">Todas las sedes</option>
      ${branches.map(b => `<option value="${b.id}" ${filters.branchId === b.id ? "selected" : ""}>${escape(getBranchName(b.id))}</option>`).join("")}
    </select>`;
}

/* ============================================================
   UI BASICS
   ============================================================ */
function showToast(msg, type = "success") {
  const icons = { success:"✓", error:"✕", info:"ℹ" };
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || "✓"}</span><span class="toast-msg">${escape(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("removing");
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function showConfirm(title, msg, onConfirm, dangerLabel = "Eliminar") {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMsg").textContent = msg;
  const btn = document.getElementById("confirmOkBtn");
  btn.textContent = dangerLabel;
  btn.onclick = () => { closeConfirm(); onConfirm(); };
  document.getElementById("confirmOverlay").classList.remove("hidden");
}

function closeConfirm() {
  document.getElementById("confirmOverlay").classList.add("hidden");
}

function openModal() {
  document.getElementById("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  editingId = null;
  document.getElementById("modalOverlay").classList.add("hidden");
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById("modalOverlay")) closeModal();
}

/* ============================================================
   TEMA / RELOJ / NAV
   ============================================================ */
function initTheme() {
  const saved = localStorage.getItem("esamdo_theme");
  const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  applyTheme(isDark ? "dark" : "light");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-label");
  if (icon && label) {
    icon.textContent = theme === "dark" ? "○" : "◑";
    label.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  }
  rerenderCharts();
}

function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  localStorage.setItem("esamdo_theme", next);
  applyTheme(next);
}

function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById("clock-date");
  const timeEl = document.getElementById("clock-time");
  if (dateEl) dateEl.textContent = now.toLocaleDateString("es-PE", {
    weekday:"long", day:"2-digit", month:"long", year:"numeric"
  });
  if (timeEl) timeEl.textContent = now.toLocaleTimeString("es-PE", {
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
}

function setTab(tab, element) {
  activeTab = tab;
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  if (element) element.classList.add("active");
  destroyCharts();
  updateHeader();
  render();
}

function updateHeader() {
  document.getElementById("page-title").textContent = titles[activeTab].title;
  document.getElementById("page-subtitle").textContent = titles[activeTab].subtitle;
  renderHeaderButtons();
}

function renderHeaderButtons() {
  const container = document.getElementById("header-buttons");
  const btns = {
    students: `<button class="btn btn-secondary btn-sm" onclick="exportStudents()">⬇ CSV</button>
               <button class="btn btn-primary" onclick="openStudentModal()">+ Registrar alumno</button>`,
    schedules:`<button class="btn btn-primary" onclick="openScheduleModal()">+ Crear horario</button>`,
    attendance:`<button class="btn btn-secondary btn-sm" onclick="exportAttendance()">⬇ CSV</button>`,
    payments:`<button class="btn btn-secondary btn-sm" onclick="exportPayments()">⬇ CSV</button>
              <button class="btn btn-primary" onclick="openPaymentModal()">+ Registrar pago</button>`,
    cash:`<button class="btn btn-secondary btn-sm" onclick="exportCash()">⬇ CSV</button>
          <button class="btn btn-primary" onclick="openCashMovementModal()">+ Movimiento</button>`,
    inventory:`<button class="btn btn-secondary btn-sm" onclick="openStockAdjustModal()">Ajustar stock</button>
               <button class="btn btn-primary" onclick="openProductModal()">+ Agregar producto</button>`,
    sales:`<button class="btn btn-secondary btn-sm" onclick="exportSales()">⬇ CSV</button>
           <button class="btn btn-primary" onclick="openSaleModal()">+ Nueva venta</button>`
  };
  container.innerHTML = btns[activeTab] || "";
}

function setFilter(key, value) {
  filters[key] = value;
  render();
}

/* ============================================================
   CHARTS
   ============================================================ */
function destroyCharts() {
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  chartInstances = {};
}

function rerenderCharts() {
  if (activeTab === "dashboard" && isBooted) {
    destroyCharts();
    render();
  }
}

function getChartColors() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    grid: dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)",
    text: dark ? "#a1a1aa" : "#71717a",
    primary: dark ? "#e05a4e" : "#c0392b",
    success: dark ? "#4ade80" : "#16a34a",
    warning: dark ? "#fbbf24" : "#b45309",
    surface: dark ? "#18181b" : "#ffffff"
  };
}

function buildBarChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const c = getChartColors();
  chartInstances[canvasId] = new Chart(canvas, {
    type:"bar",
    data:{ labels, datasets },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:c.text, font:{ family:"'DM Sans'" }, boxWidth:12 } } },
      scales:{
        x:{ grid:{ color:c.grid }, ticks:{ color:c.text, font:{ family:"'DM Sans'" } } },
        y:{ grid:{ color:c.grid }, ticks:{ color:c.text, font:{ family:"'DM Sans'" } } }
      }
    }
  });
}

function buildDoughnutChart(canvasId, labels, data, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const c = getChartColors();
  chartInstances[canvasId] = new Chart(canvas, {
    type:"doughnut",
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:c.surface }] },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:"68%",
      plugins:{ legend:{ position:"bottom", labels:{ color:c.text, font:{ family:"'DM Sans'" }, boxWidth:12, padding:12 } } }
    }
  });
}

/* ============================================================
   RENDER MAIN
   ============================================================ */
function render() {
  const content = document.getElementById("content");
  if (!content || !isBooted) return;
  const search = getSearchValue();

  if (activeTab === "dashboard") renderDashboard(content);
  if (activeTab === "students") renderStudents(content, search);
  if (activeTab === "schedules") renderSchedules(content, search);
  if (activeTab === "attendance") renderAttendance(content, search);
  if (activeTab === "payments") renderPayments(content, search);
  if (activeTab === "cash") renderCash(content, search);
  if (activeTab === "inventory") renderInventory(content, search);
  if (activeTab === "sales") renderSales(content, search);
  if (activeTab === "reports") renderReports(content, search);
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(content) {
  const activeStudents = students.filter(s => s.status !== "retirado");
  const totalPayments = payments.reduce((a,p) => a + Number(p.amount || 0), 0);
  const totalSales = sales.reduce((a,s) => a + Number(s.total || 0), 0);
  const totalPending = students.reduce((a,s) => a + Number(s.balance || 0), 0);
  const cashTotal = cashBoxes.reduce((a,c) => a + Number(c.current_balance || 0), 0);
  const todayAtt = attendance.filter(a => String(a.date).slice(0,10) === getTodayIso());
  const lowStock = inventory.filter(isLowStock);

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-icon red">👥</div><div class="kpi-label">Alumnos activos</div><div class="kpi-value">${activeStudents.length}</div><div class="kpi-help">Registros activos</div></div>
      <div class="card kpi"><div class="kpi-icon green">💰</div><div class="kpi-label">Pagos</div><div class="kpi-value mono">${formatCurrency(totalPayments)}</div><div class="kpi-help">Matrículas y mensualidades</div></div>
      <div class="card kpi"><div class="kpi-icon amber">🛍️</div><div class="kpi-label">Ventas</div><div class="kpi-value mono">${formatCurrency(totalSales)}</div><div class="kpi-help">Tienda</div></div>
      <div class="card kpi"><div class="kpi-icon green">□</div><div class="kpi-label">Caja</div><div class="kpi-value mono">${formatCurrency(cashTotal)}</div><div class="kpi-help">Saldo actual</div></div>

      <div class="card span-8">
        <div class="section-title">Ingresos por mes</div>
        <div class="section-subtitle" style="margin-bottom:16px">Pagos + ventas · últimos 6 meses</div>
        <div class="chart-wrap" style="height:220px"><canvas id="chartMonthly"></canvas></div>
      </div>

      <div class="card span-4">
        <div class="section-title">Estado de pagos</div>
        <div class="section-subtitle" style="margin-bottom:16px">Alumnos</div>
        <div class="chart-wrap" style="height:220px"><canvas id="chartStatus"></canvas></div>
      </div>

      <div class="card span-6">
        <div class="section-title">Resumen por sede</div>
        <div class="info-list">
          ${branches.map(b => `
            <div class="info-row">
              <span>${escape(getBranchName(b.id))}</span>
              <strong>${students.filter(s => s.branch_id === b.id).length} alumnos · ${formatCurrency(cashBoxes.find(c => c.branch_id === b.id)?.current_balance || 0)}</strong>
            </div>`).join("")}
        </div>
      </div>

      <div class="card span-6">
        <div class="section-title">Alertas</div>
        <div class="alert-list">
          <div class="alert-item ${students.filter(isOverdue).length ? "alert-danger" : "alert-success"}">
            <strong>${students.filter(isOverdue).length} pagos vencidos</strong>
            <p>Alumnos con deuda vencida.</p>
          </div>
          <div class="alert-item ${lowStock.length ? "alert-warning" : "alert-success"}">
            <strong>${lowStock.length} productos por reponer</strong>
            <p>Stock mínimo alcanzado.</p>
          </div>
          <div class="alert-item alert-neutral">
            <strong>${todayAtt.length} asistencias hoy</strong>
            <p>Registros marcados en la fecha actual.</p>
          </div>
          <div class="alert-item ${totalPending ? "alert-warning" : "alert-success"}">
            <strong>${formatCurrency(totalPending)} por cobrar</strong>
            <p>Saldo pendiente total.</p>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const c = getChartColors();
    const labels = [];
    const data = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const cycle = getCurrentCycle(d);
      labels.push(d.toLocaleDateString("es-PE", { month:"short", year:"2-digit" }));
      data.push(
        payments.filter(p => String(p.date).startsWith(cycle)).reduce((a,p) => a + Number(p.amount || 0), 0) +
        sales.filter(s => String(s.date).startsWith(cycle)).reduce((a,s) => a + Number(s.total || 0), 0)
      );
    }

    buildBarChart("chartMonthly", labels, [{
      label:"Ingresos (S/)",
      data,
      backgroundColor:c.primary + "cc",
      borderColor:c.primary,
      borderWidth:2,
      borderRadius:6
    }]);

    buildDoughnutChart("chartStatus",
      ["Pagado", "Parcial", "Pendiente"],
      [
        students.filter(s => s.payment_status === "paid").length,
        students.filter(s => s.payment_status === "partial").length,
        students.filter(s => s.payment_status === "pending").length
      ],
      [c.success, c.warning, c.primary]
    );
  }, 0);
}

/* ============================================================
   STUDENTS
   ============================================================ */
function filteredStudents(search) {
  return students.filter(s => {
    if (s.status === "retirado" && filters.studentStatus !== "retirado") return false;

    const haystack = [
      s.name, s.registration_code, s.document_number, s.phone, s.email,
      s.discipline, getBranchName(s.branch_id), getScheduleLabel(s.schedule_id)
    ].join(" ").toLowerCase();

    const searchOk = haystack.includes(search);
    const branchOk = filters.branchId === "all" || s.branch_id === filters.branchId;
    const disciplineOk = filters.discipline === "all" || s.discipline === filters.discipline;
    const scheduleOk = filters.scheduleId === "all" || s.schedule_id === filters.scheduleId;
    const statusOk = filters.studentStatus === "all" || s.status === filters.studentStatus;

    let payOk = true;
    if (filters.studentPayment === "paid") payOk = s.payment_status === "paid";
    if (filters.studentPayment === "partial") payOk = s.payment_status === "partial";
    if (filters.studentPayment === "pending") payOk = s.payment_status === "pending";
    if (filters.studentPayment === "due_week") payOk = isDueWithinWeek(s);
    if (filters.studentPayment === "overdue") payOk = isOverdue(s);
    if (filters.studentPayment === "enrollment_pending") payOk = !isEnrollmentPaid(s) && Number(s.enrollment_fee || 0) > 0 && s.status !== "retirado";

    return searchOk && branchOk && disciplineOk && scheduleOk && statusOk && payOk;
  });
}

function renderStudents(content, search) {
  const list = filteredStudents(search);

  const overdueCount = students.filter(isOverdue).length;
  const dueWeekCount = students.filter(isDueWithinWeek).length;
  const paidCount = students.filter(s => s.payment_status === "paid").length;
  const activeCount = students.filter(s => s.status !== "retirado").length;
  const retiredCount = students.filter(s => s.status === "retirado").length;
  const enrollPendingCount = students.filter(s =>
    !isEnrollmentPaid(s) && Number(s.enrollment_fee || 0) > 0 && s.status !== "retirado"
  ).length;

  const activeChips = [];
  if (filters.branchId !== "all") activeChips.push({ key:"branchId", label:`Sede: ${getBranchName(filters.branchId)}` });
  if (filters.discipline !== "all") activeChips.push({ key:"discipline", label:filters.discipline });
  if (filters.scheduleId !== "all") activeChips.push({ key:"scheduleId", label:`Horario: ${getScheduleLabel(filters.scheduleId)}` });
  if (filters.studentStatus !== "all") activeChips.push({ key:"studentStatus", label:`Estado: ${filters.studentStatus}` });

  const advancedFilterCount =
    (filters.branchId !== "all" ? 1 : 0) +
    (filters.discipline !== "all" ? 1 : 0) +
    (filters.scheduleId !== "all" ? 1 : 0) +
    (filters.studentStatus !== "all" ? 1 : 0);

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Total activos</div><div class="kpi-value">${activeCount}</div><div class="kpi-help">de ${students.length} registrados</div></div>
      <div class="card kpi"><div class="kpi-label">Al día</div><div class="kpi-value" style="color:var(--success)">${paidCount}</div><div class="kpi-help">Pagos completos</div></div>
      <div class="card kpi"><div class="kpi-label">Próximos a vencer</div><div class="kpi-value" style="color:var(--warning)">${dueWeekCount}</div><div class="kpi-help">7 días</div></div>
      <div class="card kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value" style="color:var(--danger)">${overdueCount}</div><div class="kpi-help">Seguimiento urgente</div></div>

      <div class="card span-12">
        <div class="students-toolbar">
          <input type="text" class="filter-select students-search" placeholder="Buscar por nombre, código o DNI..." value="${escape(search)}" oninput="setStudentSearch(this.value)">
          <button class="btn btn-secondary" onclick="toggleStudentFilters()">
            Filtros${advancedFilterCount ? ` (${advancedFilterCount})` : ""}
          </button>
          ${retiredCount > 0 ? `
            <button class="btn ${filters.studentStatus === "retirado" ? "btn-primary" : "btn-secondary"}" onclick="toggleRetiredView()" title="${filters.studentStatus === "retirado" ? "Volver a la lista activa" : "Ver alumnos retirados"}">
              ${filters.studentStatus === "retirado" ? "← Activos" : `Retirados · ${retiredCount}`}
            </button>` : ""}
        </div>

        ${filters.studentStatus === "retirado" ? `
          <div class="retired-banner">
            <div>
              <strong>Estás viendo alumnos retirados.</strong>
              <span>${retiredCount} alumno${retiredCount !== 1 ? "s" : ""} sin actividad en el dojo.</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="toggleRetiredView()">Volver a activos</button>
          </div>
        ` : ""}

        ${filters.studentStatus !== "retirado" ? `
          <div class="quick-chips">
            <button class="chip-btn ${filters.studentPayment === "all" ? "active" : ""}" onclick="setFilter('studentPayment','all')">Todos</button>
            <button class="chip-btn chip-danger ${filters.studentPayment === "overdue" ? "active" : ""}" onclick="setFilter('studentPayment','overdue')">Vencidos · ${overdueCount}</button>
            <button class="chip-btn chip-warning ${filters.studentPayment === "due_week" ? "active" : ""}" onclick="setFilter('studentPayment','due_week')">Próximos 7 días · ${dueWeekCount}</button>
            ${enrollPendingCount > 0 ? `<button class="chip-btn chip-warning ${filters.studentPayment === "enrollment_pending" ? "active" : ""}" onclick="setFilter('studentPayment','enrollment_pending')">Matrícula pendiente · ${enrollPendingCount}</button>` : ""}
            <button class="chip-btn chip-success ${filters.studentPayment === "paid" ? "active" : ""}" onclick="setFilter('studentPayment','paid')">Al día · ${paidCount}</button>
            <button class="chip-btn ${filters.studentPayment === "partial" ? "active" : ""}" onclick="setFilter('studentPayment','partial')">Parciales</button>
            <span class="results-count">${list.length} resultado${list.length !== 1 ? "s" : ""}</span>
          </div>
        ` : `<div class="quick-chips"><span class="results-count">${list.length} retirado${list.length !== 1 ? "s" : ""}</span></div>`}

        <div class="advanced-filters ${filters._showAdvancedFilters ? "open" : ""}">
          <select class="filter-select" onchange="setFilter('branchId', this.value)">
            <option value="all">Todas las sedes</option>
            ${branches.map(b => `<option value="${b.id}" ${filters.branchId === b.id ? "selected" : ""}>${escape(getBranchName(b.id))}</option>`).join("")}
          </select>
          <select class="filter-select" onchange="setFilter('discipline', this.value)">
            <option value="all">Todas las disciplinas</option>
            ${DISCIPLINES.map(d => `<option value="${d}" ${filters.discipline === d ? "selected" : ""}>${escape(d)}</option>`).join("")}
          </select>
          <select class="filter-select" onchange="setFilter('scheduleId', this.value)">
            <option value="all">Todos los horarios</option>
            ${schedules.map(s => `<option value="${s.id}" ${filters.scheduleId === s.id ? "selected" : ""}>${escape(getScheduleLabel(s.id))}</option>`).join("")}
          </select>
          <select class="filter-select" onchange="setFilter('studentStatus', this.value)">
            <option value="all">Todos los estados</option>
            <option value="activo" ${filters.studentStatus === "activo" ? "selected" : ""}>Activo</option>
            <option value="retirado" ${filters.studentStatus === "retirado" ? "selected" : ""}>Retirado</option>
          </select>
          ${advancedFilterCount > 0 ? `<button class="btn btn-ghost btn-sm" onclick="clearAdvancedStudentFilters()">Limpiar todo</button>` : ""}
        </div>

        ${activeChips.length ? `
          <div class="active-chips">
            ${activeChips.map(c => `<span class="active-chip">${escape(c.label)} <button class="active-chip-x" onclick="setFilter('${c.key}','all')" title="Quitar filtro">×</button></span>`).join("")}
          </div>
        ` : ""}

        ${list.length ? renderStudentList(list) : `<div class="empty-state"><p>No se encontraron alumnos con esos filtros.</p></div>`}
      </div>
    </div>`;
}

function renderStudentList(list) {
  return `
    <div class="students-list-wrapper">
      <div class="students-list-header">
        <div></div>
        <div>Alumno</div>
        <div>Código</div>
        <div>Horario</div>
        <div>Próximo pago</div>
      </div>
      ${list.map(renderStudentRow).join("")}
    </div>
  `;
}

function renderStudentRow(s) {
  const dueDays = daysUntil(s.next_payment_date);
  const status = s.payment_status === "paid"
    ? "ok"
    : isOverdue(s) ? "overdue"
    : isDueWithinWeek(s) ? "due_soon"
    : "neutral";

  const dueLabel = !s.next_payment_date
    ? `<span class="muted">sin definir</span>`
    : s.payment_status === "paid"
      ? `<span class="ok">${formatDate(s.next_payment_date)}</span>`
      : dueDays < 0
        ? `<span class="overdue-text">vencido hace ${Math.abs(dueDays)} día${Math.abs(dueDays) !== 1 ? "s" : ""}</span>`
        : dueDays === 0
          ? `<span class="warning-text">vence hoy</span>`
          : dueDays <= 7
            ? `<span class="warning-text">en ${dueDays} día${dueDays !== 1 ? "s" : ""}</span>`
            : `<span>${formatDate(s.next_payment_date)}</span>`;

  const initials = getInitials(s.name);
  const sched = getSchedule(s.schedule_id);
  const schedLabel = sched
    ? `${(sched.days || []).map(d => normalizeDayName(d)).filter(Boolean).map(d => WEEK_DAYS.find(w => w.full === d)?.mini || d.slice(0,2)).join("·")} ${formatTime(sched.start_time)}`
    : `<span class="muted">sin horario</span>`;

  return `
    <div class="student-row row-${status}" onclick="openStudentDetail('${s.id}')" tabindex="0" role="button">
      <div class="student-row-avatar">
        <div class="row-avatar">${escape(initials)}</div>
        <span class="row-status-dot row-status-${status}" title="${getPaymentStatusLabel(s.payment_status)}"></span>
      </div>
      <div class="student-row-main">
        <div class="row-name">${escape(s.name)}</div>
        <div class="row-sub">${escape(s.discipline || "—")} · ${escape(getBranchName(s.branch_id))}</div>
      </div>
      <div class="row-code mono">${escape(s.registration_code || "—")}</div>
      <div class="row-schedule">${schedLabel}</div>
      <div class="row-due">${dueLabel}</div>
    </div>`;
}

function getInitials(name) {
  return (name || "?").split(" ").filter(Boolean).slice(0,2).map(p => p.charAt(0).toUpperCase()).join("") || "?";
}

function getStudentPaymentSummary(student) {
  const studentPayments = payments
    .filter(p => p.student_id === student.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3);
  if (!studentPayments.length) return `<div class="student-detail-empty">Sin pagos registrados todavía.</div>`;
  return studentPayments.map(p => `
    <div class="student-detail-payment-row">
      <div>
        <strong>${escape(p.concept || "Pago")}</strong>
        <span>${formatDate(p.date)} · ${escape(p.method || "—")}</span>
      </div>
      <strong class="mono">${formatCurrency(p.amount)}</strong>
    </div>`).join("");
}

function getStudentAttendanceSummary(student) {
  const records = attendance
    .filter(a => a.student_id === student.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30);
  const total = records.length;
  const present = records.filter(a => a.status === "presente" || a.status === "tardanza" || a.status === "justificado").length;
  const percent = total ? Math.round((present / total) * 100) : 0;
  const dots = records.slice(0, 30).reverse().map(a => `<span class="att-mini-dot att-${escape(a.status)}" title="${formatDate(a.date)} · ${escape(a.status)}"></span>`).join("");
  return { total, present, percent, dots: dots || `<span class="muted">Sin asistencia registrada</span>` };
}

function getEnrollmentStatusLabel(student) {
  if (isEnrollmentPaid(student)) return "Pagada";
  if (student.enrollment_status === "exonerada") return "Exonerada";
  return "Pendiente";
}

function openStudentDetail(id) {
  const s = getStudent(id);
  if (!s) return;
  closeStudentDetail();

  const dueDays = daysUntil(s.next_payment_date);
  const dueText = s.payment_status === "paid"
    ? "Al día"
    : dueDays < 0 ? `Vencido hace ${Math.abs(dueDays)} día${Math.abs(dueDays) !== 1 ? "s" : ""}`
    : dueDays === 0 ? "Vence hoy"
    : `Vence en ${dueDays} día${dueDays !== 1 ? "s" : ""}`;
  const att = getStudentAttendanceSummary(s);
  const initials = getInitials(s.name);
  const enrollmentPaid = isEnrollmentPaid(s);
  const statusLabel = (s.status === "retirado") ? "Retirado" : "Activo";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay student-detail-overlay";
  overlay.id = "studentDetailOverlay";
  overlay.onclick = e => { if (e.target === overlay) closeStudentDetail(); };

  overlay.innerHTML = `
    <div class="modal student-detail-modal ${getDisciplineClass(s.discipline)}">
      <div class="student-detail-header">
        <div class="student-detail-identity">
          <div class="student-detail-avatar">${escape(initials)}</div>
          <div>
            <div class="student-detail-kicker">${escape(s.registration_code || "Sin código")}</div>
            <h3>${escape(s.name)}</h3>
            <div class="student-detail-chips">
              <span class="badge ${statusLabel === "Activo" ? "ok" : "neutral"}">${statusLabel}</span>
              <span class="badge ${getPaymentStatusClass(s.payment_status)}">${getPaymentStatusLabel(s.payment_status)}</span>
              <span class="badge ${enrollmentPaid ? "ok" : (s.enrollment_status === "exonerada" ? "neutral" : "warning")}">Matrícula ${getEnrollmentStatusLabel(s)}</span>
            </div>
          </div>
        </div>
        <div class="student-detail-actions">
          <button class="btn btn-primary" onclick="closeStudentDetail();openPaymentModal('${s.id}')">Cobrar</button>
          <button class="btn btn-secondary" onclick="closeStudentDetail();openStudentModal('${s.id}')">Editar</button>
          <button class="icon-btn" onclick="closeStudentDetail()" aria-label="Cerrar">✕</button>
        </div>
      </div>

      <div class="student-detail-body">
        <section class="student-detail-grid">
          <article class="student-detail-card">
            <div class="student-detail-title">Datos personales</div>
            <div class="detail-list">
              <div><span>DNI / Documento</span><strong>${escape(s.document_number || "—")}</strong></div>
              <div><span>Edad</span><strong>${s.age ? `${escape(String(s.age))} años` : "—"}</strong></div>
              <div><span>Teléfono</span><strong>${escape(s.phone || "—")}</strong></div>
              <div><span>Correo</span><strong>${escape(s.email || "—")}</strong></div>
            </div>
          </article>

          <article class="student-detail-card">
            <div class="student-detail-title">Sede y plan</div>
            <div class="detail-list">
              <div><span>Sede</span><strong>${escape(getBranchName(s.branch_id))}</strong></div>
              <div><span>Disciplina</span><strong>${escape(s.discipline || "—")}</strong></div>
              <div><span>Horario</span><strong>${escape(getScheduleLabel(s.schedule_id))}</strong></div>
              <div><span>Grado / Cinturón</span><strong>${escape(s.rank || "—")}</strong></div>
            </div>
          </article>

          <article class="student-detail-card">
            <div class="student-detail-title">Pagos</div>
            <div class="detail-metrics">
              <div><span>Mensualidad</span><strong>${formatCurrency(s.monthly_fee)}</strong></div>
              <div><span>Pendiente</span><strong>${formatCurrency(s.balance)}</strong></div>
              <div><span>Saldo a favor</span><strong>${formatCurrency(s.credit_balance)}</strong></div>
            </div>
            <div class="detail-list compact">
              <div><span>Próximo pago</span><strong>${formatDate(s.next_payment_date)}</strong></div>
              <div><span>Seguimiento</span><strong>${escape(dueText)}</strong></div>
              <div><span>Último pago</span><strong>${formatDate(s.last_payment_date)}</strong></div>
            </div>
          </article>

          <article class="student-detail-card">
            <div class="student-detail-title">Matrícula</div>
            <div class="detail-list">
              <div><span>Estado</span><strong>${getEnrollmentStatusLabel(s)}</strong></div>
              <div><span>Monto</span><strong>${formatCurrency(s.enrollment_fee)}</strong></div>
              <div><span>Fecha</span><strong>${formatDate(s.enrollment_date)}</strong></div>
              <div><span>Pago registrado</span><strong>${formatDate(getEnrollmentPaymentRecord(s)?.date)}</strong></div>
            </div>
          </article>

          <article class="student-detail-card span-detail-2">
            <div class="student-detail-title">Últimos pagos</div>
            <div class="student-detail-payments">${getStudentPaymentSummary(s)}</div>
          </article>

          <article class="student-detail-card span-detail-2">
            <div class="student-detail-title">Asistencia</div>
            <div class="attendance-summary-detail">
              <div><span>Asistencia últimas marcas</span><strong>${att.percent}%</strong></div>
              <div class="att-mini-heatmap">${att.dots}</div>
            </div>
          </article>

          ${s.status === "retirado" ? `
            <article class="student-detail-card span-detail-2 retired-detail-card">
              <div class="student-detail-title">Retiro</div>
              <div class="detail-list compact">
                <div><span>Fecha</span><strong>${formatDate(s.retired_date)}</strong></div>
                <div><span>Motivo</span><strong>${escape(s.retired_reason || "—")}</strong></div>
              </div>
            </article>` : ""}

          ${s.notes ? `
            <article class="student-detail-card span-detail-2">
              <div class="student-detail-title">Observaciones</div>
              <p class="student-detail-note">${escape(s.notes)}</p>
            </article>` : ""}
        </section>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.addEventListener("keydown", studentDetailEscHandler);
}

function studentDetailEscHandler(e) {
  if (e.key === "Escape") closeStudentDetail();
}

function closeStudentDetail() {
  const overlay = document.getElementById("studentDetailOverlay");
  if (overlay) overlay.remove();
  document.removeEventListener("keydown", studentDetailEscHandler);
}

function setStudentSearch(value) {
  const searchEl = document.getElementById("search");
  if (searchEl) searchEl.value = value;
  render();
}

function toggleStudentFilters() {
  filters._showAdvancedFilters = !filters._showAdvancedFilters;
  render();
}

function toggleRetiredView() {
  if (filters.studentStatus === "retirado") {
    filters.studentStatus = "all";
  } else {
    filters.studentStatus = "retirado";
    filters.studentPayment = "all";
  }
  render();
}

function clearAdvancedStudentFilters() {
  filters.branchId = "all";
  filters.discipline = "all";
  filters.scheduleId = "all";
  filters.studentStatus = "all";
  render();
}

async function generateRegistrationCode() {
  const nums = students
    .map(s => Number(String(s.registration_code || "").replace(/\D/g, "")))
    .filter(Boolean);
  const next = (nums.length ? Math.max(...nums) : 20260000) + 1;
  return `ESAM-${next}`;
}

function openStudentModal(id = null, defaults = {}) {
  const s = id ? getStudent(id) : null;
  editingId = id;
  const isEditing = Boolean(s);

  const initialBranchId = s?.branch_id || defaults.branch_id || branches[0]?.id;
  const initialDiscipline = s?.discipline || defaults.discipline || "Karate";
  const initialScheduleId = s?.schedule_id || defaults.schedule_id || "";
  const defaultSchedule = initialScheduleId ? getSchedule(initialScheduleId) : null;
  const initialMonthlyFee = s?.monthly_fee ?? defaultSchedule?.monthly_fee ?? 200;
  const initialEnrollmentFee = s?.enrollment_fee ?? defaultSchedule?.enrollment_fee ?? 100;
  const currentStatus = s?.status === "retirado" ? "retirado" : "activo";

  document.getElementById("modalTitle").textContent = isEditing ? "Editar alumno" : "Registrar alumno";

  const enrollmentSection = !isEditing ? `
    <div class="form-section full">
      <div class="form-section-title">Matrícula inicial</div>
      <div class="form-section-grid">
        <div class="form-group"><label>Monto matrícula (S/)</label><input type="number" id="sEnrollFee" min="0" step="0.01" value="${initialEnrollmentFee}"></div>
        <div class="form-group"><label>Estado</label>
          <select id="sEnrollStatus" onchange="toggleEnrollPaymentFields()">
            <option value="pendiente" selected>Pendiente</option>
            <option value="pagada">Pagada</option>
            <option value="exonerada">Exonerada</option>
          </select>
        </div>
        <div class="form-group enroll-payment-field"><label>Método de pago</label>
          <select id="sEnrollMethod">${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join("")}</select>
        </div>
        <div class="form-group full enroll-payment-field">
          <div class="form-hint">
            Esto solo se usa al registrar un alumno nuevo. Si marcas la matrícula como Pagada, se registrará el cobro una sola vez.
          </div>
        </div>
      </div>
    </div>` : "";

  document.getElementById("modalForm").innerHTML = `
    <div class="form-section full">
      <div class="form-section-title">Datos personales</div>
      <div class="form-section-grid">
        <div class="form-group full"><label>Nombre completo</label><input id="sName" required value="${escape(s?.name || "")}" placeholder="Apellidos, Nombres"></div>
        <div class="form-group"><label>DNI / Documento</label><input id="sDoc" required value="${escape(s?.document_number || "")}" placeholder="12345678"></div>
        <div class="form-group"><label>Edad</label><input type="number" id="sAge" min="3" max="99" value="${s?.age || ""}" placeholder="Años"></div>
        <div class="form-group full"><label>Teléfono</label><input id="sPhone" value="${escape(s?.phone || "")}" placeholder="Ej: +51 987 654 321"></div>
      </div>
    </div>

    <div class="form-section full">
      <div class="form-section-title">Sede y plan</div>
      <div class="form-section-grid">
        <div class="form-group"><label>Sede</label><select id="sBranch" required onchange="updateStudentScheduleOptions()">${branchOptions(initialBranchId)}</select></div>
        <div class="form-group"><label>Disciplina</label><select id="sDiscipline" required onchange="updateStudentScheduleOptions()">${disciplineOptions(initialDiscipline)}</select></div>
        <div class="form-group full"><label>Horario fijo</label><select id="sSchedule" onchange="applyScheduleFees()">${scheduleOptions(initialScheduleId, initialBranchId, initialDiscipline)}</select></div>
        <div class="form-group"><label>Grado / Cinturón</label><input id="sRank" value="${escape(s?.rank || "")}" placeholder="Ej: Cinturón blanco"></div>
        <div class="form-group"><label>Mensualidad (S/)</label><input type="number" id="sFee" min="1" step="0.01" value="${initialMonthlyFee}"></div>
        <div class="form-group"><label>Día de pago</label><input type="number" id="sPayDay" min="1" max="31" value="${s?.payment_day ?? 1}" title="Día del mes en que debe pagar la mensualidad"></div>
        ${!isEditing ? `<div class="form-group"><label>Fecha de matrícula</label><input type="date" id="sEnrollDate" value="${s?.enrollment_date || getTodayIso()}"></div>` : ""}
      </div>
    </div>

    ${enrollmentSection}

    <div class="form-section full">
      <div class="form-section-title">Estado del alumno</div>
      <div class="form-section-grid">
        <div class="form-group"><label>Estado</label>
          <select id="sStatus" onchange="toggleRetiredFields()">
            <option value="activo" ${currentStatus === "activo" ? "selected" : ""}>Activo</option>
            <option value="retirado" ${currentStatus === "retirado" ? "selected" : ""}>Retirado</option>
          </select>
        </div>
        <div class="form-group retired-field"><label>Fecha de retiro</label><input type="date" id="sRetiredDate" value="${s?.retired_date || ""}"></div>
        <div class="form-group full retired-field"><label>Motivo de retiro</label><input id="sRetiredReason" value="${escape(s?.retired_reason || "")}" placeholder="Ej: Mudanza, costos, falta de tiempo..."></div>
        <div class="form-group full"><label>Observaciones</label><textarea id="sNotes" placeholder="Notas internas sobre el alumno (opcional)">${escape(s?.notes || "")}</textarea></div>
      </div>
    </div>

    <div class="form-actions form-actions-between">
      ${isEditing ? `<button type="button" class="btn btn-danger" onclick="confirmDeleteStudent('${s.id}')">Eliminar</button>` : `<span></span>`}
      <div class="form-actions-right">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" type="submit">${isEditing ? "Guardar cambios" : "Registrar alumno"}</button>
      </div>
    </div>`;

  document.getElementById("modalForm").onsubmit = saveStudent;
  toggleEnrollPaymentFields();
  toggleRetiredFields();
  openModal();
}

function toggleEnrollPaymentFields() {
  const status = document.getElementById("sEnrollStatus")?.value;
  const show = status === "pagada";
  document.querySelectorAll(".enroll-payment-field").forEach(el => {
    el.style.display = show ? "" : "none";
  });
}

function toggleRetiredFields() {
  const status = document.getElementById("sStatus")?.value;
  const show = status === "retirado";
  document.querySelectorAll(".retired-field").forEach(el => {
    el.style.display = show ? "" : "none";
  });
  if (show) {
    const dateInput = document.getElementById("sRetiredDate");
    if (dateInput && !dateInput.value) dateInput.value = getTodayIso();
  }
}

function updateStudentScheduleOptions() {
  const branchId = document.getElementById("sBranch").value;
  const discipline = document.getElementById("sDiscipline").value;
  const select = document.getElementById("sSchedule");
  if (select) select.innerHTML = scheduleOptions("", branchId, discipline);
  applyScheduleFees();
}

function applyScheduleFees() {
  const sc = getSchedule(document.getElementById("sSchedule")?.value);
  if (!sc) return;
  const feeInput = document.getElementById("sFee");
  if (feeInput) feeInput.value = sc.monthly_fee || 200;
  const enrollInput = document.getElementById("sEnrollFee");
  if (enrollInput) enrollInput.value = sc.enrollment_fee || 100;
}

async function saveStudent(e) {
  e.preventDefault();

  const id = editingId;
  const current = id ? getStudent(id) : null;
  const isEditing = Boolean(id);

  const monthly = Number(document.getElementById("sFee").value);
  const payDay = Number(document.getElementById("sPayDay").value);
  const status = document.getElementById("sStatus").value;
  const enrollDate = isEditing
    ? (current?.enrollment_date || getTodayIso())
    : (document.getElementById("sEnrollDate")?.value || getTodayIso());

  const payload = {
    document_type: "DNI",
    document_number: document.getElementById("sDoc").value.trim(),
    name: document.getElementById("sName").value.trim(),
    age: Number(document.getElementById("sAge").value) || null,
    phone: document.getElementById("sPhone").value.trim() || null,
    discipline: document.getElementById("sDiscipline").value,
    branch_id: document.getElementById("sBranch").value,
    schedule_id: document.getElementById("sSchedule").value || null,
    rank: document.getElementById("sRank").value.trim() || null,
    monthly_fee: monthly,
    payment_day: payDay,
    status,
    notes: document.getElementById("sNotes").value.trim() || null,
    next_payment_date: current?.next_payment_date || buildNextPaymentDate(payDay, enrollDate),
    last_cycle_processed: current?.last_cycle_processed || getCurrentCycle()
  };

  let enrollment = 0;
  let enrollStatus = "pendiente";
  let enrollMethod = "Efectivo";
  if (!isEditing) {
    enrollment = Number(document.getElementById("sEnrollFee")?.value || 0);
    enrollStatus = document.getElementById("sEnrollStatus")?.value || "pendiente";
    enrollMethod = document.getElementById("sEnrollMethod")?.value || "Efectivo";
    payload.enrollment_fee = enrollment;
    payload.enrollment_date = enrollDate;
    payload.enrollment_status = enrollStatus;
  }

  if (status === "retirado") {
    payload.retired_date = document.getElementById("sRetiredDate").value || getTodayIso();
    payload.retired_reason = document.getElementById("sRetiredReason").value.trim() || null;
  } else {
    payload.retired_date = null;
    payload.retired_reason = null;
  }

  if (!payload.name || !payload.document_number || !payload.branch_id || !payload.discipline) {
    showToast("Completa nombre, DNI, sede y disciplina.", "error");
    return;
  }
  if (monthly <= 0) {
    showToast("La mensualidad debe ser mayor a 0.", "error");
    return;
  }
  if (payDay < 1 || payDay > 31) {
    showToast("El día de pago debe estar entre 1 y 31.", "error");
    return;
  }
  if (status === "retirado" && !payload.retired_reason) {
    showToast("Indica el motivo del retiro.", "error");
    return;
  }
  if (!isEditing && enrollStatus === "pagada" && enrollment <= 0) {
    showToast("Si la matrícula está pagada, el monto debe ser mayor a 0. Si es gratis, marca como Exonerada.", "error");
    return;
  }

  if (!id) {
    payload.registration_code = await generateRegistrationCode();
    payload.paid_amount = 0;
    payload.balance = monthly;
    payload.credit_balance = 0;
    payload.payment_status = "pending";
    payload.last_payment_date = enrollDate;
  }

  const shouldChargeEnrollment = !isEditing && enrollStatus === "pagada" && enrollment > 0;

  await safeAction(async () => {
    let savedStudentId = id;

    if (id) {
      const { error } = await db.from("students").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await db.from("students").insert(payload).select().single();
      if (error) throw error;
      savedStudentId = inserted.id;
    }

    if (shouldChargeEnrollment && savedStudentId) {
      const { error: payError } = await db.from("payments").insert({
        student_id: savedStudentId,
        branch_id: payload.branch_id,
        date: enrollDate,
        amount: enrollment,
        method: enrollMethod,
        concept: "Matrícula",
        reference: null
      });
      if (payError) throw payError;
    }
  }, id ? "Alumno actualizado." : "Alumno registrado.");
}

function confirmDeleteStudent(id) {
  const s = getStudent(id);
  if (!s) return;
  showConfirm("Eliminar alumno", `¿Seguro que deseas eliminar a ${s.name}? Esta acción no se puede deshacer.`, async () => {
    closeStudentDetail();
    await safeAction(async () => {
      const { error } = await db.from("students").delete().eq("id", id);
      if (error) throw error;
    }, "Alumno eliminado.");
  });
}

/* ============================================================
   SCHEDULES
   ============================================================ */
function renderSchedules(content, search) {
  const list = schedules.filter(s => {
    const haystack = [getBranchName(s.branch_id), s.discipline, s.age_group, (s.days || []).join(" "), s.shift].join(" ").toLowerCase();
    return haystack.includes(search) &&
      filterByBranch(s) &&
      (filters.discipline === "all" || s.discipline === filters.discipline) &&
      (filters.scheduleShift === "all" || s.shift === filters.scheduleShift);
  });

  const activeList = schedules.filter(s => s.active);
  const totalEnrolled = activeList.reduce((sum, s) => sum + getScheduleOccupancy(s).enrolled, 0);
  const totalCapacity = activeList.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
  const avgOccupancy = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const freeSlots = Math.max(totalCapacity - totalEnrolled, 0);

  const kpis = `
    <div class="card kpi"><div class="kpi-label">Horarios activos</div><div class="kpi-value">${activeList.length}</div><div class="kpi-help">de ${schedules.length} registrados</div></div>
    <div class="card kpi"><div class="kpi-label">Alumnos inscritos</div><div class="kpi-value">${totalEnrolled}</div><div class="kpi-help">en horarios activos</div></div>
    <div class="card kpi"><div class="kpi-label">Ocupación promedio</div><div class="kpi-value">${avgOccupancy}%</div><div class="kpi-help">${totalEnrolled} / ${totalCapacity} cupos</div></div>
    <div class="card kpi"><div class="kpi-label">Cupos libres</div><div class="kpi-value">${freeSlots}</div><div class="kpi-help">disponibles para inscribir</div></div>
  `;

  const filtersBar = `
    <div class="filters-bar schedule-filters">
      ${branchFilterHtml()}
      <select class="filter-select" onchange="setFilter('discipline', this.value)">
        <option value="all">Todas las disciplinas</option>
        ${DISCIPLINES.map(d => `<option value="${d}" ${filters.discipline === d ? "selected" : ""}>${escape(d)}</option>`).join("")}
      </select>
      <select class="filter-select" onchange="setFilter('scheduleShift', this.value)">
        <option value="all">Todos los turnos</option>
        ${SHIFTS.map(t => `<option value="${t}" ${filters.scheduleShift === t ? "selected" : ""}>${escape(t)}</option>`).join("")}
      </select>
      <div class="view-toggle" role="tablist" aria-label="Cambiar vista">
        <button type="button" class="view-toggle-btn ${filters.scheduleView === "week" ? "active" : ""}" onclick="setFilter('scheduleView','week')">Semana</button>
        <button type="button" class="view-toggle-btn ${filters.scheduleView === "cards" ? "active" : ""}" onclick="setFilter('scheduleView','cards')">Tarjetas</button>
      </div>
    </div>
  `;

  const body = filters.scheduleView === "week"
    ? renderSchedulesWeek(list)
    : renderSchedulesCards(list);

  content.innerHTML = `
    <div class="grid">
      ${kpis}
      <div class="card span-12">
        ${filtersBar}
        ${body}
      </div>
    </div>`;
}

function renderSchedulesWeek(list) {
  if (!list.length) {
    return `<div class="empty-state">No hay horarios que coincidan con los filtros.</div>`;
  }

  const grid = {};
  SHIFTS.forEach(t => {
    grid[t] = {};
    WEEK_DAYS.forEach(d => grid[t][d.full] = []);
  });

  list.forEach(s => {
    const shift = SHIFTS.includes(s.shift) ? s.shift : "Mañana";
    (s.days || []).forEach(rawDay => {
      const day = normalizeDayName(rawDay);
      if (day && grid[shift][day]) grid[shift][day].push(s);
    });
  });

  Object.values(grid).forEach(dayMap => {
    Object.values(dayMap).forEach(arr => {
      arr.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    });
  });

  const visibleShifts = SHIFTS.filter(t => filters.scheduleShift === "all" || filters.scheduleShift === t);

  const headerRow = `
    <div class="week-row week-header">
      <div class="week-corner"></div>
      ${WEEK_DAYS.map(d => `<div class="week-day-head"><span class="week-day-short">${d.short}</span></div>`).join("")}
    </div>`;

  const rows = visibleShifts.map(shift => `
    <div class="week-row">
      <div class="week-shift-label">
        <span class="week-shift-name">${shift}</span>
      </div>
      ${WEEK_DAYS.map(d => {
        const blocks = grid[shift][d.full];
        if (!blocks.length) return `<div class="week-cell empty"></div>`;
        return `<div class="week-cell">
          ${blocks.map(s => renderClassBlock(s)).join("")}
        </div>`;
      }).join("")}
    </div>`).join("");

  const legend = `
    <div class="discipline-legend">
      ${DISCIPLINES.map(d => `<span class="legend-item ${getDisciplineClass(d)}"><span class="legend-swatch"></span>${escape(d)}</span>`).join("")}
    </div>`;

  return `
    <div class="week-view">
      ${headerRow}
      ${rows}
    </div>
    ${legend}
  `;
}

function renderClassBlock(s) {
  const o = getScheduleOccupancy(s);
  const state = getOccupancyState(o);
  const occupancyText = o.capacity > 0 ? `${o.enrolled}/${o.capacity}` : `${o.enrolled}`;
  const inactive = !s.active ? "inactive" : "";

  return `
    <button type="button"
      class="class-block ${getDisciplineClass(s.discipline)} occ-${state} ${inactive}"
      onclick="openScheduleAttendees('${s.id}')"
      title="Ver alumnos de ${escape(s.discipline)} · ${escape(s.age_group)} · ${escape(getBranchName(s.branch_id))}">
      <div class="class-block-time mono">
        <span class="class-block-dot"></span>
        ${formatTime(s.start_time)}–${formatTime(s.end_time)}
      </div>
      <div class="class-block-title">${escape(s.discipline)}</div>
      <div class="class-block-meta">${escape(s.age_group)} · ${occupancyText}</div>
    </button>
  `;
}

function renderSchedulesCards(list) {
  if (!list.length) {
    return `<div class="empty-state">No hay horarios que coincidan con los filtros.</div>`;
  }

  return `
    <div class="schedule-grid">
      ${list.map(s => {
        const o = getScheduleOccupancy(s);
        const state = getOccupancyState(o);
        const dayMinis = (s.days || [])
          .map(d => normalizeDayName(d))
          .filter(Boolean)
          .map(full => WEEK_DAYS.find(w => w.full === full)?.mini || full.slice(0,2));

        return `
          <article class="schedule-card ${getDisciplineClass(s.discipline)} ${s.active ? "" : "inactive"}"
            onclick="openScheduleAttendees('${s.id}')"
            tabindex="0"
            role="button">
            <div class="schedule-card-top">
              <div class="schedule-card-time">
                <div class="schedule-card-hours mono">
                  <span class="schedule-card-dot"></span>
                  ${formatTime(s.start_time)}–${formatTime(s.end_time)}
                </div>
                <div class="schedule-card-shift">${escape(s.shift)}</div>
              </div>
              ${s.active ? "" : `<span class="badge neutral">Inactivo</span>`}
            </div>

            <div class="schedule-card-headline">
              <h4>${escape(s.discipline)} · ${escape(s.age_group)}</h4>
              <p>${escape(getBranchName(s.branch_id))}</p>
            </div>

            <div class="schedule-day-strip">
              ${WEEK_DAYS.map(d => {
                const on = dayMinis.includes(d.mini);
                return `<span class="day-pill ${on ? "on" : ""}">${d.mini}</span>`;
              }).join("")}
            </div>

            <div class="occupancy">
              <div class="occupancy-head">
                <span>Ocupación</span>
                <strong>${o.enrolled}${o.capacity ? ` / ${o.capacity}` : ""}${o.capacity ? ` · ${o.percent}%` : ""}</strong>
              </div>
              <div class="occupancy-bar">
                <span class="occupancy-fill occ-${state}" style="width:${o.capacity ? o.percent : 0}%"></span>
              </div>
            </div>

            <div class="schedule-card-fees">
              <span>Mensualidad <strong>${formatCurrency(s.monthly_fee)}</strong></span>
              <span>Matrícula <strong>${formatCurrency(s.enrollment_fee)}</strong></span>
            </div>

            <div class="schedule-actions">
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openScheduleModal('${s.id}')">Editar</button>
              ${s.active
                ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();deactivateSchedule('${s.id}')">Desactivar</button>`
                : `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();reactivateSchedule('${s.id}')">Reactivar</button>`}
              <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();confirmDeleteSchedule('${s.id}')">Eliminar</button>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

/* ============================================================
   Panel de alumnos por horario (clic en una clase)
   ============================================================ */
function openScheduleAttendees(scheduleId) {
  const s = getSchedule(scheduleId);
  if (!s) return;
  closeScheduleAttendees();

  const enrolled = students
    .filter(st => st.schedule_id === scheduleId && st.status !== "retirado")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const o = getScheduleOccupancy(s);
  const state = getOccupancyState(o);
  const daysLabel = (s.days || [])
    .map(d => normalizeDayName(d))
    .filter(Boolean)
    .map(full => WEEK_DAYS.find(w => w.full === full)?.mini || full.slice(0,2))
    .join(" · ");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "attendeesOverlay";
  overlay.onclick = (e) => { if (e.target === overlay) closeScheduleAttendees(); };

  overlay.innerHTML = `
    <div class="modal attendees-modal ${getDisciplineClass(s.discipline)}">
      <div class="attendees-header">
        <div class="attendees-header-top">
          <div class="attendees-title-block">
            <div class="attendees-discipline">${escape(s.discipline)} · ${escape(s.age_group)}</div>
            <div class="attendees-meta">
              <span class="mono">${formatTime(s.start_time)} – ${formatTime(s.end_time)}</span>
              ${daysLabel ? `<span>${escape(daysLabel)}</span>` : ""}
              <span>${escape(s.shift)}</span>
              <span>${escape(getBranchName(s.branch_id))}</span>
              ${!s.active ? `<span class="badge neutral">Inactivo</span>` : ""}
            </div>
          </div>
          <button class="icon-btn" onclick="closeScheduleAttendees()" aria-label="Cerrar">✕</button>
        </div>

        <div class="attendees-stats">
          <div class="attendees-stat">
            <span>Inscritos</span>
            <strong>${o.enrolled}${o.capacity ? ` / ${o.capacity}` : ""}</strong>
          </div>
          <div class="attendees-stat">
            <span>Ocupación</span>
            <strong>${o.capacity ? `${o.percent}%` : "—"}</strong>
          </div>
          <div class="attendees-stat">
            <span>Mensualidad</span>
            <strong class="mono">${formatCurrency(s.monthly_fee)}</strong>
          </div>
          <div class="attendees-stat">
            <span>Matrícula</span>
            <strong class="mono">${formatCurrency(s.enrollment_fee)}</strong>
          </div>
        </div>

        ${o.capacity ? `
          <div class="attendees-occupancy-bar">
            <span class="occupancy-fill occ-${state}" style="width:${o.percent}%"></span>
          </div>
        ` : ""}

        <div class="attendees-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeScheduleAttendees();openScheduleModal('${s.id}')">Editar horario</button>
          <button class="btn btn-primary btn-sm" onclick="enrollStudentInSchedule('${s.id}')">+ Inscribir alumno</button>
        </div>
      </div>

      <div class="attendees-body">
        ${enrolled.length ? renderAttendeesList(enrolled) : renderAttendeesEmpty(s.id)}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.addEventListener("keydown", attendeesEscHandler);
}

function attendeesEscHandler(e) {
  if (e.key === "Escape") closeScheduleAttendees();
}

function closeScheduleAttendees() {
  const overlay = document.getElementById("attendeesOverlay");
  if (overlay) overlay.remove();
  document.removeEventListener("keydown", attendeesEscHandler);
}

function renderAttendeesList(list) {
  return `
    <div class="attendees-list-header">
      <div></div>
      <div>Alumno</div>
      <div>Código</div>
      <div>Próximo pago</div>
      <div></div>
    </div>
    ${list.map(s => {
      const dueDays = daysUntil(s.next_payment_date);
      const status = s.payment_status === "paid"
        ? "ok"
        : isOverdue(s) ? "overdue"
        : isDueWithinWeek(s) ? "due_soon"
        : "neutral";

      const dueLabel = !s.next_payment_date
        ? `<span class="muted">sin definir</span>`
        : s.payment_status === "paid"
          ? `<span class="ok">${formatDate(s.next_payment_date)}</span>`
          : dueDays < 0
            ? `<span class="overdue-text">vencido hace ${Math.abs(dueDays)} día${Math.abs(dueDays) !== 1 ? "s" : ""}</span>`
            : dueDays === 0
              ? `<span class="warning-text">vence hoy</span>`
              : dueDays <= 7
                ? `<span class="warning-text">en ${dueDays} día${dueDays !== 1 ? "s" : ""}</span>`
                : `<span>${formatDate(s.next_payment_date)}</span>`;

      const initials = getInitials(s.name);

      const cobrarBtn = Number(s.balance || 0) > 0
        ? `<button class="btn btn-sm cobrar-btn-due" onclick="event.stopPropagation();closeScheduleAttendees();openPaymentModal('${s.id}')">Cobrar</button>`
        : `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();closeScheduleAttendees();openPaymentModal('${s.id}')">Cobrar</button>`;

      return `
        <div class="attendees-row row-${status}" onclick="closeScheduleAttendees();openStudentDetail('${s.id}')" tabindex="0" role="button">
          <div class="student-row-avatar">
            <div class="row-avatar">${escape(initials)}</div>
            <span class="row-status-dot row-status-${status}"></span>
          </div>
          <div class="student-row-main">
            <div class="row-name">${escape(s.name)}</div>
            <div class="row-sub">${s.age ? `${s.age} años` : "—"}${s.phone ? ` · ${escape(s.phone)}` : ""}</div>
          </div>
          <div class="row-code mono">${escape(s.registration_code || "—")}</div>
          <div class="row-due">${dueLabel}</div>
          <div class="row-actions">${cobrarBtn}</div>
        </div>`;
    }).join("")}
  `;
}

function renderAttendeesEmpty(scheduleId) {
  return `
    <div class="attendees-empty">
      <div class="attendees-empty-title">Aún no hay alumnos en este horario</div>
      <div class="attendees-empty-sub">Inscribe al primero o asigna este horario a un alumno existente desde su ficha.</div>
      <button class="btn btn-primary" onclick="enrollStudentInSchedule('${scheduleId}')">+ Inscribir alumno</button>
    </div>
  `;
}

function enrollStudentInSchedule(scheduleId) {
  const s = getSchedule(scheduleId);
  if (!s) return;
  closeScheduleAttendees();
  openStudentModal(null, {
    branch_id: s.branch_id,
    discipline: s.discipline,
    schedule_id: s.id
  });
}

function openScheduleModal(id = null) {
  const s = id ? getSchedule(id) : null;
  editingId = id;
  const isEditing = Boolean(s);
  const enrolledCount = isEditing
    ? students.filter(st => st.schedule_id === id && st.status !== "retirado").length
    : 0;

  document.getElementById("modalTitle").textContent = isEditing ? "Editar horario" : "Crear horario";

  const currentDays = new Set(
    (s?.days || ["Lunes","Miércoles","Viernes"])
      .map(normalizeDayName)
      .filter(Boolean)
  );

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group"><label>Sede</label><select id="hBranch">${branchOptions(s?.branch_id || branches[0]?.id)}</select></div>
    <div class="form-group"><label>Disciplina</label><select id="hDiscipline">${disciplineOptions(s?.discipline || "Karate")}</select></div>

    <div class="form-group"><label>Grupo de edad</label><input id="hAge" value="${escape(s?.age_group || "General")}" placeholder="Niños / Juvenil / Adultos..."></div>
    <div class="form-group"><label>Turno</label><select id="hShift">${SHIFTS.map(t => `<option ${s?.shift === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>

    <div class="form-group full">
      <label>Días de la semana</label>
      <div class="day-toggle-row">
        ${WEEK_DAYS.map(d => `
          <button type="button"
            class="day-toggle ${currentDays.has(d.full) ? "on" : ""}"
            data-day="${d.full}"
            onclick="toggleDayBtn(this)">${d.short}</button>
        `).join("")}
      </div>
    </div>

    <div class="form-group"><label>Hora inicio</label><input type="time" id="hStart" value="${String(s?.start_time || "09:00").slice(0,5)}"></div>
    <div class="form-group"><label>Hora fin</label><input type="time" id="hEnd" value="${String(s?.end_time || "10:00").slice(0,5)}"></div>

    <div class="form-group"><label>Cupos</label><input type="number" id="hCapacity" min="0" value="${s?.capacity ?? ""}" placeholder="Ej: 15"></div>
    <div class="form-group"><label>Activo</label><select id="hActive"><option value="true" ${s?.active !== false ? "selected" : ""}>Sí</option><option value="false" ${s?.active === false ? "selected" : ""}>No</option></select></div>

    <div class="form-group"><label>Matrícula (S/)</label><input type="number" id="hEnrollFee" min="0" step="0.01" value="${s?.enrollment_fee ?? 100}"></div>
    <div class="form-group"><label>Mensualidad (S/)</label><input type="number" id="hMonthlyFee" min="0" step="0.01" value="${s?.monthly_fee ?? 200}"></div>

    <div class="form-actions form-actions-between">
      ${isEditing ? `
        <button type="button" class="btn btn-danger"
          onclick="confirmDeleteSchedule('${s.id}')"
          ${enrolledCount > 0 ? `title="Tiene ${enrolledCount} alumno(s) inscrito(s)"` : ""}>
          Eliminar horario${enrolledCount > 0 ? ` (${enrolledCount} insc.)` : ""}
        </button>
      ` : `<span></span>`}
      <div class="form-actions-right">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" type="submit">Guardar</button>
      </div>
    </div>`;

  document.getElementById("modalForm").onsubmit = async e => {
    e.preventDefault();

    const days = Array.from(document.querySelectorAll("#modalForm .day-toggle.on"))
      .map(b => b.dataset.day);

    if (days.length === 0) {
      showToast("Selecciona al menos un día.", "error");
      return;
    }

    const start = document.getElementById("hStart").value;
    const end = document.getElementById("hEnd").value;
    if (start && end && end <= start) {
      showToast("La hora de fin debe ser posterior a la de inicio.", "error");
      return;
    }

    const payload = {
      branch_id: document.getElementById("hBranch").value,
      discipline: document.getElementById("hDiscipline").value,
      age_group: document.getElementById("hAge").value.trim() || "General",
      days,
      shift: document.getElementById("hShift").value,
      start_time: start,
      end_time: end,
      capacity: Number(document.getElementById("hCapacity").value) || null,
      enrollment_fee: Number(document.getElementById("hEnrollFee").value),
      monthly_fee: Number(document.getElementById("hMonthlyFee").value),
      active: document.getElementById("hActive").value === "true"
    };

    await safeAction(async () => {
      const result = id
        ? await db.from("schedules").update(payload).eq("id", id)
        : await db.from("schedules").insert(payload);
      if (result.error) throw result.error;
    }, "Horario guardado.");
  };

  openModal();
}

function toggleDayBtn(btn) {
  btn.classList.toggle("on");
}

async function deactivateSchedule(id) {
  showConfirm(
    "Desactivar horario",
    "El horario dejará de aparecer en la grilla y no se podrán inscribir nuevos alumnos. Los alumnos ya inscritos no serán afectados.",
    async () => {
      await safeAction(async () => {
        const { error } = await db.from("schedules").update({ active:false }).eq("id", id);
        if (error) throw error;
      }, "Horario desactivado.");
    },
    "Desactivar"
  );
}

async function reactivateSchedule(id) {
  await safeAction(async () => {
    const { error } = await db.from("schedules").update({ active:true }).eq("id", id);
    if (error) throw error;
  }, "Horario reactivado.");
}

function confirmDeleteSchedule(id) {
  const sched = getSchedule(id);
  if (!sched) return;

  const enrolledCount = students.filter(st => st.schedule_id === id && st.status !== "retirado").length;

  if (enrolledCount > 0) {
    showConfirm(
      "No se puede eliminar",
      `Este horario tiene ${enrolledCount} alumno(s) inscrito(s). Primero cambia o quita el horario de esos alumnos, o desactívalo en lugar de eliminarlo.`,
      () => {},
      "Entendido"
    );
    // Reemplazo el handler para que sea solo "Cerrar"
    const btn = document.getElementById("confirmOkBtn");
    btn.className = "btn btn-secondary";
    btn.onclick = () => closeConfirm();
    return;
  }

  showConfirm(
    "Eliminar horario",
    `Se eliminará permanentemente el horario "${sched.discipline} · ${sched.age_group} · ${formatTime(sched.start_time)}". Esta acción no se puede deshacer.`,
    async () => {
      await safeAction(async () => {
        const { error } = await db.from("schedules").delete().eq("id", id);
        if (error) throw error;
      }, "Horario eliminado.");
    },
    "Eliminar"
  );
}

/* ============================================================
   ATTENDANCE — 2 pantallas: clases del día + pasar lista
   ============================================================ */
const STATUS_SHORT = { presente:"P", falta:"F", tardanza:"T", justificado:"J" };
const STATUS_DOT = { presente:"presente", falta:"falta", tardanza:"tardanza", justificado:"justificado" };

function getDayNameFromIso(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return WEEK_DAYS[(date.getDay() + 6) % 7]?.full;
}

function scheduleRunsOn(schedule, isoDate) {
  const dayName = getDayNameFromIso(isoDate);
  if (!dayName) return false;
  return (schedule.days || [])
    .map(d => normalizeDayName(d))
    .filter(Boolean)
    .includes(dayName);
}

function getClassesForDay(isoDate) {
  return schedules
    .filter(s => s.active && scheduleRunsOn(s, isoDate) && filterByBranch(s))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

function getClassStatus(schedule, isoDate) {
  const todayIso = getTodayIso();
  if (isoDate < todayIso) return "past";
  if (isoDate > todayIso) return "future";
  const now = new Date();
  const nowHM = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  if (nowHM < String(schedule.start_time).slice(0,5)) return "upcoming";
  if (nowHM > String(schedule.end_time).slice(0,5)) return "past";
  return "live";
}

function getMinutesUntil(timeStr) {
  const now = new Date();
  const [h, m] = String(timeStr).split(":").map(Number);
  const target = new Date();
  target.setHours(h || 0, m || 0, 0, 0);
  return Math.round((target - now) / 60000);
}

function formatTimeUntil(minutes) {
  if (minutes < 0) return "ya empezó";
  if (minutes < 60) return `en ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `en ${h}h` : `en ${h}h ${m}min`;
}

function getEnrolledForSchedule(scheduleId) {
  return students
    .filter(s => s.schedule_id === scheduleId && s.status !== "retirado")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function getStudentLast5(studentId, beforeIso) {
  return attendance
    .filter(a => a.student_id === studentId && String(a.date).slice(0,10) < beforeIso)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5)
    .reverse();
}

function findAttendanceRecord(studentId, scheduleId, isoDate) {
  return attendance.find(a =>
    a.student_id === studentId &&
    a.schedule_id === scheduleId &&
    String(a.date).slice(0, 10) === isoDate
  );
}

function renderAttendance(content, search) {
  const date = filters.attendanceDate;
  const dayName = getDayNameFromIso(date) || "—";

  if (filters.scheduleId !== "all") {
    const sched = getSchedule(filters.scheduleId);
    if (sched) {
      content.innerHTML = renderAttendanceRoll(sched, date, search);
      return;
    }
  }

  const classes = getClassesForDay(date);
  const totals = computeDayTotals(classes, date);

  const groups = { "Mañana": [], "Tarde": [], "Noche": [] };
  classes.forEach(c => {
    const hour = Number(String(c.start_time).slice(0,2));
    if (hour < 12) groups["Mañana"].push(c);
    else if (hour < 18) groups["Tarde"].push(c);
    else groups["Noche"].push(c);
  });

  const groupHtml = Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([name, list]) => `
      <div class="agenda-group">
        <div class="agenda-group-label">${name} · ${list.length} clase${list.length !== 1 ? "s" : ""}</div>
        <div class="agenda-list">
          ${list.map(c => renderAgendaRow(c, date)).join("")}
        </div>
      </div>
    `).join("");

  content.innerHTML = `
    <div class="grid">
      <div class="card span-12 attendance-page">
        <div class="att-toolbar">
          <input class="filter-select" type="date" value="${date}" onchange="setFilter('attendanceDate', this.value)">
          ${branchFilterHtml()}
          <span class="att-day-label">${escape(dayName)} ${formatDate(date)} · ${classes.length} clase${classes.length !== 1 ? "s" : ""}</span>
        </div>

        <div class="att-day-stats">
          <div class="att-day-stat"><span>Esperados</span><strong>${totals.expected}</strong></div>
          <div class="att-day-stat"><span>Marcados</span><strong>${totals.marked}</strong></div>
          <div class="att-day-stat"><span>Presentes</span><strong style="color:var(--success)">${totals.presente}</strong></div>
          <div class="att-day-stat"><span>Faltas</span><strong style="color:var(--danger)">${totals.falta}</strong></div>
        </div>

        ${classes.length ? groupHtml : `
          <div class="empty-state">
            <p>No hay clases programadas para ${escape(dayName)}.</p>
            <p class="muted">Cambia la fecha o revisa que los horarios estén activos.</p>
          </div>
        `}
      </div>
    </div>`;
}

function renderAgendaRow(s, date) {
  const enrolled = getEnrolledForSchedule(s.id);
  const total = enrolled.length;
  const marks = enrolled.map(st => findAttendanceRecord(st.id, s.id, date));
  const marked = marks.filter(Boolean).length;
  const progress = total > 0 ? Math.round((marked / total) * 100) : 0;
  const classStatus = getClassStatus(s, date);
  const isComplete = total > 0 && marked === total;

  let rowState = "";
  let inlineLabel = "";
  let rightInfo = "";
  let progressColor = "var(--border-strong)";

  if (classStatus === "live") {
    rowState = "is-live";
    inlineLabel = `<span class="agenda-inline-label live">En curso</span>`;
    progressColor = "var(--info, #378ADD)";
    rightInfo = `${marked} / ${total}`;
  } else if (classStatus === "upcoming") {
    const mins = getMinutesUntil(s.start_time);
    rightInfo = `<span class="muted">${escape(formatTimeUntil(mins))}</span>`;
  } else if (classStatus === "future") {
    rightInfo = total > 0 ? `<span class="muted">${total} alumno${total !== 1 ? "s" : ""}</span>` : `<span class="muted">—</span>`;
  } else if (isComplete) {
    inlineLabel = `<svg class="agenda-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`;
    progressColor = "var(--success)";
    rightInfo = `${marked} / ${total}`;
  } else if (marked > 0) {
    progressColor = "var(--warning)";
    rightInfo = `${marked} / ${total}`;
  } else {
    rightInfo = total > 0 ? `<span class="muted">0 / ${total}</span>` : `<span class="muted">—</span>`;
  }

  const dotColor = `var(--d-line)`;

  return `
    <button type="button"
      class="agenda-row ${getDisciplineClass(s.discipline)} ${rowState}"
      onclick="setFilter('scheduleId', '${s.id}')"
      title="Pasar lista de ${escape(s.discipline)} · ${escape(s.age_group)}">
      <div class="agenda-row-time">
        <span class="agenda-dot" style="background:${dotColor}"></span>
        <span class="mono">${formatTime(s.start_time)}</span>
      </div>
      <div class="agenda-row-main">
        <div class="agenda-row-title">
          <span>${escape(s.discipline)} · ${escape(s.age_group)}</span>
          ${inlineLabel}
        </div>
        <div class="agenda-row-sub">${escape(getBranchName(s.branch_id))}</div>
      </div>
      <div class="agenda-row-info">${rightInfo}</div>
      <div class="agenda-row-bar">
        <span class="agenda-row-bar-fill" style="width:${progress}%; background:${progressColor}"></span>
      </div>
    </button>
  `;
}

function computeDayTotals(classes, date) {
  let expected = 0, presente = 0, falta = 0, tardanza = 0, justificado = 0;
  classes.forEach(c => {
    const enrolled = getEnrolledForSchedule(c.id);
    expected += enrolled.length;
    enrolled.forEach(st => {
      const row = findAttendanceRecord(st.id, c.id, date);
      if (!row) return;
      if (row.status === "presente") presente++;
      else if (row.status === "falta") falta++;
      else if (row.status === "tardanza") tardanza++;
      else if (row.status === "justificado") justificado++;
    });
  });
  const marked = presente + falta + tardanza + justificado;
  return { expected, marked, presente, falta, tardanza, justificado };
}

function renderAttendanceRoll(sched, date, search) {
  const dayName = getDayNameFromIso(date) || "—";
  const isSchedDay = scheduleRunsOn(sched, date);
  const classStatus = getClassStatus(sched, date);

  let allEnrolled = getEnrolledForSchedule(sched.id);
  if (search) {
    allEnrolled = allEnrolled.filter(s =>
      [s.name, s.registration_code, s.document_number].join(" ").toLowerCase().includes(search)
    );
  }

  const rows = allEnrolled.map(st => ({
    student: st,
    record: findAttendanceRecord(st.id, sched.id, date)
  }));

  const onlyPending = filters._onlyPending;
  const visibleRows = onlyPending ? rows.filter(r => !r.record) : rows;

  const counts = {
    presente: rows.filter(r => r.record?.status === "presente").length,
    falta: rows.filter(r => r.record?.status === "falta").length,
    tardanza: rows.filter(r => r.record?.status === "tardanza").length,
    justificado: rows.filter(r => r.record?.status === "justificado").length
  };
  const marked = counts.presente + counts.falta + counts.tardanza + counts.justificado;

  let badgeHtml = "";
  if (!isSchedDay) badgeHtml = `<span class="class-status-badge status-warning">No es día de clase</span>`;
  else if (classStatus === "live") badgeHtml = `<span class="class-status-badge status-live">En curso</span>`;
  else if (classStatus === "upcoming") badgeHtml = `<span class="class-status-badge status-upcoming">Próxima</span>`;
  else if (classStatus === "future") badgeHtml = `<span class="class-status-badge status-future">Pendiente</span>`;
  else if (marked === rows.length && rows.length > 0) badgeHtml = `<span class="class-status-badge status-completed">Completada</span>`;

  return `
    <div class="grid">
      <div class="card span-12 attendance-roll ${getDisciplineClass(sched.discipline)}">

        <div class="roll-header">
          <button class="btn btn-ghost btn-sm" onclick="setFilter('scheduleId','all')">← Volver</button>
          <div class="roll-title-block">
            <div class="roll-title">${escape(sched.discipline)} · ${escape(sched.age_group)}</div>
            <div class="roll-meta">
              <span class="mono">${formatTime(sched.start_time)} – ${formatTime(sched.end_time)}</span>
              <span>${escape(getBranchName(sched.branch_id))}</span>
              <span>${escape(dayName)} ${formatDate(date)}</span>
            </div>
          </div>
          ${badgeHtml}
        </div>

        <div class="roll-stats">
          <span><strong>${marked}</strong> / ${rows.length} marcados</span>
          <span class="ok-text"><strong>${counts.presente}</strong> presentes</span>
          <span class="overdue-text"><strong>${counts.falta}</strong> faltas</span>
          <span class="warning-text"><strong>${counts.tardanza}</strong> tardanzas</span>
          ${counts.justificado > 0 ? `<span><strong>${counts.justificado}</strong> justificados</span>` : ""}
        </div>

        <div class="roll-actions">
          <input class="filter-select" type="date" value="${date}" onchange="setFilter('attendanceDate', this.value)">
          <button class="btn btn-secondary btn-sm" onclick="markAllPresent('${sched.id}','${date}')" ${rows.length === 0 ? "disabled" : ""}>Marcar todos presentes</button>
          <label class="checkbox-toggle">
            <input type="checkbox" ${onlyPending ? "checked" : ""} onchange="togglePendingOnly()">
            Solo pendientes
          </label>
        </div>

        ${rows.length === 0
          ? `<div class="empty-state"><p>No hay alumnos inscritos en este horario.</p></div>`
          : visibleRows.length === 0
            ? `<div class="empty-state"><p>No hay alumnos pendientes. ¡Lista completa!</p></div>`
            : `<div class="roll-list">
                ${visibleRows.map(r => renderRollRow(r, sched, date)).join("")}
              </div>
              <div class="roll-legend">
                <span><span class="dot dot-presente"></span>Presente</span>
                <span><span class="dot dot-falta"></span>Falta</span>
                <span><span class="dot dot-tardanza"></span>Tardanza</span>
                <span><span class="dot dot-justificado"></span>Justificado</span>
                <span class="muted">5 últimas asistencias →</span>
              </div>`}

      </div>
    </div>`;
}

function renderRollRow({ student, record }, sched, date) {
  const initials = getInitials(student.name);
  const last5 = getStudentLast5(student.id, date);

  const consecutiveFaltas = (() => {
    let count = 0;
    for (let i = last5.length - 1; i >= 0; i--) {
      if (last5[i].status === "falta") count++;
      else break;
    }
    return count;
  })();
  const alarming = consecutiveFaltas >= 3 || record?.status === "falta";

  const dotsHtml = Array.from({ length: 5 }).map((_, i) => {
    const r = last5[i];
    if (!r) return `<span class="dot dot-empty"></span>`;
    return `<span class="dot dot-${STATUS_DOT[r.status] || "empty"}" title="${formatDate(r.date)}: ${r.status}"></span>`;
  }).join("");

  const buttons = ATTENDANCE_STATUSES.map(st => {
    const active = record?.status === st ? "active" : "";
    return `<button type="button" class="roll-mark-btn mark-${st} ${active}" onclick="markAttendanceFor('${student.id}','${sched.id}','${st}','${date}')" title="${st}">${STATUS_SHORT[st]}</button>`;
  }).join("");

  return `
    <div class="roll-row ${alarming ? "row-alarming" : ""}" data-status="${record?.status || ""}">
      <div class="roll-row-avatar">
        <div class="row-avatar">${escape(initials)}</div>
      </div>
      <div class="roll-row-main">
        <div class="row-name">${escape(student.name)}</div>
        <div class="roll-row-dots">${dotsHtml}</div>
      </div>
      <div class="roll-row-buttons">${buttons}</div>
    </div>`;
}

function togglePendingOnly() {
  filters._onlyPending = !filters._onlyPending;
  render();
}

/**
 * Marca o actualiza la asistencia. NO usa onConflict (porque la BD del usuario
 * no tiene un constraint UNIQUE para esa combinación). En su lugar busca el
 * registro existente y decide si insert o update.
 */
async function markAttendanceFor(studentId, scheduleId, status, date) {
  const s = getStudent(studentId);
  if (!s) return;

  try {
    const existing = findAttendanceRecord(studentId, scheduleId, date);

    if (existing) {
      const { error } = await db.from("attendance")
        .update({ status })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("attendance").insert({
        student_id: s.id,
        branch_id: s.branch_id,
        schedule_id: scheduleId || s.schedule_id,
        date,
        status
      });
      if (error) throw error;
    }

    await refreshData();
    render();
  } catch (error) {
    console.error("markAttendanceFor:", error);
    showToast(error.message || "No se pudo guardar la asistencia.", "error");
  }
}

async function markAllPresent(scheduleId, date) {
  const sched = getSchedule(scheduleId);
  if (!sched) return;
  const enrolled = getEnrolledForSchedule(scheduleId);
  if (!enrolled.length) {
    showToast("No hay alumnos en este horario.", "error");
    return;
  }

  const pending = enrolled.filter(st => !findAttendanceRecord(st.id, scheduleId, date));

  if (!pending.length) {
    showToast("Todos los alumnos ya están marcados.", "info");
    return;
  }

  showConfirm(
    "Marcar todos presentes",
    `Se marcarán ${pending.length} alumno${pending.length !== 1 ? "s" : ""} como presentes. Puedes cambiar individualmente después.`,
    async () => {
      try {
        const payload = pending.map(st => ({
          student_id: st.id,
          branch_id: st.branch_id,
          schedule_id: scheduleId,
          date,
          status: "presente"
        }));
        const { error } = await db.from("attendance").insert(payload);
        if (error) throw error;
        await refreshData();
        render();
        showToast(`${pending.length} alumno${pending.length !== 1 ? "s marcados" : " marcado"} como presente${pending.length !== 1 ? "s" : ""}.`, "success");
      } catch (error) {
        console.error("markAllPresent:", error);
        showToast(error.message || "No se pudo marcar la lista.", "error");
      }
    },
    "Marcar todos"
  );
}

async function markAttendance(studentId, status) {
  const s = getStudent(studentId);
  if (!s) return;
  await markAttendanceFor(studentId, s.schedule_id, status, filters.attendanceDate);
}

/* ============================================================
   PAYMENTS
   ============================================================ */
function renderPayments(content, search) {
  const list = payments.filter(p => {
    const haystack = [
      p.students?.name, p.students?.registration_code, p.students?.document_number,
      p.method, p.concept, p.reference, getBranchName(p.branch_id)
    ].join(" ").toLowerCase();
    return haystack.includes(search) && filterByBranch(p);
  });

  const totalPending = students.reduce((a, s) => a + Number(s.balance || 0), 0);

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Saldo pendiente</div><div class="kpi-value mono">${formatCurrency(totalPending)}</div><div class="kpi-help">Por cobrar</div></div>
      <div class="card kpi"><div class="kpi-label">Pagados</div><div class="kpi-value">${students.filter(s => s.payment_status === "paid").length}</div><div class="kpi-help">Al día</div></div>
      <div class="card kpi"><div class="kpi-label">Parciales</div><div class="kpi-value">${students.filter(s => s.payment_status === "partial").length}</div><div class="kpi-help">Abonos</div></div>
      <div class="card kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value">${students.filter(s => s.payment_status === "pending").length}</div><div class="kpi-help">Sin completar</div></div>

      <div class="card span-12">
        <div class="filters-bar">${branchFilterHtml()}</div>

        <div class="section-title">Historial de pagos</div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Fecha</th><th>Alumno</th><th>Código</th><th>Sede</th><th>Concepto</th><th>Método</th><th>Referencia</th><th>Monto</th></tr></thead>
            <tbody>
              ${list.length ? list.map(p => `
                <tr>
                  <td>${formatDate(p.date)}</td>
                  <td>${escape(p.students?.name || "—")}</td>
                  <td>${escape(p.students?.registration_code || "—")}</td>
                  <td>${escape(getBranchName(p.branch_id))}</td>
                  <td>${escape(p.concept)}</td>
                  <td>${escape(p.method)}</td>
                  <td>${escape(p.reference || "—")}</td>
                  <td class="mono">${formatCurrency(p.amount)}</td>
                </tr>`).join("") : `<tr><td colspan="8"><div class="empty-state"><p>No hay pagos registrados.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   Caja: registro automático desde pagos y ventas
   ============================================================ */
function isEnrollmentPaid(student) {
  if (!student) return false;
  return payments.some(p => p.student_id === student.id && p.concept === "Matrícula");
}

function getEnrollmentPaymentRecord(student) {
  if (!student) return null;
  return payments
    .filter(p => p.student_id === student.id && p.concept === "Matrícula")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

async function recordCashIfNeeded() {
  // Caja automática: los movimientos de caja los crea Supabase mediante triggers.
  // Esta función queda como compatibilidad para evitar dobles registros desde el frontend.
  return { skipped: true, reason: "cash_managed_by_database" };
}

function openPaymentModal(studentId = null) {
  document.getElementById("modalTitle").textContent = "Registrar pago";

  const preselected = studentId ? getStudent(studentId) : null;
  const suggestedAmount = preselected
    ? (Number(preselected.balance || 0) > 0 ? Number(preselected.balance) : Number(preselected.monthly_fee || 0))
    : "";
  const suggestedConcept = preselected && Number(preselected.balance || 0) > 0 ? "Mensualidad" : "";

  const studentSelectHtml = preselected
    ? `<select id="pStudent" disabled>
         <option value="${preselected.id}" selected>
           ${escape(preselected.name)} · ${escape(preselected.registration_code || "")} · Saldo: ${formatCurrency(preselected.balance)}
         </option>
       </select>
       <div class="form-hint">Cobro pre-cargado para este alumno. Cancela y vuelve a abrir desde "Pagos" si quieres elegir otro.</div>`
    : `<select id="pStudent">
         ${students.filter(s => s.status !== "retirado").map(s => `<option value="${s.id}">${escape(s.name)} · ${escape(s.registration_code || "")} · Saldo: ${formatCurrency(s.balance)}</option>`).join("")}
       </select>`;

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group full"><label>Alumno</label>
      ${studentSelectHtml}
    </div>
    <div class="form-group"><label>Fecha de pago</label><input type="date" id="pDate" required value="${getTodayIso()}"></div>
    <div class="form-group"><label>Monto (S/)</label><input type="number" id="pAmount" required min="0.01" step="0.01" value="${suggestedAmount}"></div>
    <div class="form-group"><label>Método</label><select id="pMethod">${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join("")}</select></div>
    <div class="form-group"><label>Concepto</label>
      <select id="pConcept">${PAYMENT_CONCEPTS.map(c => `<option ${suggestedConcept === c ? "selected" : ""}>${c}</option>`).join("")}</select>
    </div>
    <div class="form-group"><label>Referencia</label><input type="text" id="pRef" placeholder="N° operación o comprobante"></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar pago</button>
    </div>`;

  document.getElementById("modalForm").onsubmit = savePayment;
  openModal();
}

async function savePayment(e) {
  e.preventDefault();

  const studentEl = document.getElementById("pStudent");
  const studentId = studentEl.value || studentEl.options[studentEl.selectedIndex]?.value;
  const student = getStudent(studentId);
  const amount = Number(document.getElementById("pAmount").value);
  const date = document.getElementById("pDate").value;
  const method = document.getElementById("pMethod").value;
  const concept = document.getElementById("pConcept").value;

  if (!student || amount <= 0) {
    showToast("Selecciona alumno y monto válido.", "error");
    return;
  }

  const oldBalance = Number(student.balance || 0);
  const applied = Math.min(amount, oldBalance);
  const extra = Math.max(amount - oldBalance, 0);
  const newBalance = Math.max(oldBalance - applied, 0);
  const newPaid = Number(student.paid_amount || 0) + applied;
  const newCredit = Number(student.credit_balance || 0) + extra;
  const newStatus = newBalance === 0 ? "paid" : newPaid > 0 ? "partial" : "pending";

  await safeAction(async () => {
    const { error: payError } = await db.from("payments").insert({
      student_id: student.id,
      branch_id: student.branch_id,
      date,
      amount,
      method,
      concept,
      reference: document.getElementById("pRef").value.trim() || null
    });
    if (payError) throw payError;

    const { error: studentError } = await db.from("students").update({
      paid_amount: newPaid,
      balance: newBalance,
      credit_balance: newCredit,
      payment_status: newStatus,
      last_payment_date: date,
      next_payment_date: newStatus === "paid" ? buildNextPaymentDate(student.payment_day, date) : student.next_payment_date
    }).eq("id", student.id);
    if (studentError) throw studentError;
  }, "Pago registrado.");
}

/* ============================================================
   CASH
   ============================================================ */
function renderCash(content, search) {
  const boxes = cashBoxes.filter(filterByBranch);
  const movements = cashMovements.filter(m => {
    const haystack = [m.category, m.description, m.source, getBranchName(m.branch_id)].join(" ").toLowerCase();
    return haystack.includes(search) && filterByBranch(m) && (filters.cashType === "all" || m.type === filters.cashType);
  });

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Saldo total</div><div class="kpi-value mono">${formatCurrency(boxes.reduce((a,c) => a + Number(c.current_balance || 0), 0))}</div><div class="kpi-help">Caja</div></div>
      <div class="card kpi"><div class="kpi-label">Ingresos</div><div class="kpi-value mono">${formatCurrency(movements.filter(m => m.type === "ingreso").reduce((a,m) => a + Number(m.amount || 0), 0))}</div><div class="kpi-help">Movimientos</div></div>
      <div class="card kpi"><div class="kpi-label">Egresos</div><div class="kpi-value mono">${formatCurrency(movements.filter(m => m.type === "egreso").reduce((a,m) => a + Number(m.amount || 0), 0))}</div><div class="kpi-help">Gastos/vueltos</div></div>
      <div class="card kpi"><div class="kpi-label">Movimientos</div><div class="kpi-value">${movements.length}</div><div class="kpi-help">Historial</div></div>

      <div class="card span-12">
        <div class="cash-summary">
          ${boxes.map(b => `<div class="cash-box-card"><div class="cash-box-branch">${escape(getBranchName(b.branch_id))}</div><div class="cash-box-balance">${formatCurrency(b.current_balance)}</div></div>`).join("")}
        </div>

        <div class="filters-bar">
          ${branchFilterHtml()}
          <select class="filter-select" onchange="setFilter('cashType', this.value)">
            <option value="all">Todos</option>
            <option value="ingreso" ${filters.cashType === "ingreso" ? "selected" : ""}>Ingresos</option>
            <option value="egreso" ${filters.cashType === "egreso" ? "selected" : ""}>Egresos</option>
          </select>
        </div>

        <div class="table-wrapper">
          <table>
            <thead><tr><th>Fecha</th><th>Sede</th><th>Tipo</th><th>Categoría</th><th>Fuente</th><th>Descripción</th><th>Monto</th></tr></thead>
            <tbody>
              ${movements.map(m => `
                <tr>
                  <td>${formatDateTime(m.date)}</td>
                  <td>${escape(getBranchName(m.branch_id))}</td>
                  <td><span class="badge ${m.type === "ingreso" ? "ok" : "warning"}">${escape(m.type)}</span></td>
                  <td>${escape(m.category)}</td>
                  <td>${escape(m.source)}</td>
                  <td>${escape(m.description || "—")}</td>
                  <td class="mono">${formatCurrency(m.amount)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function openCashMovementModal() {
  document.getElementById("modalTitle").textContent = "Movimiento de caja";

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group"><label>Sede</label><select id="cBranch">${branchOptions(branches[0]?.id)}</select></div>
    <div class="form-group"><label>Tipo</label><select id="cType"><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></div>
    <div class="form-group"><label>Categoría</label>
      <select id="cCategory">
        <option>Apertura semanal</option>
        <option>Ajuste manual</option>
        ${EXPENSE_CATEGORIES.map(c => `<option>${c}</option>`).join("")}
      </select>
    </div>
    <div class="form-group"><label>Monto</label><input type="number" id="cAmount" min="0.01" step="0.01" required></div>
    <div class="form-group full"><label>Descripción</label><textarea id="cDesc"></textarea></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" type="submit">Guardar</button>
    </div>`;

  document.getElementById("modalForm").onsubmit = async e => {
    e.preventDefault();

    const branchId = document.getElementById("cBranch").value;
    const box = cashBoxes.find(c => c.branch_id === branchId);
    const type = document.getElementById("cType").value;
    const amount = Number(document.getElementById("cAmount").value);

    if (!box) {
      showToast("No existe caja para esta sede.", "error");
      return;
    }

    if (amount <= 0) {
      showToast("Monto inválido.", "error");
      return;
    }

    await safeAction(async () => {
      const category = document.getElementById("cCategory").value;
      const { error } = await db.from("cash_movements").insert({
        cash_box_id: box.id,
        branch_id: branchId,
        type,
        category,
        amount,
        description: document.getElementById("cDesc").value.trim() || null,
        source: category === "Apertura semanal" ? "apertura semanal" : "ajuste manual",
        payment_method: "Efectivo"
      });
      if (error) throw error;
    }, "Movimiento de caja registrado.");
  };

  openModal();
}

/* ============================================================
   INVENTORY
   ============================================================ */
function renderInventory(content, search) {
  const list = inventory.filter(p => {
    const haystack = [p.name, p.category].join(" ").toLowerCase();
    return haystack.includes(search) && (filters.stock === "all" || (filters.stock === "low" && isLowStock(p)));
  });

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Productos</div><div class="kpi-value">${inventory.length}</div><div class="kpi-help">Registrados</div></div>
      <div class="card kpi"><div class="kpi-label">Stock crítico</div><div class="kpi-value">${inventory.filter(isLowStock).length}</div><div class="kpi-help">Reponer</div></div>
      <div class="card kpi"><div class="kpi-label">Unidades</div><div class="kpi-value">${inventory.reduce((a,p) => a + Number(p.stock || 0), 0)}</div><div class="kpi-help">Disponibles</div></div>
      <div class="card kpi"><div class="kpi-label">Valor inventario</div><div class="kpi-value mono">${formatCurrency(inventory.reduce((a,p) => a + Number(p.price || 0) * Number(p.stock || 0), 0))}</div><div class="kpi-help">Precio × stock</div></div>

      <div class="card span-12">
        <div class="filters-bar">
          <select class="filter-select" onchange="setFilter('stock', this.value)">
            <option value="all">Todos</option>
            <option value="low" ${filters.stock === "low" ? "selected" : ""}>Stock crítico</option>
          </select>
        </div>

        <div class="table-wrapper">
          <table>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Mínimo</th><th>Valor</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map(p => `
                <tr>
                  <td>${escape(p.name)}</td>
                  <td>${escape(p.category)}</td>
                  <td class="mono">${formatCurrency(p.price)}</td>
                  <td><strong>${p.stock}</strong></td>
                  <td>${p.min_stock}</td>
                  <td class="mono">${formatCurrency(Number(p.price) * Number(p.stock))}</td>
                  <td><span class="badge ${isLowStock(p) ? "warning" : "neutral"}">${isLowStock(p) ? "Reponer" : "Estable"}</span></td>
                  <td style="display:flex;gap:4px;padding-right:0">
                    <button class="btn btn-ghost btn-sm btn-icon" onclick="openProductModal('${p.id}')">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteProduct('${p.id}')">✕</button>
                  </td>
                </tr>`).join("") : `<tr><td colspan="8"><div class="empty-state"><p>No se encontraron productos.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function openProductModal(id = null) {
  const p = id ? getProduct(id) : null;
  editingId = id;

  document.getElementById("modalTitle").textContent = id ? "Editar producto" : "Agregar producto";

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group"><label>Producto</label><input type="text" id="prdName" required value="${escape(p?.name || "")}"></div>
    <div class="form-group"><label>Categoría</label><input type="text" id="prdCat" required value="${escape(p?.category || "")}"></div>
    <div class="form-group"><label>Precio (S/)</label><input type="number" id="prdPrice" required min="0.01" step="0.01" value="${p?.price || ""}"></div>
    <div class="form-group"><label>Stock</label><input type="number" id="prdStock" required min="0" value="${p?.stock ?? ""}"></div>
    <div class="form-group full"><label>Stock mínimo</label><input type="number" id="prdMin" required min="0" value="${p?.min_stock ?? ""}"></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar producto</button>
    </div>`;

  document.getElementById("modalForm").onsubmit = async e => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("prdName").value.trim(),
      category: document.getElementById("prdCat").value.trim(),
      price: Number(document.getElementById("prdPrice").value),
      stock: Number(document.getElementById("prdStock").value),
      min_stock: Number(document.getElementById("prdMin").value),
      active: true
    };

    if (!payload.name || !payload.category || payload.price < 0 || payload.stock < 0) {
      showToast("Completa producto, categoría, precio y stock válidos.", "error");
      return;
    }

    await safeAction(async () => {
      const result = id
        ? await db.from("inventory_products").update(payload).eq("id", id)
        : await db.from("inventory_products").insert(payload);
      if (result.error) throw result.error;
    }, "Producto guardado.");
  };

  openModal();
}

function confirmDeleteProduct(id) {
  const p = getProduct(id);
  if (!p) return;
  showConfirm("Eliminar producto", `¿Eliminar "${p.name}"?`, async () => {
    await safeAction(async () => {
      const { error } = await db.from("inventory_products").delete().eq("id", id);
      if (error) throw error;
    }, "Producto eliminado.");
  });
}

function openStockAdjustModal() {
  document.getElementById("modalTitle").textContent = "Ajustar stock";

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group full"><label>Producto</label>
      <select id="adjProd">${inventory.map(p => `<option value="${p.id}">${escape(p.name)} · stock: ${p.stock}</option>`).join("")}</select>
    </div>
    <div class="form-group full"><label>Nuevo stock</label><input type="number" id="adjStock" min="0" required></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar ajuste</button>
    </div>`;

  document.getElementById("modalForm").onsubmit = async e => {
    e.preventDefault();

    await safeAction(async () => {
      const { error } = await db.from("inventory_products")
        .update({ stock: Number(document.getElementById("adjStock").value) })
        .eq("id", document.getElementById("adjProd").value);
      if (error) throw error;
    }, "Stock actualizado.");
  };

  openModal();
}

/* ============================================================
   SALES
   ============================================================ */
function renderSales(content, search) {
  const list = sales.filter(s => {
    const products = (s.sale_items || []).map(i => i.product_name).join(" ");
    const haystack = [s.receipt_number, s.customer_name, s.method, getBranchName(s.branch_id), products].join(" ").toLowerCase();
    return haystack.includes(search) &&
      filterByBranch(s) &&
      (filters.saleMethod === "all" || s.method === filters.saleMethod);
  });

  const totalSales = list.reduce((a,s) => a + Number(s.total || 0), 0);
  const totalUnits = list.reduce((a,s) => a + (s.sale_items || []).reduce((b,i) => b + Number(i.quantity || 0), 0), 0);

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Ventas</div><div class="kpi-value">${list.length}</div><div class="kpi-help">Boletas</div></div>
      <div class="card kpi"><div class="kpi-label">Ingreso</div><div class="kpi-value mono">${formatCurrency(totalSales)}</div><div class="kpi-help">Filtrado</div></div>
      <div class="card kpi"><div class="kpi-label">Efectivo</div><div class="kpi-value mono">${formatCurrency(list.filter(s => s.method === "Efectivo").reduce((a,s) => a + Number(s.total || 0), 0))}</div><div class="kpi-help">Caja</div></div>
      <div class="card kpi"><div class="kpi-label">Unidades</div><div class="kpi-value">${totalUnits}</div><div class="kpi-help">Vendidas</div></div>

      <div class="card span-12">
        <div class="filters-bar">
          ${branchFilterHtml()}
          <select class="filter-select" onchange="setFilter('saleMethod', this.value)">
            <option value="all">Todos los métodos</option>
            ${PAYMENT_METHODS.map(m => `<option value="${m}" ${filters.saleMethod === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>

        <div class="table-wrapper">
          <table>
            <thead><tr><th>Boleta</th><th>Fecha</th><th>Cliente</th><th>Sede</th><th>Productos</th><th>Método</th><th>Total</th><th></th></tr></thead>
            <tbody>
              ${list.length ? list.map(s => {
                const items = s.sale_items || [];
                const itemCount = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
                const productsLabel = items.length === 0
                  ? "—"
                  : items.length === 1
                    ? `${escape(items[0].product_name)} ×${items[0].quantity}`
                    : `<span class="sale-products-summary" title="${escape(items.map(i => `${i.product_name} ×${i.quantity}`).join(", "))}">${items.length} productos · ${itemCount} unid.</span>`;
                return `
                <tr>
                  <td class="mono">${escape(s.receipt_number)}</td>
                  <td>${formatDateTime(s.date)}</td>
                  <td>${escape(s.customer_name)}</td>
                  <td>${escape(getBranchName(s.branch_id))}</td>
                  <td>${productsLabel}</td>
                  <td>${escape(s.method)}</td>
                  <td class="mono">${formatCurrency(s.total)}</td>
                  <td><button class="btn btn-ghost btn-sm" onclick="printReceipt('${s.id}')">🖨 Imprimir</button></td>
                </tr>`;
              }).join("") : `<tr><td colspan="8"><div class="empty-state"><p>No hay ventas registradas.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   SALES — Carrito multi-producto
   ============================================================ */
let saleCart = [];

function getCartItem(productId) {
  return saleCart.find(i => i.product_id === productId);
}

function getCartTotal() {
  return saleCart.reduce((sum, i) => sum + i.quantity * Number(i.price), 0);
}

function getProductRemainingStock(productId) {
  const product = getProduct(productId);
  if (!product) return 0;
  const inCart = getCartItem(productId)?.quantity || 0;
  return Number(product.stock) - inCart;
}

function addToCart() {
  const productId = document.getElementById("saleProd")?.value;
  const qty = Number(document.getElementById("saleQty")?.value || 1);
  const product = getProduct(productId);

  if (!product) return;
  if (qty < 1) {
    showToast("La cantidad debe ser al menos 1.", "error");
    return;
  }

  const existing = getCartItem(productId);
  const currentInCart = existing?.quantity || 0;
  const totalRequested = currentInCart + qty;

  if (totalRequested > Number(product.stock)) {
    showToast(`Stock insuficiente. Disponible: ${Number(product.stock) - currentInCart}.`, "error");
    return;
  }

  if (existing) {
    existing.quantity = totalRequested;
  } else {
    saleCart.push({
      product_id: product.id,
      product_name: product.name,
      price: Number(product.price),
      quantity: qty
    });
  }

  document.getElementById("saleQty").value = 1;
  refreshSaleModalUI();
}

function updateCartItemQty(productId, newQty) {
  const item = getCartItem(productId);
  const product = getProduct(productId);
  if (!item || !product) return;

  const qty = Number(newQty);
  if (!qty || qty < 1) {
    removeFromCart(productId);
    return;
  }

  if (qty > Number(product.stock)) {
    showToast(`Stock insuficiente. Máximo: ${product.stock}.`, "error");
    item.quantity = Number(product.stock);
  } else {
    item.quantity = qty;
  }

  refreshSaleModalUI();
}

function removeFromCart(productId) {
  saleCart = saleCart.filter(i => i.product_id !== productId);
  refreshSaleModalUI();
}

function clearCart() {
  saleCart = [];
}

function renderCartTable() {
  if (!saleCart.length) {
    return `<div class="cart-empty">Carrito vacío. Selecciona un producto y haz clic en <strong>Añadir</strong>.</div>`;
  }

  return `
    <div class="cart-wrapper">
      <table class="cart-table">
        <thead>
          <tr><th>Producto</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Subtotal</th><th></th></tr>
        </thead>
        <tbody>
          ${saleCart.map(i => `
            <tr>
              <td>${escape(i.product_name)}</td>
              <td class="num mono">${formatCurrency(i.price)}</td>
              <td class="num">
                <input type="number" min="1" value="${i.quantity}" class="cart-qty-input"
                  onchange="updateCartItemQty('${i.product_id}', this.value)">
              </td>
              <td class="num mono">${formatCurrency(i.price * i.quantity)}</td>
              <td><button type="button" class="cart-remove-btn" onclick="removeFromCart('${i.product_id}')" title="Quitar">✕</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductSelectOptions() {
  const available = inventory.filter(p => getProductRemainingStock(p.id) > 0);
  if (!available.length) {
    return `<option value="">Sin productos disponibles</option>`;
  }
  return available.map(p => {
    const remaining = getProductRemainingStock(p.id);
    return `<option value="${p.id}">${escape(p.name)} · ${formatCurrency(p.price)} · stock: ${remaining}</option>`;
  }).join("");
}

function refreshSaleModalUI() {
  const cartContainer = document.getElementById("saleCartContainer");
  if (cartContainer) cartContainer.innerHTML = renderCartTable();

  const prodSelect = document.getElementById("saleProd");
  if (prodSelect) {
    const prevValue = prodSelect.value;
    prodSelect.innerHTML = renderProductSelectOptions();
    if ([...prodSelect.options].some(o => o.value === prevValue)) {
      prodSelect.value = prevValue;
    }
  }

  const total = getCartTotal();
  const totalEl = document.getElementById("saleTotal");
  if (totalEl) totalEl.textContent = formatCurrency(total);

  const received = Number(document.getElementById("saleReceived")?.value || 0);
  const change = Math.max(received - total, 0);
  const changeEl = document.getElementById("saleChange");
  if (changeEl) changeEl.value = formatCurrency(change);

  const hintEl = document.getElementById("saleCashHint");
  const branchId = document.getElementById("saleBranch")?.value;
  const method = document.getElementById("saleMethod")?.value;
  if (hintEl && branchId && method === "Efectivo") {
    const balance = getCashBalanceForBranch(branchId);
    hintEl.textContent = change > balance
      ? `⚠️ Caja disponible: ${formatCurrency(balance)}. No alcanza para el vuelto de ${formatCurrency(change)}.`
      : `Caja disponible para vuelto: ${formatCurrency(balance)}.`;
  }
}

function openSaleModal() {
  if (!inventory.some(p => Number(p.stock) > 0)) {
    showToast("No hay productos con stock disponible.", "error");
    return;
  }

  clearCart();
  document.getElementById("modalTitle").textContent = "Nueva venta";

  document.getElementById("modalForm").innerHTML = `
    <div class="form-group"><label>Sede</label><select id="saleBranch" onchange="refreshSaleModalUI()">${branchOptions(branches[0]?.id)}</select></div>
    <div class="form-group"><label>Cliente</label><input type="text" id="saleCust" required placeholder="Nombre del cliente" autocomplete="off"></div>

    <div class="form-group full">
      <label>Agregar producto al carrito</label>
      <div class="cart-add-row">
        <select id="saleProd" class="cart-add-product">${renderProductSelectOptions()}</select>
        <input type="number" id="saleQty" min="1" value="1" class="cart-add-qty" placeholder="Cant.">
        <button type="button" class="btn btn-secondary" onclick="addToCart()">+ Añadir</button>
      </div>
    </div>

    <div class="form-group full">
      <label>Carrito</label>
      <div id="saleCartContainer">${renderCartTable()}</div>
    </div>

    <div class="form-group full">
      <div class="cart-total-row">
        <span>Total</span>
        <strong id="saleTotal" class="mono">${formatCurrency(0)}</strong>
      </div>
    </div>

    <div class="form-group"><label>Método de pago</label><select id="saleMethod" onchange="toggleCashFields()">${PAYMENT_METHODS.map(m => `<option>${m}</option>`).join("")}</select></div>
    <div class="form-group cash-sale-field"><label>Recibido (S/)</label><input type="number" id="saleReceived" min="0" step="0.01" placeholder="0.00" oninput="refreshSaleModalUI()"></div>
    <div class="form-group cash-sale-field"><label>Vuelto</label><input id="saleChange" readonly value="${formatCurrency(0)}"></div>
    <div class="form-group full cash-sale-field"><div class="form-hint" id="saleCashHint">La venta se bloqueará si el vuelto requerido supera el efectivo disponible en caja.</div></div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary">Registrar venta</button>
    </div>`;

  document.getElementById("modalForm").onsubmit = saveSale;
  toggleCashFields();
  openModal();
}

function toggleCashFields() {
  const isCash = document.getElementById("saleMethod")?.value === "Efectivo";
  document.querySelectorAll(".cash-sale-field").forEach(el => el.style.display = isCash ? "flex" : "none");
  refreshSaleModalUI();
}

function getNextReceiptNumber() {
  const nums = sales.map(s => Number(String(s.receipt_number || "").replace(/\D/g, ""))).filter(Boolean);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `B001-${String(next).padStart(6, "0")}`;
}

function getCashBalanceForBranch(branchId) {
  const box = cashBoxes.find(c => c.branch_id === branchId);
  return Number(box?.current_balance || 0);
}

async function getFreshCashBalanceForBranch(branchId) {
  const { data, error } = await db
    .from("cash_boxes")
    .select("current_balance")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) throw error;
  return Number(data?.current_balance || 0);
}

async function saveSale(e) {
  e.preventDefault();

  const customerName = document.getElementById("saleCust").value.trim();
  const method = document.getElementById("saleMethod").value;
  const total = getCartTotal();
  const received = method === "Efectivo" ? Number(document.getElementById("saleReceived").value || total) : 0;
  const change = method === "Efectivo" ? received - total : 0;

  if (!customerName) {
    showToast("Ingresa el nombre del cliente.", "error");
    return;
  }
  if (!saleCart.length) {
    showToast("El carrito está vacío. Agrega al menos un producto.", "error");
    return;
  }
  for (const item of saleCart) {
    const product = getProduct(item.product_id);
    if (!product || item.quantity > Number(product.stock)) {
      showToast(`Stock insuficiente para ${item.product_name}.`, "error");
      return;
    }
  }
  const branchId = document.getElementById("saleBranch").value;

  if (method === "Efectivo" && received < total) {
    showToast("El monto recibido no puede ser menor al total.", "error");
    return;
  }

  if (method === "Efectivo" && change > 0) {
    try {
      const availableCash = await getFreshCashBalanceForBranch(branchId);
      if (change > availableCash) {
        showToast(`No hay suficiente efectivo para dar vuelto. Caja disponible: ${formatCurrency(availableCash)} · Vuelto requerido: ${formatCurrency(change)}.`, "error");
        return;
      }
    } catch (error) {
      console.error(error);
      showToast("No se pudo verificar el saldo de caja. Intenta nuevamente.", "error");
      return;
    }
  }

  await safeAction(async () => {
    const { data: sale, error: saleError } = await db.from("sales").insert({
      branch_id: branchId,
      customer_name: customerName,
      receipt_number: getNextReceiptNumber(),
      method,
      total,
      cash_received: received,
      change_given: Math.max(change, 0)
    }).select().single();

    if (saleError) throw saleError;

    const itemsPayload = saleCart.map(i => ({
      sale_id: sale.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      price: i.price,
      subtotal: i.price * i.quantity
    }));

    const { error: itemError } = await db.from("sale_items").insert(itemsPayload);
    if (itemError) throw itemError;

    clearCart();
  }, "Venta registrada.");
}

function printReceipt(id) {
  const sale = sales.find(s => s.id === id);
  if (!sale) return;

  const win = window.open("", "_blank", "width=680,height=760");
  if (!win) {
    showToast("Permite ventanas emergentes para imprimir.", "error");
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><title>Boleta ${escape(sale.receipt_number)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;max-width:520px;margin:0 auto;color:#18181b}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border-bottom:1px solid #e4e4e7;padding:8px;text-align:left;font-size:13px}
      .total{font-size:20px;font-weight:700;margin-top:12px}
      .meta{color:#52525b;font-size:13px;line-height:1.6}
    </style></head><body>
    <h2>ESAM-DO 2026</h2>
    <div class="meta">
      <div>Boleta: <strong>${escape(sale.receipt_number)}</strong></div>
      <div>Fecha: ${formatDateTime(sale.date)}</div>
      <div>Cliente: ${escape(sale.customer_name)}</div>
      <div>Sede: ${escape(getBranchName(sale.branch_id))}</div>
    </div>
    <table>
      <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>${(sale.sale_items || []).map(i => `<tr><td>${escape(i.product_name)}</td><td>${i.quantity}</td><td>${formatCurrency(i.price)}</td><td>${formatCurrency(i.subtotal)}</td></tr>`).join("")}</tbody>
    </table>
    <div>Método: ${escape(sale.method)}</div>
    <div>Recibido: ${formatCurrency(sale.cash_received)}</div>
    <div>Vuelto: ${formatCurrency(sale.change_given)}</div>
    <div class="total">Total: ${formatCurrency(sale.total)}</div>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`);

  win.document.close();
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports(content, search) {
  const totalPayments = payments.reduce((a,p) => a + Number(p.amount || 0), 0);
  const totalSales = sales.reduce((a,s) => a + Number(s.total || 0), 0);
  const cashIn = cashMovements.filter(m => m.type === "ingreso").reduce((a,m) => a + Number(m.amount || 0), 0);
  const cashOut = cashMovements.filter(m => m.type === "egreso").reduce((a,m) => a + Number(m.amount || 0), 0);

  content.innerHTML = `
    <div class="grid">
      <div class="card kpi"><div class="kpi-label">Pagos</div><div class="kpi-value mono">${formatCurrency(totalPayments)}</div><div class="kpi-help">Finanzas</div></div>
      <div class="card kpi"><div class="kpi-label">Ventas</div><div class="kpi-value mono">${formatCurrency(totalSales)}</div><div class="kpi-help">Tienda</div></div>
      <div class="card kpi"><div class="kpi-label">Ingresos caja</div><div class="kpi-value mono">${formatCurrency(cashIn)}</div><div class="kpi-help">Caja</div></div>
      <div class="card kpi"><div class="kpi-label">Egresos caja</div><div class="kpi-value mono">${formatCurrency(cashOut)}</div><div class="kpi-help">Gastos/vueltos</div></div>

      <div class="card span-4">
        <div class="section-title">Alumnos por sede</div>
        <div class="info-list">${branches.map(b => `<div class="info-row"><span>${escape(getBranchName(b.id))}</span><strong>${students.filter(s => s.branch_id === b.id).length}</strong></div>`).join("")}</div>
      </div>

      <div class="card span-4">
        <div class="section-title">Alumnos por disciplina</div>
        <div class="info-list">${DISCIPLINES.map(d => `<div class="info-row"><span>${escape(d)}</span><strong>${students.filter(s => s.discipline === d).length}</strong></div>`).join("")}</div>
      </div>

      <div class="card span-4">
        <div class="section-title">Inventario</div>
        <div class="info-list">
          <div class="info-row"><span>Productos</span><strong>${inventory.length}</strong></div>
          <div class="info-row"><span>Stock crítico</span><strong>${inventory.filter(isLowStock).length}</strong></div>
          <div class="info-row"><span>Valor inventario</span><strong>${formatCurrency(inventory.reduce((a,p) => a + Number(p.price || 0) * Number(p.stock || 0), 0))}</strong></div>
        </div>
      </div>

      <div class="card span-12">
        <div class="section-title">Últimos movimientos de caja</div>
        <div class="history-list">
          ${cashMovements.slice(0, 12).map(m => `
            <article class="history-item" data-type="cash">
              <div class="history-head">
                <div class="history-title">${escape(m.category)} · ${formatCurrency(m.amount)}</div>
                <div class="history-time">${formatDateTime(m.date)}</div>
              </div>
              <div class="history-meta">${escape(getBranchName(m.branch_id))} · ${escape(m.description || m.source)}</div>
            </article>`).join("")}
        </div>
      </div>
    </div>`;
}

/* ============================================================
   EXPORTS
   ============================================================ */
function exportCSV(rows, filename) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportStudents() {
  exportCSV([
    ["Código","DNI","Nombre","Edad","Teléfono","Correo","Sede","Disciplina","Horario","Mensualidad","Matrícula","Estado pago","Saldo","Próximo pago","Estado"],
    ...students.map(s => [
      s.registration_code, s.document_number, s.name, s.age, s.phone, s.email,
      getBranchName(s.branch_id), s.discipline, getScheduleLabel(s.schedule_id),
      s.monthly_fee, s.enrollment_fee, getPaymentStatusLabel(s.payment_status), s.balance, s.next_payment_date, s.status
    ])
  ], "alumnos_esamdo.csv");
}

function exportPayments() {
  exportCSV([
    ["Fecha","Alumno","Código","Sede","Concepto","Método","Referencia","Monto"],
    ...payments.map(p => [p.date, p.students?.name, p.students?.registration_code, getBranchName(p.branch_id), p.concept, p.method, p.reference, p.amount])
  ], "pagos_esamdo.csv");
}

function exportAttendance() {
  exportCSV([
    ["Fecha","Alumno","Código","Sede","Horario","Estado","Notas"],
    ...attendance.map(a => [a.date, a.students?.name, a.students?.registration_code, getBranchName(a.branch_id), getScheduleLabel(a.schedule_id), a.status, a.notes])
  ], "asistencia_esamdo.csv");
}

function exportCash() {
  exportCSV([
    ["Fecha","Sede","Tipo","Categoría","Fuente","Descripción","Monto"],
    ...cashMovements.map(m => [m.date, getBranchName(m.branch_id), m.type, m.category, m.source, m.description, m.amount])
  ], "caja_esamdo.csv");
}

function exportSales() {
  exportCSV([
    ["Boleta","Fecha","Cliente","Sede","Método","Total","Recibido","Vuelto"],
    ...sales.map(s => [s.receipt_number, s.date, s.customer_name, getBranchName(s.branch_id), s.method, s.total, s.cash_received, s.change_given])
  ], "ventas_esamdo.csv");
}