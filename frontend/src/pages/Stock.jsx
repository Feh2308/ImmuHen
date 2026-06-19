import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";
import {
  authorizeStockAccessApi,
  fetchRequestsApi,
  reviewVaccinationCompletionApi,
} from "../services/vacitechApi";
import {
  getTenantSessionKey,
  readJson,
  writeJson,
} from "../utils/vacitechStorage";
import { compareVaccinesByCode, sortVaccinesByCode } from "../utils/vaccineSort";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function getAverageDoseCost(entries, vaccineId) {
  const vaccineEntries = entries.filter((entry) => String(entry.vaccineId) === String(vaccineId));
  const totalDoses = vaccineEntries.reduce((total, entry) => total + Number(entry.doses || 0), 0);
  const totalValue = vaccineEntries.reduce((total, entry) => total + getEntryTotalValue(entry), 0);

  return totalDoses > 0 ? totalValue / totalDoses : 0;
}

function isActiveOutput(output) {
  return !output?.clearedAt;
}

function normalizeRequestStatus(status) {
  if (status === "ENVIADA_PARA_CONFERENCIA") {
    return "AGUARDANDO_CONFIRMACAO_ADMIN";
  }

  return status || "PENDENTE";
}

function isPendingStockReview(request) {
  const status = normalizeRequestStatus(request.status);

  return status === "AGUARDANDO_CONFIRMACAO_ADMIN" || status === "CONCLUIDA";
}

function getPendingUsageItems(request) {
  const items = Array.isArray(request.actualVaccineUsages) && request.actualVaccineUsages.length > 0
    ? request.actualVaccineUsages
    : Array.isArray(request.usageConfirmation)
      ? request.usageConfirmation
      : [];

  return items
    .map((item, index) => ({
      id: `${request.id}-${item.vaccineId || index}`,
      requestId: request.id,
      vaccineId: item.vaccineId || "",
      vacina: item.vacina || "Vacina",
      farmName: request.farmName || "Granja",
      birdLotName: request.birdLotName || "-",
      vaccinatorName: request.vaccinatorName || "Vacinador",
      quantityTaken: Number(item.quantityTaken || item.doses || 0),
      quantityUsed: Number(item.quantityUsed || item.doses || 0),
      quantityReturned: Number(item.quantityReturned || 0),
      date: request.awaitingAdminConfirmationAt || request.completedAt || "-",
    }))
    .filter((item) => item.vaccineId && (item.quantityTaken > 0 || item.quantityUsed > 0));
}

function getStatus(saldo) {
  if (saldo <= 0) {
    return {
      label: "Sem estoque",
      className: "text-red-500",
    };
  }

  if (saldo < 500) {
    return {
      label: "Baixo",
      className: "text-yellow-600",
    };
  }

  return {
    label: "OK",
    className: "text-green-600",
  };
}

function formatAuditType(type) {
  const labels = {
    "stock-cleared": "Estoque limpo",
    "used-doses-cleared": "Doses usadas limpas",
    "entry-deleted": "Entrada excluida",
    "entry-value-updated": "Valor de entrada alterado",
    "vaccine-updated": "Vacina alterada",
    "vaccine-deleted": "Vacina excluida",
  };

  return labels[type] || type || "Registro";
}

