import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getFarmProfile } from "../utils/vacitechStorage";

function Sidebar() {
  const location = useLocation();
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);

  useEffect(() => {
    function refreshProfile() {
      setFarmProfile(getFarmProfile());
    }

    window.addEventListener("storage", refreshProfile);
    window.addEventListener("vacitech-storage", refreshProfile);

    return () => {
      window.removeEventListener("storage", refreshProfile);
      window.removeEventListener("vacitech-storage", refreshProfile);
    };
  }, []);

  function linkClass(path) {
    return `
      p-3 rounded-2xl transition font-medium
      ${
        location.pathname === path
          ? "bg-green-600 text-white"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
      }
    `;
  }

  return (
    <div className="w-72 bg-zinc-950 border-r border-zinc-800 min-h-screen p-6 flex flex-col">
      <div>
        <div className="flex items-center gap-3">
          {farmProfile.logoDataUrl && (
            <img
              src={farmProfile.logoDataUrl}
              alt={`Logo ${farmProfile.farmName || "da granja"}`}
              className="h-14 w-14 rounded-2xl border border-green-700 bg-white object-contain p-1"
            />
          )}

          <h1 className="text-3xl font-bold text-white">
            Immu
            <span className="text-green-500">
              Hen
            </span>
          </h1>
        </div>

        <p className="mt-2 text-sm text-zinc-500">
          Gestao sanitaria avicola
        </p>
      </div>

      <nav className="flex flex-col gap-3 mt-10">
        <Link to="/home" className={linkClass("/home")}>
          Home
        </Link>

        <Link to="/Aves" className={linkClass("/Aves")}>
          Aves
        </Link>

        <Link to="/vacinas" className={linkClass("/vacinas")}>
          Vacinas
        </Link>

        <Link to="/entradas" className={linkClass("/entradas")}>
          Entradas
        </Link>

        <Link to="/estoque" className={linkClass("/estoque")}>
          Estoque
        </Link>

        <Link to="/agenda" className={linkClass("/agenda")}>
          Programa
        </Link>

        <Link to="/vaccinators" className={linkClass("/vaccinators")}>
          Vacinadores
        </Link>

        <Link to="/solicitacoes" className={linkClass("/solicitacoes")}>
          Solicitacoes
        </Link>

        <Link to="/perfil" className={linkClass("/perfil")}>
          Perfil da Granja
        </Link>
      </nav>

      <div className="mt-auto pt-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-400 text-sm">
            Sistema operacional sanitario avicola
          </p>

          <p className="text-green-500 font-bold mt-2">
            Online
          </p>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
