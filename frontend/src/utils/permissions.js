export const ACCESS_MODULES = Object.freeze({
  DASHBOARD: "DASHBOARD",
  CLIENTES: "CLIENTES",
  FINANCEIRO: "FINANCEIRO",
  ESTOQUE: "ESTOQUE",
  RELATORIOS: "RELATORIOS",
  CONFIGURACOES: "CONFIGURACOES",
  AVES: "AVES",
  VACINAS: "VACINAS",
  ENTRADAS: "ENTRADAS",
  PROGRAMA: "PROGRAMA",
  VACINADORES: "VACINADORES",
  SOLICITACOES: "SOLICITACOES",
  ADMINISTRADOR: "ADMINISTRADOR",
});

export const PERMISSION_OPTIONS = Object.freeze([
  { module: ACCESS_MODULES.DASHBOARD, label: "Dashboard" },
  { module: ACCESS_MODULES.CLIENTES, label: "Clientes" },
  { module: ACCESS_MODULES.FINANCEIRO, label: "Financeiro" },
  { module: ACCESS_MODULES.ESTOQUE, label: "Estoque" },
  { module: ACCESS_MODULES.RELATORIOS, label: "Relatorios" },
  { module: ACCESS_MODULES.CONFIGURACOES, label: "Configuracoes" },
  { module: ACCESS_MODULES.AVES, label: "Aves" },
  { module: ACCESS_MODULES.VACINAS, label: "Vacinas" },
  { module: ACCESS_MODULES.ENTRADAS, label: "Entradas" },
  { module: ACCESS_MODULES.PROGRAMA, label: "Programa" },
  { module: ACCESS_MODULES.VACINADORES, label: "Vacinadores" },
  { module: ACCESS_MODULES.SOLICITACOES, label: "Solicitacoes" },
  { module: ACCESS_MODULES.ADMINISTRADOR, label: "Administrador" },
]);

export const ROLE_OPTIONS = Object.freeze([
  { role: "ADMIN", label: "Administrador" },
  { role: "GERENTE", label: "Gerente" },
  { role: "FUNCIONARIO", label: "Funcionario" },
  { role: "VISUALIZADOR", label: "Visualizador" },
]);

const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: Object.values(ACCESS_MODULES),
  GERENTE: [
    ACCESS_MODULES.DASHBOARD,
    ACCESS_MODULES.CLIENTES,
    ACCESS_MODULES.FINANCEIRO,
    ACCESS_MODULES.ESTOQUE,
    ACCESS_MODULES.RELATORIOS,
    ACCESS_MODULES.CONFIGURACOES,
    ACCESS_MODULES.AVES,
    ACCESS_MODULES.VACINAS,
    ACCESS_MODULES.ENTRADAS,
    ACCESS_MODULES.PROGRAMA,
    ACCESS_MODULES.VACINADORES,
    ACCESS_MODULES.SOLICITACOES,
  ],
  FUNCIONARIO: [
    ACCESS_MODULES.DASHBOARD,
    ACCESS_MODULES.AVES,
    ACCESS_MODULES.VACINAS,
    ACCESS_MODULES.ENTRADAS,
    ACCESS_MODULES.PROGRAMA,
    ACCESS_MODULES.SOLICITACOES,
  ],
  VISUALIZADOR: [
    ACCESS_MODULES.DASHBOARD,
    ACCESS_MODULES.AVES,
    ACCESS_MODULES.VACINAS,
    ACCESS_MODULES.ESTOQUE,
    ACCESS_MODULES.RELATORIOS,
  ],
});

const LEGACY_ROLES = Object.freeze({
  admin: "ADMIN",
  administrador: "ADMIN",
  owner: "ADMIN",
  chefe: "ADMIN",
  gerente: "GERENTE",
  funcionario: "FUNCIONARIO",
  funcionaria: "FUNCIONARIO",
  visualizador: "VISUALIZADOR",
});

export function normalizeRole(role) {
  const rawRole = String(role || "FUNCIONARIO").trim();
  const upperRole = rawRole.toUpperCase();

  if (ROLE_PERMISSIONS[upperRole]) {
    return upperRole;
  }

  return LEGACY_ROLES[rawRole.toLowerCase()] || "FUNCIONARIO";
}

export function getDefaultPermissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.FUNCIONARIO)];
}

export function getCurrentUser() {
  try {
    return JSON.parse(sessionStorage.getItem("user") || "{}");
  } catch (error) {
    return {};
  }
}

export function getUserPermissions(user = getCurrentUser()) {
  const role = normalizeRole(user?.role);

  if (role === "ADMIN") {
    return getDefaultPermissionsForRole("ADMIN");
  }

  if (Array.isArray(user?.permissions) && user.permissions.length > 0) {
    return Array.from(new Set(
      user.permissions
        .map((permission) => String(permission || "").trim().toUpperCase())
        .filter((permission) => Object.values(ACCESS_MODULES).includes(permission))
    ));
  }

  return getDefaultPermissionsForRole(role);
}

export function canAccess(permission, user = getCurrentUser()) {
  return getUserPermissions(user).includes(String(permission || "").trim().toUpperCase());
}

export function canAccessAny(permissions = [], user = getCurrentUser()) {
  return permissions.some((permission) => canAccess(permission, user));
}

export function isAdminUser(user = getCurrentUser()) {
  return normalizeRole(user?.role) === "ADMIN";
}
