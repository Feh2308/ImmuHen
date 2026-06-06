import { useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import {
  useVaccines,
} from "../context/VaccineContext";
import { authorizeChiefAccessApi } from "../services/vacitechApi";
import { readJson } from "../utils/vacitechStorage";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseMoney(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
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

  return Number(entry.doses || 0) * Number(entry.valorDose || 0);
}

function getCurrentUserLabel() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    return user.name || user.email || "Chefe";
  } catch (error) {
    return "Chefe";
  }
}

function getRequestStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function getChangedText(request) {
  return (request.changedFields || [])
    .map((field) => `${field}: ${request.before?.[field] || "-"} -> ${request.after?.[field] || "-"}`)
    .join(" | ");
}

function Chief() {
  const {
    vaccines,
    entries,
    outputs,
    stockAlertLevels,
    vaccineEditRequests,
    vaccineAuditLog,
    updateVaccine,
    removeVaccine,
    updateEntry,
    removeEntry,
    approveVaccineEdit,
    rejectVaccineEdit,
  } = useVaccines();

  const [authorized, setAuthorized] =
    useState(() => sessionStorage.getItem("chiefAuthorized") === "true");

  const [password, setPassword] =
    useState("");

  const [accessLoading, setAccessLoading] =
    useState(false);

  const [accessMessage, setAccessMessage] =
    useState("");

  const [editingVaccineId, setEditingVaccineId] =
    useState("");

  const [vaccineForm, setVaccineForm] =
    useState({
      codigo: "",
      nome: "",
      fabricante: "",
      dosesPerBottle: "",
      valorDosePadrao: "",
      observacoes: "",
    });

  const [editingEntryId, setEditingEntryId] =
    useState("");

  const [entryForm, setEntryForm] =
    useState({
      vaccineId: "",
      lote: "",
      validade: "",
      frascos: "",
      dosesPerBottle: "",
      doses: "",
      valorDose: "",
      lowStockAlertQuantity: "",
      fornecedor: "",
      observacao: "",
    });

  const storedRequests = readJson("requests", []);
  const storedSchedules = readJson("schedules", []);
  const storedCompletedVaccinations = readJson("completedVaccinations", []);
  const requests = Array.isArray(storedRequests) ? storedRequests : [];
  const schedules = Array.isArray(storedSchedules) ? storedSchedules : [];
  const completedVaccinations = Array.isArray(storedCompletedVaccinations)
    ? storedCompletedVaccinations
    : [];

  const summary = useMemo(() => {
    const totalEntries = entries.reduce((total, entry) => total + Number(entry.doses || 0), 0);
    const totalOutputs = outputs.reduce((total, output) => total + Number(output.doses || 0), 0);
    const totalValue = entries.reduce((total, entry) => total + getEntryTotalValue(entry), 0);
    const pendingEdits = vaccineEditRequests.filter((request) => request.status === "pending").length;
    const pendingRequests = requests.filter((request) => {
      const status = getRequestStatus(request.status);

      return !["concluida", "concluido", "cancelada", "cancelado", "recusada", "recusado"].includes(status);
    }).length;

    return {
      totalStock: totalEntries - totalOutputs,
      totalEntries,
      totalOutputs,
      totalValue,
      pendingEdits,
      pendingRequests,
      completed: completedVaccinations.length,
    };
  }, [completedVaccinations.length, entries, outputs, requests, vaccineEditRequests]);

  const stockRows = useMemo(() => {
    return vaccines.map((vaccine) => {
      const entradas = entries
        .filter((entry) => String(entry.vaccineId) === String(vaccine.id))
        .reduce((total, entry) => total + Number(entry.doses || 0), 0);
      const saidas = outputs
        .filter((output) => String(output.vaccineId) === String(vaccine.id))
        .reduce((total, output) => total + Number(output.doses || 0), 0);
      const minimum = Number(stockAlertLevels[String(vaccine.id)] || 0);
      const saldo = entradas - saidas;

      return {
        id: vaccine.id,
        name: vaccine.nome || "Vacina",
        saldo,
        minimum,
      };
    });
  }, [entries, outputs, stockAlertLevels, vaccines]);

  const lowStockRows = stockRows
    .filter((row) => row.minimum > 0 && row.saldo <= row.minimum)
    .sort((a, b) => a.saldo - b.saldo)
    .slice(0, 5);

  const usageChartRows = useMemo(() => {
    const rows = new Map();

    outputs.forEach((output) => {
      const key = String(output.vaccineId || output.vacina || "sem-vacina");
      const current = rows.get(key) || {
        id: key,
        name: output.vacina || vaccines.find((vaccine) => String(vaccine.id) === key)?.nome || "Vacina",
        doses: 0,
      };

      current.doses += Number(output.doses || 0);
      rows.set(key, current);
    });

    return Array.from(rows.values())
      .sort((a, b) => b.doses - a.doses)
      .slice(0, 6);
  }, [outputs, vaccines]);

  const maxChartDoses = Math.max(...usageChartRows.map((row) => row.doses), 1);
  const pendingEditRequests = vaccineEditRequests.filter((request) => request.status === "pending");
  const recentAuditLog = vaccineAuditLog.slice(0, 6);
  const recentEntries = entries.slice(-10).reverse();
  const selectedEntryVaccine = vaccines.find((vaccine) => String(vaccine.id) === String(entryForm.vaccineId));
  const entryDosesPerBottle = parseQuantity(entryForm.dosesPerBottle || selectedEntryVaccine?.dosesPerBottle);
  const entryBottles = Math.max(1, parseQuantity(entryForm.frascos) || 1);
  const entryCalculatedDoses = entryDosesPerBottle > 0
    ? entryDosesPerBottle * entryBottles
    : parseQuantity(entryForm.doses);
  const entryTotalValue = entryCalculatedDoses * parseMoney(entryForm.valorDose);

  async function handleChiefAccess() {
    setAccessLoading(true);
    setAccessMessage("");

    try {
      await authorizeChiefAccessApi(password);
      sessionStorage.setItem("chiefAuthorized", "true");
      setAuthorized(true);
      setPassword("");
    } catch (error) {
      setAccessMessage(error.message || "Senha do chefe/admin incorreta.");
    } finally {
      setAccessLoading(false);
    }
  }

  function lockChiefArea() {
    sessionStorage.removeItem("chiefAuthorized");
    setAuthorized(false);
    setPassword("");
  }

  function approveRequest(requestId) {
    approveVaccineEdit(requestId, getCurrentUserLabel());
  }

  function rejectRequest(requestId) {
    rejectVaccineEdit(requestId, getCurrentUserLabel());
  }

  function startVaccineEdit(vaccine) {
    setEditingVaccineId(vaccine.id);
    setVaccineForm({
      codigo: vaccine.codigo || "",
      nome: vaccine.nome || "",
      fabricante: vaccine.fabricante || "",
      dosesPerBottle: vaccine.dosesPerBottle || "",
      valorDosePadrao: vaccine.valorDosePadrao || "",
      observacoes: vaccine.observacoes || "",
    });
  }

  function cancelVaccineEdit() {
    setEditingVaccineId("");
    setVaccineForm({
      codigo: "",
      nome: "",
      fabricante: "",
      dosesPerBottle: "",
      valorDosePadrao: "",
      observacoes: "",
    });
  }

  function saveVaccineEdit() {
    if (!editingVaccineId) {
      return;
    }

    if (!vaccineForm.codigo || !vaccineForm.nome) {
      alert("Informe codigo e nome da vacina.");
      return;
    }

    updateVaccine(editingVaccineId, vaccineForm);
    cancelVaccineEdit();
  }

  function deleteVaccine(vaccineId) {
    const confirmed = window.confirm("Excluir esta vacina do cadastro base?");

    if (!confirmed) {
      return;
    }

    removeVaccine(vaccineId);
  }

  function startEntryEdit(entry) {
    setEditingEntryId(entry.id);
    setEntryForm({
      vaccineId: entry.vaccineId || "",
      lote: entry.lote || "",
      validade: entry.validade || "",
      frascos: entry.frascos || "",
      dosesPerBottle: entry.dosesPerBottle || "",
      doses: entry.manualDoses || entry.doses || "",
      valorDose: String(getEntryDoseValue(entry) || ""),
      lowStockAlertQuantity: entry.lowStockAlertQuantity || "",
      fornecedor: entry.fornecedor || "",
      observacao: entry.observacao || "",
    });
  }

  function cancelEntryEdit() {
    setEditingEntryId("");
    setEntryForm({
      vaccineId: "",
      lote: "",
      validade: "",
      frascos: "",
      dosesPerBottle: "",
      doses: "",
      valorDose: "",
      lowStockAlertQuantity: "",
      fornecedor: "",
      observacao: "",
    });
  }

  function updateEntryForm(field, value) {
    setEntryForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (field === "vaccineId") {
        const vaccine = vaccines.find((item) => String(item.id) === String(value));
        nextForm.dosesPerBottle = vaccine?.dosesPerBottle || nextForm.dosesPerBottle;

        if (vaccine?.valorDosePadrao && !nextForm.valorDose) {
          nextForm.valorDose = String(vaccine.valorDosePadrao);
        }
      }

      return nextForm;
    });
  }

  function saveEntryEdit() {
    if (!editingEntryId) {
      return;
    }

    const vaccine = vaccines.find((item) => String(item.id) === String(entryForm.vaccineId));

    if (!vaccine || !entryForm.lote || entryCalculatedDoses <= 0 || !entryForm.valorDose) {
      alert("Informe vacina, lote, doses e valor por dose.");
      return;
    }

    updateEntry(editingEntryId, {
      vaccineId: vaccine.id,
      vacina: vaccine.nome,
      codigo: vaccine.codigo,
      lote: entryForm.lote,
      validade: entryForm.validade,
      frascos: entryDosesPerBottle > 0 ? entryBottles : "",
      dosesPerBottle: entryDosesPerBottle || "",
      manualDoses: parseQuantity(entryForm.doses),
      doses: entryCalculatedDoses,
      valorDose: parseMoney(entryForm.valorDose),
      valorTotal: entryTotalValue,
      valor: entryTotalValue,
      lowStockAlertQuantity: parseQuantity(entryForm.lowStockAlertQuantity),
      fornecedor: entryForm.fornecedor,
      observacao: entryForm.observacao,
    });
    cancelEntryEdit();
  }

  function deleteEntry(entryId) {
    const confirmed = window.confirm("Excluir esta entrada do estoque?");

    if (!confirmed) {
      return;
    }

    removeEntry(entryId);
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

        <Sidebar />

        <div className="flex-1 p-8">
          <div className="max-w-xl rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <h1 className="text-4xl font-bold text-zinc-900">
              Ambiente do Chefe
            </h1>

            <p className="mt-2 text-zinc-500">
              Confirme a senha do chefe/admin para liberar aprovacoes e indicadores.
            </p>

            <input
              type="password"
              placeholder="Senha do chefe/admin"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-6 w-full rounded-2xl border border-green-100 bg-green-50 p-4 outline-none"
            />

            <button
              type="button"
              onClick={handleChiefAccess}
              disabled={accessLoading}
              className="mt-5 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {accessLoading ? "Verificando..." : "Entrar"}
            </button>

            {accessMessage && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
                {accessMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-5xl font-bold text-zinc-900">
                Ambiente do Chefe
              </h1>

              <p className="mt-2 text-zinc-500">
                Aprovacoes, estoque, custos e andamento operacional.
              </p>
            </div>

            <button
              type="button"
              onClick={lockChiefArea}
              className="rounded-2xl bg-zinc-200 px-6 py-4 font-bold text-zinc-700 transition hover:bg-zinc-300"
            >
              Bloquear Ambiente
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Doses em estoque</p>
            <strong className="mt-3 block text-4xl text-green-600">{summary.totalStock}</strong>
          </div>

          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Doses usadas</p>
            <strong className="mt-3 block text-4xl text-red-500">{summary.totalOutputs}</strong>
          </div>

          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Valor comprado</p>
            <strong className="mt-3 block text-3xl text-zinc-900">{formatCurrency(summary.totalValue)}</strong>
          </div>

          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Programas abertos</p>
            <strong className="mt-3 block text-4xl text-green-600">{summary.pendingRequests}</strong>
          </div>

          <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <p className="text-zinc-500">Concluidas</p>
            <strong className="mt-3 block text-4xl text-green-600">{summary.completed}</strong>
          </div>

          <div className="rounded-3xl border border-yellow-100 bg-yellow-50 p-6 shadow-sm">
            <p className="text-yellow-700">Edicoes pendentes</p>
            <strong className="mt-3 block text-4xl text-yellow-700">{summary.pendingEdits}</strong>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <div className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-zinc-900">
              Baixas por vacina
            </h2>

            <div className="mt-6 space-y-5">
              {usageChartRows.map((row) => (
                <div key={row.id}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="font-bold text-zinc-700">{row.name}</span>
                    <span className="text-zinc-500">{row.doses} doses</span>
                  </div>

                  <div className="h-4 overflow-hidden rounded-full bg-green-50">
                    <div
                      className="h-full rounded-full bg-green-600"
                      style={{ width: `${Math.max(6, (row.doses / maxChartDoses) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}

              {usageChartRows.length === 0 && (
                <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                  Sem baixas registradas.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-zinc-900">
              Estoque critico
            </h2>

            <div className="mt-6 space-y-4">
              {lowStockRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-red-50 p-4"
                >
                  <div>
                    <strong className="text-zinc-900">{row.name}</strong>
                    <p className="text-sm text-red-600">Limite: {row.minimum} doses</p>
                  </div>

                  <span className="rounded-full bg-white px-4 py-2 font-bold text-red-600">
                    {row.saldo}
                  </span>
                </div>
              ))}

              {lowStockRows.length === 0 && (
                <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                  Nenhum alerta critico no momento.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Gestao de vacinas
          </h2>

          <p className="mt-2 text-zinc-500">
            Somente o chefe altera nome, codigo, doses por frasco, valor padrao por dose e exclusoes.
          </p>

          {editingVaccineId && (
            <div className="mt-6 grid gap-4 rounded-3xl border border-green-100 bg-green-50 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <input
                  type="text"
                  placeholder="Codigo"
                  value={vaccineForm.codigo}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, codigo: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  placeholder="Nome"
                  value={vaccineForm.nome}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, nome: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  placeholder="Fabricante"
                  value={vaccineForm.fabricante}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, fabricante: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Doses por frasco"
                  value={vaccineForm.dosesPerBottle}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, dosesPerBottle: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor padrao por dose"
                  value={vaccineForm.valorDosePadrao}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, valorDosePadrao: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  placeholder="Observacoes"
                  value={vaccineForm.observacoes}
                  onChange={(event) => setVaccineForm({ ...vaccineForm, observacoes: event.target.value })}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveVaccineEdit}
                  className="rounded-2xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  Salvar vacina
                </button>

                <button
                  type="button"
                  onClick={cancelVaccineEdit}
                  className="rounded-2xl bg-white px-6 py-3 font-bold text-green-700 ring-1 ring-green-100 transition hover:bg-green-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Codigo</th>
                  <th className="pb-4">Nome</th>
                  <th className="pb-4">Fabricante</th>
                  <th className="pb-4">Doses/frasco</th>
                  <th className="pb-4">Valor padrao</th>
                  <th className="pb-4">Acoes</th>
                </tr>
              </thead>

              <tbody>
                {vaccines.map((vaccine) => (
                  <tr key={vaccine.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">{vaccine.codigo}</td>
                    <td>{vaccine.nome}</td>
                    <td>{vaccine.fabricante || "-"}</td>
                    <td>{vaccine.dosesPerBottle || "-"}</td>
                    <td>{vaccine.valorDosePadrao ? formatCurrency(parseMoney(vaccine.valorDosePadrao)) : "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startVaccineEdit(vaccine)}
                          className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                        >
                          Alterar
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteVaccine(vaccine.id)}
                          className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white transition hover:bg-red-700"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Gestao de entradas
          </h2>

          <p className="mt-2 text-zinc-500">
            Ajuste valor por dose, validade, lote, fornecedor e quantidades somente por aqui.
          </p>

          {editingEntryId && (
            <div className="mt-6 grid gap-4 rounded-3xl border border-green-100 bg-green-50 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
                <select
                  value={entryForm.vaccineId}
                  onChange={(event) => updateEntryForm("vaccineId", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                >
                  <option value="">Selecione vacina</option>
                  {vaccines.map((vaccine) => (
                    <option key={vaccine.id} value={vaccine.id}>
                      {vaccine.nome}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Lote"
                  value={entryForm.lote}
                  onChange={(event) => updateEntryForm("lote", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  Data de validade
                  <input
                    type="date"
                    value={entryForm.validade}
                    onChange={(event) => updateEntryForm("validade", event.target.value)}
                    className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                  />
                </label>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Frascos"
                  value={entryForm.frascos}
                  onChange={(event) => updateEntryForm("frascos", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Doses por frasco"
                  value={entryForm.dosesPerBottle}
                  onChange={(event) => updateEntryForm("dosesPerBottle", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Doses totais sem frasco"
                  value={entryForm.doses}
                  onChange={(event) => updateEntryForm("doses", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor por dose"
                  value={entryForm.valorDose}
                  onChange={(event) => updateEntryForm("valorDose", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Alerta estoque baixo"
                  value={entryForm.lowStockAlertQuantity}
                  onChange={(event) => updateEntryForm("lowStockAlertQuantity", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  placeholder="Fornecedor"
                  value={entryForm.fornecedor}
                  onChange={(event) => updateEntryForm("fornecedor", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="text"
                  placeholder="Observacao"
                  value={entryForm.observacao}
                  onChange={(event) => updateEntryForm("observacao", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-green-100">
                <p className="text-sm text-zinc-500">Total recalculado</p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {entryCalculatedDoses} doses - {formatCurrency(entryTotalValue)}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveEntryEdit}
                  className="rounded-2xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  Salvar entrada
                </button>

                <button
                  type="button"
                  onClick={cancelEntryEdit}
                  className="rounded-2xl bg-white px-6 py-3 font-bold text-green-700 ring-1 ring-green-100 transition hover:bg-green-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Vacina</th>
                  <th className="pb-4">Lote</th>
                  <th className="pb-4">Doses</th>
                  <th className="pb-4">Valor/dose</th>
                  <th className="pb-4">Total</th>
                  <th className="pb-4">Validade</th>
                  <th className="pb-4">Acoes</th>
                </tr>
              </thead>

              <tbody>
                {recentEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">{entry.vacina}</td>
                    <td>{entry.lote || "-"}</td>
                    <td>{entry.doses}</td>
                    <td>{formatCurrency(getEntryDoseValue(entry))}</td>
                    <td className="font-bold text-green-700">{formatCurrency(getEntryTotalValue(entry))}</td>
                    <td>{entry.validade || "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEntryEdit(entry)}
                          className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                        >
                          Alterar
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white transition hover:bg-red-700"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {recentEntries.length === 0 && (
              <p className="mt-4 rounded-2xl bg-green-50 p-5 text-zinc-500">
                Nenhuma entrada registrada.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Aprovacao de edicoes de vacina
          </h2>

          <div className="mt-6 space-y-4">
            {pendingEditRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-3xl border border-yellow-100 bg-yellow-50 p-5"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">
                      {request.vaccineName}
                    </h3>

                    <p className="mt-1 text-sm text-zinc-600">
                      Solicitado por {request.requestedBy} em {request.requestedAt}
                    </p>

                    <p className="mt-3 font-semibold text-yellow-800">
                      {request.reason}
                    </p>

                    <p className="mt-3 text-sm text-zinc-700">
                      {getChangedText(request)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => approveRequest(request.id)}
                      className="rounded-2xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                    >
                      Aprovar
                    </button>

                    <button
                      type="button"
                      onClick={() => rejectRequest(request.id)}
                      className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {pendingEditRequests.length === 0 && (
              <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                Nenhuma edicao pendente.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Historico recente
          </h2>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Data</th>
                  <th className="pb-4">Vacina</th>
                  <th className="pb-4">Acao</th>
                  <th className="pb-4">Responsavel</th>
                </tr>
              </thead>

              <tbody>
                {recentAuditLog.map((item) => (
                  <tr key={item.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">{item.createdAt}</td>
                    <td>{item.vaccineName}</td>
                    <td>{item.type === "vaccine-edit-approved" ? "Edicao aprovada" : "Edicao recusada"}</td>
                    <td>{item.approvedBy || item.rejectedBy || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {recentAuditLog.length === 0 && (
              <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                Sem historico de aprovacoes.
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          Programas cadastrados: {schedules.length}
        </p>

      </div>

    </div>
  );
}

export default Chief;
