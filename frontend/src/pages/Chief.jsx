import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import {
  useVaccines,
} from "../context/VaccineContext";
import {
  authorizeChiefAccessApi,
  createUserApi,
  deleteUserApi,
  fetchUsersApi,
  updateAdminAccessPasswordApi,
  updateUserApi,
} from "../services/vacitechApi";
import {
  PERMISSION_OPTIONS,
  ROLE_OPTIONS,
  getDefaultPermissionsForRole,
  isAdminUser,
} from "../utils/permissions";
import { getTenantSessionKey, readJson } from "../utils/vacitechStorage";
import { sortVaccinesByCode } from "../utils/vaccineSort";

const emptyUserForm = {
  name: "",
  email: "",
  password: "",
  role: "FUNCIONARIO",
  permissions: getDefaultPermissionsForRole("FUNCIONARIO"),
};

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

    return user.name || user.email || "Administrador";
  } catch (error) {
    return "Administrador";
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

function getAuditActionText(item) {
  if (item.type === "vaccine-edit-approved") {
    return "Edicao de vacina aprovada";
  }

  if (item.type === "vaccine-edit-rejected") {
    return "Edicao de vacina recusada";
  }

  if (item.type === "entry-value-edit-approved") {
    return "Valor de entrada aprovado";
  }

  if (item.type === "entry-value-edit-rejected") {
    return "Valor de entrada recusado";
  }

  if (item.type === "vaccine-deleted") {
    return `Vacina excluida | entradas removidas: ${item.removedEntryDoses || 0} doses | baixas removidas: ${item.removedOutputDoses || 0} doses`;
  }

  if (item.type === "entry-deleted") {
    return `Entrada excluida | estoque reduziu ${item.removedEntryDoses || 0} doses`;
  }

  return item.reason || "Movimentacao registrada";
}

function getMovementSortValue(item) {
  const numericId = Number(String(item.id || "").split("-").pop());

  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }

  const timestamp = Date.parse(item.createdAt || item.data || "");

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function Chief() {
  const chiefSessionKey = getTenantSessionKey("chiefAuthorized");
  const {
    vaccines,
    entries,
    outputs,
    stockAlertLevels,
    vaccineEditRequests,
    entryEditRequests,
    vaccineAuditLog,
    updateVaccine,
    removeVaccine,
    updateEntry,
    removeEntry,
    approveVaccineEdit,
    rejectVaccineEdit,
    approveEntryValueEdit,
    rejectEntryValueEdit,
  } = useVaccines();

  const [authorized, setAuthorized] =
    useState(() => sessionStorage.getItem(chiefSessionKey) === "true");

  const [password, setPassword] =
    useState("");

  const [accessLoading, setAccessLoading] =
    useState(false);

  const [accessMessage, setAccessMessage] =
    useState("");

  const [adminPasswordForm, setAdminPasswordForm] =
    useState({
      password: "",
      confirmPassword: "",
    });

  const [adminPasswordMessage, setAdminPasswordMessage] =
    useState("");

  const [adminPasswordLoading, setAdminPasswordLoading] =
    useState(false);

  const [managedUsers, setManagedUsers] =
    useState([]);

  const [managedRoles, setManagedRoles] =
    useState(ROLE_OPTIONS);

  const [managedPermissions, setManagedPermissions] =
    useState(PERMISSION_OPTIONS);

  const [userForm, setUserForm] =
    useState(emptyUserForm);

  const [editingUserId, setEditingUserId] =
    useState("");

  const [usersLoading, setUsersLoading] =
    useState(false);

  const [userMessage, setUserMessage] =
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
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch (error) {
      return {};
    }
  }, []);
  const canManageUsers = isAdminUser(currentUser);

  const summary = useMemo(() => {
    const totalEntries = entries.reduce((total, entry) => total + Number(entry.doses || 0), 0);
    const totalOutputs = outputs.reduce((total, output) => total + Number(output.doses || 0), 0);
    const totalValue = entries.reduce((total, entry) => total + getEntryTotalValue(entry), 0);
    const pendingEdits =
      vaccineEditRequests.filter((request) => request.status === "pending").length +
      entryEditRequests.filter((request) => request.status === "pending").length;
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
  }, [completedVaccinations.length, entries, entryEditRequests, outputs, requests, vaccineEditRequests]);

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
  const pendingEntryEditRequests = entryEditRequests.filter((request) => request.status === "pending");
  const recentAuditLog = vaccineAuditLog.slice(0, 6);
  const recentEntries = entries.slice(-10).reverse();
  const recentMovementRows = useMemo(() => {
    const entryRows = entries.map((entry) => ({
      id: `entrada-${entry.id}`,
      type: "Entrada",
      vaccineName: entry.vacina || "Vacina",
      doses: Number(entry.doses || 0),
      date: entry.data || entry.createdAt || "-",
      detail: entry.lote || "-",
      responsible: entry.fornecedor || "-",
      observation: entry.observacao || "Entrada registrada no estoque.",
      className: "text-green-700",
    }));

    const outputRows = outputs.map((output) => ({
      id: `baixa-${output.id}`,
      type: "Baixa",
      vaccineName: output.vacina || "Vacina",
      doses: Number(output.doses || 0),
      date: output.data || output.createdAt || "-",
      detail: output.birdLotName || output.destino || output.programSuggestedName || "-",
      responsible: output.responsavel || "-",
      observation: output.observacao || "Baixa registrada no estoque.",
      className: "text-red-600",
    }));

    return [...entryRows, ...outputRows]
      .sort((first, second) => getMovementSortValue(second) - getMovementSortValue(first))
      .slice(0, 12);
  }, [entries, outputs]);
  const selectedEntryVaccine = vaccines.find((vaccine) => String(vaccine.id) === String(entryForm.vaccineId));
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);
  const entryDosesPerBottle = parseQuantity(entryForm.dosesPerBottle || selectedEntryVaccine?.dosesPerBottle);
  const entryBottles = Math.max(1, parseQuantity(entryForm.frascos) || 1);
  const entryCalculatedDoses = entryDosesPerBottle > 0
    ? entryDosesPerBottle * entryBottles
    : parseQuantity(entryForm.doses);
  const entryTotalValue = entryCalculatedDoses * parseMoney(entryForm.valorDose);

  function getLastEntryDoseValue(vaccineIdValue) {
    const entry = [...entries]
      .reverse()
      .find((item) => String(item.vaccineId) === String(vaccineIdValue) && getEntryDoseValue(item) > 0);

    return entry ? getEntryDoseValue(entry) : 0;
  }

  function getVaccineDoseValue(vaccine) {
    const defaultValue = parseMoney(vaccine?.valorDosePadrao);

    return defaultValue > 0
      ? defaultValue
      : getLastEntryDoseValue(vaccine?.id);
  }

  useEffect(() => {
    if (authorized && canManageUsers) {
      loadManagedUsers();
    }
  }, [authorized, canManageUsers]);

  async function loadManagedUsers() {
    setUsersLoading(true);
    setUserMessage("");

    try {
      const data = await fetchUsersApi();
      setManagedUsers(data.users || []);
      setManagedRoles(
        Array.isArray(data.roles) && data.roles.length > 0
          ? data.roles.map((role) => ({ role: role.role, label: role.label }))
          : ROLE_OPTIONS
      );
      setManagedPermissions(
        Array.isArray(data.permissions) && data.permissions.length > 0
          ? data.permissions
          : PERMISSION_OPTIONS
      );
    } catch (error) {
      setUserMessage(error.message || "Nao foi possivel carregar usuarios.");
    } finally {
      setUsersLoading(false);
    }
  }

  function resetUserForm() {
    setEditingUserId("");
    setUserForm({
      ...emptyUserForm,
      permissions: [...emptyUserForm.permissions],
    });
  }

  function updateUserForm(field, value) {
    if (field === "role") {
      setUserForm({
        ...userForm,
        role: value,
        permissions: getDefaultPermissionsForRole(value),
      });
      return;
    }

    setUserForm({
      ...userForm,
      [field]: value,
    });
  }

  function toggleUserPermission(permission) {
    const normalizedPermission = String(permission || "").trim().toUpperCase();
    const currentPermissions = userForm.permissions || [];
    const nextPermissions = currentPermissions.includes(normalizedPermission)
      ? currentPermissions.filter((item) => item !== normalizedPermission)
      : [...currentPermissions, normalizedPermission];

    setUserForm({
      ...userForm,
      permissions: nextPermissions,
    });
  }

  function startUserEdit(user) {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "FUNCIONARIO",
      permissions: Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : getDefaultPermissionsForRole(user.role),
    });
  }

  async function saveManagedUser() {
    setUserMessage("");

    if (!userForm.name || !userForm.email) {
      setUserMessage("Informe nome e email do usuario.");
      return;
    }

    if (!editingUserId && userForm.password.length < 6) {
      setUserMessage("Informe senha com pelo menos 6 caracteres.");
      return;
    }

    setUsersLoading(true);

    try {
      const payload = {
        ...userForm,
        permissions: userForm.permissions,
      };
      const data = editingUserId
        ? await updateUserApi(editingUserId, payload)
        : await createUserApi(payload);

      setManagedUsers(data.users || []);
      resetUserForm();
      setUserMessage(editingUserId ? "Usuario atualizado." : "Usuario criado.");
    } catch (error) {
      setUserMessage(error.message || "Nao foi possivel salvar o usuario.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function deleteManagedUser(user) {
    const confirmed = window.confirm(`Excluir o usuario ${user.email}?`);

    if (!confirmed) {
      return;
    }

    setUsersLoading(true);
    setUserMessage("");

    try {
      const data = await deleteUserApi(user.id);
      setManagedUsers(data.users || []);
      setUserMessage("Usuario excluido.");
    } catch (error) {
      setUserMessage(error.message || "Nao foi possivel excluir o usuario.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleChiefAccess() {
    setAccessLoading(true);
    setAccessMessage("");

    try {
      await authorizeChiefAccessApi(password);
      sessionStorage.removeItem("chiefAuthorized");
      sessionStorage.setItem(chiefSessionKey, "true");
      setAuthorized(true);
      setPassword("");
    } catch (error) {
      setAccessMessage(error.message || "Senha do administrador incorreta.");
    } finally {
      setAccessLoading(false);
    }
  }

  function lockChiefArea() {
    sessionStorage.removeItem("chiefAuthorized");
    sessionStorage.removeItem(chiefSessionKey);
    setAuthorized(false);
    setPassword("");
  }

  async function saveAdminAccessPassword() {
    setAdminPasswordMessage("");

    if (adminPasswordForm.password.length < 6) {
      setAdminPasswordMessage("Use uma senha com pelo menos 6 caracteres.");
      return;
    }

    if (adminPasswordForm.password !== adminPasswordForm.confirmPassword) {
      setAdminPasswordMessage("As senhas digitadas nao conferem.");
      return;
    }

    setAdminPasswordLoading(true);

    try {
      await updateAdminAccessPasswordApi(adminPasswordForm.password);
      setAdminPasswordForm({
        password: "",
        confirmPassword: "",
      });
      setAdminPasswordMessage("Senha do Administrador e Estoque atualizada.");
    } catch (error) {
      setAdminPasswordMessage(error.message || "Nao foi possivel atualizar a senha.");
    } finally {
      setAdminPasswordLoading(false);
    }
  }

  function approveRequest(requestId) {
    approveVaccineEdit(requestId, getCurrentUserLabel());
  }

  function rejectRequest(requestId) {
    rejectVaccineEdit(requestId, getCurrentUserLabel());
  }

  function approveEntryRequest(requestId) {
    approveEntryValueEdit(requestId, getCurrentUserLabel());
  }

  function rejectEntryRequest(requestId) {
    rejectEntryValueEdit(requestId, getCurrentUserLabel());
  }

  function startVaccineEdit(vaccine) {
    setEditingVaccineId(vaccine.id);
    setVaccineForm({
      codigo: vaccine.codigo || "",
      nome: vaccine.nome || "",
      fabricante: vaccine.fabricante || "",
      dosesPerBottle: vaccine.dosesPerBottle || "",
      valorDosePadrao: vaccine.valorDosePadrao || (getVaccineDoseValue(vaccine) > 0 ? String(getVaccineDoseValue(vaccine)) : ""),
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

        const doseValue = getVaccineDoseValue(vaccine);

        if (doseValue > 0 && !nextForm.valorDose) {
          nextForm.valorDose = String(doseValue);
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

        <Sidebar />

        <div className="flex-1 p-8">
          <div className="max-w-xl rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
            <h1 className="text-4xl font-bold text-zinc-900">
              Ambiente do Administrador
            </h1>

            <p className="mt-2 text-zinc-500">
              Confirme a senha do administrador para liberar aprovacoes e indicadores.
            </p>

            <input
              type="password"
              placeholder="Senha do administrador"
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">

      <Sidebar />

      <div className="flex-1 p-8">

        <div className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-5xl font-bold text-zinc-900">
                Ambiente do Administrador
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

        <section className="mt-6 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px] xl:items-end">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Senha do Administrador e Estoque
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Defina uma senha separada do login dos funcionarios para liberar este ambiente e o estoque.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  type="password"
                  value={adminPasswordForm.password}
                  onChange={(event) => setAdminPasswordForm({
                    ...adminPasswordForm,
                    password: event.target.value,
                  })}
                  placeholder="Nova senha administrativa"
                  className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white"
                />

                <input
                  type="password"
                  value={adminPasswordForm.confirmPassword}
                  onChange={(event) => setAdminPasswordForm({
                    ...adminPasswordForm,
                    confirmPassword: event.target.value,
                  })}
                  placeholder="Confirmar senha"
                  className="rounded-2xl border border-green-100 bg-green-50 p-4 outline-none transition focus:border-green-500 focus:bg-white"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveAdminAccessPassword}
              disabled={adminPasswordLoading}
              className="rounded-2xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {adminPasswordLoading ? "Salvando..." : "Salvar senha"}
            </button>
          </div>

          {adminPasswordMessage && (
            <p className="mt-4 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm font-bold text-green-700">
              {adminPasswordMessage}
            </p>
          )}
        </section>

        {canManageUsers && (
          <section className="mt-6 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">
                  Usuarios e permissoes
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Crie acessos separados para gerente, funcionario e visualizador sem liberar todos os modulos.
                </p>
              </div>

              <button
                type="button"
                onClick={loadManagedUsers}
                disabled={usersLoading}
                className="rounded-2xl bg-zinc-900 px-6 py-3 font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {usersLoading ? "Carregando..." : "Atualizar lista"}
              </button>
            </div>

            <div className="mt-5 grid gap-4 rounded-3xl border border-green-100 bg-green-50 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <input
                  type="text"
                  placeholder="Nome do usuario"
                  value={userForm.name}
                  onChange={(event) => updateUserForm("name", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="email"
                  placeholder="Email"
                  value={userForm.email}
                  onChange={(event) => updateUserForm("email", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <input
                  type="password"
                  placeholder={editingUserId ? "Nova senha opcional" : "Senha"}
                  value={userForm.password}
                  onChange={(event) => updateUserForm("password", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                />

                <select
                  value={userForm.role}
                  onChange={(event) => updateUserForm("role", event.target.value)}
                  className="rounded-2xl border border-green-100 bg-white p-4 outline-none"
                >
                  {managedRoles.map((role) => (
                    <option key={role.role} value={role.role}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {managedPermissions.map((permission) => (
                  <label
                    key={permission.module}
                    className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-semibold text-zinc-700 ring-1 ring-green-100"
                  >
                    <input
                      type="checkbox"
                      checked={(userForm.permissions || []).includes(permission.module)}
                      onChange={() => toggleUserPermission(permission.module)}
                      className="h-4 w-4 accent-green-600"
                    />
                    {permission.label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveManagedUser}
                  disabled={usersLoading}
                  className="rounded-2xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {editingUserId ? "Salvar usuario" : "Criar usuario"}
                </button>

                {editingUserId && (
                  <button
                    type="button"
                    onClick={resetUserForm}
                    className="rounded-2xl bg-white px-6 py-3 font-bold text-green-700 ring-1 ring-green-100 transition hover:bg-green-100"
                  >
                    Cancelar edicao
                  </button>
                )}
              </div>
            </div>

            {userMessage && (
              <p className="mt-4 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm font-bold text-green-700">
                {userMessage}
              </p>
            )}

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-zinc-900">
                <thead>
                  <tr className="border-b border-green-100 text-zinc-500">
                    <th className="pb-4">Nome</th>
                    <th className="pb-4">Email</th>
                    <th className="pb-4">Perfil</th>
                    <th className="pb-4">Permissoes</th>
                    <th className="pb-4">Acoes</th>
                  </tr>
                </thead>

                <tbody>
                  {managedUsers.map((user) => (
                    <tr key={user.id} className="border-b border-green-100 last:border-b-0">
                      <td className="py-4">{user.name}</td>
                      <td>{user.email}</td>
                      <td>{managedRoles.find((role) => role.role === user.role)?.label || user.role}</td>
                      <td className="max-w-xl">
                        <span className="text-sm text-zinc-500">
                          {(user.permissions || []).join(", ")}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startUserEdit(user)}
                            className="rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteManagedUser(user)}
                            disabled={user.id === currentUser.id}
                            className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {managedUsers.length === 0 && (
                <p className="mt-4 rounded-2xl bg-green-50 p-5 text-zinc-500">
                  Nenhum usuario carregado.
                </p>
              )}
            </div>
          </section>
        )}

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

        <section className="mt-8 rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Movimentacoes recentes
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Entradas aumentam o estoque. Baixas de programa, agendamento ou solicitacao reduzem o saldo.
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-zinc-900">
              <thead>
                <tr className="border-b border-green-100 text-zinc-500">
                  <th className="pb-4">Tipo</th>
                  <th className="pb-4">Vacina</th>
                  <th className="pb-4">Doses</th>
                  <th className="pb-4">Lote/Destino</th>
                  <th className="pb-4">Responsavel</th>
                  <th className="pb-4">Data</th>
                  <th className="pb-4">Observacao</th>
                </tr>
              </thead>

              <tbody>
                {recentMovementRows.map((row) => (
                  <tr key={row.id} className="border-b border-green-100 last:border-b-0">
                    <td className={`py-4 font-bold ${row.className}`}>
                      {row.type}
                    </td>
                    <td>{row.vaccineName}</td>
                    <td className={`font-bold ${row.className}`}>
                      {row.type === "Entrada" ? "+" : "-"}
                      {row.doses}
                    </td>
                    <td>{row.detail}</td>
                    <td>{row.responsible}</td>
                    <td>{row.date}</td>
                    <td className="min-w-64 max-w-xs whitespace-normal break-words text-zinc-500">
                      {row.observation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {recentMovementRows.length === 0 && (
              <p className="mt-4 rounded-2xl bg-green-50 p-5 text-zinc-500">
                Nenhuma movimentacao registrada.
              </p>
            )}
          </div>
        </section>

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
            Somente o administrador altera nome, codigo, quantidade de doses, valor padrao por dose e exclusoes.
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
                  placeholder="Quantidade de doses"
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
                  <th className="pb-4">Quantidade de doses</th>
                  <th className="pb-4">Valor padrao</th>
                  <th className="pb-4">Acoes</th>
                </tr>
              </thead>

              <tbody>
                {sortedVaccines.map((vaccine) => (
                  <tr key={vaccine.id} className="border-b border-green-100 last:border-b-0">
                    <td className="py-4">{vaccine.codigo}</td>
                    <td>{vaccine.nome}</td>
                    <td>{vaccine.fabricante || "-"}</td>
                    <td>{vaccine.dosesPerBottle || "-"}</td>
                    <td>{getVaccineDoseValue(vaccine) > 0 ? formatCurrency(getVaccineDoseValue(vaccine)) : "-"}</td>
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
                  {sortedVaccines.map((vaccine) => (
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
                  placeholder="Quantidade de doses"
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
            Aprovacao de edicoes de entrada
          </h2>

          <p className="mt-2 text-zinc-500">
            Confirme alteracoes de valor por dose solicitadas na tela de Entradas.
          </p>

          <div className="mt-6 space-y-4">
            {pendingEntryEditRequests.map((request) => (
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
                      Lote {request.lote || "-"} | Solicitado por {request.requestedBy} em {request.requestedAt}
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-yellow-100">
                        <p className="text-sm font-bold text-zinc-500">Valor atual</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900">
                          {formatCurrency(request.before?.valorDose)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white p-4 ring-1 ring-yellow-100">
                        <p className="text-sm font-bold text-zinc-500">Novo valor</p>
                        <p className="mt-1 text-xl font-bold text-green-700">
                          {formatCurrency(request.after?.valorDose)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white p-4 ring-1 ring-yellow-100">
                        <p className="text-sm font-bold text-zinc-500">Novo total</p>
                        <p className="mt-1 text-xl font-bold text-green-700">
                          {formatCurrency(request.after?.valorTotal)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 font-semibold text-yellow-800">
                      {request.reason}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => approveEntryRequest(request.id)}
                      className="rounded-2xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                    >
                      Aprovar
                    </button>

                    <button
                      type="button"
                      onClick={() => rejectEntryRequest(request.id)}
                      className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {pendingEntryEditRequests.length === 0 && (
              <p className="rounded-2xl bg-green-50 p-5 text-zinc-500">
                Nenhuma edicao de entrada pendente.
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
                    <td>
                      {getAuditActionText(item)}
                    </td>
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
