export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`
).replace(/\/$/, "");

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = response.status === 402
      ? "Assinatura vencida. Entre em contato com a granja para renovar."
      : error.message || "Nao foi possivel conectar ao ImmuHen";

    throw new Error(message);
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

export function updateRequestStatus(requestId, status) {
  return apiRequest(`/api/vacitech/requests/${requestId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
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

export function requestExtraDoses(requestId, message) {
  return apiRequest(`/api/vacitech/requests/${requestId}/dose-request`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
