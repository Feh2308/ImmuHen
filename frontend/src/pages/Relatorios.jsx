import { Link } from "react-router-dom";

function Relatorios() {
  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 min-h-screen p-6 flex flex-col">
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white">
          ImmuHen
        </h1>

        <p className="text-zinc-500 text-sm mt-1">
          Gestao Sanitaria Avicola
        </p>
      </div>

      <nav className="flex flex-col gap-4">
        <Link
          to="/home"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Home
        </Link>

        <Link
          to="/Aves"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Aves
        </Link>

        <Link
          to="/vacinas"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Vacinas
        </Link>

        <Link
          to="/agenda"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Programa
        </Link>

        <Link
          to="/estoque"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Estoque
        </Link>

        <Link
          to="/entradas"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Entradas
        </Link>

        <Link
          to="/vaccinators"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Vacinadores
        </Link>

        <Link
          to="/solicitacoes"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Solicitacoes
        </Link>

        <Link
          to="/perfil"
          className="text-zinc-300 hover:text-white hover:bg-zinc-800 p-3 rounded-xl transition"
        >
          Perfil da Granja
        </Link>
      </nav>
    </div>
  );
}

export default Relatorios;
