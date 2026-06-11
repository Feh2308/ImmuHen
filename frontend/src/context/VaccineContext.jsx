import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  createStockLowAlertApi,
  fetchSharedStateApi,
  saveInventoryStateApi,
} from "../services/vacitechApi";
import {
  TENANT_CHANGED_EVENT,
  getCurrentTenantId,
  readJson,
  writeJson,
} from "../utils/vacitechStorage";

const VaccineContext =
  createContext();

function getStoredItems(key) {
  const value = readJson(key, []);

  return Array.isArray(value)
    ? value
    : [];
}

function getStoredObject(key) {
  const value = readJson(key, {});

  return value && !Array.isArray(value)
    ? value
    : {};
}

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function getStockFromLists(entries, outputs, vaccineId) {
  const entrada = entries
    .filter((entry) => String(entry.vaccineId) === String(vaccineId))
    .reduce((total, item) => total + Number(item.doses || 0), 0);

  const saida = outputs
    .filter((output) => String(output.vaccineId) === String(vaccineId))
    .reduce((total, item) => total + Number(item.doses || 0), 0);

  return entrada - saida;
}

function getAlertHistory() {
  return getStoredObject("stockAlertHistory");
}

function writeAlertHistory(history) {
  writeJson("stockAlertHistory", history, { silent: true });
}

