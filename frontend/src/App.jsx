import { useEffect } from "react";

import AppRoutes from "./routes/AppRoutes";
import { applyTenantTheme } from "./utils/tenantTheme";

function App() {
  useEffect(() => {
    applyTenantTheme();

    function refreshTheme() {
      applyTenantTheme();
    }

    window.addEventListener("storage", refreshTheme);
    window.addEventListener("vacitech-storage", refreshTheme);

    return () => {
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("vacitech-storage", refreshTheme);
    };
  }, []);

  return <AppRoutes />;
}

export default App;
