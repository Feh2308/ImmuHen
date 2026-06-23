import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import { fetchSanitaryAgendaApi } from "../services/vacitechApi";
import { matchesSearchQuery } from "../utils/search";

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getEventDate(item) {
  return item.vaccinationStartDate || item.vaccinationEndDate || item.date || item.validade || item.expiresAt || item.createdAtIso || "";
}

function getEventTitle(item) {
  return item.title || item.vaccineName || item.programSuggestedName || item.birdLotName || item.nome || item.name || "Evento sanitario";
}

function buildRows(agenda = {}) {
  return [
    ...(agenda.expiredVaccines || []).map((item) => ({ ...item, group: "Vacina vencida", severity: "critical" })),
    ...(agenda.expiringVaccines || []).map((item) => ({ ...item, group: "Vacina vencendo", severity: "warning" })),
    ...(agenda.overdueVaccinations || []).map((item) => ({ ...item, group: "Aplicacao atrasada", severity: "critical" })),
    ...(agenda.futureApplications || []).map((item) => ({ ...item, group: "Aplicacao futura", severity: "normal" })),
    ...(agenda.pendingRequests || []).map((item) => ({ ...item, group: "Solicitacao pendente", severity: "warning" })),
    ...(agenda.inProgressTasks || []).map((item) => ({ ...item, group: "Tarefa em andamento", severity: "normal" })),
    ...(agenda.awaitingConfirmation || []).map((item) => ({ ...item, group: "Aguardando confirmacao", severity: "warning" })),
    ...(agenda.lowStock || []).map((item) => ({ ...item, group: "Estoque baixo", severity: "critical" })),
    ...(agenda.alerts || []).map((item) => ({ ...item, group: "Alerta", severity: "critical" })),
  ].sort((a, b) => String(getEventDate(a)).localeCompare(String(getEventDate(b))));
}

function getSeverityClass(severity) {
  if (severity === "critical") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  if (severity === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-green-100 bg-green-50 text-green-700";
}

function SanitaryAgenda() {
  const [agenda, setAgenda] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchSanitaryAgendaApi()
      .then((data) => setAgenda(data.agenda || data))
      .catch((error) => setMessage(error.message));
  }, []);

  const rows = useMemo(() => buildRows(agenda || {}), [agenda]);
  const filteredRows = useMemo(() => (
    rows.filter((row) => matchesSearchQuery(row, search, [
      row.group,
      getEventTitle(row),
      formatDate(getEventDate(row)),
      row.message,
      row.status,
      row.vaccineName,
      row.currentStock,
      row.minimum,
    ]))
  ), [rows, search]);

  const counters = [
    { label: "Vacinas vencendo", value: (agenda?.expiringVaccines || []).length + (agenda?.expiredVaccines || []).length },
    { label: "Aplicacoes futuras", value: (agenda?.futureApplications || []).length },
    { label: "Solicitacoes", value: (agenda?.pendingRequests || []).length },
    { label: "Estoque baixo", value: (agenda?.lowStock || []).length },
    { label: "Atrasadas", value: (agenda?.overdueVaccinations || []).length },
    { label: "Aguardando confirmacao", value: (agenda?.awaitingConfirmation || []).length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-8">
        <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h1 className="text-5xl font-bold text-zinc-900">Agenda Sanitaria</h1>
          <p className="mt-2 text-zinc-500">
            Visao consolidada de vacinas, solicitacoes, estoque baixo e tarefas de vacinacao.
          </p>
        </section>

        {message && (
          <p className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 font-semibold text-red-700">
            {message}
          </p>
        )}

        <section className="mt-8 grid gap-5 md:grid-cols-3 xl:grid-cols-6">
          {counters.map((item) => (
            <div key={item.label} className="rounded-3xl border border-green-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-wide text-green-700">{item.label}</p>
              <strong className="mt-3 block text-3xl text-zinc-900">{item.value}</strong>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">Eventos e alertas</h2>
              <p className="mt-1 text-sm text-zinc-500">{filteredRows.length} de {rows.length} item(ns).</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por vacina, lote, status, data, alerta ou estoque"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none md:max-w-lg"
            />
          </div>

          <div className="mt-6 grid gap-4">
            {filteredRows.map((row, index) => (
              <article key={`${row.group}-${row.id || row.refId || index}`} className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getSeverityClass(row.severity)}`}>
                      {row.group}
                    </span>
                    <h3 className="mt-3 text-xl font-bold text-zinc-900">{getEventTitle(row)}</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {row.message || row.birdLotName || row.programSuggestedName || row.fabricante || "-"}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-sm font-bold text-green-700">{formatDate(getEventDate(row))}</p>
                    <p className="mt-1 text-sm text-zinc-500">{row.status || row.type || ""}</p>
                  </div>
                </div>

                {(row.currentStock !== undefined || row.minimum !== undefined) && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-green-50 p-4">
                      <p className="text-xs font-bold uppercase text-green-700">Estoque atual</p>
                      <strong className="mt-1 block text-xl text-zinc-900">{row.currentStock ?? "-"}</strong>
                    </div>
                    <div className="rounded-2xl bg-green-50 p-4">
                      <p className="text-xs font-bold uppercase text-green-700">Alerta configurado</p>
                      <strong className="mt-1 block text-xl text-zinc-900">{row.minimum ?? "-"}</strong>
                    </div>
                  </div>
                )}
              </article>
            ))}

            {filteredRows.length === 0 && (
              <p className="rounded-2xl border border-green-100 bg-green-50 p-5 text-zinc-600">
                Nenhum evento encontrado para a busca atual.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default SanitaryAgenda;
