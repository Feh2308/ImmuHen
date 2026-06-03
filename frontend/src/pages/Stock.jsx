import { useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";

import {
  useVaccines,
} from "../context/VaccineContext";

const STOCK_PASSWORD = "123456";

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

function Stock() {

  const {
    vaccines,
    entries,
    outputs,
  } = useVaccines();

  const [password, setPassword] =
    useState("");

  const [authorized, setAuthorized] =
    useState(() => sessionStorage.getItem("stockAuthorized") === "true");

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

    vaccines.forEach((vaccine) => {
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

    outputs.forEach((output) => {
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
      .filter((row) => row.entradas > 0 || row.saidas > 0 || vaccines.length);
  }, [vaccines, entries, outputs]);

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
      tipo: "Baixa",
      vacina: output.vacina,
      doses: Number(output.doses || 0),
      data: output.data || "-",
      detalhe: output.destino || "-",
      responsavel: output.responsavel || "-",
      observacao: output.observacao || "-",
      className: "text-red-500",
    }));

    return [...entryRows, ...outputRows].sort((a, b) => {
      const idA = Number(String(a.id).split("-").pop());
      const idB = Number(String(b.id).split("-").pop());

      return idB - idA;
    });
  }, [entries, outputs]);

  const lotCostRows = useMemo(() => {
    const rows = new Map();

    outputs.forEach((output) => {
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

  function handleStockAccess() {
    if (password === STOCK_PASSWORD) {
      sessionStorage.setItem("stockAuthorized", "true");
      setAuthorized(true);
      setPassword("");
      return;
    }

    alert("Senha administrativa incorreta");
  }

  function lockStock() {
    sessionStorage.removeItem("stockAuthorized");
    setAuthorized(false);
    setPassword("");
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
      <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

        <Sidebar />

        <div className="flex-1 p-8">

          <div className="bg-white rounded-3xl p-8 border border-green-100 shadow-sm max-w-xl">

            <h1 className="text-4xl font-bold text-zinc-900">
              Acesso ao Estoque
            </h1>

            <p className="text-zinc-500 mt-2">
              Digite a senha administrativa para acessar o controle de estoque.
            </p>

            <input
              type="password"
              placeholder="Digite a senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-6 w-full bg-green-50 border border-green-100 rounded-2xl p-4 outline-none"
            />

            <button
              onClick={handleStockAccess}
              className="mt-5 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-2xl font-bold transition"
            >
              Acessar Estoque
            </button>

          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-green-50 to-white">

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

      </div>

    </div>
  );
}

export default Stock;
