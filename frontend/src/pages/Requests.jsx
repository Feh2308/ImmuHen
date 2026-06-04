import Sidebar from "../components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import {
  formatPeriod,
  getStatusClass,
  normalizeRequestStatus,
  readJson,
} from "../utils/vacitechStorage";
import {
  confirmVaccinationCompletionApi,
  confirmDoseRequestApi,
  fetchRequestsApi,
  fetchSharedStateApi,
} from "../services/vacitechApi";
import { useVaccines } from "../context/VaccineContext";

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }

  return parsed.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getLaborCost(record) {
  return parseQuantity(record?.programLaborCost ?? record?.laborCost ?? 0);
}

function getRequestTotalDoses(request) {
  return (request.vaccineUsages || []).reduce((total, usage) => total + Number(usage.doses || 0), 0);
}

function getRecordDateValue(record) {
  return (
    record?.vaccinationStartDate ||
    record?.date ||
    record?.programStartDate ||
    "9999-12-31"
  );
}

function getProgramDayValue(record) {
  const parsed = Number(record?.programDay || 0);

  return parsed > 0 ? parsed : 9999;
}

function sortVaccinationRecords(first, second) {
  const firstDate = getRecordDateValue(first);
  const secondDate = getRecordDateValue(second);

  if (firstDate !== secondDate) {
    return firstDate.localeCompare(secondDate);
  }

  const firstProgram = String(first?.programId || "");
  const secondProgram = String(second?.programId || "");

  if (firstProgram !== secondProgram) {
    return firstProgram.localeCompare(secondProgram);
  }

  const dayDiff = getProgramDayValue(first) - getProgramDayValue(second);

  if (dayDiff !== 0) {
    return dayDiff;
  }

  return String(first?.farmName || first?.birdLotName || "").localeCompare(
    String(second?.farmName || second?.birdLotName || ""),
    "pt-BR"
  );
}

function calculateBirdsPerFlask(flaskCc, dosePerBirdCc) {
  const flask = parseQuantity(flaskCc);
  const dose = parseQuantity(dosePerBirdCc);

  if (flask <= 0 || dose <= 0) {
    return 0;
  }

  return Math.floor(flask / dose);
}

function getUsageTechnicalText(item) {
  const flaskCc = String(item.flaskCc || item.flasks || item.frascos || "").trim();
  const dosePerBirdCc = String(item.dosePerBirdCc || "").trim();
  const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);
  const parts = [];

  if (flaskCc) {
    parts.push(`${flaskCc} cc/frasco`);
  }

  if (dosePerBirdCc) {
    parts.push(`${dosePerBirdCc} cc/ave`);
  }

  if (birdsPerFlask > 0) {
    parts.push(`${formatQuantity(birdsPerFlask)} aves/frasco`);
  }

  return parts.join(" | ");
}

