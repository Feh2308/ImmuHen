import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";
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

function Entries() {

  const {
    vaccines,
    entries,
    addEntry,
    calculateStock,
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

  const selectedVaccine = useMemo(() => (
    vaccines.find((vaccine) => String(vaccine.id) === String(vaccineId))
  ), [vaccineId, vaccines]);
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);

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

  const dosesPerBottle = parseQuantity(selectedVaccine?.dosesPerBottle);
  const calculatedDoses = dosesPerBottle > 0
    ? dosesPerBottle * Math.max(1, parseQuantity(bottles) || 1)
    : parseQuantity(doses);

  const totalEntrada = useMemo(() => {
    return calculatedDoses * parseMoney(valorDose);
  }, [calculatedDoses, valorDose]);

  const selectedAlertLevel = vaccineId
    ? getStockAlertLevel(vaccineId)
    : 0;

  useEffect(() => {
    if (!selectedVaccine) {
      return;
    }

    if (selectedVaccine.dosesPerBottle) {
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
    setBottles("1");
    setLowStockAlertQuantity("");
    setValorDose("");
    setFornecedor("");
    setObservacao("");
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Vacina
              <select
                value={vaccineId}
                onChange={(e) =>
                  setVaccineId(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
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

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Lote da vacina
              <input
                type="text"
                placeholder="Lote"
                value={lote}
                onChange={(e) =>
                  setLote(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Data de validade
              <input
                type="date"
                value={validade}
                onChange={(e) =>
                  setValidade(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Valor por dose
              <input
                type="text"
                placeholder="Valor por dose"
                value={valorDose}
                onChange={(e) =>
                  setValorDose(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
                inputMode="decimal"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Frascos recebidos
              <input
                type="text"
                placeholder="1"
                value={bottles}
                onChange={(e) =>
                  setBottles(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
                inputMode="decimal"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Quantidade de doses
              <input
                type="text"
                placeholder="Quantidade de doses"
                value={dosesPerBottle > 0 ? selectedVaccine?.dosesPerBottle || "" : doses}
                onChange={(e) =>
                  setDoses(e.target.value)
                }
                readOnly={dosesPerBottle > 0}
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none read-only:text-zinc-500"
                inputMode="numeric"
              />
            </label>

            <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
              <p className="text-sm font-semibold text-zinc-600">
                Doses totais calculadas
              </p>
              <p className="mt-2 text-2xl font-bold text-green-700">
                {calculatedDoses}
              </p>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Avisar estoque baixo em doses
              <input
                type="text"
                placeholder="Avisar estoque baixo em doses"
                value={lowStockAlertQuantity}
                onChange={(e) =>
                  setLowStockAlertQuantity(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Fornecedor
              <input
                type="text"
                placeholder="Fornecedor"
                value={fornecedor}
                onChange={(e) =>
                  setFornecedor(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700 md:col-span-3">
              Observacao
              <input
                type="text"
                placeholder="Observacao"
                value={observacao}
                onChange={(e) =>
                  setObservacao(e.target.value)
                }
                className="bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
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

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">

          <table className="w-full text-left text-zinc-900">

            <thead>

              <tr className="border-b border-green-100 text-zinc-500">

                <th className="pb-4">
                  Vacina
                </th>

                <th className="pb-4">
                  Lote
                </th>

                <th className="pb-4">
                  Doses
                </th>

                <th className="pb-4">
                  Frascos
                </th>

                <th className="pb-4">
                  Quantidade de doses
                </th>

                <th className="pb-4">
                  Valor por dose
                </th>

                <th className="pb-4">
                  Alerta baixo
                </th>

                <th className="pb-4">
                  Total
                </th>

                <th className="pb-4">
                  Validade
                </th>

                <th className="pb-4">
                  Fornecedor
                </th>

                <th className="pb-4">
                  Observacao
                </th>

              </tr>

            </thead>

            <tbody>

              {entries.map((entry) => (

                <tr
                  key={entry.id}
                  className="border-b border-green-100 last:border-b-0"
                >

                  <td className="py-4">
                    {entry.vacina}
                  </td>

                  <td>
                    {entry.lote}
                  </td>

                  <td>
                    {entry.doses}
                  </td>

                  <td>
                    {entry.frascos || "-"}
                  </td>

                  <td>
                    {entry.dosesPerBottle || "-"}
                  </td>

                  <td>
                    {formatCurrency(getEntryDoseValue(entry))}
                  </td>

                  <td>
                    {entry.lowStockAlertQuantity
                      ? `${entry.lowStockAlertQuantity} doses`
                      : "-"}
                  </td>

                  <td className="font-bold text-green-600">
                    {formatCurrency(getEntryTotalValue(entry))}
                  </td>

                  <td>
                    {entry.validade}
                  </td>

                  <td>
                    {entry.fornecedor}
                  </td>

                  <td className="min-w-64 max-w-xs whitespace-normal break-words text-zinc-500">
                    {entry.observacao || "-"}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default Entries;
