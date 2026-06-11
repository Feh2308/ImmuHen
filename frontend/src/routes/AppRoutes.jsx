import { BrowserRouter, Routes, Route } from "react-router-dom";

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

export default function AppRoutes() {

  return (
    <BrowserRouter>

      <Routes>

        {/* LOGIN */}
        <Route path="/" element={<Login />} />
        <Route path="/cadastro" element={<RegisterFarm />} />
        <Route path="/vacinador" element={<VaccinatorPortal />} />
        <Route path="/temperatura-vacina" element={<TemperatureCapture />} />
        <Route path="/cadastro-granja" element={<FarmSetup />} />

        {/* WELCOME */}
        <Route path="/Home" element={<Home />} />
        <Route path="/home" element={<Home />} />

        {/* SISTEMA */}
        <Route path="/vacinas" element={<Vaccines />} />

        <Route path="/entradas" element={<Entries />} />
        <Route path="/estoque" element={<Stock />} />

        <Route path="/agenda" element={<Schedule />} />

        <Route path="/vaccinators" element={<Vaccinators />} />

        <Route path="/solicitacoes" element={<Request />} />

        <Route path="/perfil" element={<FarmProfile />} />

        <Route path="/chefe" element={<Chief />} />
        <Route path="/administrador" element={<Chief />} />

        <Route path="/Aves" element={<Aves />} />

      </Routes>

    </BrowserRouter>
  );
}
