import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import {
  createMortalityRecordApi,
  deleteMortalityRecordApi,
  fetchBirdLotsApi,
  fetchMortalityRecordsApi,
} from "../services/vacitechApi";
import { matchesSearchQuery } from "../utils/search";

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  birdLotId: "",
  deaths: "",
  responsible: "",
  observation: "",
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function Mortality() {
  const [lots, setLots] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const selectedLot = lots.find((lot) => String(lot.id) === String(form.birdLotId));

  async function loadData() {
    const [apiLots, apiRecords] = await Promise.all([
      fetchBirdLotsApi(),
      fetchMortalityRecordsApi(),
    ]);

    setLots(apiLots || []);
    setRecords(apiRecords || []);
  }

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message));
  }, []);

  const summaries = useMemo(() => {
    const activeLots = lots.filter((lot) => String(lot.status || "").toLowerCase() === "ativo");
    const initialBirds = activeLots.reduce((total, lot) => total + Number(lot.avesAlojadas || 0), 0);
    const totalDeaths = records.reduce((total, record) => total + Number(record.deaths || 0), 0);
    const currentBirds = Math.max(0, initialBirds - totalDeaths);
    const survivalRate = initialBirds > 0 ? (currentBirds / initialBirds) * 100 : 0;

    return {
      initialBirds,
      totalDeaths,
      currentBirds,
      survivalRate,
    };
  }, [lots, records]);

  const filteredRecords = useMemo(() => (
    records.filter((record) => matchesSearchQuery(record, search, [
      record.date,
      formatDate(record.date),
      record.birdLotName,
      record.deaths,
      record.responsible,
      record.observation,
    ]))
  ), [records, search]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveRecord(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await createMortalityRecordApi({
        ...form,
        birdLotName: selectedLot
          ? `ID ${selectedLot.id} - ${selectedLot.ranchoAtual || "Rancho"} - ${selectedLot.linhagem || "Lote"}`
          : "",
        initialBirds: Number(selectedLot?.avesAlojadas || 0),
      });

      setRecords(data.mortalityRecords || []);
      setForm(emptyForm);
      setMessage("Mortalidade registrada.");
    } catch (error) {
      setMessage(error.message || "Nao foi possivel registrar mortalidade.");
    }
  }

  async function removeRecord(record) {
    const confirmed = window.confirm("Excluir este registro de mortalidade? A exclusao sera registrada como historico interno.");

    if (!confirmed) {
      return;
    }

    const data = await deleteMortalityRecordApi(record.id);
    setRecords(data.mortalityRecords || []);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-8">
        <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h1 className="text-5xl font-bold text-zinc-900">Mortalidade</h1>
          <p className="mt-2 text-zinc-500">
            Controle diario por lote com aves atuais estimadas e taxa de sobrevivencia.
          </p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Aves alojadas</p>
            <strong className="mt-3 block text-3xl text-green-700">{formatNumber(summaries.initialBirds)}</strong>
          </div>
          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Mortes acumuladas</p>
            <strong className="mt-3 block text-3xl text-red-600">{formatNumber(summaries.totalDeaths)}</strong>
          </div>
          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Aves atuais estimadas</p>
            <strong className="mt-3 block text-3xl text-green-700">{formatNumber(summaries.currentBirds)}</strong>
          </div>
          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Sobrevivencia geral</p>
            <strong className="mt-3 block text-3xl text-green-700">{formatPercent(summaries.survivalRate)}</strong>
          </div>
        </section>

        <form onSubmit={saveRecord} className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">Registrar mortalidade diaria</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <input
              type="date"
              value={form.date}
              onChange={(event) => updateForm("date", event.target.value)}
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <select
              value={form.birdLotId}
              onChange={(event) => updateForm("birdLotId", event.target.value)}
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            >
              <option value="">Selecione o lote</option>
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  ID {lot.id} - {lot.ranchoAtual || "Rancho"} - {lot.linhagem || "Lote"}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={form.deaths}
              onChange={(event) => updateForm("deaths", event.target.value)}
              placeholder="Mortes"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <input
              type="text"
              value={form.responsible}
              onChange={(event) => updateForm("responsible", event.target.value)}
              placeholder="Responsavel"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <input
              type="text"
              value={form.observation}
              onChange={(event) => updateForm("observation", event.target.value)}
              placeholder="Observacao"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />
          </div>

          <button type="submit" className="mt-6 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700">
            Registrar mortalidade
          </button>

          {message && (
            <p className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4 font-semibold text-green-700">
              {message}
            </p>
          )}
        </form>

        <section className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">Historico diario</h2>
              <p className="mt-1 text-sm text-zinc-500">{filteredRecords.length} de {records.length} registro(s).</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por lote, data, responsavel ou observacao"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none md:max-w-lg"
            />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Data</th>
                  <th className="pb-4">Lote</th>
                  <th className="pb-4">Mortes</th>
                  <th className="pb-4">Responsavel</th>
                  <th className="pb-4">Observacao</th>
                  <th className="pb-4">Acao</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">{formatDate(record.date)}</td>
                    <td className="font-bold text-green-700">{record.birdLotName || record.birdLotId}</td>
                    <td className="font-bold text-red-600">{record.deaths}</td>
                    <td>{record.responsible || "-"}</td>
                    <td className="max-w-md whitespace-normal break-words text-zinc-600">{record.observation || "-"}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeRecord(record)}
                        className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-zinc-500">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Mortality;
