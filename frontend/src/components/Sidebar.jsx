import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { ACCESS_MODULES, canAccessAny } from "../utils/permissions";
import { getFarmProfile } from "../utils/vacitechStorage";

function Sidebar() {
  const location = useLocation();
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);
  const [menuOpen, setMenuOpen] = useState(false);
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
    { to: "/vacinacoes", label: "Acompanhamento", permissions: [ACCESS_MODULES.PROGRAMA] },
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

  useEffect(() => {
    function closeWithEscape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", closeWithEscape);
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.removeEventListener("keydown", closeWithEscape);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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

  function navigateAndClose() {
    setMenuOpen(false);
  }

  return (
    <>
      {menuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px]"
        />
      )}
      <header className="relative sticky top-0 z-50 border-b border-green-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {farmProfile.logoDataUrl && (
            <img
              src={farmProfile.logoDataUrl}
              alt={`Logo ${farmProfile.farmName || "da granja"}`}
              className="h-12 w-12 rounded-xl border border-green-100 bg-white object-contain p-1"
            />
          )}

          <div className="min-w-0">
          <button type="button" onClick={() => setMenuOpen(true)} className="text-left" aria-label="Abrir menu do ImmuHen">
            <h1 className="text-2xl font-bold text-zinc-900">
              Immu
              <span className="text-green-500">
                Hen
              </span>
            </h1>
          </button>

          <p className="truncate text-xs font-semibold text-zinc-500">
            {farmProfile.farmName || "Gestao sanitaria avicola"}
          </p>
        </div>
      </div>

        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-xl border border-green-200 bg-white p-3 text-green-700 shadow-sm transition hover:bg-green-50"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <nav className={`${menuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"} absolute right-4 top-full z-50 flex max-h-[calc(100vh-84px)] w-[min(90vw,360px)] flex-col gap-2 overflow-y-auto rounded-2xl border border-green-100 bg-white p-4 shadow-2xl transition-all duration-200`}>
          {visibleLinks.map((link) => (
            <Link key={link.to} to={link.to} onClick={navigateAndClose} className={linkClass(link.to)}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      </header>
    </>
  );
}

export default Sidebar;
