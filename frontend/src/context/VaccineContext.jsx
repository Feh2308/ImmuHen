import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { createStockLowAlertApi } from "../services/vacitechApi";

const VaccineContext =
  createContext();

function getStoredItems(key) {
  try {
    const storage =
      localStorage.getItem(key);

    return storage
      ? JSON.parse(storage)
      : [];
  } catch (error) {
    console.log(error);
    return [];
  }
}

function getStoredObject(key) {
  const value = getStoredItems(key);

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
  localStorage.setItem("stockAlertHistory", JSON.stringify(history));
}

export function VaccineProvider({
  children,
}) {

  const [vaccines, setVaccines] =
    useState(() => getStoredItems("vaccines"));

  const [entries, setEntries] =
    useState(() => getStoredItems("entries"));

  const [outputs, setOutputs] =
    useState(() => getStoredItems("outputs"));

  const [stockAlertLevels, setStockAlertLevels] =
    useState(() => getStoredObject("stockAlertLevels"));

  useEffect(() => {

    localStorage.setItem(
      "vaccines",
      JSON.stringify(vaccines)
    );

  }, [vaccines]);

  useEffect(() => {

    localStorage.setItem(
      "entries",
      JSON.stringify(entries)
    );

  }, [entries]);

  useEffect(() => {

    localStorage.setItem(
      "outputs",
      JSON.stringify(outputs)
    );

  }, [outputs]);

  useEffect(() => {
    localStorage.setItem(
      "stockAlertLevels",
      JSON.stringify(stockAlertLevels)
    );
  }, [stockAlertLevels]);

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

        addVaccine,
        removeVaccine,

        addEntry,
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
