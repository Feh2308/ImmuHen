export function readJson(key, fallback) {
  try {
    const storedValue = localStorage.getItem(key);

    return storedValue
      ? JSON.parse(storedValue)
      : fallback;
  } catch (error) {
    console.log(error);
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("vacitech-storage"));
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
