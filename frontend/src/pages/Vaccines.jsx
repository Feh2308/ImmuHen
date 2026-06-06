import { useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";

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

  function cadastrarVacina() {

    if (
      !codigo ||
      !nome ||
      !dosesPerBottle
    ) {
      alert("Preencha codigo, nome e doses dentro do frasco");
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
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm">

          <h1 className="text-5xl font-bold text-zinc-900">
            Vacinas
          </h1>

          <p className="text-zinc-500 mt-2">
            Cadastro base de vacinas. Alteracoes, valores e exclusoes ficam no ambiente do chefe.
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
              placeholder="Doses dentro do frasco"
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
                  Doses/frasco
                </th>

                <th className="pb-4">
                  Observacoes
                </th>

              </tr>

            </thead>

            <tbody>

              {vaccines.map((vacina) => (

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

        </div>

      </div>

    </div>
  );
}

export default Vaccines;
