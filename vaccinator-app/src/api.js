const PRODUCTION_API_URL = "";
const API_TIMEOUT_MS = 15000;

function getDefaultApiUrl() {
  const hostname = window.location.hostname;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);

  if (isLocalHost) {
    return `${window.location.protocol}//${hostname}:3001`;
  }

  return PRODUCTION_API_URL || window.location.origin;
}

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  getDefaultApiUrl()
).replace(/\/$/, "");

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const isTimeout = error.name === "AbortError";
    throw new Error(
      isTimeout
        ? "A API demorou para responder. Verifique a internet e tente novamente."
        : "Nao foi possivel conectar ao servidor ImmuHen. Verifique se o app esta apontando para a API correta."
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = response.status === 402
      ? "Assinatura vencida. Entre em contato com a granja para renovar."
      : error.message || "Nao foi possivel conectar ao ImmuHen";
    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return response.json();
}

export function loginVaccinator(credentials) {
  return apiRequest("/api/vacitech/vaccinator-login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function getVaccinatorPortal(vaccinatorId) {
  return apiRequest(`/api/vacitech/vaccinator-portal/${vaccinatorId}`);
}

export function clearVaccinatorNotifications(vaccinatorId) {
  return apiRequest(`/api/vacitech/vaccinator-portal/${vaccinatorId}/notifications`, {
    method: "DELETE",
  });
}

export function updateVaccinatorNotificationContact(vaccinatorId, notificationContact) {
  return apiRequest(`/api/vacitech/vaccinator-portal/${vaccinatorId}/notification-contact`, {
    method: "PATCH",
    body: JSON.stringify({ notificationContact }),
  });
}

export function updateRequestStatus(requestId, status, payload = {}) {
  return apiRequest(`/api/vacitech/requests/${requestId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...payload }),
  });
}

export function sendRequestMessage(requestId, payload = {}) {
  return apiRequest(`/api/vacitech/requests/${requestId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postponeVaccination(requestId, postponement) {
  return apiRequest(`/api/vacitech/requests/${requestId}/postpone`, {
    method: "POST",
    body: JSON.stringify(postponement),
  });
}

export function uploadTemperaturePhoto(requestId, payload) {
  return apiRequest(`/api/vacitech/requests/${requestId}/temperature-photo`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function requestExtraDoses(requestId, message, payload = {}) {
  return apiRequest(`/api/vacitech/requests/${requestId}/dose-request`, {
    method: "POST",
    body: JSON.stringify({ message, ...payload }),
  });
}
