import Sidebar from "../components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../services/vacitechApi";
import {
  getFarmProfile,
  getProfileRanches,
} from "../utils/vacitechStorage";

const API_URL = API_BASE_URL;

const emptyForm = {
  linhagem: "",
  avesAlojadas: "",
  dataAlojamento: "",
  idadeAtual: "",
  ranchoAtual: "Pinteiro",
  observacoes: "",
  status: "Ativo",
};

function getCurrentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function formatDate(date) {
  if (!date) {
    return "-";
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatMonth(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function Aves() {
  const [lots, setLots] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingLotId, setEditingLotId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [ranchFilter, setRanchFilter] = useState("");
  const [farmProfile] = useState(getFarmProfile);

  const ranchOptions = useMemo(() => {
    const profileRanches = getProfileRanches(farmProfile);
    const hasCurrentRanch = profileRanches.some((ranch) => (
      ranch.name === form.ranchoAtual
    ));

    return hasCurrentRanch || !form.ranchoAtual
      ? profileRanches
      : [
          ...profileRanches,
          { id: "rancho-atual", name: form.ranchoAtual },
        ];
  }, [farmProfile, form.ranchoAtual]);

  async function loadLots() {
    const response = await fetch(`${API_URL}/birdlots`);
    const data = await response.json();
    setLots(data);
  }

  useEffect(() => {
    loadLots();
  }, []);

  const monthlyLots = useMemo(() => {
    const normalizedRanchFilter = ranchFilter.trim().toLowerCase();

    return lots
      .filter((lot) => lot.dataAlojamento?.startsWith(selectedMonth))
      .filter((lot) => {
        if (!normalizedRanchFilter) {
          return true;
        }

        return String(lot.ranchoAtual || "")
          .toLowerCase()
          .includes(normalizedRanchFilter);
      })
      .sort((a, b) => Number(a.idadeAtual) - Number(b.idadeAtual));
  }, [lots, selectedMonth, ranchFilter]);

  const monthlyTotal = useMemo(() => {
    return monthlyLots.reduce(
      (total, lot) => total + Number(lot.avesAlojadas || 0),
      0
    );
  }, [monthlyLots]);

  const monthlyLotsByAge = useMemo(() => {
    const groups = monthlyLots.reduce((items, lot) => {
      const age = Number(lot.idadeAtual || 0);

      if (!items[age]) {
        items[age] = [];
      }

      items[age].push(lot);

      return items;
    }, {});

    return Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)
      .map((age) => ({
        age,
        lots: groups[age],
        totalAves: groups[age].reduce(
          (total, lot) => total + Number(lot.avesAlojadas || 0),
          0
        ),
      }));
  }, [monthlyLots]);

  async function saveLot(e) {
    e.preventDefault();

    const url = editingLotId
      ? `${API_URL}/birdlots/${editingLotId}`
      : `${API_URL}/birdlots`;
    const method = editingLotId ? "PUT" : "POST";

    await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setForm(emptyForm);
    setEditingLotId(null);
    loadLots();
  }

  function startEdit(lot) {
    setEditingLotId(lot.id);
    setForm({
      linhagem: lot.linhagem || "",
      avesAlojadas: lot.avesAlojadas || "",
      dataAlojamento: lot.dataAlojamento || "",
      idadeAtual: lot.idadeAtual || "",
      ranchoAtual: lot.ranchoAtual || "Pinteiro",
      observacoes: lot.observacoes || "",
      status: lot.status || "Ativo",
    });
  }

  function cancelEdit() {
    setEditingLotId(null);
    setForm(emptyForm);
  }

  async function deleteLot(id) {
    const confirmed = window.confirm("Deseja excluir este registro?");

    if (!confirmed) {
      return;
    }

    await fetch(`${API_URL}/birdlots/${id}`, {
      method: "DELETE",
    });

    loadLots();
  }

  function openMonthlyPdf() {
    const ranchQuery = ranchFilter.trim()
      ? `&rancho=${encodeURIComponent(ranchFilter.trim())}`
      : "";

    window.open(
      `${API_URL}/birdlots/monthly-report/pdf?month=${selectedMonth}${ranchQuery}`,
      "_blank"
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <div className="flex-1 p-8">
        <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm">
          <h1 className="text-5xl font-bold text-zinc-900">
            Manejo Avicola
          </h1>

          <p className="text-zinc-500 mt-2">
            Cadastro e controle operacional das aves.
          </p>
        </div>

        <form
          onSubmit={saveLot}
          className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-8">
            <h2 className="text-3xl font-bold text-zinc-900">
              {editingLotId ? "Editar Registro" : "Novo Registro"}
            </h2>
            <p className="text-sm text-zinc-500">
              Quando editar e trocar o rancho, o sistema registra a movimentacao no historico.
            </p>

            {editingLotId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-5 py-3 rounded-xl font-bold transition"
              >
                Cancelar edicao
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <input
              type="text"
              placeholder="Linhagem"
              value={form.linhagem}
              onChange={(e) => setForm({ ...form, linhagem: e.target.value })}
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              required
            />

            <input
              type="number"
              placeholder="Aves Alojadas"
              value={form.avesAlojadas}
              onChange={(e) =>
                setForm({ ...form, avesAlojadas: e.target.value })
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              min="0"
              required
            />

            <input
              type="date"
              value={form.dataAlojamento}
              onChange={(e) =>
                setForm({ ...form, dataAlojamento: e.target.value })
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              required
            />

            <input
              type="number"
              placeholder="Idade Atual"
              value={form.idadeAtual}
              onChange={(e) =>
                setForm({ ...form, idadeAtual: e.target.value })
              }
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              min="0"
              required
            />

            <select
              value={form.ranchoAtual}
              onChange={(e) => setForm({ ...form, ranchoAtual: e.target.value })}
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              required
            >
              {ranchOptions.map((ranch) => (
                <option key={ranch.id} value={ranch.name}>
                  {ranch.name}
                </option>
              ))}
            </select>

            <textarea
              placeholder="Observacoes do registro"
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none md:col-span-2 min-h-28"
            />

            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none md:col-span-2"
            >
              <option value="Ativo">Ativo</option>
              <option value="Finalizado">Finalizado</option>
            </select>
          </div>

          <button
            type="submit"
            className="mt-8 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-bold transition"
          >
            {editingLotId ? "Salvar Alteracoes" : "Registrar"}
          </button>
        </form>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Registro mensal feito
              </h2>

              <p className="text-zinc-500 mt-2">
                {formatMonth(selectedMonth)} - {monthlyLots.length} registro(s)
                - {monthlyTotal} aves alojadas
                {ranchFilter.trim() && ` - rancho: ${ranchFilter.trim()}`}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                onInput={(e) => setSelectedMonth(e.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />

              <input
                type="text"
                placeholder="Filtrar por rancho"
                value={ranchFilter}
                onChange={(e) => setRanchFilter(e.target.value)}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />

              <button
                type="button"
                onClick={openMonthlyPdf}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-bold transition"
              >
                Gerar PDF mensal
              </button>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            {monthlyLotsByAge.length === 0 && (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-6 text-zinc-500">
                Nenhum registro encontrado com os filtros selecionados.
              </div>
            )}

            {monthlyLotsByAge.map((group) => (
              <div
                key={group.age}
                className="border border-green-100 rounded-2xl overflow-hidden"
              >
                <div className="bg-green-50 px-5 py-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <h3 className="font-bold text-zinc-900">
                    Idade Atual: {group.age} dias
                  </h3>

                  <span className="text-zinc-500">
                    {group.lots.length} registro(s) - {group.totalAves} aves
                  </span>
                </div>

                <div className="divide-y divide-green-100">
                  {group.lots.map((lot) => (
                    <div
                      key={lot.id}
                      className="p-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto]"
                    >
                      <div>
                        <p className="text-zinc-500">Rancho atual</p>
                        <h4 className="font-bold text-xl text-green-600">
                          {lot.ranchoAtual || "Pinteiro"}
                        </h4>
                        <p className="text-sm text-zinc-500 mt-1">
                          Localizacao das aves
                        </p>
                      </div>

                      <div>
                        <p className="text-zinc-500">Linhagem</p>
                        <h4 className="font-bold text-lg">{lot.linhagem}</h4>
                      </div>

                      <div>
                        <p className="text-zinc-500">Aves Alojadas</p>
                        <h4 className="font-bold text-lg">
                          {lot.avesAlojadas}
                        </h4>
                      </div>

                      <div>
                        <p className="text-zinc-500">Alojamento</p>
                        <h4 className="font-bold text-lg">
                          {formatDate(lot.dataAlojamento)}
                        </h4>
                        <p className="text-sm text-zinc-500 mt-1">
                          {lot.status || "Ativo"}
                        </p>
                      </div>

                      <div className="grid gap-3 xl:justify-end">
                        {Array.isArray(lot.movimentacoes) && lot.movimentacoes.length > 0 && (
                          <details className="rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-zinc-700">
                            <summary className="cursor-pointer font-bold text-green-700">
                              Historico
                            </summary>
                            <div className="mt-2 grid gap-2">
                              {lot.movimentacoes.map((movement, index) => (
                                <p key={`${lot.id}-${index}`}>
                                  {(movement.date || "-")} - {(movement.from || "Entrada")} para {(movement.to || "-")}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}

                        {lot.observacoes && (
                          <p className="rounded-xl border border-green-100 bg-white p-3 text-sm text-zinc-600">
                            {lot.observacoes}
                          </p>
                        )}

                        <div className="flex gap-3 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(lot)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteLot(lot.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold transition"
                        >
                          Excluir
                        </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Aves;