function Stock() {
  const stockSessionKey = getTenantSessionKey("stockAuthorized");

  const {
    vaccines,
    entries,
    outputs,
    vaccineAuditLog,
    clearStock,
  } = useVaccines();

  const [password, setPassword] =
    useState("");

  const [accessLoading, setAccessLoading] =
    useState(false);

  const [accessMessage, setAccessMessage] =
    useState("");

  const [authorized, setAuthorized] =
    useState(() => sessionStorage.getItem(stockSessionKey) === "true");
  const [requests, setRequests] =
    useState(() => readJson("requests", []));
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);

  useEffect(() => {
    let active = true;

    async function loadRequests() {
      try {
        const apiRequests = await fetchRequestsApi();

        if (!active) {
          return;
        }

        setRequests(apiRequests || []);
        writeJson("requests", apiRequests || [], { silent: true });
      } catch (error) {
        console.log(error);
        setRequests(readJson("requests", []));
      }
    }

    loadRequests();

    return () => {
      active = false;
    };
  }, []);

  const stockRows = useMemo(() => {
    const rows = new Map();

    function ensureRow(vaccineId, fallback = {}) {
      const key = String(vaccineId || fallback.vacina || fallback.id);
      const vaccine = vaccines.find(
        (item) => String(item.id) === String(vaccineId)
      );

      if (!rows.has(key)) {
        rows.set(key, {
          vaccineId,
          vacina: vaccine?.nome || fallback.vacina || "Vacina",
          codigo: vaccine?.codigo || fallback.codigo || "-",
          entradas: 0,
          saidas: 0,
          valorTotal: 0,
          lotes: new Set(),
          validades: new Set(),
          fornecedores: new Set(),
        });
      }

      return rows.get(key);
    }

    sortedVaccines.forEach((vaccine) => {
      ensureRow(vaccine.id, {
        vacina: vaccine.nome,
        codigo: vaccine.codigo,
      });
    });

    entries.forEach((entry) => {
      const row = ensureRow(entry.vaccineId, entry);

      row.entradas += Number(entry.doses || 0);
      row.valorTotal += getEntryTotalValue(entry);

      if (entry.lote) {
        row.lotes.add(entry.lote);
      }

      if (entry.validade) {
        row.validades.add(entry.validade);
      }

      if (entry.fornecedor) {
        row.fornecedores.add(entry.fornecedor);
      }
    });

    outputs.filter(isActiveOutput).forEach((output) => {
      const row = ensureRow(output.vaccineId, output);

      row.saidas += Number(output.doses || 0);
    });

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        saldo: row.entradas - row.saidas,
        lotes: Array.from(row.lotes).join(", ") || "-",
        validades: Array.from(row.validades).join(", ") || "-",
        fornecedores: Array.from(row.fornecedores).join(", ") || "-",
      }))
      .filter((row) => row.entradas > 0 || row.saidas > 0 || vaccines.length)
      .sort((first, second) => compareVaccinesByCode(
        { codigo: first.codigo, nome: first.vacina },
        { codigo: second.codigo, nome: second.vacina }
      ));
  }, [vaccines, sortedVaccines, entries, outputs]);

  const movementRows = useMemo(() => {
    const entryRows = entries.map((entry) => ({
      id: `entrada-${entry.id}`,
      tipo: "Entrada",
      vacina: entry.vacina,
      doses: Number(entry.doses || 0),
      data: entry.data || "-",
      detalhe: entry.lote || "-",
      responsavel: entry.fornecedor || "-",
      observacao: entry.observacao || "-",
      className: "text-green-600",
    }));

    const outputRows = outputs.map((output) => ({
      id: `saida-${output.id}`,
      tipo: output.clearedAt ? "Baixa limpa" : "Baixa",
      vacina: output.vacina,
      doses: Number(output.doses || 0),
      data: output.data || "-",
      detalhe: output.destino || "-",
      responsavel: output.responsavel || "-",
      observacao: output.clearedAt
        ? `Baixa preservada no historico e limpa em ${output.clearedAt}. ${output.clearedReason || ""}`.trim()
        : output.observacao || "-",
      className: output.clearedAt ? "text-zinc-500" : "text-red-500",
    }));

    return [...entryRows, ...outputRows].sort((a, b) => {
      const idA = Number(String(a.id).split("-").pop());
      const idB = Number(String(b.id).split("-").pop());

      return idB - idA;
    });
  }, [entries, outputs]);

  const pendingStockRows = useMemo(() => (
    requests
      .filter(isPendingStockReview)
      .flatMap(getPendingUsageItems)
      .sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")))
  ), [requests]);

  const pendingStockTotals = useMemo(() => (
    pendingStockRows.reduce(
      (total, row) => ({
        levadas: total.levadas + row.quantityTaken,
        usadas: total.usadas + row.quantityUsed,
        sobrando: total.sobrando + row.quantityReturned,
      }),
      {
        levadas: 0,
        usadas: 0,
        sobrando: 0,
      }
    )
  ), [pendingStockRows]);

  const lotCostRows = useMemo(() => {
    const rows = new Map();

    outputs.filter(isActiveOutput).forEach((output) => {
      const key = String(output.birdLotId || output.birdLotName || output.destino || "sem-lote");
      const row = rows.get(key) || {
        id: key,
        lote: output.birdLotName || output.destino || "Sem lote informado",
        doses: 0,
        custo: 0,
        vacinas: new Set(),
      };
      const doses = Number(output.doses || 0);
      const unitCost = getAverageDoseCost(entries, output.vaccineId);

      row.doses += doses;
      row.custo += doses * unitCost;

      if (output.vacina) {
        row.vacinas.add(output.vacina);
      }

      rows.set(key, row);
    });

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        vacinas: Array.from(row.vacinas).join(", ") || "-",
      }))
      .sort((first, second) => second.custo - first.custo);
  }, [entries, outputs]);

  const totals = useMemo(() => {
    return stockRows.reduce(
      (acc, row) => ({
        entradas: acc.entradas + row.entradas,
        saidas: acc.saidas + row.saidas,
        saldo: acc.saldo + row.saldo,
        valorTotal: acc.valorTotal + row.valorTotal,
      }),
      {
        entradas: 0,
        saidas: 0,
        saldo: 0,
        valorTotal: 0,
      }
    );
  }, [stockRows]);

  const stockHistoryRows = useMemo(() => (
    (Array.isArray(vaccineAuditLog) ? vaccineAuditLog : [])
      .filter((item) => (
        item.type === "stock-cleared" ||
        item.type === "used-doses-cleared" ||
        item.type === "entry-deleted" ||
        item.type === "entry-value-updated" ||
        item.type === "vaccine-deleted" ||
        item.type === "vaccine-updated"
      ))
      .slice(0, 20)
  ), [vaccineAuditLog]);

  async function handleStockAccess() {
    setAccessLoading(true);
    setAccessMessage("");

    try {
      await authorizeStockAccessApi(password);
      sessionStorage.removeItem("stockAuthorized");
      sessionStorage.setItem(stockSessionKey, "true");
      setAuthorized(true);
      setPassword("");
    } catch (error) {
      setAccessMessage(error.message || "Senha administrativa incorreta");
    } finally {
      setAccessLoading(false);
    }
  }

  function lockStock() {
    sessionStorage.removeItem("stockAuthorized");
    sessionStorage.removeItem(stockSessionKey);
    setAuthorized(false);
    setPassword("");
  }

  async function returnPendingVaccination(requestId) {
    const reason = window.prompt("Informe o motivo da devolucao sem baixa no estoque:");

    if (reason === null) {
      return;
    }

    if (!reason.trim()) {
      alert("Informe um motivo para registrar a devolucao.");
      return;
    }

    const confirmed = window.confirm("Registrar devolucao/rejeicao sem baixar estoque? Esta acao remove a pendencia da conferencia.");

    if (!confirmed) {
      return;
    }

    try {
      const data = await reviewVaccinationCompletionApi(requestId, {
        action: "REJECT",
        reason: reason.trim(),
      });

      setRequests(data.requests || []);
      writeJson("requests", data.requests || [], { silent: true });
    } catch (error) {
      alert(error.message || "Nao foi possivel registrar a devolucao.");
    }
  }

  function handleClearStock() {
    const message = [
      "Limpar o estoque atual?",
      "",
      `Doses em estoque que serao zeradas: ${totals.saldo}`,
      `Entradas removidas do estoque atual: ${entries.length}`,
      `Baixas preservadas no historico e retiradas do saldo: ${outputs.filter(isActiveOutput).length}`,
      `Vacinas cadastradas mantidas: ${vaccines.length}`,
      "",
      "Cadastro da granja, usuarios, vacinadores, vacinas e configuracoes serao mantidos.",
      "Depois, faca uma nova entrada para informar valor, lote, validade e doses do estoque atual.",
      "Digite LIMPAR ESTOQUE para confirmar.",
    ].join("\n");
    const confirmation = window.prompt(message);

    if (confirmation !== "LIMPAR ESTOQUE") {
      return;
    }

    clearStock({
      reason: "Limpeza geral do estoque feita pela tela Estoque.",
      clearedBy: "Administrador",
    });
  }

  function printLotCostReport() {
    const reportWindow = window.open("", "_blank", "width=1000,height=800");

    if (!reportWindow) {
      alert("Permita pop-ups para gerar o relatorio.");
      return;
    }

    const totalCost = lotCostRows.reduce((total, row) => total + row.custo, 0);

    reportWindow.document.write(`
      <html>
        <head>
          <title>Relatorio por lote - ImmuHen</title>
          <style>
            body { font-family: Arial, sans-serif; color: #18181b; padding: 28px; }
            h1 { color: #14532d; margin-bottom: 6px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #bbf7d0; padding: 9px; text-align: left; vertical-align: top; }
            th { background: #dcfce7; color: #14532d; }
            .total { margin-top: 16px; font-weight: 700; color: #14532d; }
          </style>
        </head>
        <body>
          <h1>Relatorio de custo por lote</h1>
          <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Vacinas</th>
                <th>Doses baixadas</th>
                <th>Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              ${lotCostRows.map((row) => `
                <tr>
                  <td>${row.lote}</td>
                  <td>${row.vacinas}</td>
                  <td>${row.doses}</td>
                  <td>${formatCurrency(row.custo)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <p class="total">Custo total estimado: ${formatCurrency(totalCost)}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

        <Sidebar />

        <div className="flex-1 p-8">

          <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm max-w-xl">

            <h1 className="text-4xl font-bold text-zinc-900">
              Acesso ao Estoque
            </h1>

            <p className="text-zinc-500 mt-2">
              Digite a senha do administrador desta granja para acessar o controle de estoque.
            </p>

            <input
              type="password"
              placeholder="Senha do login admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-6 w-full bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <button
              onClick={handleStockAccess}
              disabled={accessLoading}
              className="mt-5 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-bold transition"
            >
              {accessLoading ? "Verificando..." : "Acessar Estoque"}
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm">

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

            <div>

              <h1 className="text-5xl font-bold text-zinc-900">
                Estoque
              </h1>

              <p className="text-zinc-500 mt-2">
                Controle operacional de estoque por entradas e baixas automaticas.
              </p>

            </div>

            <button
              type="button"
              onClick={lockStock}
              className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-6 py-4 rounded-2xl font-bold transition"
            >
              Bloquear Estoque
            </button>

            <button
              type="button"
              onClick={handleClearStock}
              className="bg-red-50 hover:bg-red-100 text-red-700 px-6 py-4 rounded-2xl font-bold transition"
            >
              Limpar Estoque
            </button>

          </div>


        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mt-8">

          <div className="bg-white rounded-3xl border border-green-100 p-6 shadow-sm">
            <p className="text-zinc-500">
              Doses em estoque
            </p>
            <h2 className="text-4xl font-bold text-green-600 mt-3">
              {totals.saldo}
            </h2>
          </div>

          <div className="bg-white rounded-3xl border border-green-100 p-6 shadow-sm">
            <p className="text-zinc-500">
              Entradas
            </p>
            <h2 className="text-4xl font-bold text-green-600 mt-3">
              {totals.entradas}
            </h2>
          </div>

          <div className="bg-white rounded-3xl border border-green-100 p-6 shadow-sm">
            <p className="text-zinc-500">
              Baixas
            </p>
            <h2 className="text-4xl font-bold text-red-500 mt-3">
              {totals.saidas}
            </h2>
          </div>

          <div className="bg-white rounded-3xl border border-green-100 p-6 shadow-sm">
            <p className="text-zinc-500">
              Valor comprado
            </p>
            <h2 className="text-3xl font-bold text-green-600 mt-3">
              {formatCurrency(totals.valorTotal)}
            </h2>
          </div>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-purple-100 p-8 shadow-sm overflow-x-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Doses levadas aguardando conferencia
              </h2>
              <p className="mt-2 text-zinc-500">
                Estas doses foram informadas pelo vacinador, mas ainda nao foram baixadas definitivamente do estoque.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-purple-50 px-4 py-2 text-sm font-bold text-purple-700">
                Levadas: {pendingStockTotals.levadas}
              </span>
              <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                Usadas informadas: {pendingStockTotals.usadas}
              </span>
              <span className="rounded-full bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-700">
                Sobras: {pendingStockTotals.sobrando}
              </span>
            </div>
          </div>

          <table className="mt-6 w-full text-left text-zinc-900">
            <thead>
              <tr className="border-b border-purple-100 text-zinc-500">
                <th className="pb-4">Vacina</th>
                <th className="pb-4">Granja/Lote</th>
                <th className="pb-4">Vacinador</th>
                <th className="pb-4">Levou</th>
                <th className="pb-4">Usou</th>
                <th className="pb-4">Sobrou</th>
                <th className="pb-4">Acao</th>
              </tr>
            </thead>
            <tbody>
              {pendingStockRows.map((row) => (
                <tr key={row.id} className="border-b border-purple-100 last:border-b-0">
                  <td className="py-4 font-bold">{row.vacina}</td>
                  <td className="min-w-56 max-w-md whitespace-normal break-words">
                    {row.farmName} {row.birdLotName !== "-" ? `| ${row.birdLotName}` : ""}
                  </td>
                  <td>{row.vaccinatorName}</td>
                  <td className="font-bold text-purple-700">{row.quantityTaken}</td>
                  <td className="font-bold text-green-700">{row.quantityUsed}</td>
                  <td className="font-bold text-zinc-700">{row.quantityReturned}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => returnPendingVaccination(row.requestId)}
                      className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                    >
                      Devolver sem baixa
                    </button>
                  </td>
                </tr>
              ))}

              {pendingStockRows.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-6 text-zinc-500">
                    Nenhuma dose aguardando conferencia do administrador.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Custo por lote
              </h2>
              <p className="mt-2 text-zinc-500">
                Estimativa por registro de nascimento usando o custo medio das entradas.
              </p>
            </div>

            <button
              type="button"
              onClick={printLotCostReport}
              className="w-fit rounded-2xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
            >
              Gerar relatorio por lote
            </button>
          </div>

          <table className="mt-6 w-full text-left text-zinc-900">
            <thead>
              <tr className="border-b border-green-100 text-zinc-500">
                <th className="pb-4">Lote</th>
                <th className="pb-4">Vacinas</th>
                <th className="pb-4">Doses</th>
                <th className="pb-4">Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              {lotCostRows.map((row) => (
                <tr key={row.id} className="border-b border-green-100 last:border-b-0">
                  <td className="py-4 font-bold">{row.lote}</td>
                  <td className="min-w-56 max-w-md whitespace-normal break-words">{row.vacinas}</td>
                  <td className="font-bold text-red-500">{row.doses}</td>
                  <td className="font-bold text-green-700">{formatCurrency(row.custo)}</td>
                </tr>
              ))}

              {lotCostRows.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-zinc-500">
                    Nenhuma baixa vinculada a lote ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">

          <h2 className="text-3xl font-bold text-zinc-900 mb-6">
            Saldo por vacina
          </h2>

          <table className="w-full text-left text-zinc-900">

            <thead>

              <tr className="border-b border-green-100 text-zinc-500">

                <th className="pb-4">
                  Vacina
                </th>

                <th className="pb-4">
                  Codigo
                </th>

                <th className="pb-4">
                  Lotes
                </th>

                <th className="pb-4">
                  Entradas
                </th>

                <th className="pb-4">
                  Baixas
                </th>

                <th className="pb-4">
                  Saldo
                </th>

                <th className="pb-4">
                  Valor
                </th>

                <th className="pb-4">
                  Status
                </th>

              </tr>

            </thead>

            <tbody>

              {stockRows.map((row) => {
                const status = getStatus(row.saldo);

                return (

                  <tr
                    key={String(row.vaccineId || row.vacina)}
                    className="border-b border-green-100 last:border-b-0"
                  >

                    <td className="py-4 font-bold">
                      {row.vacina}
                    </td>

                    <td>
                      {row.codigo}
                    </td>

                    <td className="min-w-48 max-w-xs whitespace-normal break-words">
                      {row.lotes}
                    </td>

                    <td className="text-green-600 font-bold">
                      {row.entradas}
                    </td>

                    <td className="text-red-500 font-bold">
                      {row.saidas}
                    </td>

                    <td className="font-bold">
                      {row.saldo}
                    </td>

                    <td>
                      {formatCurrency(row.valorTotal)}
                    </td>

                    <td>
                      <span className={`${status.className} font-bold`}>
                        {status.label}
                      </span>
                    </td>

                  </tr>

                );
              })}

              {stockRows.length === 0 && (

                <tr>
                  <td colSpan="8" className="py-6 text-zinc-500">
                    Nenhuma movimentacao registrada.
                  </td>
                </tr>

              )}

            </tbody>

          </table>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">

          <h2 className="text-3xl font-bold text-zinc-900 mb-6">
            Movimentacoes
          </h2>

          <table className="w-full text-left text-zinc-900">

            <thead>

              <tr className="border-b border-green-100 text-zinc-500">

                <th className="pb-4">
                  Tipo
                </th>

                <th className="pb-4">
                  Vacina
                </th>

                <th className="pb-4">
                  Doses
                </th>

                <th className="pb-4">
                  Lote/Destino
                </th>

                <th className="pb-4">
                  Fornecedor/Responsavel
                </th>

                <th className="pb-4">
                  Data
                </th>

                <th className="pb-4">
                  Observacao
                </th>

              </tr>

            </thead>

            <tbody>

              {movementRows.map((row) => (

                <tr
                  key={row.id}
                  className="border-b border-green-100 last:border-b-0"
                >

                  <td className={`${row.className} py-4 font-bold`}>
                    {row.tipo}
                  </td>

                  <td>
                    {row.vacina}
                  </td>

                  <td className={`${row.className} font-bold`}>
                    {row.tipo === "Entrada" ? "+" : "-"}
                    {row.doses}
                  </td>

                  <td>
                    {row.detalhe}
                  </td>

                  <td>
                    {row.responsavel}
                  </td>

                  <td>
                    {row.data}
                  </td>

                  <td className="min-w-64 max-w-xs whitespace-normal break-words text-zinc-500">
                    {row.observacao}
                  </td>

                </tr>

              ))}

              {movementRows.length === 0 && (

                <tr>
                  <td colSpan="7" className="py-6 text-zinc-500">
                    Nenhuma entrada ou baixa registrada.
                  </td>
                </tr>

              )}

            </tbody>

          </table>

        </div>

        <div className="mt-8 bg-white rounded-3xl border border-green-100 p-8 shadow-sm overflow-x-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900">
                Historico do estoque
              </h2>
              <p className="mt-2 text-zinc-500">
                Auditoria das limpezas, exclusoes e ajustes feitos no estoque.
              </p>
            </div>
          </div>

          <table className="mt-6 w-full text-left text-zinc-900">
            <thead>
              <tr className="border-b border-green-100 text-zinc-500">
                <th className="pb-4">Acao</th>
                <th className="pb-4">Vacina</th>
                <th className="pb-4">Resumo</th>
                <th className="pb-4">Responsavel</th>
                <th className="pb-4">Data</th>
              </tr>
            </thead>
            <tbody>
              {stockHistoryRows.map((item) => (
                <tr key={item.id} className="border-b border-green-100 last:border-b-0">
                  <td className="py-4 font-bold text-green-700">{formatAuditType(item.type)}</td>
                  <td className="min-w-48 max-w-xs whitespace-normal break-words">
                    {item.vaccineName || item.vacina || item.nome || "-"}
                  </td>
                  <td className="min-w-64 max-w-md whitespace-normal break-words text-zinc-600">
                    {item.type === "stock-cleared"
                      ? `Estoque anterior: ${item.stockBefore || 0}. Entradas removidas: ${item.removedEntriesCount || 0}. Baixas limpas: ${item.clearedOutputsCount || 0}. Vacinas mantidas: ${item.preservedVaccinesCount || 0}.`
                      : item.reason || item.observacao || "-"}
                  </td>
                  <td>{item.clearedBy || item.approvedBy || item.requestedBy || "Sistema"}</td>
                  <td>{item.createdAt || item.approvedAt || "-"}</td>
                </tr>
              ))}

              {stockHistoryRows.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-6 text-zinc-500">
                    Nenhuma acao de estoque registrada no historico.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}

export default Stock;
