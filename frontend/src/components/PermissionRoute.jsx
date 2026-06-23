import { Navigate } from "react-router-dom";

import { ACCESS_MODULES, canAccessAny, getCurrentUser } from "../utils/permissions";

const fallbackRoutes = [
  { to: "/home", permissions: [ACCESS_MODULES.DASHBOARD] },
  { to: "/Aves", permissions: [ACCESS_MODULES.AVES] },
  { to: "/mortalidade", permissions: [ACCESS_MODULES.AVES] },
  { to: "/vacinas", permissions: [ACCESS_MODULES.VACINAS] },
  { to: "/entradas", permissions: [ACCESS_MODULES.ENTRADAS] },
  { to: "/estoque", permissions: [ACCESS_MODULES.ESTOQUE] },
  { to: "/agenda", permissions: [ACCESS_MODULES.PROGRAMA] },
  { to: "/solicitacoes", permissions: [ACCESS_MODULES.SOLICITACOES] },
  { to: "/perfil", permissions: [ACCESS_MODULES.CONFIGURACOES] },
];

function getFallbackPath(user) {
  return fallbackRoutes.find((route) => canAccessAny(route.permissions, user))?.to || "/";
}

function PermissionRoute({ children, permissions = [] }) {
  const token = localStorage.getItem("token") || "";
  const user = getCurrentUser();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (permissions.length > 0 && !canAccessAny(permissions, user)) {
    return <Navigate to={getFallbackPath(user)} replace />;
  }

  return children;
}

export default PermissionRoute;
