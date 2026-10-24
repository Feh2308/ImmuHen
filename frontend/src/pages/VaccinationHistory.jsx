import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { fetchSharedStateApi } from "../services/vacitechApi";
import { normalizeRequestStatus } from "../utils/vacitechStorage";

const filters = [["TODAS", "Todas"], ["PENDENTE", "Aguardando confirmação"], ["EM_ANDAMENTO", "Em andamento"], ["CONCLUIDA", "Confirmadas"]];

function statusLabel(status) {
  const value = normalizeRequestStatus(status);
  return value === "PENDENTE" ? "Aguardando confirmação" : value === "EM_ANDAMENTO" ? "Em andamento" : ["CONCLUIDA", "CONCLUIDA_CONFIRMADA"].includes(value) ? "Confirmado" : value;
}

export default function VaccinationHistory() {
  const [schedules, setSchedules] = useState([]);
  const [filter, setFilter] = useState("TODAS");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    fetchSharedStateApi(["schedules"]).then((data) => setSchedules(data.schedules || [])).catch((error) => setMessage(error.message));
  }, []);

  const programs = useMemo(() => {
    const groups = new Map();
    schedules.filter((item) => {
      const status = normalizeRequestStatus(item.status);
      return filter === "TODAS" || (filter === "CONCLUIDA" ? ["CONCLUIDA", "CONCLUIDA_CONFIRMADA"].includes(status) : status === filter);
    }).forEach((item) => {
      const key = item.programId || `single-${item.id}`;
      const group = groups.get(key) || { key, items: [] };
      group.items.push(item);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [filter, schedules]);

  return <div className="min-h-screen bg-gradient-to-br from-green-50 to-white"><Sidebar /><main className="mx-auto max-w-7xl p-5 md:p-8"><section className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm"><h1 className="text-3xl font-bold text-zinc-900 md:text-5xl">Acompanhamento de vacinações</h1><p className="mt-2 text-zinc-500">Programas agrupados para não poluir a tela.</p><div className="mt-6 flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 font-bold ${filter === value ? "bg-green-600 text-white" : "border border-green-200 bg-white text-green-700"}`}>{label}</button>)}</div></section>{message && <p className="mt-5 rounded-xl bg-red-50 p-4 font-semibold text-red-700">{message}</p>}<section className="mt-6 grid gap-4">{programs.map((program) => { const first = program.items[0]; const isOpen = expanded[program.key]; return <article key={program.key} className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-zinc-900">{first.farmName || "Granja"} — {first.programId ? `Programa ${statusLabel(first.status).toLowerCase()} (todos)` : "Vacinação"}</h2><p className="mt-1 text-sm text-zinc-500">Vacinador: {first.vaccinatorName || "-"} · Período: {first.vaccinationStartDate || "-"} a {first.vaccationEndDate || first.vaccinationEndDate || first.vaccinationStartDate || "-"}</p></div><button type="button" onClick={() => setExpanded((current) => ({ ...current, [program.key]: !isOpen }))} className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white">{isOpen ? "Ocultar detalhes" : "Ver detalhes"}</button></div>{isOpen && <div className="mt-4 grid gap-3 border-t border-green-100 pt-4">{program.items.sort((a, b) => Number(a.programDay || 0) - Number(b.programDay || 0)).map((item) => <div key={item.id} className="rounded-xl bg-green-50 p-4"><strong>Dia {item.programDay || "—"} · {item.programSuggestedName || "Vacinação"}</strong><p className="mt-1 text-sm text-zinc-600">{item.vaccinationStartDate || "-"} · {(item.vaccineUsages || []).map((usage) => `${usage.vacina || "Vacina"} (${usage.doses || 0} doses)`).join(", ") || "Sem vacinas informadas"}</p></div>)}</div>}</article>; })}{programs.length === 0 && <p className="rounded-2xl border border-green-100 bg-white p-6 text-zinc-500">Nenhuma vacinação encontrada.</p>}</section></main></div>;
}
