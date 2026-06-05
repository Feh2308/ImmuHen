export const TENANT_CHANGED_EVENT = "immuhen-tenant-changed";

const CURRENT_TENANT_KEY = "currentTenantId";
const TENANT_STORAGE_PREFIX = "immuhen:tenant:";
const TENANT_SCOPED_KEYS = new Set([
  "farmProfile",
  "vaccinators",
  "schedules",
  "requests",
  "completedVaccinations",
  "vaccinatorNotifications",
  "vaccinatorPortalSession",
  "vaccines",
  "entries",
  "outputs",
  "stockAlertLevels",
  "stockAlertHistory",
]);

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function decodeAuthToken(token) {
  if (!token || !token.includes(".")) {
    return {};
  }

  try {
    const [payload] = token.split(".");
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    return JSON.parse(window.atob(padded));
  } catch (error) {
    console.log(error);
    return {};
  }
}

function getTenantIdFromSession() {
  if (!canUseStorage()) {
    return "";
  }

  try {
    const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const tokenPayload = decodeAuthToken(localStorage.getItem("token") || "");

    return (
      storedUser.tenantId ||
      tokenPayload.tenantId ||
      storedUser.email ||
      tokenPayload.email ||
      storedUser.id ||
      tokenPayload.accountId ||
      ""
    );
  } catch (error) {
    console.log(error);
    return "";
  }
}

function emitTenantChanged(tenantId = getCurrentTenantId()) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(TENANT_CHANGED_EVENT, { detail: { tenantId } }));
  window.dispatchEvent(new Event("vacitech-storage"));
}

export function getCurrentTenantId() {
  if (!canUseStorage()) {
    return "";
  }

  return localStorage.getItem(CURRENT_TENANT_KEY) || getTenantIdFromSession();
}

export function setCurrentTenantContext(authData = {}, options = {}) {
  if (!canUseStorage()) {
    return "";
  }

  const tokenPayload = decodeAuthToken(authData.token || localStorage.getItem("token") || "");
  const user = authData.user || {};
  const tenantId = (
    user.tenantId ||
    tokenPayload.tenantId ||
    user.email ||
    tokenPayload.email ||
    user.id ||
    tokenPayload.accountId ||
    ""
  );

  if (tenantId) {
    localStorage.setItem(CURRENT_TENANT_KEY, tenantId);
  } else {
    localStorage.removeItem(CURRENT_TENANT_KEY);
  }

  if (!options.silent) {
    emitTenantChanged(tenantId);
  }

  return tenantId;
}

export function saveAccountSession({ token, user }, options = {}) {
  if (!canUseStorage()) {
    return "";
  }

  localStorage.setItem("token", token || "");
  localStorage.setItem("user", JSON.stringify(user || {}));

  return setCurrentTenantContext({ token, user }, options);
}

export function clearAccountSession() {
  if (!canUseStorage()) {
    return;
  }

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem(CURRENT_TENANT_KEY);
  emitTenantChanged("");
}

export function notifyTenantStorageReady() {
  emitTenantChanged();
}

export function getStorageKey(key) {
  if (!TENANT_SCOPED_KEYS.has(key)) {
    return key;
  }

  return `${TENANT_STORAGE_PREFIX}${getCurrentTenantId() || "guest"}:${key}`;
}

export function readJson(key, fallback) {
  try {
    const storedValue = localStorage.getItem(getStorageKey(key));

    return storedValue
      ? JSON.parse(storedValue)
      : fallback;
  } catch (error) {
    console.log(error);
    return fallback;
  }
}

export function writeJson(key, value, options = {}) {
  localStorage.setItem(getStorageKey(key), JSON.stringify(value));

  if (!options.silent) {
    window.dispatchEvent(new Event("vacitech-storage"));
  }
}

export function removeJson(key, options = {}) {
  localStorage.removeItem(getStorageKey(key));

  if (!options.silent) {
    window.dispatchEvent(new Event("vacitech-storage"));
  }
}

export function getFarmProfile() {
  return readJson("farmProfile", {}) || {};
}

export const DEFAULT_RANCHES = [
  { id: "pinteiro", name: "Pinteiro" },
  { id: "rancho-1", name: "Rancho 1" },
];

export function normalizeRanches(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((ranch, index) => ({
      id: String(ranch?.id || `rancho-${index + 1}`),
      name: String(ranch?.name || "").trim(),
    }))
    .filter((ranch) => ranch.name);
}

export function getProfileRanches(profile = getFarmProfile()) {
  const ranches = normalizeRanches(profile.ranches);

  return ranches.length
    ? ranches
    : DEFAULT_RANCHES;
}

export function normalizeImportantContacts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((contact, index) => ({
      id: String(contact?.id || `contato-${index + 1}`),
      role: String(contact?.role || "").trim(),
      name: String(contact?.name || "").trim(),
      phone: String(contact?.phone || "").trim(),
    }))
    .filter((contact) => contact.role || contact.name || contact.phone);
}

export function hasCompleteFarmProfile(profile = getFarmProfile()) {
  return Boolean(
    profile.farmName &&
    profile.city &&
    profile.document &&
    profile.owner
  );
}

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function findVaccinatorByContact(vaccinators, email, phone) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  return vaccinators.find((vaccinator) => (
    normalizeEmail(vaccinator.email) === normalizedEmail &&
    normalizePhone(vaccinator.phone) === normalizedPhone
  ));
}

export function matchesVaccinator(item, vaccinator) {
  if (!item || !vaccinator) {
    return false;
  }

  if (
    item.vaccinatorId &&
    vaccinator.id &&
    String(item.vaccinatorId) === String(vaccinator.id)
  ) {
    return true;
  }

  const itemEmail = item.vaccinatorEmail || item.email;
  const itemPhone = item.vaccinatorPhone || item.phone;

  return (
    normalizeEmail(itemEmail) === normalizeEmail(vaccinator.email) &&
    normalizePhone(itemPhone) === normalizePhone(vaccinator.phone)
  );
}

export function appendVaccinatorNotification(notification) {
  const notifications = readJson("vaccinatorNotifications", []);

  writeJson("vaccinatorNotifications", [
    ...notifications,
    {
      id: Date.now() + Math.random(),
      createdAt: new Date().toLocaleString("pt-BR"),
      read: false,
      ...notification,
    },
  ]);
}

export function formatDate(date) {
  if (!date) {
    return "-";
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

export function formatPeriod(startDate, endDate) {
  if (!startDate && !endDate) {
    return "-";
  }

  if (!startDate || !endDate) {
    return formatDate(startDate || endDate);
  }

  return `${formatDate(startDate)} ate ${formatDate(endDate)}`;
}

export function normalizeRequestStatus(status) {
  if (status === "CONFIRMADO") {
    return "CONFIRMADA";
  }

  if (status === "RECUSADO") {
    return "RECUSADA";
  }

  if (
    status === "CONFIRMADA" ||
    status === "RECUSADA" ||
    status === "EM_ANDAMENTO" ||
    status === "CONCLUIDA"
  ) {
    return status;
  }

  return status || "PENDENTE";
}

export function getStatusClass(status) {
  const normalizedStatus = normalizeRequestStatus(status);

  if (normalizedStatus === "CONFIRMADA") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (normalizedStatus === "RECUSADA") {
    return "bg-red-100 text-red-700 border-red-200";
  }

  if (normalizedStatus === "EM_ANDAMENTO") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  if (normalizedStatus === "CONCLUIDA") {
    return "bg-zinc-900 text-white border-zinc-900";
  }

  return "bg-yellow-100 text-yellow-700 border-yellow-200";
}
