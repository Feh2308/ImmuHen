import { Fragment, useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";
import { matchesSearchQuery } from "../utils/search";
import { sortVaccinesByCode } from "../utils/vaccineSort";

function parseMoney(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getEntryDoseValue(entry) {
  if (entry.valorDose !== undefined) {
    return Number(entry.valorDose || 0);
  }

  if (entry.valorTotal !== undefined && Number(entry.doses)) {
    return Number(entry.valorTotal || 0) / Number(entry.doses);
  }

  if (entry.valor !== undefined && Number(entry.doses)) {
    return Number(entry.valor || 0) / Number(entry.doses);
  }

  return 0;
}

function getEntryTotalValue(entry) {
  if (entry.valorTotal !== undefined) {
    return Number(entry.valorTotal || 0);
  }

  if (entry.valor !== undefined) {
    return Number(entry.valor || 0);
  }

  return Number(entry.doses || 0) * getEntryDoseValue(entry);
}

function getCurrentUserLabel() {
  try {
    const user = JSON.parse(sessionStorage.getItem("user") || "{}");

    return user.name || user.email || "Funcionario";
  } catch (error) {
    return "Funcionario";
  }
}

function Entries() {

  const {
    vaccines,
    entries,
    entryEditRequests,
    addEntry,
    clearUsedDoses,
    requestEntryValueEdit,
    calculateStock,
    getUsedDosesByVaccine,
    getStockAlertLevel,
  } = useVaccines();

  const [vaccineId, setVaccineId] =
    useState("");

  const [lote, setLote] =
    useState("");

  const [validade, setValidade] =
    useState("");

  const [doses, setDoses] =
    useState("");

  const [dosesPerBottleInput, setDosesPerBottleInput] =
    useState("");

  const [bottles, setBottles] =
    useState("1");

  const [lowStockAlertQuantity, setLowStockAlertQuantity] =
    useState("");

  const [valorDose, setValorDose] =
    useState("");

  const [fornecedor, setFornecedor] =
    useState("");

  const [observacao, setObservacao] =
    useState("");

  const [editingValueEntryId, setEditingValueEntryId] =
    useState("");

  const [entryValueDraft, setEntryValueDraft] =
    useState("");

  const [entryValueReason, setEntryValueReason] =
    useState("");

  const [entryValueMessage, setEntryValueMessage] =
    useState("");

  const [clearVaccineId, setClearVaccineId] =
    useState("");

  const [entrySearch, setEntrySearch] =
    useState("");

  const selectedVaccine = useMemo(() => (
    vaccines.find((vaccine) => String(vaccine.id) === String(vaccineId))
  ), [vaccineId, vaccines]);
  const selectedClearVaccine = useMemo(() => (
    vaccines.find((vaccine) => String(vaccine.id) === String(clearVaccineId))
  ), [clearVaccineId, vaccines]);
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);
  const selectedClearUsedDoses = clearVaccineId
    ? getUsedDosesByVaccine(clearVaccineId)
    : 0;

  function getLastEntryDoseValue(vaccineIdValue) {
    const entry = [...entries]
      .reverse()
      .find((item) => String(item.vaccineId) === String(vaccineIdValue) && getEntryDoseValue(item) > 0);

    return entry ? getEntryDoseValue(entry) : 0;
  }

  function getVaccineDoseValue(vacina) {
    const defaultValue = parseMoney(vacina?.valorDosePadrao);

    return defaultValue > 0
      ? defaultValue
      : getLastEntryDoseValue(vacina?.id);
  }

  const dosesPerBottle = parseQuantity(dosesPerBottleInput || selectedVaccine?.dosesPerBottle);
  const calculatedDoses = dosesPerBottle > 0
    ? dosesPerBottle * Math.max(1, parseQuantity(bottles) || 1)
    : parseQuantity(doses);

  const totalEntrada = useMemo(() => {
    return calculatedDoses * parseMoney(valorDose);
  }, [calculatedDoses, valorDose]);

  const selectedAlertLevel = vaccineId
    ? getStockAlertLevel(vaccineId)
    : 0;
  const filteredEntries = useMemo(() => (
    entries.filter((entry) => matchesSearchQuery(entry, entrySearch, [
      entry.vacina,
      entry.lote,
      entry.validade,
      entry.fornecedor,
      entry.observacao,
      formatCurrency(getEntryDoseValue(entry)),
      formatCurrency(getEntryTotalValue(entry)),
      getEntryDoseValue(entry),
      getEntryTotalValue(entry),
    ]))
  ), [entries, entrySearch]);

  useEffect(() => {
    if (!selectedVaccine) {
      return;
    }

    if (selectedVaccine.dosesPerBottle) {
      setDosesPerBottleInput(String(selectedVaccine.dosesPerBottle));
      setDoses(String(selectedVaccine.dosesPerBottle));
      setBottles((currentBottles) => currentBottles || "1");
    }

    const doseValue = getVaccineDoseValue(selectedVaccine);

    if (doseValue > 0 && !valorDose) {
      setValorDose(String(doseValue));
    }
  }, [selectedVaccine, valorDose]);

  function selectVaccineForRestock(vacina) {
    setVaccineId(String(vacina.id));
    setLote("");
    setValidade("");
    setBottles("1");
    setDoses(vacina.dosesPerBottle ? String(vacina.dosesPerBottle) : "");
    setDosesPerBottleInput(vacina.dosesPerBottle ? String(vacina.dosesPerBottle) : "");
    setValorDose(getVaccineDoseValue(vacina) > 0 ? String(getVaccineDoseValue(vacina)) : "");
    setLowStockAlertQuantity(String(getStockAlertLevel(vacina.id) || ""));
    setFornecedor("");
    setObservacao("");

    window.setTimeout(() => {
      document.getElementById("entrada-reposicao")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function getPendingEntryValueRequest(entryId) {
    return entryEditRequests.find((request) => (
      String(request.entryId) === String(entryId) &&
      request.status === "pending"
    ));
  }

  function startEntryValueEdit(entry) {
    setEditingValueEntryId(entry.id);
    setEntryValueDraft(String(getEntryDoseValue(entry) || ""));
    setEntryValueReason("");
    setEntryValueMessage("");
  }

  function cancelEntryValueEdit() {
    setEditingValueEntryId("");
    setEntryValueDraft("");
    setEntryValueReason("");
  }

  function submitEntryValueEdit(entry) {
    setEntryValueMessage("");

    try {
      requestEntryValueEdit({
        entryId: entry.id,
        valorDose: entryValueDraft,
        reason: entryValueReason,
        requestedBy: getCurrentUserLabel(),
      });
      setEntryValueMessage("Solicitacao enviada para o Administrador aprovar.");
      cancelEntryValueEdit();
    } catch (error) {
      setEntryValueMessage(error.message || "Nao foi possivel solicitar a alteracao.");
    }
  }

  function registrarEntrada() {

    if (
      !vaccineId ||
      !lote ||
      calculatedDoses <= 0 ||
      !valorDose
    ) {
      alert("Preencha vacina, lote, doses e valor por dose");
      return;
    }

    const vacina =
      vaccines.find(
        (v) => v.id == vaccineId
      );

    addEntry({
      id: Date.now(),

      vaccineId,

      vacina: vacina.nome,

      codigo: vacina.codigo,

      lote,

      validade,

      doses: calculatedDoses,

      dosesPerBottle,

      frascos: dosesPerBottle > 0
        ? Math.max(1, parseQuantity(bottles) || 1)
        : "",

      manualDoses: parseQuantity(doses),

      valorDose: parseMoney(valorDose),

      valorTotal: totalEntrada,

      valor: totalEntrada,

      fornecedor,

      observacao,

      lowStockAlertQuantity: parseQuantity(lowStockAlertQuantity),

      data:
        new Date().toLocaleDateString(),
    });

    setLote("");
    setValidade("");
    setDoses("");
    setDosesPerBottleInput("");
    setBottles("1");
    setLowStockAlertQuantity("");
    setValorDose("");
    setFornecedor("");
    setObservacao("");
  }

  function limparDosesUsadasDaVacina() {
    if (!clearVaccineId || !selectedClearVaccine) {
      alert("Selecione a vacina para limpar as doses usadas.");
      return;
    }

    if (selectedClearUsedDoses <= 0) {
      alert("Esta vacina nao possui doses usadas para limpar.");
      return;
    }

    const confirmed = window.confirm(
      "Tem certeza que deseja limpar as doses usadas desta vacina? Essa acao nao apagara o estoque nem o historico, apenas zerara as doses usadas."
    );

    if (!confirmed) {
      return;
    }

    try {
      clearUsedDoses({
        vaccineId: clearVaccineId,
        vaccineName: selectedClearVaccine.nome,
        clearedBy: getCurrentUserLabel(),
      });
      alert("Doses usadas limpas para a vacina selecionada.");
    } catch (error) {
      alert(error.message || "Nao foi possivel limpar as doses usadas.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm">

          <h1 className="text-5xl font-bold text-zinc-900">
            Entradas
          </h1>

          <p className="text-zinc-500 mt-2">
            Registro de entradas de vacinas.
          </p>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Acrescentar vacina
              </h2>

              <p className="mt-2 text-zinc-500">
                Selecione a vacina para repor o estoque dela.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedVaccines.map((vacina) => (
              <div
                key={vacina.id}
                className="rounded-2xl border border-green-100 bg-green-50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      {vacina.codigo || "Sem codigo"}
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-zinc-900">
                      {vacina.nome}
                    </h3>
                  </div>

                  <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-green-700">
                    {calculateStock(vacina.id)} doses
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-zinc-600">
                  <p>
                    Quantidade: <strong className="text-zinc-900">{vacina.dosesPerBottle || "-"} doses</strong>
                  </p>

                  <p>
                    Valor: <strong className="text-zinc-900">{getVaccineDoseValue(vacina) > 0 ? formatCurrency(getVaccineDoseValue(vacina)) : "-"}</strong>
                  </p>

                  <p>
                    Usadas: <strong className="text-zinc-900">{getUsedDosesByVaccine(vacina.id)} doses</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => selectVaccineForRestock(vacina)}
                  className="mt-5 w-full rounded-2xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  Acrescentar vacina
                </button>
              </div>
            ))}

            {vaccines.length === 0 && (
              <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                Cadastre uma vacina primeiro para repor estoque.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Limpar doses usadas
              </h2>

              <p className="mt-2 text-zinc-500">
                Selecione uma vacina especifica para zerar somente as doses usadas dela.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-4">
            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700 md:col-span-2">
              Vacina
              <select
                value={clearVaccineId}
                onChange={(event) => setClearVaccineId(event.target.value)}
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              >
                <option value="">
                  Selecione a vacina
                </option>

                {sortedVaccines.map((vacina) => (
                  <option
                    key={vacina.id}
                    value={vacina.id}
                  >
                    {vacina.codigo ? `${vacina.codigo} - ` : ""}{vacina.nome}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid place-items-center rounded-2xl border border-green-100 bg-green-50 p-5 text-center">
              <p className="text-sm font-semibold text-zinc-600">
                Estoque atual
              </p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {clearVaccineId ? calculateStock(clearVaccineId) : 0}
              </p>
            </div>

            <div className="grid place-items-center rounded-2xl border border-green-100 bg-green-50 p-5 text-center">
              <p className="text-sm font-semibold text-zinc-600">
                Doses usadas
              </p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {selectedClearUsedDoses}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={limparDosesUsadasDaVacina}
            className="mt-6 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700"
          >
            Limpar doses usadas da vacina
          </button>
        </div>

        <div
          id="entrada-reposicao"
          className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm scroll-mt-6"
        >
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-zinc-900">
              Repor estoque
            </h2>

            <p className="mt-2 text-zinc-500">
              {selectedVaccine
                ? `Reposicao selecionada: ${selectedVaccine.nome}`
                : "Escolha a vacina, lote, validade e valores da entrada."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Vacina
              <select
                value={vaccineId}
                onChange={(e) => {
                  const nextVaccine = vaccines.find((vaccine) => String(vaccine.id) === String(e.target.value));
                  setVaccineId(e.target.value);
                  setDosesPerBottleInput(nextVaccine?.dosesPerBottle ? String(nextVaccine.dosesPerBottle) : "");
                  setDoses(nextVaccine?.dosesPerBottle ? String(nextVaccine.dosesPerBottle) : "");
                }}
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              >

                <option value="">
                  Selecione Vacina
                </option>

                {sortedVaccines.map((vacina) => (

                  <option
                    key={vacina.id}
                    value={vacina.id}
                  >
                    {vacina.nome}
                  </option>

                ))}

              </select>
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Lote da vacina
              <input
                type="text"
                placeholder="Lote"
                value={lote}
                onChange={(e) =>
                  setLote(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Data de validade
              <input
                type="date"
                value={validade}
                onChange={(e) =>
                  setValidade(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Valor por dose
              <input
                type="text"
                placeholder="Valor por dose"
                value={valorDose}
                onChange={(e) =>
                  setValorDose(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
                inputMode="decimal"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Frascos recebidos
              <input
                type="text"
                placeholder="1"
                value={bottles}
                onChange={(e) =>
                  setBottles(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
                inputMode="decimal"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Doses por frasco
              <input
                type="text"
                placeholder="Doses por frasco"
                value={dosesPerBottleInput}
                onChange={(e) =>
                  setDosesPerBottleInput(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
                inputMode="numeric"
              />
            </label>

            <div className="grid place-items-center rounded-2xl border border-green-100 bg-green-50 p-5 text-center">
              <p className="text-sm font-semibold text-zinc-600">
                Doses totais calculadas
              </p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {calculatedDoses}
              </p>
            </div>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Avisar estoque baixo em doses
              <input
                type="text"
                placeholder="Avisar estoque baixo em doses"
                value={lowStockAlertQuantity}
                onChange={(e) =>
                  setLowStockAlertQuantity(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700">
              Fornecedor
              <input
                type="text"
                placeholder="Fornecedor"
                value={fornecedor}
                onChange={(e) =>
                  setFornecedor(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              />
            </label>

            <label className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-center text-sm font-semibold text-zinc-700 md:col-span-2 xl:col-span-3">
              Observacao
              <input
                type="text"
                placeholder="Observacao"
                value={observacao}
                onChange={(e) =>
                  setObservacao(e.target.value)
                }
                className="rounded-2xl border border-green-100 bg-white p-4 text-center outline-none"
              />
            </label>

          </div>

          <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-zinc-600">
            <strong className="text-green-700">
              Alerta de estoque baixo:
            </strong>{" "}
            informe a quantidade mínima de doses para esta vacina. Quando uma baixa deixar o estoque igual ou menor que esse valor, o ImmuHen envia aviso para o contato de notificação da granja.
            {selectedAlertLevel > 0 && !lowStockAlertQuantity && (
              <span className="ml-1 font-semibold text-green-700">
                Limite atual dessa vacina: {selectedAlertLevel} doses.
              </span>
            )}
          </div>

          <div className="mt-6 bg-green-50 border border-green-100 rounded-2xl p-5">

            <p className="text-zinc-500">
              Total em R$ gasto nesta entrada
            </p>

            <h2 className="text-3xl font-bold text-green-600 mt-1">
              {formatCurrency(totalEntrada)}
            </h2>

          </div>

          <button
            onClick={registrarEntrada}
            className="mt-8 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-bold transition"
          >
            Acrescentar vacina ao estoque
          </button>

        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Entradas registradas
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Para alterar valor por dose, envie uma solicitacao para o Administrador aprovar.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 md:max-w-xl">
              <input
                type="search"
                value={entrySearch}
                onChange={(event) => setEntrySearch(event.target.value)}
                placeholder="Buscar por vacina, lote, validade, fornecedor, valor ou observacao"
                className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white"
              />

              {entryValueMessage && (
                <p className="rounded-2xl border border-green-100 bg-green-50 px-5 py-3 text-sm font-bold text-green-700">
                  {entryValueMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[1320px] w-full border-separate border-spacing-y-3 text-center text-zinc-900">
              <thead>
                <tr className="text-sm text-zinc-500">
                  <th className="px-4 pb-2">Vacina</th>
                  <th className="px-4 pb-2">Lote</th>
                  <th className="px-4 pb-2">Doses</th>
                  <th className="px-4 pb-2">Frascos</th>
                  <th className="px-4 pb-2">Quantidade</th>
                  <th className="px-4 pb-2">Valor por dose</th>
                  <th className="px-4 pb-2">Alerta baixo</th>
                  <th className="px-4 pb-2">Total</th>
                  <th className="px-4 pb-2">Validade</th>
                  <th className="px-4 pb-2">Fornecedor</th>
                  <th className="px-4 pb-2">Observacao</th>
                  <th className="px-4 pb-2">Acao</th>
                </tr>
              </thead>

              <tbody>
                {filteredEntries.map((entry) => {
                  const pendingRequest = getPendingEntryValueRequest(entry.id);
                  const editingThisEntry = String(editingValueEntryId) === String(entry.id);

                  return (
                    <Fragment key={entry.id}>
                      <tr className="rounded-2xl bg-green-50 align-middle shadow-sm ring-1 ring-green-100">
                        <td className="rounded-l-2xl px-4 py-5 font-bold text-zinc-900">
                          {entry.vacina}
                        </td>

                        <td className="px-4 py-5">
                          {entry.lote || "-"}
                        </td>

                        <td className="px-4 py-5">
                          {entry.doses}
                        </td>

                        <td className="px-4 py-5">
                          {entry.frascos || "-"}
                        </td>

                        <td className="px-4 py-5">
                          {entry.dosesPerBottle || "-"}
                        </td>

                        <td className="px-4 py-5 font-bold text-green-700">
                          {formatCurrency(getEntryDoseValue(entry))}
                        </td>

                        <td className="px-4 py-5">
                          {entry.lowStockAlertQuantity
                            ? `${entry.lowStockAlertQuantity} doses`
                            : "-"}
                        </td>

                        <td className="px-4 py-5 font-bold text-green-700">
                          {formatCurrency(getEntryTotalValue(entry))}
                        </td>

                        <td className="px-4 py-5">
                          {entry.validade || "-"}
                        </td>

                        <td className="px-4 py-5">
                          {entry.fornecedor || "-"}
                        </td>

                        <td className="max-w-xs whitespace-normal break-words px-4 py-5 text-zinc-500">
                          {entry.observacao || "-"}
                        </td>

                        <td className="rounded-r-2xl px-4 py-5">
                          {pendingRequest ? (
                            <span className="inline-flex rounded-full bg-yellow-100 px-4 py-2 text-xs font-bold text-yellow-800">
                              Pendente
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEntryValueEdit(entry)}
                              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-800"
                            >
                              Editar valor
                            </button>
                          )}
                        </td>
                      </tr>

                      {editingThisEntry && (
                        <tr>
                          <td colSpan={12} className="rounded-2xl border border-green-100 bg-white p-5 text-left shadow-sm">
                            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                              <label className="grid gap-2 text-sm font-bold text-zinc-700">
                                Novo valor por dose
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={entryValueDraft}
                                  onChange={(event) => setEntryValueDraft(event.target.value)}
                                  className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center outline-none"
                                />
                              </label>

                              <label className="grid gap-2 text-sm font-bold text-zinc-700">
                                Justificativa obrigatoria
                                <input
                                  type="text"
                                  value={entryValueReason}
                                  onChange={(event) => setEntryValueReason(event.target.value)}
                                  placeholder="Ex.: valor informado incorretamente na nota fiscal"
                                  className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
                                />
                              </label>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => submitEntryValueEdit(entry)}
                                  className="rounded-2xl bg-green-600 px-5 py-4 font-bold text-white transition hover:bg-green-700"
                                >
                                  Enviar
                                </button>

                                <button
                                  type="button"
                                  onClick={cancelEntryValueEdit}
                                  className="rounded-2xl bg-white px-5 py-4 font-bold text-green-700 ring-1 ring-green-100 transition hover:bg-green-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {entries.length === 0 && (
              <p className="mt-4 rounded-2xl bg-green-50 p-5 text-center text-zinc-500">
                Nenhuma entrada registrada.
              </p>
            )}

            {entries.length > 0 && filteredEntries.length === 0 && (
              <p className="mt-4 rounded-2xl bg-green-50 p-5 text-center text-zinc-500">
                Nenhuma entrada encontrada para a busca informada.
              </p>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

export default Entries;
