import Sidebar from "../components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import {
  deleteBirdLotApi,
  fetchBirdLotsApi,
  fetchBirdLotsMonthlyReportPdfApi,
  saveBirdLotApi,
} from "../services/vacitechApi";
import {
  getFarmProfile,
  getProfileRanches,
  normalizeRequestStatus,
  readJson,
} from "../utils/vacitechStorage";
import { matchesSearchQuery } from "../utils/search";

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
  const [lotSearch, setLotSearch] = useState("");
  const [farmProfile] = useState(getFarmProfile);
  const storedSchedules = readJson("schedules", []);
  const schedules = Array.isArray(storedSchedules) ? storedSchedules : [];

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
    try {
      const data = await fetchBirdLotsApi();
      setLots(data);
    } catch (error) {
      console.log(error);
      setLots([]);
    }
  }

  useEffect(() => {
    loadLots();
  }, []);

  function getLotSearchValues(lot) {
    const lotSchedules = schedules.filter((schedule) => String(schedule.birdLotId || "") === String(lot.id));

    return [
      lot.id,
      lot.linhagem,
      lot.ranchoAtual,
      lot.avesAlojadas,
      lot.dataAlojamento,
      formatDate(lot.dataAlojamento),
      lot.idadeAtual,
      lot.status,
      lot.observacoes,
      ...lotSchedules.flatMap((schedule) => [
        schedule.programId,
        schedule.programDay ? `dia ${schedule.programDay}` : "",
        schedule.programSuggestedName,
        schedule.birdLotName,
        schedule.vaccinatorName,
        schedule.vaccinationStartDate,
        formatDate(schedule.vaccinationStartDate || schedule.date),
        normalizeRequestStatus(schedule.status),
        ...(schedule.vaccineUsages || []).flatMap((usage) => [
          usage.vacina,
          usage.fabricante,
          usage.applicationMethod,
          usage.doses,
        ]),
      ]),
    ];
  }

  const filteredLots = useMemo(() => (
    lots.filter((lot) => matchesSearchQuery(lot, lotSearch, getLotSearchValues(lot)))
  ), [lotSearch, lots, schedules]);

  const monthlyLots = useMemo(() => {
    const normalizedRanchFilter = ranchFilter.trim().toLowerCase();

    return filteredLots
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
  }, [filteredLots, selectedMonth, ranchFilter]);

  const monthlyTotal = useMemo(() => {
    return monthlyLots.reduce(
      (total, lot) => total + Number(lot.avesAlojadas || 0),
      0
    );
  }, [monthlyLots]);

  const recentLots = useMemo(() => (
    [...filteredLots]
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .slice(0, 6)
  ), [filteredLots]);

  const searchedLots = useMemo(() => {
    if (!lotSearch.trim()) {
      return [];
    }

    return filteredLots;
  }, [filteredLots, lotSearch]);

  function getLotVaccinations(lotId) {
    return schedules
      .filter((schedule) => String(schedule.birdLotId || "") === String(lotId))
      .filter((schedule) => {
        const status = normalizeRequestStatus(schedule.status);

        return !["CONCLUIDA", "RECUSADA", "CANCELADA"].includes(status);
      })
      .sort((a, b) => String(a.vaccinationStartDate || a.date || "").localeCompare(String(b.vaccinationStartDate || b.date || "")));
  }

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

    await saveBirdLotApi(form, editingLotId);

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

    await deleteBirdLotApi(id);

    loadLots();
  }

  async function openMonthlyPdf() {
    try {
      const pdfBlob = await fetchBirdLotsMonthlyReportPdfApi(selectedMonth, ranchFilter.trim());
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `relatorio-aves-${selectedMonth}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(pdfUrl);
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
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

        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Todos os registrados
              </h2>

              <p className="mt-2 text-zinc-500">
                  {filteredLots.length} de {lots.length} registro(s) de aves cadastrados.
              </p>
            </div>

            <input
              type="search"
              value={lotSearch}
              onChange={(event) => setLotSearch(event.target.value)}
              placeholder="Buscar por ID, rancho, linhagem, data, status ou vacina"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white md:max-w-sm"
            />
          </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-zinc-900">
                <thead>
                  <tr className="border-b border-green-100 text-zinc-500">
                    <th className="pb-4">ID</th>
                    <th className="pb-4">Rancho</th>
                    <th className="pb-4">Linhagem</th>
                    <th className="pb-4">Aves</th>
                    <th className="pb-4">Alojamento</th>
                    <th className="pb-4">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLots.map((lot) => (
                    <tr key={lot.id} className="border-b border-green-100 last:border-b-0">
                      <td className="py-4 font-bold text-green-700">{lot.id}</td>
                      <td>{lot.ranchoAtual || "Pinteiro"}</td>
                      <td>{lot.linhagem || "-"}</td>
                      <td>{lot.avesAlojadas || 0}</td>
                      <td>{formatDate(lot.dataAlojamento)}</td>
                      <td>{lot.status || "Ativo"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {lots.length > 0 && filteredLots.length === 0 && (
                <p className="mt-4 rounded-2xl bg-green-50 p-5 text-zinc-500">
                  Nenhum registro encontrado para a busca informada.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-bold text-zinc-900">
              Registros recentes
            </h2>

            <div className="mt-6 grid gap-3">
              {recentLots.map((lot) => (
                <div key={lot.id} className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <strong className="text-green-700">ID {lot.id}</strong>
                    <span className="text-sm font-semibold text-zinc-500">{lot.status || "Ativo"}</span>
                  </div>
                  <p className="mt-2 font-bold text-zinc-900">{lot.linhagem || "-"} - {lot.ranchoAtual || "Pinteiro"}</p>
                  <p className="text-sm text-zinc-500">{formatDate(lot.dataAlojamento)} | {lot.avesAlojadas || 0} aves</p>
                </div>
              ))}

              {recentLots.length === 0 && (
                <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                  Nenhum registro recente.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Lotes
              </h2>

              <p className="mt-2 text-zinc-500">
                Pesquise por ID, rancho, linhagem, vacina, status ou data para ver o lote e as vacinas vinculadas.
              </p>
            </div>

            <input
              type="text"
              value={lotSearch}
              onChange={(event) => setLotSearch(event.target.value)}
              placeholder="Pesquisar lote, rancho, vacina ou data"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none xl:max-w-sm"
            />
          </div>

          <div className="mt-6 grid gap-4">
            {lotSearch.trim() && searchedLots.length === 0 && (
              <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                Nenhum lote encontrado para a busca informada.
              </p>
            )}

            {searchedLots.map((lot) => {
              const lotVaccinations = getLotVaccinations(lot.id);

              return (
                <div key={lot.id} className="rounded-3xl border border-green-100 bg-green-50 p-5">
                  <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Lote ID {lot.id}
                      </p>
                      <h3 className="mt-2 text-2xl font-bold text-zinc-900">
                        {lot.linhagem || "-"}
                      </h3>
                      <p className="mt-1 text-zinc-600">
                        {lot.ranchoAtual || "Pinteiro"} | {lot.avesAlojadas || 0} aves | {formatDate(lot.dataAlojamento)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 ring-1 ring-green-100">
                      <p className="font-bold text-zinc-900">
                        Vacinas neste lote
                      </p>

                      <div className="mt-3 grid gap-2">
                        {lotVaccinations.map((schedule) => (
                          <div key={schedule.id} className="rounded-xl border border-green-100 bg-green-50 p-3">
                            <p className="font-bold text-green-700">
                              {schedule.programSuggestedName || schedule.vaccineUsages?.map((usage) => usage.vacina).join(", ") || "Vacinacao"}
                            </p>
                            <p className="text-sm text-zinc-600">
                              Data: {formatDate(schedule.vaccinationStartDate || schedule.date)} | Status: {normalizeRequestStatus(schedule.status)}
                            </p>
                          </div>
                        ))}

                        {lotVaccinations.length === 0 && (
                          <p className="rounded-xl bg-green-50 p-3 text-zinc-500">
                            Nenhuma vacina em andamento para este lote.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

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
