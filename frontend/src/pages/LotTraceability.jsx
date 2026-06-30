import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import {
  fetchBirdLotsApi,
  fetchLotTraceabilityApi,
} from "../services/vacitechApi";
import { matchesSearchQuery } from "../utils/search";
import { normalizeRequestStatus } from "../utils/vacitechStorage";

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

  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

function getLotLabel(lot) {
  if (!lot) {
    return "Lote";
  }

  return `ID ${lot.id} - ${lot.ranchoAtual || "Rancho"} - ${lot.linhagem || "Lote"}`;
}

function getVaccinesText(record = {}) {
  const usages = record.vaccineUsages || record.actualVaccineUsages || [];

  if (Array.isArray(usages) && usages.length > 0) {
    return usages.map((usage) => usage.vacina || usage.name).filter(Boolean).join(", ");
  }

  return record.programSuggestedName || record.vaccineName || record.vacina || "-";
}

function LotTraceability() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLotId = searchParams.get("lote") || searchParams.get("lot") || "";
  const [lots, setLots] = useState([]);
  const [selectedLotId, setSelectedLotId] = useState(initialLotId);
  const [traceability, setTraceability] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchBirdLotsApi()
      .then((data) => setLots(data || []))
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedLotId) {
      setTraceability(null);
      return;
    }

    setMessage("");
    fetchLotTraceabilityApi(selectedLotId)
      .then((data) => setTraceability(data.traceability || data))
      .catch((error) => setMessage(error.message));
  }, [selectedLotId]);

  const filteredLots = useMemo(() => (
    lots.filter((lot) => matchesSearchQuery(lot, search, [
      getLotLabel(lot),
      lot.id,
      lot.status,
      lot.ranchoAtual,
      lot.linhagem,
      lot.dataAlojamento,
    ]))
  ), [lots, search]);

  function chooseLot(lotId) {
    setSelectedLotId(lotId);
    setSearchParams(lotId ? { lote: lotId } : {});
  }

  const summary = traceability?.summary || {};
  const selectedLot = traceability?.lot || lots.find((lot) => String(lot.id) === String(selectedLotId));

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-8">
        <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h1 className="text-5xl font-bold text-zinc-900">Rastreabilidade por lote</h1>
          <p className="mt-2 text-zinc-500">
            Historico completo de aves, mortalidade, vacinacoes e temperatura.
          </p>
        </section>

        {message && (
          <p className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 font-semibold text-red-700">
            {message}
          </p>
        )}

        <section className="mt-8 grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-zinc-900">Lotes</h2>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por ID, rancho, linhagem, status ou data"
              className="mt-4 w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <div className="mt-5 grid max-h-[620px] gap-3 overflow-y-auto pr-1">
              {filteredLots.map((lot) => (
                <button
                  key={lot.id}
                  type="button"
                  onClick={() => chooseLot(String(lot.id))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    String(selectedLotId) === String(lot.id)
                      ? "border-green-500 bg-green-50"
                      : "border-green-100 bg-white hover:bg-green-50"
                  }`}
                >
                  <strong className="block text-lg text-zinc-900">{getLotLabel(lot)}</strong>
                  <span className="mt-1 block text-sm text-zinc-500">
                    {formatNumber(lot.avesAlojadas)} aves | {lot.status || "-"}
                  </span>
                </button>
              ))}

              {filteredLots.length === 0 && (
                <p className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-zinc-600">
                  Nenhum lote encontrado.
                </p>
              )}
            </div>
          </aside>

          <section className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            {!selectedLot && (
              <p className="rounded-2xl border border-green-100 bg-green-50 p-5 text-zinc-600">
                Selecione um lote para visualizar a rastreabilidade.
              </p>
            )}

            {selectedLot && (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold text-zinc-900">{getLotLabel(selectedLot)}</h2>
                    <p className="mt-1 text-zinc-500">
                      Alojamento: {formatDate(selectedLot.dataAlojamento)} | Idade: {selectedLot.idadeAtual || "-"} dia(s)
                    </p>
                  </div>
                  <span className="rounded-full border border-green-100 bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                    {selectedLot.status || "-"}
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl bg-green-50 p-5">
                    <p className="text-sm text-zinc-500">Aves iniciais</p>
                    <strong className="mt-2 block text-2xl text-green-700">{formatNumber(summary.initialBirds || selectedLot.avesAlojadas)}</strong>
                  </div>
                  <div className="rounded-2xl bg-green-50 p-5">
                    <p className="text-sm text-zinc-500">Mortalidade</p>
                    <strong className="mt-2 block text-2xl text-red-600">{formatNumber(summary.totalDeaths)}</strong>
                  </div>
                  <div className="rounded-2xl bg-green-50 p-5">
                    <p className="text-sm text-zinc-500">Aves atuais</p>
                    <strong className="mt-2 block text-2xl text-green-700">{formatNumber(summary.currentBirds || selectedLot.avesAlojadas)}</strong>
                  </div>
                  <div className="rounded-2xl bg-green-50 p-5">
                    <p className="text-sm text-zinc-500">Sobrevivencia</p>
                    <strong className="mt-2 block text-2xl text-green-700">{formatPercent(summary.survivalRate || 100)}</strong>
                  </div>
                </div>

                <TraceSection title="Vacinas e programas">
                  {(traceability?.vaccinations || []).map((record, index) => (
                    <article key={`${record.id || index}-vaccination`} className="rounded-2xl border border-green-100 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <strong className="text-zinc-900">{getVaccinesText(record)}</strong>
                          <p className="mt-1 text-sm text-zinc-500">
                            {record.vaccinatorName || record.responsible || "-"} | {formatDate(record.vaccinationStartDate || record.date || record.systemConfirmedAtIso)}
                          </p>
                        </div>
                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                          {normalizeRequestStatus(record.status)}
                        </span>
                      </div>
                      {(record.quantityUsed || record.completionObservation || record.observation) && (
                        <p className="mt-3 text-sm text-zinc-600">
                          Usado: {record.quantityUsed || "-"} | {record.completionObservation || record.observation || "-"}
                        </p>
                      )}
                    </article>
                  ))}
                  {(traceability?.vaccinations || []).length === 0 && <EmptyMessage text="Nenhuma vacinacao encontrada para este lote." />}
                </TraceSection>

                <TraceSection title="Mortalidade diaria">
                  {(traceability?.mortalityRecords || []).map((record) => (
                    <article key={record.id} className="rounded-2xl border border-green-100 p-4">
                      <strong className="text-red-600">{formatNumber(record.deaths)} morte(s)</strong>
                      <p className="mt-1 text-sm text-zinc-500">{formatDate(record.date)} | {record.responsible || "-"}</p>
                      <p className="mt-2 text-sm text-zinc-600">{record.observation || "-"}</p>
                    </article>
                  ))}
                  {(traceability?.mortalityRecords || []).length === 0 && <EmptyMessage text="Nenhum registro de mortalidade para este lote." />}
                </TraceSection>

                <TraceSection title="Temperatura da vacina">
                  {(traceability?.temperaturePhotos || []).map((photo, index) => (
                    <article key={`${photo.requestId || index}-temp`} className="rounded-2xl border border-green-100 p-4">
                      <strong className="text-zinc-900">{photo.vaccine || "Registro de temperatura"}</strong>
                      <p className="mt-1 text-sm text-zinc-500">
                        {formatDate(photo.capturedAt || photo.uploadedAt)} | {photo.source || "-"} | {photo.status || "NORMAL"}
                      </p>
                      {photo.photo && (
                        <img
                          src={photo.photo}
                          alt="Foto da temperatura"
                          className="mt-3 max-h-64 rounded-2xl border border-green-100 object-contain"
                        />
                      )}
                      <p className="mt-2 text-sm text-zinc-600">{photo.notes || "-"}</p>
                    </article>
                  ))}
                  {(traceability?.temperaturePhotos || []).length === 0 && <EmptyMessage text="Nenhuma foto de temperatura encontrada para este lote." />}
                </TraceSection>
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function TraceSection({ title, children }) {
  return (
    <section className="mt-8">
      <h3 className="text-2xl font-bold text-zinc-900">{title}</h3>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function EmptyMessage({ text }) {
  return (
    <p className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-zinc-600">
      {text}
    </p>
  );
}

export default LotTraceability;
