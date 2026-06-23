import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import Login from "../pages/Login";
import Home from "../pages/Home";
import Vaccines from "../pages/Vaccines";
import Entries from "../pages/Entries";
import Stock from "../pages/Stock";
import Schedule from "../pages/Schedule";
import Vaccinators from "../pages/Vaccinators";
import Request from "../pages/Requests";
import FarmProfile from "../pages/FarmProfile";
import Aves from "../pages/Aves";
import FarmSetup from "../pages/FarmSetup";
import VaccinatorPortal from "../pages/VaccinatorPortal";
import RegisterFarm from "../pages/RegisterFarm";
import TemperatureCapture from "../pages/TemperatureCapture";
import Chief from "../pages/Chief";
import OwnerAdmin from "../pages/OwnerAdmin";
import Mortality from "../pages/Mortality";
import Sanitary from "../pages/Sanitary";
import SanitaryAgenda from "../pages/SanitaryAgenda";
import LotTraceability from "../pages/LotTraceability";
import PermissionRoute from "../components/PermissionRoute";
import { ACCESS_MODULES } from "../utils/permissions";
import { applyThemeForPath } from "../utils/tenantTheme";

function ThemeController() {
  const location = useLocation();

  useEffect(() => {
    function refreshTheme() {
      applyThemeForPath(location.pathname);
    }

    refreshTheme();
    window.addEventListener("storage", refreshTheme);
    window.addEventListener("vacitech-storage", refreshTheme);

    return () => {
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("vacitech-storage", refreshTheme);
    };
  }, [location.pathname]);

  return null;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <ThemeController />

      <Routes>

        {/* LOGIN */}
        <Route path="/" element={<Login />} />
        <Route path="/cadastro" element={<RegisterFarm />} />
        <Route path="/vacinador" element={<VaccinatorPortal />} />
        <Route path="/admin-geral" element={<OwnerAdmin />} />
        <Route path="/temperatura-vacina" element={<TemperatureCapture />} />
        <Route path="/cadastro-granja" element={<FarmSetup />} />

        {/* WELCOME */}
        <Route path="/Home" element={<PermissionRoute permissions={[ACCESS_MODULES.DASHBOARD]}><Home /></PermissionRoute>} />
        <Route path="/home" element={<PermissionRoute permissions={[ACCESS_MODULES.DASHBOARD]}><Home /></PermissionRoute>} />

        {/* SISTEMA */}
        <Route path="/vacinas" element={<PermissionRoute permissions={[ACCESS_MODULES.VACINAS]}><Vaccines /></PermissionRoute>} />

        <Route path="/entradas" element={<PermissionRoute permissions={[ACCESS_MODULES.ENTRADAS]}><Entries /></PermissionRoute>} />
        <Route path="/estoque" element={<PermissionRoute permissions={[ACCESS_MODULES.ESTOQUE]}><Stock /></PermissionRoute>} />

        <Route path="/agenda" element={<PermissionRoute permissions={[ACCESS_MODULES.PROGRAMA]}><Schedule /></PermissionRoute>} />

        <Route path="/vaccinators" element={<PermissionRoute permissions={[ACCESS_MODULES.VACINADORES]}><Vaccinators /></PermissionRoute>} />

        <Route path="/solicitacoes" element={<PermissionRoute permissions={[ACCESS_MODULES.SOLICITACOES]}><Request /></PermissionRoute>} />

        <Route path="/perfil" element={<PermissionRoute permissions={[ACCESS_MODULES.CONFIGURACOES]}><FarmProfile /></PermissionRoute>} />

        <Route path="/chefe" element={<PermissionRoute permissions={[ACCESS_MODULES.ADMINISTRADOR]}><Chief /></PermissionRoute>} />
        <Route path="/administrador" element={<PermissionRoute permissions={[ACCESS_MODULES.ADMINISTRADOR]}><Chief /></PermissionRoute>} />

        <Route path="/Aves" element={<PermissionRoute permissions={[ACCESS_MODULES.AVES]}><Aves /></PermissionRoute>} />
        <Route path="/mortalidade" element={<PermissionRoute permissions={[ACCESS_MODULES.AVES]}><Mortality /></PermissionRoute>} />
        <Route path="/rastreabilidade" element={<PermissionRoute permissions={[ACCESS_MODULES.AVES]}><LotTraceability /></PermissionRoute>} />
        <Route path="/sanitario" element={<PermissionRoute permissions={[ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.SOLICITACOES]}><Sanitary /></PermissionRoute>} />
        <Route path="/agenda-sanitaria" element={<PermissionRoute permissions={[ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.SOLICITACOES]}><SanitaryAgenda /></PermissionRoute>} />

      </Routes>

    </BrowserRouter>
  );
}
