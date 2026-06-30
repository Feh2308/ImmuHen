import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ACCESS_MODULES, canAccessAny } from "../utils/permissions";
import { getFarmProfile } from "../utils/vacitechStorage";

function Sidebar() {
  const location = useLocation();
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);
  const links = [
    { to: "/home", label: "Home", permissions: [ACCESS_MODULES.DASHBOARD] },
    { to: "/Aves", label: "Aves", permissions: [ACCESS_MODULES.AVES] },
    { to: "/mortalidade", label: "Mortalidade", permissions: [ACCESS_MODULES.AVES] },
    { to: "/rastreabilidade", label: "Rastreabilidade", permissions: [ACCESS_MODULES.AVES] },
    { to: "/vacinas", label: "Vacinas", permissions: [ACCESS_MODULES.VACINAS] },
    { to: "/entradas", label: "Entradas", permissions: [ACCESS_MODULES.ENTRADAS] },
    { to: "/estoque", label: "Estoque", permissions: [ACCESS_MODULES.ESTOQUE] },
    { to: "/administrador", label: "Administrador", permissions: [ACCESS_MODULES.ADMINISTRADOR] },
    { to: "/agenda", label: "Programa", permissions: [ACCESS_MODULES.PROGRAMA] },
    { to: "/vaccinators", label: "Vacinadores", permissions: [ACCESS_MODULES.VACINADORES] },
    { to: "/solicitacoes", label: "Notificacoes", permissions: [ACCESS_MODULES.SOLICITACOES] },
    { to: "/perfil", label: "Perfil da Granja", permissions: [ACCESS_MODULES.CONFIGURACOES] },
  ];
  const visibleLinks = links.filter((link) => canAccessAny(link.permissions));

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
      shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition
      ${
        location.pathname === path
          ? "bg-green-600 text-white"
          : "text-zinc-600 hover:bg-green-50 hover:text-green-700"
      }
    `;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-green-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {farmProfile.logoDataUrl && (
            <img
              src={farmProfile.logoDataUrl}
              alt={`Logo ${farmProfile.farmName || "da granja"}`}
              className="h-12 w-12 rounded-xl border border-green-100 bg-white object-contain p-1"
            />
          )}

          <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900">
            Immu
            <span className="text-green-500">
              Hen
            </span>
          </h1>

          <p className="truncate text-xs font-semibold text-zinc-500">
            {farmProfile.farmName || "Gestao sanitaria avicola"}
          </p>
        </div>
      </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 xl:pb-0">
          {visibleLinks.map((link) => (
            <Link key={link.to} to={link.to} className={linkClass(link.to)}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Sidebar;
