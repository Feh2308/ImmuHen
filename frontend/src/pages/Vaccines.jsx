import { useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";
import { matchesSearchQuery } from "../utils/search";
import { sortVaccinesByCode } from "../utils/vaccineSort";

function Vaccines() {

  const {
    vaccines,
    addVaccine,
  } = useVaccines();

  const [codigo, setCodigo] =
    useState("");

  const [nome, setNome] =
    useState("");

  const [fabricante, setFabricante] =
    useState("");

  const [dosesPerBottle, setDosesPerBottle] =
    useState("");

  const [observacoes, setObservacoes] =
    useState("");
  const [vaccineSearch, setVaccineSearch] =
    useState("");
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);
  const filteredVaccines = useMemo(() => (
    sortedVaccines.filter((vacina) => matchesSearchQuery(vacina, vaccineSearch, [
      vacina.codigo,
      vacina.nome,
      vacina.fabricante,
      vacina.dosesPerBottle,
      vacina.observacoes,
    ]))
  ), [sortedVaccines, vaccineSearch]);

  function cadastrarVacina() {

    if (
      !codigo ||
      !nome ||
      !dosesPerBottle
    ) {
      alert("Preencha codigo, nome e quantidade de doses");
      return;
    }

    addVaccine({
      id: Date.now(),
      codigo,
      nome,
      fabricante,
      dosesPerBottle,
      observacoes,
    });

    setCodigo("");
    setNome("");
    setFabricante("");
    setDosesPerBottle("");
    setObservacoes("");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm">

          <h1 className="text-5xl font-bold text-zinc-900">
            Vacinas
          </h1>

          <p className="text-zinc-500 mt-2">
            Cadastro base de vacinas. Alteracoes, valores e exclusoes ficam no ambiente do administrador.
          </p>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm">

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            <input
              type="text"
              placeholder="Codigo"
              value={codigo}
              onChange={(e) =>
                setCodigo(e.target.value)
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <input
              type="text"
              placeholder="Nome"
              value={nome}
              onChange={(e) =>
                setNome(e.target.value)
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <input
              type="text"
              placeholder="Fabricante"
              value={fabricante}
              onChange={(e) =>
                setFabricante(e.target.value)
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <input
              type="text"
              inputMode="decimal"
              placeholder="Quantidade de doses"
              value={dosesPerBottle}
              onChange={(e) =>
                setDosesPerBottle(e.target.value)
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <input
              type="text"
              placeholder="Observacoes"
              value={observacoes}
              onChange={(e) =>
                setObservacoes(e.target.value)
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

          </div>

          <button
            onClick={cadastrarVacina}
            className="mt-8 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-bold transition"
          >
            Cadastrar Vacina
          </button>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Vacinas cadastradas
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {filteredVaccines.length} de {sortedVaccines.length} vacina(s) encontradas.
              </p>
            </div>

            <input
              type="search"
              value={vaccineSearch}
              onChange={(event) => setVaccineSearch(event.target.value)}
              placeholder="Buscar por codigo, nome, fabricante, doses ou observacao"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white md:max-w-md"
            />
          </div>

          <table className="w-full text-left text-zinc-900">

            <thead>

              <tr className="border-b border-green-100 text-zinc-500">

                <th className="pb-4">
                  Codigo
                </th>

                <th className="pb-4">
                  Nome
                </th>

                <th className="pb-4">
                  Fabricante
                </th>

                <th className="pb-4">
                  Quantidade de doses
                </th>

                <th className="pb-4">
                  Observacoes
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredVaccines.map((vacina) => (

                <tr
                  key={vacina.id}
                  className="border-b border-green-100 last:border-b-0"
                >

                  <td className="py-4">
                    {vacina.codigo}
                  </td>

                  <td>
                    {vacina.nome}
                  </td>

                  <td>
                    {vacina.fabricante}
                  </td>

                  <td>
                    {vacina.dosesPerBottle || "-"}
                  </td>

                  <td>
                    {vacina.observacoes}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

          {sortedVaccines.length > 0 && filteredVaccines.length === 0 && (
            <p className="mt-4 rounded-2xl bg-green-50 p-5 text-center text-zinc-500">
              Nenhuma vacina encontrada para a busca informada.
            </p>
          )}

        </div>

      </div>

    </div>
  );
}

export default Vaccines;
