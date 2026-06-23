import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import {
  createSanitaryRecordApi,
  deleteSanitaryRecordApi,
  fetchBirdLotsApi,
  fetchSanitaryRecordsApi,
} from "../services/vacitechApi";
import { matchesSearchQuery } from "../utils/search";

const SANITARY_TYPES = [
  { value: "VACINA", label: "Vacina" },
  { value: "MEDICAMENTO", label: "Medicamento" },
  { value: "ANTIBIOTICO", label: "Antibiotico" },
  { value: "DESINFECCAO", label: "Desinfeccao" },
  { value: "DETETIZACAO", label: "Detetizacao" },
];

const emptyForm = {
  type: "MEDICAMENTO",
  date: new Date().toISOString().split("T")[0],
  birdLotId: "",
  product: "",
  quantity: "",
  responsible: "",
  observations: "",
  fileName: "",
};

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getTypeLabel(type) {
  return SANITARY_TYPES.find((item) => item.value === type)?.label || type || "-";
}

function Sanitary() {
  const [lots, setLots] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const selectedLot = lots.find((lot) => String(lot.id) === String(form.birdLotId));

  async function loadData() {
    const [apiLots, apiRecords] = await Promise.all([
      fetchBirdLotsApi(),
      fetchSanitaryRecordsApi(),
    ]);

    setLots(apiLots || []);
    setRecords(apiRecords || []);
  }

  useEffect(() => {
    loadData().catch((error) => setMessage(error.message));
  }, []);

  const counters = useMemo(() => (
    SANITARY_TYPES.map((type) => ({
      ...type,
      count: records.filter((record) => record.type === type.value).length,
    }))
  ), [records]);

  const filteredRecords = useMemo(() => (
    records.filter((record) => matchesSearchQuery(record, search, [
      getTypeLabel(record.type),
      formatDate(record.date),
      record.birdLotName,
      record.product,
      record.quantity,
      record.responsible,
      record.observations,
      record.fileName,
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
      const data = await createSanitaryRecordApi({
        ...form,
        birdLotName: selectedLot
          ? `ID ${selectedLot.id} - ${selectedLot.ranchoAtual || "Rancho"} - ${selectedLot.linhagem || "Lote"}`
          : "",
      });

      setRecords(data.sanitaryRecords || []);
      setForm(emptyForm);
      setMessage("Registro sanitario salvo.");
    } catch (error) {
      setMessage(error.message || "Nao foi possivel salvar o registro sanitario.");
    }
  }

  async function removeRecord(record) {
    const confirmed = window.confirm("Excluir este registro sanitario? A exclusao sera preservada como soft delete no AppState.");

    if (!confirmed) {
      return;
    }

    const data = await deleteSanitaryRecordApi(record.id);
    setRecords(data.sanitaryRecords || []);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-8">
        <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h1 className="text-5xl font-bold text-zinc-900">Controle Sanitario</h1>
          <p className="mt-2 text-zinc-500">
            Registro organizado de vacinas, medicamentos, antibioticos, desinfeccao e detetizacao.
          </p>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-5">
          {counters.map((item) => (
            <div key={item.value} className="rounded-3xl border border-green-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-wide text-green-700">{item.label}</p>
              <strong className="mt-3 block text-3xl text-zinc-900">{item.count}</strong>
            </div>
          ))}
        </section>

        <form onSubmit={saveRecord} className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">Novo registro sanitario</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={form.type}
              onChange={(event) => updateForm("type", event.target.value)}
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            >
              {SANITARY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>

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
              <option value="">Lote opcional</option>
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  ID {lot.id} - {lot.ranchoAtual || "Rancho"} - {lot.linhagem || "Lote"}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={form.product}
              onChange={(event) => updateForm("product", event.target.value)}
              placeholder="Produto"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <input
              type="text"
              value={form.quantity}
              onChange={(event) => updateForm("quantity", event.target.value)}
              placeholder="Quantidade"
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
              value={form.fileName}
              onChange={(event) => updateForm("fileName", event.target.value)}
              placeholder="Referencia de arquivo/foto"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <input
              type="text"
              value={form.observations}
              onChange={(event) => updateForm("observations", event.target.value)}
              placeholder="Observacoes"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />
          </div>

          <button type="submit" className="mt-6 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700">
            Salvar registro
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
              <h2 className="text-2xl font-bold text-zinc-900">Historico sanitario</h2>
              <p className="mt-1 text-sm text-zinc-500">{filteredRecords.length} de {records.length} registro(s).</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por tipo, lote, produto, responsavel, data ou observacao"
              className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none md:max-w-lg"
            />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Tipo</th>
                  <th className="pb-4">Data</th>
                  <th className="pb-4">Lote</th>
                  <th className="pb-4">Produto</th>
                  <th className="pb-4">Quantidade</th>
                  <th className="pb-4">Responsavel</th>
                  <th className="pb-4">Observacoes</th>
                  <th className="pb-4">Acao</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4 font-bold text-green-700">{getTypeLabel(record.type)}</td>
                    <td>{formatDate(record.date)}</td>
                    <td>{record.birdLotName || record.birdLotId || "-"}</td>
                    <td className="font-bold">{record.product}</td>
                    <td>{record.quantity || "-"}</td>
                    <td>{record.responsible || "-"}</td>
                    <td className="max-w-md whitespace-normal break-words text-zinc-600">
                      {record.observations || record.fileName || "-"}
                    </td>
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
                    <td colSpan="8" className="py-6 text-zinc-500">
                      Nenhum registro sanitario encontrado.
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

export default Sanitary;