export function VaccineProvider({
  children,
}) {
  const [tenantId, setTenantId] = useState(getCurrentTenantId);

  const [vaccines, setVaccines] =
    useState(() => getStoredItems("vaccines"));

  const [entries, setEntries] =
    useState(() => getStoredItems("entries"));

  const [outputs, setOutputs] =
    useState(() => getStoredItems("outputs"));

  const [stockAlertLevels, setStockAlertLevels] =
    useState(() => getStoredObject("stockAlertLevels"));

  const [vaccineEditRequests, setVaccineEditRequests] =
    useState(() => getStoredItems("vaccineEditRequests"));

  const [vaccineAuditLog, setVaccineAuditLog] =
    useState(() => getStoredItems("vaccineAuditLog"));

  useEffect(() => {
    let active = true;

    if (!tenantId || !localStorage.getItem("token")) {
      return () => {
        active = false;
      };
    }

    fetchSharedStateApi()
      .then((state) => {
        if (!active) {
          return;
        }

        if (Array.isArray(state.vaccines) && (state.vaccines.length > 0 || getStoredItems("vaccines").length === 0)) {
          setVaccines(state.vaccines);
        }

        if (Array.isArray(state.entries) && (state.entries.length > 0 || getStoredItems("entries").length === 0)) {
          setEntries(state.entries);
        }

        if (Array.isArray(state.outputs) && (state.outputs.length > 0 || getStoredItems("outputs").length === 0)) {
          setOutputs(state.outputs);
        }

        if (
          state.stockAlertLevels &&
          typeof state.stockAlertLevels === "object" &&
          !Array.isArray(state.stockAlertLevels) &&
          (Object.keys(state.stockAlertLevels).length > 0 || Object.keys(getStoredObject("stockAlertLevels")).length === 0)
        ) {
          setStockAlertLevels(state.stockAlertLevels);
        }

        if (Array.isArray(state.vaccineEditRequests) && (state.vaccineEditRequests.length > 0 || getStoredItems("vaccineEditRequests").length === 0)) {
          setVaccineEditRequests(state.vaccineEditRequests);
        }

        if (Array.isArray(state.vaccineAuditLog) && (state.vaccineAuditLog.length > 0 || getStoredItems("vaccineAuditLog").length === 0)) {
          setVaccineAuditLog(state.vaccineAuditLog);
        }
      })
      .catch((error) => {
        console.log(error);
      });

    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    function loadTenantData() {
      setTenantId(getCurrentTenantId());
      setVaccines(getStoredItems("vaccines"));
      setEntries(getStoredItems("entries"));
      setOutputs(getStoredItems("outputs"));
      setStockAlertLevels(getStoredObject("stockAlertLevels"));
      setVaccineEditRequests(getStoredItems("vaccineEditRequests"));
      setVaccineAuditLog(getStoredItems("vaccineAuditLog"));
    }

    function loadTenantDataFromStorage(event) {
      if (
        !event.key ||
        event.key === "currentTenantId" ||
        event.key === "token" ||
        event.key === "user"
      ) {
        loadTenantData();
      }
    }

    window.addEventListener(TENANT_CHANGED_EVENT, loadTenantData);
    window.addEventListener("storage", loadTenantDataFromStorage);

    return () => {
      window.removeEventListener(TENANT_CHANGED_EVENT, loadTenantData);
      window.removeEventListener("storage", loadTenantDataFromStorage);
    };
  }, []);

  useEffect(() => {

    writeJson(
      "vaccines",
      vaccines,
      { silent: true }
    );

  }, [vaccines, tenantId]);

  useEffect(() => {

    writeJson(
      "entries",
      entries,
      { silent: true }
    );

  }, [entries, tenantId]);

  useEffect(() => {

    writeJson(
      "outputs",
      outputs,
      { silent: true }
    );

  }, [outputs, tenantId]);

  useEffect(() => {
    writeJson(
      "stockAlertLevels",
      stockAlertLevels,
      { silent: true }
    );
  }, [stockAlertLevels, tenantId]);

  useEffect(() => {
    writeJson(
      "vaccineEditRequests",
      vaccineEditRequests,
      { silent: true }
    );
  }, [vaccineEditRequests, tenantId]);

  useEffect(() => {
    writeJson(
      "vaccineAuditLog",
      vaccineAuditLog,
      { silent: true }
    );
  }, [vaccineAuditLog, tenantId]);

  useEffect(() => {
    if (!tenantId || !localStorage.getItem("token")) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      saveInventoryStateApi({
        vaccines,
        entries,
        outputs,
        stockAlertLevels,
        vaccineEditRequests,
        vaccineAuditLog,
      }).catch((error) => {
        console.log(error);
      });
    }, 600);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    entries,
    outputs,
    stockAlertLevels,
    tenantId,
    vaccineAuditLog,
    vaccineEditRequests,
    vaccines,
  ]);

  function getVaccineName(id, fallback = "Vacina") {
    const vaccine = vaccines.find((item) => String(item.id) === String(id));

    return vaccine?.nome || fallback;
  }

  function getStockAlertLevel(id) {
    return Number(stockAlertLevels[String(id)] || 0);
  }

  function setStockAlertLevel(id, value) {
    const parsed = parseQuantity(value);

    setStockAlertLevels((currentLevels) => {
      const nextLevels = { ...currentLevels };

      if (parsed > 0) {
        nextLevels[String(id)] = parsed;
      } else {
        delete nextLevels[String(id)];
      }

      return nextLevels;
    });
  }

  function clearStockAlertIfRecovered(vaccineId, currentStock, minimumStock) {
    if (!minimumStock || currentStock <= minimumStock) {
      return;
    }

    const history = getAlertHistory();
    const item = history[String(vaccineId)];

    if (!item?.active) {
      return;
    }

    history[String(vaccineId)] = {
      ...item,
      active: false,
      recoveredAt: new Date().toISOString(),
      recoveredStock: currentStock,
    };
    writeAlertHistory(history);
  }

  function notifyLowStockIfNeeded({
    vaccineId,
    vaccineName,
    currentStock,
    minimumStock,
    source,
  }) {
    if (!vaccineId || !minimumStock || currentStock > minimumStock) {
      return;
    }

    const history = getAlertHistory();
    const currentHistory = history[String(vaccineId)];

    if (
      currentHistory?.active &&
      Number(currentHistory.minimumStock || 0) === Number(minimumStock)
    ) {
      return;
    }

    const alertId = `low-stock-${vaccineId}-${Date.now()}`;
    history[String(vaccineId)] = {
      active: true,
      alertId,
      currentStock,
      minimumStock,
      alertedAt: new Date().toISOString(),
    };
    writeAlertHistory(history);

    createStockLowAlertApi({
      alertId,
      vaccineId,
      vaccineName,
      currentStock,
      minimumStock,
      source,
    }).catch((error) => {
      console.log(error);
    });
  }

  function addVaccine(vaccine) {

    setVaccines((currentVaccines) => [
      ...currentVaccines,
      vaccine,
    ]);
  }

  function removeVaccine(id) {

    const filtered =
      vaccines.filter(
        (v) => v.id !== id
      );

    setVaccines(filtered);
  }

  function updateVaccine(id, updates) {
    setVaccines((currentVaccines) =>
      currentVaccines.map((vaccine) => (
        String(vaccine.id) === String(id)
          ? {
              ...vaccine,
              ...updates,
              id: vaccine.id,
              updatedAt: new Date().toISOString(),
            }
          : vaccine
      ))
    );

    setEntries((currentEntries) => currentEntries.map((entry) => (
      String(entry.vaccineId) === String(id)
        ? {
            ...entry,
            vacina: updates.nome || entry.vacina,
            codigo: updates.codigo || entry.codigo,
          }
        : entry
    )));

    setOutputs((currentOutputs) => currentOutputs.map((output) => (
      String(output.vaccineId) === String(id)
        ? {
            ...output,
            vacina: updates.nome || output.vacina,
            codigo: updates.codigo || output.codigo,
          }
        : output
    )));
  }

  function requestVaccineEdit({ vaccineId, changes, reason, requestedBy }) {
    const vaccine = vaccines.find((item) => String(item.id) === String(vaccineId));

    if (!vaccine) {
      throw new Error("Vacina nao encontrada.");
    }

    const cleanReason = String(reason || "").trim();

    if (!cleanReason) {
      throw new Error("Informe a justificativa da edicao.");
    }

    const after = {
      codigo: String(changes.codigo || "").trim(),
      nome: String(changes.nome || "").trim(),
      fabricante: String(changes.fabricante || "").trim(),
      observacoes: String(changes.observacoes || "").trim(),
      dosesPerBottle: String(changes.dosesPerBottle || "").trim(),
      valorDosePadrao: String(changes.valorDosePadrao || "").trim(),
    };

    const before = {
      codigo: vaccine.codigo || "",
      nome: vaccine.nome || "",
      fabricante: vaccine.fabricante || "",
      observacoes: vaccine.observacoes || "",
      dosesPerBottle: vaccine.dosesPerBottle || "",
      valorDosePadrao: vaccine.valorDosePadrao || "",
    };

    const changedFields = Object.keys(after).filter((field) => (
      String(after[field] || "") !== String(before[field] || "")
    ));

    if (changedFields.length === 0) {
      throw new Error("Altere pelo menos um campo da vacina.");
    }

    const request = {
      id: `vaccine-edit-${Date.now()}`,
      vaccineId,
      vaccineName: before.nome || "Vacina",
      before,
      after,
      changedFields,
      reason: cleanReason,
      requestedBy: requestedBy || "Funcionario",
      requestedAt: new Date().toLocaleString("pt-BR"),
      status: "pending",
    };

    setVaccineEditRequests((currentRequests) => [
      request,
      ...currentRequests,
    ]);

    return request;
  }

  function approveVaccineEdit(requestId, approvedBy = "Administrador") {
    const request = vaccineEditRequests.find((item) => String(item.id) === String(requestId));

    if (!request || request.status !== "pending") {
      return;
    }

    updateVaccine(request.vaccineId, request.after);

    const approvedAt = new Date().toLocaleString("pt-BR");

    setVaccineEditRequests((currentRequests) =>
      currentRequests.map((item) => (
        String(item.id) === String(requestId)
          ? {
              ...item,
              status: "approved",
              approvedBy,
              approvedAt,
            }
          : item
      ))
    );

    setVaccineAuditLog((currentLog) => [
      {
        id: `audit-${Date.now()}`,
        type: "vaccine-edit-approved",
        vaccineId: request.vaccineId,
        vaccineName: request.after.nome || request.vaccineName,
        reason: request.reason,
        changedFields: request.changedFields,
        requestedBy: request.requestedBy,
        approvedBy,
        createdAt: approvedAt,
      },
      ...currentLog,
    ]);
  }

  function rejectVaccineEdit(requestId, rejectedBy = "Administrador") {
    const rejectedAt = new Date().toLocaleString("pt-BR");
    const request = vaccineEditRequests.find((item) => String(item.id) === String(requestId));

    setVaccineEditRequests((currentRequests) =>
      currentRequests.map((item) => (
        String(item.id) === String(requestId)
          ? {
              ...item,
              status: "rejected",
              rejectedBy,
              rejectedAt,
            }
          : item
      ))
    );

    if (request) {
      setVaccineAuditLog((currentLog) => [
        {
          id: `audit-${Date.now()}`,
          type: "vaccine-edit-rejected",
          vaccineId: request.vaccineId,
          vaccineName: request.vaccineName,
          reason: request.reason,
          changedFields: request.changedFields,
          requestedBy: request.requestedBy,
          rejectedBy,
          createdAt: rejectedAt,
        },
        ...currentLog,
      ]);
    }
  }

  function addEntry(entry) {
    const threshold = parseQuantity(entry.lowStockAlertQuantity);

    if (threshold > 0) {
      setStockAlertLevel(entry.vaccineId, threshold);
    }

    setEntries((currentEntries) => {
      const nextEntries = [
        ...currentEntries,
        entry,
      ];
      const minimumStock = threshold || getStockAlertLevel(entry.vaccineId);
      const currentStock = getStockFromLists(nextEntries, outputs, entry.vaccineId);

      clearStockAlertIfRecovered(entry.vaccineId, currentStock, minimumStock);
      notifyLowStockIfNeeded({
        vaccineId: entry.vaccineId,
        vaccineName: entry.vacina || getVaccineName(entry.vaccineId),
        currentStock,
        minimumStock,
        source: "ENTRADA",
      });

      return nextEntries;
    });
  }

  function updateEntry(id, updates) {
    const threshold = parseQuantity(updates.lowStockAlertQuantity);

    if (updates.vaccineId && threshold > 0) {
      setStockAlertLevel(updates.vaccineId, threshold);
    }

    setEntries((currentEntries) => currentEntries.map((entry) => (
      String(entry.id) === String(id)
        ? {
            ...entry,
            ...updates,
            id: entry.id,
            updatedAt: new Date().toISOString(),
          }
        : entry
    )));
  }

  function removeEntry(id) {
    setEntries((currentEntries) => currentEntries.filter((entry) => (
      String(entry.id) !== String(id)
    )));
  }

  function addOutput(output) {

    setOutputs((currentOutputs) => {
      const nextOutputs = [
        ...currentOutputs,
        output,
      ];
      const minimumStock = getStockAlertLevel(output.vaccineId);
      const currentStock = getStockFromLists(entries, nextOutputs, output.vaccineId);

      notifyLowStockIfNeeded({
        vaccineId: output.vaccineId,
        vaccineName: output.vacina || getVaccineName(output.vaccineId),
        currentStock,
        minimumStock,
        source: output.source || "BAIXA",
      });

      return nextOutputs;
    });
  }

  function calculateStock(id) {
    return getStockFromLists(entries, outputs, id);
  }

  return (
    <VaccineContext.Provider
      value={{
        vaccines,
        entries,
        outputs,
        vaccineEditRequests,
        vaccineAuditLog,

        addVaccine,
        removeVaccine,
        updateVaccine,
        requestVaccineEdit,
        approveVaccineEdit,
        rejectVaccineEdit,

        addEntry,
        updateEntry,
        removeEntry,
        addOutput,

        calculateStock,
        getStockAlertLevel,
        setStockAlertLevel,
        stockAlertLevels,

      }}
    >
      {children}
    </VaccineContext.Provider>
  );
}

export function useVaccines() {
  return useContext(
    VaccineContext
  );
}   
