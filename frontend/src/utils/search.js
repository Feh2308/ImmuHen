const HEAVY_FIELD_PATTERN = /(base64|dataurl|photo|foto|image|imagem|logo|token|password|senha|secret)/i;

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function collectSearchValues(value, values = [], seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined || depth > 4) {
    return values;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    values.push(String(value));
    return values;
  }

  if (value instanceof Date) {
    values.push(value.toISOString());
    return values;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchValues(item, values, seen, depth + 1));
    return values;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return values;
    }

    seen.add(value);

    Object.entries(value).forEach(([key, item]) => {
      if (HEAVY_FIELD_PATTERN.test(key)) {
        return;
      }

      collectSearchValues(item, values, seen, depth + 1);
    });
  }

  return values;
}

export function matchesSearchQuery(record, query, extraValues = []) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText([
    ...collectSearchValues(record),
    ...extraValues,
  ].join(" "));

  return terms.every((term) => haystack.includes(term));
}
