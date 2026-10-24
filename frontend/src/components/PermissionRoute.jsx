import { Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { ACCESS_MODULES, canAccessAny, getCurrentUser } from "../utils/permissions";
import { fetchSubscriptionStatusApi } from "../services/vacitechApi";
import { clearAccountSession } from "../utils/vacitechStorage";

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
  const token = sessionStorage.getItem("token") || "";
  const user = getCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let active = true;

    async function checkSubscription() {
      try {
        const subscription = await fetchSubscriptionStatusApi();

        if (active && subscription && !subscription.active) {
          clearAccountSession();
          navigate("/?subscription=expired", { replace: true });
        }
      } catch (error) {
        if (error?.status === 402) {
          clearAccountSession();
          navigate("/?subscription=expired", { replace: true });
        }
      }
    }

    checkSubscription();
    const intervalId = window.setInterval(checkSubscription, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [navigate, token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (permissions.length > 0 && !canAccessAny(permissions, user)) {
    return <Navigate to={getFallbackPath(user)} replace />;
  }

  return children;
}

export default PermissionRoute;