function getCompletionDate(record) {
  const value = record.systemConfirmedAtIso || record.archivedAtIso || record.completedAtIso || "";
  const date = value ? new Date(value) : new Date(0);

  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getRecordMaterials(record) {
  const storedMaterials = Array.isArray(record.materialsUsed) && record.materialsUsed.length > 0
    ? record.materialsUsed
    : [
        ...(Array.isArray(record.vaccineUsages) ? record.vaccineUsages : []),
        ...(Array.isArray(record.doseRequest?.confirmedItems) ? record.doseRequest.confirmedItems : []),
      ];

  return storedMaterials
    .map((item) => ({
      id: item.id || item.vaccineId || item.codigo || item.vacina,
      vaccineId: item.vaccineId || "",
      vacina: item.vacina || item.name || "Vacina",
      codigo: item.codigo || "",
      doses: parseQuantity(item.doses),
      technicalDetails: item.technicalDetails || getUsageTechnicalText(item),
      flasks: item.technicalDetails || getUsageTechnicalText(item),
      source: item.source || "",
    }))
    .filter((item) => item.vacina && item.doses > 0);
}

function getRecordSummary(record) {
  if (record.completionSummary) {
    return record.completionSummary;
  }

  const materials = getRecordMaterials(record);
  const materialsText = materials.length > 0
    ? materials.map((item) => `${item.vacina} (${item.doses} dose(s)${item.technicalDetails ? `, ${item.technicalDetails}` : ""})`).join(", ")
    : "vacina nao informada";

  return `${record.vaccinatorName || "Vacinador"} efetuou ${materialsText} na granja ${record.farmName || "Granja"}.`;
}

function shouldShowRequest(request) {
  const status = normalizeRequestStatus(request.status);

  return status !== "RECUSADA" && !request.systemConfirmedAtIso && !request.archivedAtIso;
}

function Requests() {
  const {
    vaccines,
    addEntry,
    addOutput,
    calculateStock,
  } = useVaccines();
  const [requests, setRequests] = useState(() => readJson("requests", []));
  const [notifications, setNotifications] = useState(() => readJson("vaccinatorNotifications", []));
  const [completedVaccinations, setCompletedVaccinations] = useState(() => readJson("completedVaccinations", []));
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [doseConfirmationForms, setDoseConfirmationForms] = useState({});
  const [completionForms, setCompletionForms] = useState({});
  const captureUrl = `${window.location.origin}/temperatura-vacina`;

  async function loadRequests() {
    try {
      const [apiRequests, state] = await Promise.all([
        fetchRequestsApi(),
        fetchSharedStateApi(),
      ]);

      setRequests(apiRequests);
      setNotifications(state.notifications || []);
      setCompletedVaccinations(state.completedVaccinations || []);
      localStorage.setItem("requests", JSON.stringify(apiRequests));
      localStorage.setItem("vaccinatorNotifications", JSON.stringify(state.notifications || []));
      localStorage.setItem("completedVaccinations", JSON.stringify(state.completedVaccinations || []));
    } catch (error) {
      console.log(error);
      setRequests(readJson("requests", []));
      setNotifications(readJson("vaccinatorNotifications", []));
      setCompletedVaccinations(readJson("completedVaccinations", []));
    }
  }

  useEffect(() => {
    loadRequests();
    const refreshInterval = window.setInterval(loadRequests, 5000);

    window.addEventListener("storage", loadRequests);
    window.addEventListener("vacitech-storage", loadRequests);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", loadRequests);
      window.removeEventListener("vacitech-storage", loadRequests);
    };
  }, []);

  const activeRequests = useMemo(() => (
    requests
      .filter(shouldShowRequest)
      .sort(sortVaccinationRecords)
  ), [requests]);

  const counters = useMemo(() => {
    return activeRequests.reduce(
      (total, request) => {
        const status = normalizeRequestStatus(request.status);

        return {
          ...total,
          [status]: (total[status] || 0) + 1,
        };
      },
      {
        PENDENTE: 0,
        CONFIRMADA: 0,
        EM_ANDAMENTO: 0,
        CONCLUIDA: 0,
        RECUSADA: 0,
      }
    );
  }, [activeRequests]);

  const filteredRequests = activeRequests.filter((request) => {
    if (statusFilter === "TODAS") {
      return true;
    }

    return normalizeRequestStatus(request.status) === statusFilter;
  });

  const visibleNotifications = notifications
    .filter((notification) => (
      notification.type === "DOSE_REQUEST" ||
      notification.type === "TEMPERATURE_PHOTO" ||
      notification.type === "VACCINATION_COMPLETED" ||
      notification.type === "VACCINATION_POSTPONED" ||
      notification.type === "VACCINE_CHANGED" ||
      notification.type === "OVERDUE_VACCINATION" ||
      notification.type === "LOW_STOCK"
    ))
    .slice(-8)
    .reverse();

  const completedHistory = useMemo(() => {
    return [...completedVaccinations]
      .sort((first, second) => getCompletionDate(second).getTime() - getCompletionDate(first).getTime())
      .slice(0, 12);
  }, [completedVaccinations]);

  function getNotificationLabel(type) {
    if (type === "TEMPERATURE_PHOTO") {
      return "Foto da temperatura";
    }

    if (type === "VACCINATION_COMPLETED") {
      return "Vacinacao concluida";
    }

    if (type === "OVERDUE_VACCINATION") {
      return "Vacina atrasada";
    }

    if (type === "LOW_STOCK") {
      return "Estoque baixo";
    }

    if (type === "VACCINATION_POSTPONED") {
      return "Vacinacao adiada";
    }

    if (type === "VACCINE_CHANGED") {
      return "Vacina alterada";
    }

    return "Solicitacao de doses";
  }

  function getCaptureUrl(requestId) {
    return `${captureUrl}?requestId=${encodeURIComponent(requestId)}`;
  }

  function copyCaptureUrl(requestId) {
    const url = getCaptureUrl(requestId);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
      return;
    }

    window.prompt("Copie o link para abrir no celular:", url);
  }

  function getVaccine(id) {
    return vaccines.find((vaccine) => String(vaccine.id) === String(id));
  }

  function getInitialDoseRows(request) {
    const scheduledUsages = Array.isArray(request.vaccineUsages) && request.vaccineUsages.length > 0
      ? request.vaccineUsages
      : [{}];

    return scheduledUsages.map((usage, index) => ({
      id: `dose-${request.id}-${index}`,
      vaccineId: usage.vaccineId || "",
      doses: "",
    }));
  }

  function getDoseRows(request) {
    return doseConfirmationForms[request.id] || getInitialDoseRows(request);
  }

  function getCompletionForm(request) {
    const materials = getRecordMaterials(request);

    return completionForms[request.id] || {
      completionTiming: "PONTUAL",
      returnedVaccines: materials.map((material, index) => ({
        id: `retorno-${request.id}-${index}`,
        vaccineId: material.vaccineId || "",
        vacina: material.vacina || "Vacina",
        codigo: material.codigo || "",
        doses: "",
      })),
    };
  }

  function updateCompletionTiming(request, value) {
    const currentForm = getCompletionForm(request);

    setCompletionForms({
      ...completionForms,
      [request.id]: {
        ...currentForm,
        completionTiming: value,
      },
    });
  }

  function updateReturnedDose(request, vaccineId, value) {
    const currentForm = getCompletionForm(request);

    setCompletionForms({
      ...completionForms,
      [request.id]: {
        ...currentForm,
        returnedVaccines: currentForm.returnedVaccines.map((item) => (
          String(item.vaccineId) === String(vaccineId)
            ? { ...item, doses: value }
            : item
        )),
      },
    });
  }

  function getReturnedVaccines(request) {
    return getCompletionForm(request).returnedVaccines
      .map((item) => ({
        ...item,
        doses: parseQuantity(item.doses),
      }))
      .filter((item) => item.vaccineId && item.doses > 0);
  }

  function updateDoseConfirmationRow(request, rowId, field, value) {
    const currentRows = getDoseRows(request);

    setDoseConfirmationForms({
      ...doseConfirmationForms,
      [request.id]: currentRows.map((row) => (
        row.id === rowId
          ? { ...row, [field]: value }
          : row
      )),
    });
  }

  function addDoseConfirmationRow(request) {
    setDoseConfirmationForms({
      ...doseConfirmationForms,
      [request.id]: [
        ...getDoseRows(request),
        { id: `dose-${request.id}-${Date.now()}`, vaccineId: "", doses: "" },
      ],
    });
  }

  function removeDoseConfirmationRow(request, rowId) {
    const currentRows = getDoseRows(request);

    setDoseConfirmationForms({
      ...doseConfirmationForms,
      [request.id]: currentRows.length === 1
        ? [{ id: `dose-${request.id}-${Date.now()}`, vaccineId: "", doses: "" }]
        : currentRows.filter((row) => row.id !== rowId),
    });
  }

  function getConfirmedDoseItems(request) {
    return getDoseRows(request)
      .filter((row) => row.vaccineId || row.doses)
      .map((row) => {
        const vaccine = getVaccine(row.vaccineId);

        return {
          id: row.id,
          vaccineId: row.vaccineId,
          vacina: vaccine?.nome || "Vacina",
          codigo: vaccine?.codigo || "-",
          doses: parseQuantity(row.doses),
        };
      });
  }

  function getDoseStockError(items) {
    const dosesByVaccine = items.reduce((total, item) => {
      total[item.vaccineId] = (total[item.vaccineId] || 0) + item.doses;
      return total;
    }, {});

    return Object.entries(dosesByVaccine).find(([vaccineId, doses]) => (
      doses > calculateStock(vaccineId)
    ));
  }

  async function confirmDoseRequest(request) {
    const confirmedItems = getConfirmedDoseItems(request);

    if (confirmedItems.length === 0) {
      alert("Informe as vacinas e doses que serao liberadas.");
      return;
    }

    if (confirmedItems.some((item) => !item.vaccineId || !item.doses || item.doses <= 0)) {
      alert("Preencha vacina e doses maiores que zero em todas as linhas.");
      return;
    }

    const invalidStock = getDoseStockError(confirmedItems);

    if (invalidStock) {
      const [vaccineId, doses] = invalidStock;
      const vaccine = getVaccine(vaccineId);

      alert(
        `Doses maiores que o estoque para ${vaccine?.nome || "a vacina"}. Necessario: ${doses}, estoque: ${calculateStock(vaccineId)}.`
      );
      return;
    }

    const confirmed = window.confirm("Confirmar as doses solicitadas e baixar do estoque?");

    if (!confirmed) {
      return;
    }

    try {
      const data = await confirmDoseRequestApi(request.id, confirmedItems);
      const outputBaseId = Date.now() + 200000;

      confirmedItems.forEach((item, index) => {
        addOutput({
          id: outputBaseId + index,
          groupId: `dose-request-${request.id}`,
          source: "SOLICITACAO_DOSES",
          scheduleId: request.scheduleId,
          requestId: request.id,
          vaccineId: item.vaccineId,
          vacina: item.vacina,
          codigo: item.codigo,
          doses: item.doses,
          destino: request.farmName || "Solicitacao",
          responsavel: request.vaccinatorName || "Vacinador",
          observacao: `Doses extras confirmadas. ${request.doseRequest?.message || ""}`.trim(),
          data: new Date().toLocaleDateString(),
        });
      });

      setRequests(data.requests || requests);
      setNotifications(data.notifications || notifications);
      localStorage.setItem("requests", JSON.stringify(data.requests || requests));
      localStorage.setItem("vaccinatorNotifications", JSON.stringify(data.notifications || notifications));
      setDoseConfirmationForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[request.id];
        return nextForms;
      });
    } catch (error) {
      alert(error.message);
    }
  }

  async function confirmCompletion(request) {
    const completionForm = getCompletionForm(request);
    const returnedVaccines = getReturnedVaccines(request);
    const confirmed = window.confirm(
      "Confirmar que esta vacinacao foi concluida?\n\nO sistema vai gerar o comprovante em PDF e remover esta solicitacao da lista."
    );

    if (!confirmed) {
      return;
    }

    try {
      const pdfBlob = await confirmVaccinationCompletionApi(request.id, {
        completionTiming: completionForm.completionTiming,
        returnedVaccines,
      });

      returnedVaccines.forEach((item, index) => {
        addEntry({
          id: Date.now() + index,
          source: "DEVOLUCAO_VACINA",
          vaccineId: item.vaccineId,
          vacina: item.vacina,
          codigo: item.codigo || "-",
          lote: `Devolucao ${request.id}`,
          doses: item.doses,
          valorDose: 0,
          valorTotal: 0,
          valor: 0,
          fornecedor: request.vaccinatorName || "Vacinador",
          observacao: `Devolucao de doses nao utilizadas na vacinacao ${request.id}`,
          data: new Date().toLocaleDateString(),
        });
      });

      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `comprovante-vacinacao-${request.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(pdfUrl);
      setCompletionForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[request.id];
        return nextForms;
      });
      await loadRequests();
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-6 md:p-8">
        <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 md:text-5xl">
                Solicitacoes
              </h1>

              <p className="mt-2 text-zinc-500">
                Acompanhamento das respostas dos vacinadores.
              </p>
            </div>

            <button
              type="button"
              onClick={loadRequests}
              className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
            >
              Atualizar
            </button>
            <a
              href="/temperatura-vacina"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-green-50 px-5 py-3 font-bold text-green-700 transition hover:bg-green-100"
            >
              Ambiente foto temperatura
            </a>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-yellow-700">
              Pendentes
            </p>
            <p className="mt-3 text-4xl font-bold text-yellow-600">
              {counters.PENDENTE}
            </p>
          </div>

          <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-green-700">
              Confirmadas
            </p>
            <p className="mt-3 text-4xl font-bold text-green-600">
              {counters.CONFIRMADA}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Em andamento
            </p>
            <p className="mt-3 text-4xl font-bold text-blue-600">
              {counters.EM_ANDAMENTO}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {["TODAS", "PENDENTE", "CONFIRMADA", "EM_ANDAMENTO", "CONCLUIDA"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl px-4 py-2 font-bold transition ${
                  statusFilter === status
                    ? "bg-green-600 text-white"
                    : "bg-green-50 text-green-700 hover:bg-green-100"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Notificacoes do ImmuHen Vacinador
          </h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {visibleNotifications.length === 0 && (
              <p className="text-zinc-500">
                Nenhuma notificacao do vacinador.
              </p>
            )}

            {visibleNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className="rounded-xl border border-green-100 bg-green-50 p-4"
                >
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    {getNotificationLabel(notification.type)}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-zinc-900">
                    {notification.vaccinatorName || "Vacinador"}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                    {notification.message}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-green-700">
                    {notification.createdAt}
                  </p>
                </article>
              ))}
          </div>
        </section>

        <section className="mt-6 grid gap-5">
          {filteredRequests.length === 0 && (
            <div className="rounded-2xl border border-green-100 bg-white p-6 text-zinc-500 shadow-sm">
              Nenhuma solicitacao encontrada.
            </div>
          )}

          {filteredRequests.map((request) => {
            const status = normalizeRequestStatus(request.status);
            const doseRows = getDoseRows(request);
            const doseRequestConfirmed = request.doseRequest?.status === "CONFIRMADO";

            return (
              <article
                key={request.id}
                className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-900">
                      {request.vaccinatorName || request.vaccinator || "Vacinador"}
                    </h2>

                    <p className="mt-2 text-zinc-500">
                      Granja: {request.farmName || "Nao informada"}
                    </p>

                    <p className="mt-1 text-zinc-500">
                      Proprietario: {request.farmOwner || request.responsible || "Nao informado"}
                    </p>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-4 py-2 text-sm font-bold ${getStatusClass(status)}`}
                  >
                    {status}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {status !== "CONCLUIDA" && (
                      <>
                        <a
                          href={getCaptureUrl(request.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-green-50 px-4 py-2 text-sm font-bold text-green-700 transition hover:bg-green-100"
                        >
                          Foto temperatura
                        </a>
                        <button
                          type="button"
                          onClick={() => copyCaptureUrl(request.id)}
                          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-200"
                        >
                          Copiar link celular
                        </button>
                      </>
                    )}

                    {status === "CONCLUIDA" && (
                      <div className="grid gap-3 rounded-xl border border-green-100 bg-green-50 p-3">
                        <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                          Execucao
                          <select
                            value={getCompletionForm(request).completionTiming}
                            onChange={(event) => updateCompletionTiming(request, event.target.value)}
                            className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                          >
                            <option value="PONTUAL">Pontual</option>
                            <option value="ATRASADA">Em atraso</option>
                            <option value="ANTECIPADA">Antecipada</option>
                          </select>
                        </label>

                        {getCompletionForm(request).returnedVaccines.length > 0 && (
                          <div className="grid gap-2">
                            <p className="text-sm font-bold text-green-700">
                              Devolucao de doses nao utilizadas
                            </p>
                            {getCompletionForm(request).returnedVaccines.map((item) => (
                              <label
                                key={item.id}
                                className="grid gap-2 text-sm font-semibold text-zinc-700 sm:grid-cols-[minmax(0,1fr)_130px] sm:items-center"
                              >
                                <span>{item.vacina}</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.doses}
                                  onChange={(event) => updateReturnedDose(request, item.vaccineId, event.target.value)}
                                  placeholder="0"
                                  className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                />
                              </label>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => confirmCompletion(request)}
                          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700"
                        >
                          Confirmar que vacinacao foi concluida
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Vacinacao
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatPeriod(
                        request.vaccinationStartDate || request.date,
                        request.vaccinationEndDate || request.date
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Debicagem
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {request.hasDebicagem === "SIM" ? "Sim" : "Nao"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Doses usadas
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatQuantity(getRequestTotalDoses(request))}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Mao de obra
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatCurrency(getLaborCost(request))}
                    </p>
                  </div>

                </div>

                {Array.isArray(request.vaccineUsages) && request.vaccineUsages.length > 0 && (
                  <div className="mt-5 rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Vacinas do agendamento
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.vaccineUsages.map((usage, index) => (
                        <span
                          key={`${usage.vaccineId}-${index}`}
                          className="rounded-full bg-white px-3 py-1 text-sm font-bold text-zinc-700"
                        >
                          {usage.vacina || "Vacina"}: {usage.doses} doses{getUsageTechnicalText(usage) ? ` | ${getUsageTechnicalText(usage)}` : ""}{usage.applicationMethod ? ` | ${usage.applicationMethod}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(request.farmAddress || request.farmLocation || request.observations) && (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-green-100 bg-white p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Endereco
                      </p>
                      <p className="mt-2 text-zinc-700">
                        {request.farmAddress || "Nao informado"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-green-100 bg-white p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Localizacao
                      </p>
                      <p className="mt-2 break-words text-zinc-700">
                        {request.farmLocation || "Nao informada"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-green-100 bg-white p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Observacoes
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                        {request.observations || "Nenhuma observacao"}
                      </p>
                    </div>
                  </div>
                )}

                {request.answeredAt && (
                  <p className="mt-4 text-sm text-zinc-500">
                    Respondida em {request.answeredAt}
                  </p>
                )}

                {request.startedAt && (
                  <p className="mt-4 text-sm text-blue-600">
                    Iniciada em {request.startedAt}
                  </p>
                )}

                {request.postponement && (
                  <p className="mt-4 text-sm font-semibold text-yellow-700">
                    Adiada por {request.postponement.vaccinatorName || "vacinador"} para {formatPeriod(request.postponement.vaccinationStartDate, request.postponement.vaccinationEndDate)}
                    {request.postponement.reason ? ` - ${request.postponement.reason}` : ""}
                  </p>
                )}

                {request.completedAt && (
                  <p className="mt-4 text-sm text-zinc-700">
                    Concluida em {request.completedAt}
                  </p>
                )}

                {(request.temperaturePhoto || request.temperatureNotes || request.doseRequest) && (
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    {request.temperaturePhoto && (
                      <div className="rounded-xl border border-green-100 bg-white p-4">
                        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                          Foto temperatura
                        </p>
                        <img
                          src={request.temperaturePhoto}
                          alt="Temperatura da vacina"
                          className="mt-3 max-h-56 rounded-xl border border-green-100 object-contain"
                        />
                        <p className="mt-2 text-sm text-zinc-500">
                          {request.temperaturePhotoUploadedAt}
                        </p>
                        {request.temperaturePhotoSource && (
                          <p className="mt-1 text-sm font-semibold text-green-700">
                            Origem: {request.temperaturePhotoSource === "GRANJA" ? "Granja" : "Vacinador"}
                          </p>
                        )}
                      </div>
                    )}

                    {request.temperatureNotes && (
                      <div className="rounded-xl border border-green-100 bg-white p-4">
                        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                          Observacao temperatura
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                          {request.temperatureNotes}
                        </p>
                      </div>
                    )}

                    {request.doseRequest && (
                      <div className="rounded-xl border border-green-100 bg-white p-4 md:col-span-3">
                        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                          Doses solicitadas
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                          {request.doseRequest.message}
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">
                          {request.doseRequest.requestedAt}
                        </p>

                        {doseRequestConfirmed ? (
                          <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
                            <p className="font-bold text-green-700">
                              Doses confirmadas em {request.doseRequest.confirmedAt}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(request.doseRequest.confirmedItems || []).map((item, index) => (
                                <span
                                  key={`${item.vaccineId}-${index}`}
                                  className="rounded-full bg-white px-3 py-1 text-sm font-bold text-zinc-700"
                                >
                                  {item.vacina || "Vacina"}: {item.doses} doses{item.technicalDetails ? ` | ${item.technicalDetails}` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="font-bold text-zinc-900">
                                Confirmar baixa no estoque
                              </p>
                              <button
                                type="button"
                                onClick={() => addDoseConfirmationRow(request)}
                                className="rounded-xl bg-white px-4 py-2 font-bold text-green-700 transition hover:bg-green-100"
                              >
                                Adicionar vacina
                              </button>
                            </div>

                            {doseRows.map((row) => (
                              <div
                                key={row.id}
                                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_120px]"
                              >
                                <select
                                  value={row.vaccineId}
                                  onChange={(event) => updateDoseConfirmationRow(request, row.id, "vaccineId", event.target.value)}
                                  className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                >
                                  <option value="">
                                    Selecione a vacina
                                  </option>
                                  {vaccines.map((vaccine) => (
                                    <option key={vaccine.id} value={vaccine.id}>
                                      {vaccine.nome} | estoque: {calculateStock(vaccine.id)}
                                    </option>
                                  ))}
                                </select>

                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={row.doses}
                                  onChange={(event) => updateDoseConfirmationRow(request, row.id, "doses", event.target.value)}
                                  placeholder="Doses"
                                  className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                />

                                <button
                                  type="button"
                                  onClick={() => removeDoseConfirmationRow(request, row.id)}
                                  className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                                >
                                  Remover
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => confirmDoseRequest(request)}
                              className="w-fit rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                            >
                              Confirmar doses
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Historico de vacinacoes confirmadas
              </h2>
              <p className="mt-1 text-zinc-500">
                Registros salvos apos a granja confirmar que a vacinacao foi realizada.
              </p>
            </div>

            <span className="w-fit rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
              {completedVaccinations.length} salvo(s)
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {completedHistory.length === 0 && (
              <p className="text-zinc-500">
                Nenhuma vacinacao confirmada pela granja ainda.
              </p>
            )}

            {completedHistory.map((record) => {
              const materials = getRecordMaterials(record);

              return (
                <article
                  key={`${record.id}-${record.systemConfirmedAtIso || record.archivedAtIso || record.completedAtIso || ""}`}
                  className="rounded-xl border border-green-100 bg-green-50 p-4"
                >
                  <p className="text-lg font-bold text-zinc-900">
                    {getRecordSummary(record)}
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-green-100 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Periodo
                      </p>
                      <p className="mt-2 font-semibold text-zinc-700">
                        {formatPeriod(
                          record.vaccinationStartDate || record.date,
                          record.vaccinationEndDate || record.date
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-green-100 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Confirmada pela granja
                      </p>
                      <p className="mt-2 font-semibold text-zinc-700">
                        {record.systemConfirmedAt || record.archivedAt || "-"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-green-100 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Vacinador
                      </p>
                      <p className="mt-2 font-semibold text-zinc-700">
                        {record.vaccinatorName || "Vacinador"}
                      </p>
                    </div>
                  </div>

                  {materials.length > 0 && (
                    <div className="mt-4 rounded-xl border border-green-100 bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Materiais utilizados
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {materials.map((material, index) => (
                          <span
                            key={`${material.id}-${index}`}
                            className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-zinc-700"
                          >
                            {material.vacina}: {material.doses} doses{material.technicalDetails ? ` | ${material.technicalDetails}` : ""}{material.source ? ` | ${material.source}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(record.temperaturePhoto || record.temperatureNotes) && (
                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                      {record.temperaturePhoto && (
                        <img
                          src={record.temperaturePhoto}
                          alt="Temperatura da vacina"
                          className="max-h-44 rounded-xl border border-green-100 bg-white object-contain p-2"
                        />
                      )}
                      {record.temperatureNotes && (
                        <div className="rounded-xl border border-green-100 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                            Observacao temperatura
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                            {record.temperatureNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Requests;
