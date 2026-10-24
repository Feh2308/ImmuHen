import { useEffect, useMemo, useState } from "react";

import {
  archiveOwnerTenantApi,
  createOwnerTenantApi,
  deleteOwnerTenantApi,
  expireOwnerTenantApi,
  fetchOwnerOverviewApi,
  ownerLoginApi,
  ownerLogout,
  renewOwnerTenantApi,
  resetOwnerAccountPasswordApi,
  resetOwnerTenantAdminPasswordApi,
  restoreOwnerTenantApi,
  updateOwnerTenantApi,
} from "../services/vacitechApi";

const emptyTenantForm = {
  name: "",
  identifier: "",
  domain: "",
  primaryColor: "#16a34a",
  secondaryColor: "#dcfce7",
  status: "ACTIVE",
  city: "",
  document: "",
  owner: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

function getTenantName(tenant) {
  const name = String(tenant.tenant?.name || tenant.farmProfile?.farmName || tenant.tenantId || "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();

  return name || tenant.tenantId;
}

function getTenantStatus(tenant) {
  return tenant.tenant?.status || (tenant.archivedAt ? "INACTIVE" : "ACTIVE");
}

function formatTenantDomain(tenant) {
  const rawValue = String(tenant.tenant?.domain || tenant.farmProfile?.domain || "").trim();

  if (!rawValue) {
    return "-";
  }

  const urlStart = rawValue.search(/https?:\/\//i);
  const value = urlStart >= 0 ? rawValue.slice(urlStart) : rawValue;

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname || "-";
  } catch (error) {
    return value
      .replace(/^https?:\/\//i, "")
      .split(/[/?#]/)[0]
      .trim() || "-";
  }
}

function OwnerAdmin() {
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editingTenantId, setEditingTenantId] = useState("");
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const hasOwnerToken = Boolean(sessionStorage.getItem("ownerToken"));

  const tenants = useMemo(() => (
    [...(overview?.tenants || [])].sort((first, second) => (
      getTenantName(first).localeCompare(getTenantName(second), "pt-BR")
    ))
  ), [overview]);

  useEffect(() => {
    if (hasOwnerToken) {
      loadOverview();
    }
  }, []);

  async function loadOverview() {
    setLoading(true);
    setMessage("");

    try {
      const data = await fetchOwnerOverviewApi();
      setOverview(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await ownerLoginApi(password);
      setPassword("");
      await loadOverview();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    ownerLogout();
    setOverview(null);
    setPassword("");
  }

  function updateTenantForm(field, value) {
    setTenantForm({
      ...tenantForm,
      [field]: value,
    });
  }

  function resetTenantForm() {
    setEditingTenantId("");
    setTenantForm(emptyTenantForm);
  }

  function startTenantEdit(tenant) {
    setEditingTenantId(tenant.tenantId);
    setTenantForm({
      ...emptyTenantForm,
      name: tenant.tenant?.name || tenant.farmProfile?.farmName || "",
      identifier: tenant.tenant?.identifier || tenant.farmProfile?.identifier || "",
      domain: formatTenantDomain(tenant) === "-" ? "" : formatTenantDomain(tenant),
      primaryColor: tenant.tenant?.primaryColor || tenant.farmProfile?.primaryColor || "#16a34a",
      secondaryColor: tenant.tenant?.secondaryColor || tenant.farmProfile?.secondaryColor || "#dcfce7",
      status: getTenantStatus(tenant),
      city: tenant.farmProfile?.city || "",
      document: tenant.farmProfile?.document || "",
      owner: tenant.farmProfile?.owner || "",
    });
  }

  async function saveTenant() {
    setLoading(true);
    setMessage("");

    try {
      const data = editingTenantId
        ? await updateOwnerTenantApi(editingTenantId, tenantForm)
        : await createOwnerTenantApi(tenantForm);

      setOverview(data.overview || overview);
      resetTenantForm();
      setMessage(editingTenantId ? "Granja atualizada." : "Granja criada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function runTenantAction(action, tenantId, successMessage) {
    setLoading(true);
    setMessage("");

    try {
      const data = await action(tenantId);
      setOverview(data.overview || overview);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTenant(tenantId) {
    const confirmed = window.confirm("Excluir definitivamente esta granja e seus usuarios?");

    if (!confirmed) {
      return;
    }

    await runTenantAction(deleteOwnerTenantApi, tenantId, "Granja excluida definitivamente.");
  }

  async function resetAccountPassword(account) {
    const password = window.prompt(`Nova senha para ${account.email}`);

    if (!password) {
      return;
    }

    if (password.length < 6) {
      setMessage("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await resetOwnerAccountPasswordApi(account.id, password);
      await loadOverview();
      setMessage(`Senha alterada para ${account.email}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetTenantAdminPassword(tenant) {
    const password = window.prompt(`Nova senha do Estoque/Administrador para ${getTenantName(tenant)}`);

    if (!password) {
      return;
    }

    if (password.length < 6) {
      setMessage("A senha administrativa precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await resetOwnerTenantAdminPasswordApi(tenant.tenantId, password);
      setOverview(data.overview || overview);
      setMessage(`Senha de Estoque/Administrador alterada para ${getTenantName(tenant)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!hasOwnerToken && !overview) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-green-700">
            ImmuHen
          </p>
          <h1 className="mt-2 text-4xl font-bold text-zinc-900">
            Admin Geral
          </h1>
          <p className="mt-2 text-zinc-500">
            Acesse com a senha OWNER_ADMIN_KEY do servidor.
          </p>

          <form onSubmit={handleLogin} className="mt-6 grid gap-4">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha do admin geral"
              className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white"
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          {message && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 md:p-8">
      <main className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                ImmuHen
              </p>
              <h1 className="mt-2 text-4xl font-bold text-zinc-900">
                Admin Geral
              </h1>
              <p className="mt-2 text-zinc-500">
                Gerencie granjas, status, identidade visual e acesso inicial.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadOverview}
                disabled={loading}
                className="rounded-2xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl bg-zinc-200 px-6 py-3 font-bold text-zinc-700 transition hover:bg-zinc-300"
              >
                Sair
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            {editingTenantId ? "Editar granja" : "Cadastrar granja"}
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Nome da granja" value={tenantForm.name} onChange={(event) => updateTenantForm("name", event.target.value)} />
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Identificador" value={tenantForm.identifier} onChange={(event) => updateTenantForm("identifier", event.target.value)} />
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Dominio" value={tenantForm.domain} onChange={(event) => updateTenantForm("domain", event.target.value)} />
            <select className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" value={tenantForm.status} onChange={(event) => updateTenantForm("status", event.target.value)}>
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </select>
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Cidade" value={tenantForm.city} onChange={(event) => updateTenantForm("city", event.target.value)} />
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Documento" value={tenantForm.document} onChange={(event) => updateTenantForm("document", event.target.value)} />
            <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Responsavel" value={tenantForm.owner} onChange={(event) => updateTenantForm("owner", event.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Cor geral
                <input type="color" className="h-12 rounded-xl border border-green-100 bg-green-50 p-1" value={tenantForm.primaryColor} onChange={(event) => updateTenantForm("primaryColor", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Cor secundaria
                <input type="color" className="h-12 rounded-xl border border-green-100 bg-green-50 p-1" value={tenantForm.secondaryColor} onChange={(event) => updateTenantForm("secondaryColor", event.target.value)} />
              </label>
            </div>
          </div>

          {!editingTenantId && (
            <div className="grid gap-4 md:grid-cols-3">
              <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Nome do admin da granja" value={tenantForm.adminName} onChange={(event) => updateTenantForm("adminName", event.target.value)} />
              <input className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Email do admin da granja" value={tenantForm.adminEmail} onChange={(event) => updateTenantForm("adminEmail", event.target.value)} />
              <input type="password" className="rounded-xl border border-green-100 bg-green-50 p-3 outline-none" placeholder="Senha inicial" value={tenantForm.adminPassword} onChange={(event) => updateTenantForm("adminPassword", event.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveTenant}
              disabled={loading}
              className="rounded-2xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {editingTenantId ? "Salvar granja" : "Criar granja"}
            </button>

            {editingTenantId && (
              <button
                type="button"
                onClick={resetTenantForm}
                className="rounded-2xl bg-white px-6 py-3 font-bold text-green-700 ring-1 ring-green-100 transition hover:bg-green-100"
              >
                Cancelar edicao
              </button>
            )}
          </div>
        </section>

        {message && (
          <p className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-bold text-green-700">
            {message}
          </p>
        )}

        <section className="mt-6 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
          <div className="mb-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm text-zinc-500">Granjas</p>
              <strong className="text-3xl text-green-700">{overview?.totals?.tenants || 0}</strong>
            </div>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm text-zinc-500">Contas</p>
              <strong className="text-3xl text-green-700">{overview?.totals?.accounts || 0}</strong>
            </div>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm text-zinc-500">Vencidas</p>
              <strong className="text-3xl text-green-700">{overview?.totals?.expired || 0}</strong>
            </div>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm text-zinc-500">Inativas</p>
              <strong className="text-3xl text-green-700">{tenants.filter((tenant) => getTenantStatus(tenant) === "INACTIVE").length}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Granja</th>
                  <th className="pb-4">Identificador</th>
                  <th className="pb-4">Dominio</th>
                  <th className="pb-4">Status</th>
                  <th className="pb-4">Contas</th>
                  <th className="pb-4">Assinatura</th>
                  <th className="pb-4">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.tenantId} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 rounded-full border border-green-100" style={{ backgroundColor: tenant.tenant?.primaryColor || "#16a34a" }} />
                        <div>
                          <strong>{getTenantName(tenant)}</strong>
                          <p className="text-sm text-zinc-500">{tenant.farmProfile?.city || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td>{tenant.tenant?.identifier || "-"}</td>
                    <td>{formatTenantDomain(tenant)}</td>
                    <td>{getTenantStatus(tenant) === "INACTIVE" ? "Inativa" : "Ativa"}</td>
                    <td>
                      <div className="grid min-w-[240px] gap-2">
                        {(tenant.accounts || []).map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-zinc-900">
                                {account.email}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {account.role || "USUARIO"}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => resetAccountPassword(account)}
                              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
                            >
                              Senha
                            </button>
                          </div>
                        ))}

                        {(!tenant.accounts || tenant.accounts.length === 0) && (
                          <span className="text-sm text-zinc-500">Sem contas</span>
                        )}
                      </div>
                    </td>
                    <td>{tenant.subscription?.active ? "Ativa" : "Vencida"}</td>
                    <td>
                      <div className="flex min-w-[520px] flex-wrap gap-2">
                        <button type="button" onClick={() => startTenantEdit(tenant)} className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white">Editar</button>
                        <button type="button" onClick={() => resetTenantAdminPassword(tenant)} className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white">Senha admin</button>
                        <button type="button" onClick={() => runTenantAction(renewOwnerTenantApi, tenant.tenantId, "Mensalidade renovada.")} className="rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white">Renovar</button>
                        <button type="button" onClick={() => runTenantAction(expireOwnerTenantApi, tenant.tenantId, "Mensalidade vencida.")} className="rounded-xl bg-yellow-500 px-3 py-2 text-sm font-bold text-white">Vencer</button>
                        {getTenantStatus(tenant) === "INACTIVE" ? (
                          <button type="button" onClick={() => runTenantAction(restoreOwnerTenantApi, tenant.tenantId, "Granja ativada.")} className="rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white">Ativar</button>
                        ) : (
                          <button type="button" onClick={() => runTenantAction(archiveOwnerTenantApi, tenant.tenantId, "Granja inativada.")} className="rounded-xl bg-zinc-600 px-3 py-2 text-sm font-bold text-white">Inativar</button>
                        )}
                        <button type="button" onClick={() => deleteTenant(tenant.tenantId)} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white">Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default OwnerAdmin;
