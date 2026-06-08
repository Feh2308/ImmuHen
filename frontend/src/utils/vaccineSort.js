function getCodeNumber(vaccine) {
  const code = String(vaccine?.codigo || "").trim();
  const match = code.match(/\d+(?:[,.]\d+)?/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[0].replace(",", "."));
}

export function compareVaccinesByCode(first, second) {
  const firstCode = getCodeNumber(first);
  const secondCode = getCodeNumber(second);

  if (firstCode !== secondCode) {
    return firstCode - secondCode;
  }

  return String(first?.codigo || "").localeCompare(
    String(second?.codigo || ""),
    "pt-BR",
    { numeric: true, sensitivity: "base" }
  ) || String(first?.nome || "").localeCompare(
    String(second?.nome || ""),
    "pt-BR",
    { sensitivity: "base" }
  );
}

export function sortVaccinesByCode(vaccines = []) {
  return [...vaccines].sort(compareVaccinesByCode);
}
