import { getFarmProfile, readJson } from "./vacitechStorage";

export const defaultTheme = {
  name: "ImmuHen",
  logoDataUrl: "",
  primaryColor: "#16a34a",
  secondaryColor: "#dcfce7",
};

const DEFAULT_THEME_PATHS = [
  "/",
  "/cadastro",
  "/admin-geral",
  "/vacinador",
  "/temperatura-vacina",
];

function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : fallback;
}

export function getTenantTheme() {
  const farmProfile = getFarmProfile();
  const tenantSettings = readJson("tenantSettings", {});

  return {
    name: tenantSettings.name || farmProfile.farmName || defaultTheme.name,
    logoDataUrl: tenantSettings.logoDataUrl || farmProfile.logoDataUrl || "",
    primaryColor: normalizeHexColor(tenantSettings.primaryColor || farmProfile.primaryColor, defaultTheme.primaryColor),
    secondaryColor: normalizeHexColor(tenantSettings.secondaryColor || farmProfile.secondaryColor, defaultTheme.secondaryColor),
  };
}

export function applyTenantTheme(theme = getTenantTheme()) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty("--tenant-primary", theme.primaryColor || defaultTheme.primaryColor);
  document.documentElement.style.setProperty("--tenant-secondary", theme.secondaryColor || defaultTheme.secondaryColor);
  document.documentElement.style.setProperty("--tenant-soft", theme.secondaryColor || defaultTheme.secondaryColor);
  document.documentElement.style.setProperty("--tenant-name", `"${theme.name || "ImmuHen"}"`);
  document.title = theme.name && theme.name !== "ImmuHen"
    ? `${theme.name} | ImmuHen`
    : "ImmuHen";
}

export function shouldUseDefaultTheme(pathname = "") {
  const normalizedPath = String(pathname || "/").toLowerCase();

  return DEFAULT_THEME_PATHS.some((path) => (
    normalizedPath === path ||
    (path !== "/" && normalizedPath.startsWith(`${path}/`))
  ));
}

export function applyDefaultTheme() {
  applyTenantTheme(defaultTheme);
}

export function applyThemeForPath(pathname = "") {
  if (shouldUseDefaultTheme(pathname)) {
    applyDefaultTheme();
    return;
  }

  applyTenantTheme();
}
