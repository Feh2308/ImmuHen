import { useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";

function getCurrentUserLabel() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    return user.name || user.email || "Usuario";
  } catch (error) {
    return "Usuario";
  }
}

function Vaccines() {

  const {
    vaccines,
    addVaccine,
    removeVaccine,
    requestVaccineEdit,
    vaccineEditRequests,
  } = useVaccines();

  const [codigo, setCodigo] =
    useState("");

  const [nome, setNome] =
    useState("");

  const [fabricante, setFabricante] =
    useState("");

  const [observacoes, setObservacoes] =
    useState("");

  const [editingVaccine, setEditingVaccine] =
    useState(null);

  const [editForm, setEditForm] =
    useState({
      codigo: "",
      nome: "",
      fabricante: "",
      observacoes: "",
    });

  const [editReason, setEditReason] =
    useState("");

  const pendingEditByVaccine = useMemo(() => {
    const map = new Map();

    vaccineEditRequests
      .filter((request) => request.status === "pending")
      .forEach((request) => {
        map.set(String(request.vaccineId), request);
      });

    return map;
  }, [vaccineEditRequests]);

  function cadastrarVacina() {

    if (
      !codigo ||
      !nome
    ) {
      alert("Preencha os campos");
      return;
    }

    addVaccine({
      id: Date.now(),
      codigo,
      nome,
      fabricante,
      observacoes,
    });

    setCodigo("");
    setNome("");
    setFabricante("");
    setObservacoes("");
  }

  function startEdit(vacina) {
    setEditingVaccine(vacina);
    setEditForm({
      codigo: vacina.codigo || "",
      nome: vacina.nome || "",
      fabricante: vacina.fabricante || "",
      observacoes: vacina.observacoes || "",
    });
    setEditReason("");
  }

  function updateEditForm(field, value) {
    setEditForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function submitEditRequest() {
    if (!editingVaccine) {
      return;
    }

    try {
      requestVaccineEdit({
        vaccineId: editingVaccine.id,
        changes: editForm,
        reason: editReason,
        requestedBy: getCurrentUserLabel(),
      });

      setEditingVaccine(null);
      setEditReason("");
      alert("Edicao enviada para aprovacao do chefe.");
    } catch (error) {
      alert(error.message);
    }
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
            Cadastro base e alteracoes com aprovacao do chefe.
          </p>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

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

        {editingVaccine && (
          <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm">

            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">
                  Solicitar edicao de vacina
                </h2>

                <p className="text-zinc-500 mt-1">
                  {editingVaccine.nome}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingVaccine(null)}
                className="rounded-2xl bg-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:bg-zinc-300"
              >
                Cancelar
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <input
                type="text"
                placeholder="Codigo"
                value={editForm.codigo}
                onChange={(event) => updateEditForm("codigo", event.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />

              <input
                type="text"
                placeholder="Nome"
                value={editForm.nome}
                onChange={(event) => updateEditForm("nome", event.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />

              <input
                type="text"
                placeholder="Fabricante"
                value={editForm.fabricante}
                onChange={(event) => updateEditForm("fabricante", event.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />

              <input
                type="text"
                placeholder="Observacoes"
                value={editForm.observacoes}
                onChange={(event) => updateEditForm("observacoes", event.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />
            </div>

            <textarea
              placeholder="Justificativa da edicao"
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <button
              type="button"
              onClick={submitEditRequest}
              className="mt-5 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700"
            >
              Enviar para aprovacao
            </button>

          </div>
        )}

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
                  Observacoes
                </th>

                <th className="pb-4">
                  Status
                </th>

                <th className="pb-4">
                  Acoes
                </th>

              </tr>

            </thead>

            <tbody>

              {vaccines.map((vacina) => {
                const pendingEdit = pendingEditByVaccine.get(String(vacina.id));

                return (
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
                      {vacina.observacoes}
                    </td>

                    <td>
                      {pendingEdit ? (
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-700">
                          Edicao pendente
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                          Liberada
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startEdit(vacina)}
                          className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl font-bold transition"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() =>
                            removeVaccine(vacina.id)
                          }
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold transition"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default Vaccines;
