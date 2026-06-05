export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`
).replace(/\/$/, "");

export const PAYMENTS_ENABLED = import.meta.env.VITE_ENABLE_PAYMENTS === "true";

function getAuthToken() {
  return localStorage.getItem("token") || "";
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = response.status === 402
      ? "Assinatura vencida. Renove o acesso mensal para continuar usando."
      : error.message || "Erro ao acessar a API ImmuHen";

    throw new Error(message);
  }

  return response.json();
}

async function apiBlobRequest(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Erro ao acessar a API ImmuHen");
  }

  return response.blob();
}

export async function loginApi(credentials) {
  return apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function registerFarmAccountApi(account) {
  return apiRequest("/api/accounts/register", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export async function fetchSubscriptionStatusApi() {
  const data = await apiRequest("/api/subscription/status");
  return data.subscription;
}

export async function createSubscriptionCheckoutApi(months = 1, email = "") {
  return apiRequest("/api/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({ months, email }),
  });
}

export async function createSubscriptionPixApi(months = 1, email = "") {
  return apiRequest("/api/subscription/pix", {
    method: "POST",
    body: JSON.stringify({ months, email }),
  });
}

export async function fetchSharedStateApi() {
  return apiRequest("/api/vacitech/state");
}

export async function saveInventoryStateApi(inventoryState) {
  return apiRequest("/api/vacitech/inventory-state", {
    method: "PUT",
    body: JSON.stringify(inventoryState),
  });
}

export async function saveFarmProfileApi(profile) {
  const data = await apiRequest("/api/vacitech/farm-profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });

  return data.farmProfile;
}

export async function fetchVaccinatorsApi() {
  return apiRequest("/api/vacitech/vaccinators");
}

export async function createVaccinatorApi(vaccinator) {
  const data = await apiRequest("/api/vacitech/vaccinators", {
    method: "POST",
    body: JSON.stringify(vaccinator),
  });

  return data.vaccinator;
}

export async function updateVaccinatorApi(id, vaccinator) {
  const data = await apiRequest(`/api/vacitech/vaccinators/${id}`, {
    method: "PUT",
    body: JSON.stringify(vaccinator),
  });

  return data.vaccinator;
}

export async function deleteVaccinatorApi(id) {
  return apiRequest(`/api/vacitech/vaccinators/${id}`, {
    method: "DELETE",
  });
}

export async function fetchRequestsApi() {
  return apiRequest("/api/vacitech/requests");
}

export async function fetchSchedulesApi() {
  return apiRequest("/api/vacitech/schedules");
}

export async function createScheduleApi(schedule) {
  return apiRequest("/api/vacitech/schedules", {
    method: "POST",
    body: JSON.stringify(schedule),
  });
}

export async function deleteScheduleApi(id) {
  return apiRequest(`/api/vacitech/schedules/${id}`, {
    method: "DELETE",
  });
}

export async function updateRequestStatusApi(id, status) {
  return apiRequest(`/api/vacitech/requests/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateRequestVaccinesApi(id, vaccineUsages) {
  return apiRequest(`/api/vacitech/requests/${id}/vaccines`, {
    method: "PATCH",
    body: JSON.stringify({ vaccineUsages }),
  });
}

export async function postponeVaccinationApi(id, postponement) {
  return apiRequest(`/api/vacitech/requests/${id}/postpone`, {
    method: "POST",
    body: JSON.stringify(postponement),
  });
}

export async function confirmVaccinationCompletionApi(id, payload = {}) {
  return apiBlobRequest(`/api/vacitech/requests/${id}/confirm-completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function uploadTemperaturePhotoApi(id, payload) {
  return apiRequest(`/api/vacitech/requests/${id}/temperature-photo`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function requestExtraDosesApi(id, message) {
  return apiRequest(`/api/vacitech/requests/${id}/dose-request`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function confirmDoseRequestApi(id, items) {
  return apiRequest(`/api/vacitech/requests/${id}/dose-request/confirm`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function createStockLowAlertApi(payload) {
  return apiRequest("/api/vacitech/stock-alerts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNotificationStatusApi() {
  return apiRequest("/api/vacitech/notifications/status");
}

export async function sendNotificationTestApi() {
  return apiRequest("/api/vacitech/notifications/test", {
    method: "POST",
    body: JSON.stringify({ target: "farm" }),
  });
}

export async function authorizeStockAccessApi(password) {
  return apiRequest("/api/vacitech/stock-access", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function authorizeChiefAccessApi(password) {
  return apiRequest("/api/vacitech/chief-access", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function fetchBirdLotsApi() {
  return apiRequest("/birdlots");
}

export async function saveBirdLotApi(lot, id = null) {
  const data = await apiRequest(id ? `/birdlots/${id}` : "/birdlots", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(lot),
  });

  return data.lot;
}

export async function deleteBirdLotApi(id) {
  return apiRequest(`/birdlots/${id}`, {
    method: "DELETE",
  });
}

export async function fetchBirdLotsMonthlyReportPdfApi(month, ranch = "") {
  const searchParams = new URLSearchParams();

  if (month) {
    searchParams.set("month", month);
  }

  if (ranch) {
    searchParams.set("rancho", ranch);
  }

  const query = searchParams.toString();

  return apiBlobRequest(`/birdlots/monthly-report/pdf${query ? `?${query}` : ""}`);
}
