import Sidebar from "../components/Sidebar";
import { useEffect, useMemo, useState } from "react";
import {
  appendVaccinatorNotification,
  formatPeriod,
  getFarmProfile,
  getProfileRanches,
  getStatusClass,
  normalizeRequestStatus,
  readJson,
  writeJson,
} from "../utils/vacitechStorage";
import {
  createScheduleApi,
  deleteScheduleApi,
  fetchBirdLotsApi,
  fetchSharedStateApi,
  saveBirdLotApi,
  updateRequestVaccinesApi,
} from "../services/vacitechApi";
import { useVaccines } from "../context/VaccineContext";
import { sortVaccinesByCode } from "../utils/vaccineSort";

const WEEKDAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terca-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sabado" },
];

const APPLICATION_METHODS = [
  "Sub-cut",
  "Ocular",
  "Intram-Peito",
  "OCULAR",
  "Membrana-Asa",
  "Spray",
  "Intram-Peito-0,5cc",
];

const MAX_PROGRAM_VACCINES_PER_DAY = 4;

const PROGRAM_120_DAY_TEMPLATE = [
  { day: 1, label: "Nasc.", milestone: true },
  { day: 7, label: "Ma5+clone30 debicagem Gumboro", defaultMethod: "Ocular", hasDebicagem: "SIM" },
  { day: 13, label: "Rhino Cv / Gumboro", defaultMethod: "Ocular" },
  { day: 20, label: "Ma5 / Gumboro", defaultMethod: "Ocular" },
  { day: 27, label: "MG", defaultMethod: "Spray" },
  { day: 45, label: "Cor-4 1/2 dose / 9R 0,2", defaultMethod: "Sub-cut" },
  { day: 55, label: "Ma5+clone30", defaultMethod: "Ocular" },
  { day: 60, label: "Bouba / encefalo (Poxine-Zoetis)", defaultMethod: "Membrana-Asa" },
  { day: 70, label: "Repasse", defaultMethod: "Ocular" },
  { day: 85, label: "MG", defaultMethod: "Spray" },
  { day: 95, label: "Rhino Cv", defaultMethod: "Ocular" },
  { day: 105, label: "Cor-4", defaultMethod: "Sub-cut" },
  { day: 105, label: "SG", defaultMethod: "Sub-cut" },
  { day: 110, label: "Ma5+clone30", defaultMethod: "Ocular" },
  { day: 120, label: "Transferencia", milestone: true },
];

function getStoredSchedules() {
  return readJson("schedules", []);
}

function getStoredVaccinators() {
  return readJson("vaccinators", []);
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));

  return toDateInputValue(date);
}

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "-";
  }

  return parsed.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

function getUsageFlaskCc(usage) {
  return usage.flaskCc ?? usage.ccPerFlask ?? usage.flasks ?? "";
}

function getUsageDosePerBirdCc(usage) {
  return usage.dosePerBirdCc ?? usage.ccPerBird ?? "";
}

function getUsageBirdsVaccinated(usage) {
  return usage.birdsVaccinated ?? usage.avesVacinadas ?? "";
}

function calculateBirdsPerFlask(flaskCc, dosePerBirdCc) {
  const flask = parseQuantity(flaskCc);
  const dose = parseQuantity(dosePerBirdCc);

  if (flask <= 0 || dose <= 0) {
    return 0;
  }

  return Math.floor(flask / dose);
}

function calculateRequiredCc(birdsVaccinated, dosePerBirdCc) {
  const birds = parseQuantity(birdsVaccinated);
  const dose = parseQuantity(dosePerBirdCc);

  if (birds <= 0 || dose <= 0) {
    return 0;
  }

  return Number((birds * dose).toFixed(2));
}

function calculateRequiredFlasks(flaskCc, birdsVaccinated, dosePerBirdCc) {
  const flask = parseQuantity(flaskCc);
  const requiredCc = calculateRequiredCc(birdsVaccinated, dosePerBirdCc);

  if (flask <= 0 || requiredCc <= 0) {
    return 0;
  }

  return Math.ceil(requiredCc / flask);
}

function getUsageRequiredCc(usage) {
  return parseQuantity(usage.requiredCc ?? usage.totalCc) || calculateRequiredCc(
    getUsageBirdsVaccinated(usage),
    getUsageDosePerBirdCc(usage)
  );
}

function getUsageRequiredFlasks(usage) {
  return parseQuantity(usage.requiredFlasks ?? usage.totalFrascos) || calculateRequiredFlasks(
    getUsageFlaskCc(usage),
    getUsageBirdsVaccinated(usage),
    getUsageDosePerBirdCc(usage)
  );
}

function getUsageBirdsPerFlask(usage) {
  return calculateBirdsPerFlask(
    getUsageFlaskCc(usage),
    getUsageDosePerBirdCc(usage)
  );
}

function getUsageMetrics(usage) {
  const flaskCc = String(getUsageFlaskCc(usage) || "").trim();
  const dosePerBirdCc = String(getUsageDosePerBirdCc(usage) || "").trim();
  const birdsPerFlask = calculateBirdsPerFlask(flaskCc, dosePerBirdCc);
  const birdsVaccinated = String(getUsageBirdsVaccinated(usage) || "").trim();
  const requiredCc = getUsageRequiredCc(usage);
  const requiredFlasks = getUsageRequiredFlasks(usage);

  return {
    flaskCc,
    dosePerBirdCc,
    birdsVaccinated,
    birdsPerFlask,
    requiredCc,
    requiredFlasks,
    flasks: flaskCc,
  };
}

function formatUsageMetrics(usage) {
  const metrics = getUsageMetrics(usage);
  const parts = [];

  if (metrics.flaskCc) {
    parts.push(`${metrics.flaskCc} cc/frasco`);
  }

  if (metrics.dosePerBirdCc) {
    parts.push(`${metrics.dosePerBirdCc} cc/ave`);
  }

  if (metrics.birdsVaccinated) {
    parts.push(`${formatQuantity(metrics.birdsVaccinated)} aves vacinadas`);
  }

  if (metrics.requiredFlasks > 0) {
    parts.push(`${formatQuantity(metrics.requiredFlasks)} frasco(s) necessarios`);
  }

  if (metrics.birdsPerFlask > 0) {
    parts.push(`${formatQuantity(metrics.birdsPerFlask)} aves/frasco`);
  }

  return parts.join(" | ");
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getLaborCost(record) {
  const directCost = parseQuantity(record?.laborCost);

  if (directCost > 0) {
    return directCost;
  }

  const usageCost = getUsagesLaborCost(record?.vaccineUsages || []);

  if (usageCost > 0) {
    return usageCost;
  }

  return parseQuantity(record?.programLaborCost ?? 0);
}

function getUsageLaborCost(usage) {
  const calculatedCost = parseQuantity(usage?.calculatedLaborCost);

  if (calculatedCost > 0) {
    return calculatedCost;
  }

  const costPerThousandBirds = getUsageLaborRate(usage);
  const birdsVaccinated = parseQuantity(getUsageBirdsVaccinated(usage));

  if (costPerThousandBirds <= 0) {
    return 0;
  }

  if (birdsVaccinated <= 0) {
    return 0;
  }

  return Number(((birdsVaccinated / 1000) * costPerThousandBirds).toFixed(2));
}

function getUsageLaborRate(usage) {
  return parseQuantity(usage?.laborCostPerThousandBirds ?? usage?.laborCost ?? usage?.maoDeObra ?? 0);
}

function getUsagesLaborCost(usages = [], multiplier = 1) {
  return usages.reduce((total, usage) => (
    total + (getUsageLaborCost(usage) * multiplier)
  ), 0);
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

  return String(first?.birdLotName || first?.farmName || "").localeCompare(
    String(second?.birdLotName || second?.farmName || ""),
    "pt-BR"
  );
}

function formatDate(date) {
  if (!date) {
    return "-";
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function hasDateArrived(dateValue) {
  if (!dateValue) {
    return false;
  }

  return String(dateValue) <= toDateInputValue(new Date());
}

function addWeeks(dateValue, weeks) {
  return addDays(dateValue, Number(weeks || 0) * 7);
}

function getDatesForWeekdayInMonth(monthValue, weekdayValue) {
  if (!monthValue) {
    return [];
  }

  const [year, month] = monthValue.split("-").map(Number);
  const targetWeekday = Number(weekdayValue);
  const date = new Date(year, month - 1, 1);
  const dates = [];

  while (date.getMonth() === month - 1) {
    if (date.getDay() === targetWeekday) {
      dates.push(toDateInputValue(date));
    }

    date.setDate(date.getDate() + 1);
  }

  return dates;
}

function createProgramUsage(rowId, defaultMethod = "Ocular") {
  return {
    id: `${rowId}-vacina-${Date.now()}-${Math.random()}`,
    vaccineId: "",
    doses: "",
    flaskCc: "",
    dosePerBirdCc: "",
    birdsVaccinated: "",
    laborCost: "",
    applicationMethod: defaultMethod,
  };
}

function createProgramRows(programStartDate) {
  return PROGRAM_120_DAY_TEMPLATE.map((item, index) => ({
    id: `programa-${item.day}-${index}`,
    programDay: item.day,
    suggestedName: item.label,
    milestone: Boolean(item.milestone),
    hasDebicagem: item.hasDebicagem || "NAO",
    vaccinationStartDate: programStartDate ? addDays(programStartDate, item.day - 1) : "",
    vaccinationEndDate: programStartDate ? addDays(programStartDate, item.day - 1) : "",
    defaultMethod: item.defaultMethod || "Ocular",
    usages: item.milestone
      ? []
      : [createProgramUsage(`programa-${item.day}-${index}`, item.defaultMethod || "Ocular")],
  }));
}

function Schedule() {
  const {
    vaccines,
    entries,
    calculateStock,
  } = useVaccines();
  const [schedules, setSchedules] = useState(getStoredSchedules);
  const [vaccinators, setVaccinators] = useState(getStoredVaccinators);
  const [birdLots, setBirdLots] = useState([]);
  const [notifications, setNotifications] = useState(() => readJson("vaccinatorNotifications", []));
  const [showForm, setShowForm] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [vaccineUsages, setVaccineUsages] = useState([
    { id: "uso-1", vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" },
  ]);
  const [programRows, setProgramRows] = useState(() => createProgramRows(""));
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [editingUsages, setEditingUsages] = useState([]);
  const [transferForms, setTransferForms] = useState({});
  const [form, setForm] = useState({
    scheduleMode: "PROGRAMA_120_DIAS",
    vaccinatorId: "",
    birdLotId: "",
    programStartDate: "",
    hasDebicagem: "NAO",
    vaccinationStartDate: "",
    vaccinationEndDate: "",
    laborCost: "",
    monthlyMonth: "",
    monthlyWeekday: "1",
    monthlyVaccinationDays: "1",
    observations: "",
  });

  const activeVaccinators = vaccinators.filter(
    (vaccinator) => vaccinator.status !== "INATIVO"
  );
  const sortedVaccines = useMemo(() => sortVaccinesByCode(vaccines), [vaccines]);
  const ranchOptions = getProfileRanches(getFarmProfile());
  const availableRanches = ranchOptions.length
    ? ranchOptions
    : [{ id: "rancho-pinteiro", name: "Pinteiro" }];
  const activeSchedules = useMemo(() => (
    schedules
      .filter((schedule) => {
        const status = normalizeRequestStatus(schedule.status);

        return status !== "CONCLUIDA" && status !== "RECUSADA";
      })
      .sort(sortVaccinationRecords)
  ), [schedules]);
  const groupedActiveSchedules = useMemo(() => {
    const groups = new Map();

    activeSchedules.forEach((schedule) => {
      const key = schedule.programId ||
        (schedule.birdLotId ? `lote-${schedule.birdLotId}` : `avulso-${getRecordDateValue(schedule)}`);
      const current = groups.get(key) || {
        id: key,
        title: schedule.birdLotName || schedule.farmName || "Programa avulso",
        subtitle: schedule.programId
          ? `Programa ${schedule.programId}`
          : schedule.birdLotId
            ? "Programa vinculado ao lote"
            : "Programa avulso",
        startDate: schedule.programStartDate || schedule.vaccinationStartDate || schedule.date || "",
        schedules: [],
      };

      current.schedules.push(schedule);
      groups.set(key, current);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        schedules: group.schedules.sort(sortVaccinationRecords),
      }))
      .sort((first, second) => String(first.startDate || "").localeCompare(String(second.startDate || "")));
  }, [activeSchedules]);
  const scheduleCalendarDays = useMemo(() => {
    const groups = new Map();

    activeSchedules.forEach((schedule) => {
      const date = schedule.vaccinationStartDate || schedule.date || "sem-data";
      const current = groups.get(date) || {
        date,
        label: date === "sem-data" ? "Sem data" : formatDate(date),
        schedules: [],
      };

      current.schedules.push(schedule);
      groups.set(date, current);
    });

    return Array.from(groups.values())
      .sort((first, second) => String(first.date).localeCompare(String(second.date)));
  }, [activeSchedules]);
  const overdueNotifications = notifications
    .filter((notification) => notification.type === "OVERDUE_VACCINATION")
    .slice(-6)
    .reverse();
  const programTransferGroups = useMemo(() => {
    const groups = new Map();

    schedules.forEach((schedule) => {
      const status = normalizeRequestStatus(schedule.status);

      if (status === "CONCLUIDA" || status === "RECUSADA") {
        return;
      }

      if (!schedule.programId || !schedule.birdLotId || !schedule.programEndDate) {
        return;
      }

      const current = groups.get(schedule.programId) || {
        programId: schedule.programId,
        farmName: schedule.farmName,
        birdLotId: schedule.birdLotId,
        birdLotName: schedule.birdLotName,
        programStartDate: schedule.programStartDate,
        programEndDate: schedule.programEndDate,
        productionEndDate: schedule.productionEndDate,
      };

      groups.set(schedule.programId, current);
    });

    return Array.from(groups.values())
      .filter((program) => {
        const lot = birdLots.find((item) => String(item.id) === String(program.birdLotId));
        const alreadyTransferred = String(lot?.observacoes || "").includes(program.programId);

        return hasDateArrived(program.programEndDate) && !alreadyTransferred;
      })
      .sort((first, second) => (
        String(first.programEndDate || "").localeCompare(String(second.programEndDate || ""))
      ));
  }, [birdLots, schedules]);

  const programLotSummaries = useMemo(() => {
    const groups = new Map();

    schedules.forEach((schedule) => {
      const status = normalizeRequestStatus(schedule.status);

      if (status === "RECUSADA" || (!schedule.programId && !schedule.birdLotId)) {
        return;
      }

      const key = schedule.programId || `lote-${schedule.birdLotId || schedule.id}`;
      const current = groups.get(key) || {
        id: key,
        programId: schedule.programId || "",
        birdLotId: schedule.birdLotId || "",
        birdLotName: schedule.birdLotName || "Lote nao informado",
        programStartDate: schedule.programStartDate || schedule.vaccinationStartDate || "",
        programEndDate: schedule.programEndDate || schedule.vaccinationEndDate || "",
        totalDoses: 0,
        vaccineCost: 0,
        laborCost: 0,
        vaccines: {},
      };

      const usages = Array.isArray(schedule.vaccineUsages) ? schedule.vaccineUsages : [];

      current.totalDoses += getScheduleTotalDoses(schedule);
      current.vaccineCost += getScheduleVaccineCost(schedule);
      current.laborCost += getLaborCost(schedule);

      usages.forEach((usage) => {
        const name = usage.vacina || getVaccine(usage.vaccineId)?.nome || "Vacina";
        const vaccineKey = usage.vaccineId || name;

        current.vaccines[vaccineKey] = current.vaccines[vaccineKey] || {
          name,
          doses: 0,
        };
        current.vaccines[vaccineKey].doses += Number(usage.doses || 0);
      });

      groups.set(key, current);
    });

    return Array.from(groups.values())
      .filter((summary) => summary.totalDoses > 0)
      .map((summary) => ({
        ...summary,
        totalCost: summary.vaccineCost + summary.laborCost,
        vaccines: Object.values(summary.vaccines),
      }))
      .sort((first, second) => String(second.programStartDate || "").localeCompare(String(first.programStartDate || "")));
  }, [entries, schedules, vaccines]);

  useEffect(() => {
    writeJson("schedules", schedules);
  }, [schedules]);

  useEffect(() => {
    async function loadSharedData() {
      try {
        const state = await fetchSharedStateApi();

        setSchedules(state.schedules || []);
        setVaccinators(state.vaccinators || []);
        setNotifications(state.notifications || []);
        writeJson("requests", state.requests || []);
        writeJson("vaccinatorNotifications", state.notifications || []);
      } catch (error) {
        console.log(error);
      }
    }

    loadSharedData();
  }, []);

  useEffect(() => {
    async function loadBirdLots() {
      try {
        const data = await fetchBirdLotsApi();

        setBirdLots(Array.isArray(data) ? data : []);
      } catch (error) {
        console.log(error);
      }
    }

    loadBirdLots();
  }, []);

  useEffect(() => {
    function refreshVaccinators() {
      setVaccinators(getStoredVaccinators());
    }

    window.addEventListener("storage", refreshVaccinators);
    window.addEventListener("vacitech-storage", refreshVaccinators);

    return () => {
      window.removeEventListener("storage", refreshVaccinators);
      window.removeEventListener("vacitech-storage", refreshVaccinators);
    };
  }, []);

  function updateForm(field, value) {
    const nextForm = {
      ...form,
      [field]: value,
    };

    if (field === "birdLotId") {
      const selectedLot = birdLots.find((lot) => String(lot.id) === String(value));

      if (selectedLot?.dataAlojamento) {
        nextForm.programStartDate = selectedLot.dataAlojamento;
        setProgramRows(createProgramRows(selectedLot.dataAlojamento));
      }
    }

    if (field === "programStartDate") {
      setProgramRows(createProgramRows(value));
    }

    setForm(nextForm);
  }

  function resetForm() {
    setForm({
      scheduleMode: "PROGRAMA_120_DIAS",
      vaccinatorId: "",
      birdLotId: "",
      programStartDate: "",
      hasDebicagem: "NAO",
      vaccinationStartDate: "",
      vaccinationEndDate: "",
      laborCost: "",
      monthlyMonth: "",
      monthlyWeekday: "1",
      monthlyVaccinationDays: "1",
      observations: "",
    });
    setVaccineUsages([
      { id: `uso-${Date.now()}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" },
    ]);
    setProgramRows(createProgramRows(""));
  }

  function updateVaccineUsage(id, field, value) {
    setVaccineUsages((currentUsages) => currentUsages.map((usage) => (
      usage.id === id
        ? { ...usage, [field]: value }
        : usage
    )));
  }

  function addVaccineUsage() {
    setVaccineUsages((currentUsages) => [
      ...currentUsages,
      { id: `uso-${Date.now()}-${currentUsages.length}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" },
    ]);
  }

  function removeVaccineUsage(id) {
    setVaccineUsages((currentUsages) => (
      currentUsages.length === 1
        ? [{ id: `uso-${Date.now()}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" }]
        : currentUsages.filter((usage) => usage.id !== id)
    ));
  }

  function updateProgramRow(id, field, value) {
    setProgramRows((currentRows) => currentRows.map((row) => (
      row.id === id
        ? { ...row, [field]: value }
        : row
    )));
  }

  function updateProgramDay(id, value) {
    setProgramRows((currentRows) => currentRows.map((row) => {
      if (row.id !== id) {
        return row;
      }

      const nextDay = Number(value || 0);

      return {
        ...row,
        programDay: value,
        vaccinationStartDate: form.programStartDate && nextDay > 0
          ? addDays(form.programStartDate, nextDay - 1)
          : row.vaccinationStartDate,
        vaccinationEndDate: form.programStartDate && nextDay > 0
          ? addDays(form.programStartDate, nextDay - 1)
          : row.vaccinationEndDate,
      };
    }));
  }

  function updateProgramUsage(rowId, usageId, field, value) {
    setProgramRows((currentRows) => currentRows.map((row) => (
      row.id === rowId
        ? {
            ...row,
            usages: (row.usages || []).map((usage) => (
              usage.id === usageId
                ? { ...usage, [field]: value }
                : usage
            )),
          }
        : row
    )));
  }

  function addProgramUsage(rowId) {
    setProgramRows((currentRows) => currentRows.map((row) => (
      row.id === rowId
        ? {
            ...row,
            usages: (row.usages || []).length >= MAX_PROGRAM_VACCINES_PER_DAY
              ? row.usages
              : [
                  ...(row.usages || []),
                  createProgramUsage(row.id, row.defaultMethod || "Ocular"),
                ],
          }
        : row
    )));
  }

  function removeProgramUsage(rowId, usageId) {
    setProgramRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nextUsages = (row.usages || []).filter((usage) => usage.id !== usageId);

      return {
        ...row,
        usages: nextUsages.length
          ? nextUsages
          : [createProgramUsage(row.id, row.defaultMethod || "Ocular")],
      };
    }));
  }

  function getVaccine(id) {
    return vaccines.find((vaccine) => String(vaccine.id) === String(id));
  }

  function getNormalizedVaccineUsages() {
    return vaccineUsages
      .filter((usage) => (
        usage.vaccineId ||
        usage.doses ||
        getUsageFlaskCc(usage) ||
        getUsageDosePerBirdCc(usage) ||
        getUsageBirdsVaccinated(usage)
      ))
      .map((usage) => {
        const vaccine = getVaccine(usage.vaccineId);
        const metrics = getUsageMetrics(usage);
        const calculatedDoses = metrics.requiredCc || metrics.birdsPerFlask;

        return {
          id: usage.id,
          vaccineId: usage.vaccineId,
          vacina: vaccine?.nome || "Vacina",
          codigo: vaccine?.codigo || "-",
          fabricante: vaccine?.fabricante || usage.fabricante || "",
          doses: parseQuantity(usage.doses) || calculatedDoses,
          ...metrics,
          laborCost: getUsageLaborRate(usage),
          laborCostPerThousandBirds: getUsageLaborRate(usage),
          calculatedLaborCost: getUsageLaborCost(usage),
          applicationMethod: usage.applicationMethod || "Ocular",
        };
      });
  }

  function getProgramVaccinationRows() {
    return programRows
      .filter((row) => !row.milestone)
      .map((row) => ({
        ...row,
        programDay: Number(row.programDay || 0),
        vaccineUsages: (row.usages || [])
          .filter((usage) => (
            usage.vaccineId ||
            usage.doses ||
            getUsageFlaskCc(usage) ||
            getUsageDosePerBirdCc(usage)
          ))
          .map((usage) => {
            const vaccine = getVaccine(usage.vaccineId);
            const metrics = getUsageMetrics(usage);
            const calculatedDoses = metrics.birdsPerFlask;

            return {
              id: usage.id,
              vaccineId: usage.vaccineId,
              vacina: vaccine?.nome || row.suggestedName || "Vacina",
              codigo: vaccine?.codigo || "-",
              fabricante: vaccine?.fabricante || usage.fabricante || "",
              doses: parseQuantity(usage.doses) || calculatedDoses,
              ...metrics,
              laborCost: getUsageLaborRate(usage),
              laborCostPerThousandBirds: getUsageLaborRate(usage),
              calculatedLaborCost: getUsageLaborCost(usage),
              applicationMethod: usage.applicationMethod || row.defaultMethod || "Ocular",
            };
          }),
      }));
  }

  function getAverageDoseCost(vaccineId) {
    const vaccineEntries = entries.filter((entry) => String(entry.vaccineId) === String(vaccineId));
    const totalDoses = vaccineEntries.reduce((total, entry) => total + Number(entry.doses || 0), 0);
    const totalValue = vaccineEntries.reduce((total, entry) => {
      if (entry.valorTotal !== undefined) {
        return total + Number(entry.valorTotal || 0);
      }

      if (entry.valor !== undefined) {
        return total + Number(entry.valor || 0);
      }

      return total + (Number(entry.doses || 0) * Number(entry.valorDose || 0));
    }, 0);

    return totalDoses > 0 ? totalValue / totalDoses : 0;
  }

  function getProgramSimulationRows() {
    return getProgramVaccinationRows()
      .flatMap((row) => row.vaccineUsages.map((usage) => {
        const unitCost = getAverageDoseCost(usage.vaccineId);

        return {
          ...usage,
          programDay: row.programDay,
          suggestedName: row.suggestedName,
          unitCost,
          totalDoses: usage.doses,
          totalCost: unitCost * usage.doses,
          laborCost: getUsageLaborCost(usage),
          stock: calculateStock(usage.vaccineId),
        };
      }))
      .filter((usage) => usage.vaccineId && usage.doses > 0);
  }

  function getCurrentPeriodMultiplier() {
    if (form.scheduleMode !== "MES_INTEIRO") {
      return 1;
    }

    return Math.max(1, getDatesForWeekdayInMonth(form.monthlyMonth, form.monthlyWeekday).length || 1);
  }

  function getNonProgramSimulationRows() {
    const multiplier = getCurrentPeriodMultiplier();

    return getNormalizedVaccineUsages()
      .filter((usage) => usage.vaccineId && usage.doses > 0)
      .map((usage) => {
        const unitCost = getAverageDoseCost(usage.vaccineId);

        return {
          ...usage,
          unitCost,
          totalDoses: usage.doses * multiplier,
          totalCost: unitCost * usage.doses * multiplier,
          laborCost: getUsageLaborCost(usage) * multiplier,
          stock: calculateStock(usage.vaccineId),
        };
      });
  }

  function getFormSimulationRows() {
    return form.scheduleMode === "PROGRAMA_120_DIAS"
      ? getProgramSimulationRows()
      : getNonProgramSimulationRows();
  }

  function getFormVaccineCost() {
    return getFormSimulationRows().reduce((total, row) => total + Number(row.totalCost || 0), 0);
  }

  function getFormTotalDoses() {
    return getFormSimulationRows().reduce((total, row) => total + Number(row.totalDoses || row.doses || 0), 0);
  }

  function getFormTotalFlasks() {
    return getFormSimulationRows().reduce((total, row) => total + Number(row.requiredFlasks || getUsageRequiredFlasks(row) || 0), 0);
  }

  function getFormLaborCost() {
    return getFormSimulationRows().reduce((total, row) => total + Number(row.laborCost || 0), 0);
  }

  function getFormTotalCost() {
    return getFormVaccineCost() + getFormLaborCost();
  }

  function getScheduleTotalDoses(schedule) {
    return (schedule.vaccineUsages || []).reduce((total, usage) => total + Number(usage.doses || 0), 0);
  }

  function getScheduleTotalFlasks(schedule) {
    return (schedule.vaccineUsages || []).reduce((total, usage) => total + Number(usage.requiredFlasks || getUsageRequiredFlasks(usage) || 0), 0);
  }

  function getScheduleVaccineCost(schedule) {
    return (schedule.vaccineUsages || []).reduce((total, usage) => (
      total + (Number(usage.doses || 0) * getAverageDoseCost(usage.vaccineId))
    ), 0);
  }

function getScheduleTotalCost(schedule) {
  return getScheduleVaccineCost(schedule) + getLaborCost(schedule);
}

function getProgramLaborCostFromRows(rows) {
  return rows.reduce((total, row) => (
    total + getUsagesLaborCost(row.vaccineUsages || row.usages || [])
  ), 0);
}

function getMapsLink(location) {
  const value = String(location || "").trim();

  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}

  function getUsageStockError(usages, multiplier = 1) {
    const dosesByVaccine = usages.reduce((items, usage) => {
      items[usage.vaccineId] = (items[usage.vaccineId] || 0) + usage.doses;
      return items;
    }, {});

    return Object.entries(dosesByVaccine).find(([vaccineId, doses]) => (
      doses * multiplier > calculateStock(vaccineId)
    ));
  }

  async function cancelSchedule(id) {
    const scheduleToCancel = schedules.find((schedule) => String(schedule.id) === String(id));

    if (!scheduleToCancel) {
      return;
    }

    const cancelWholeProgram = Boolean(scheduleToCancel.programId);
    const confirmed = window.confirm(
      cancelWholeProgram
        ? "Excluir este programa inteiro?\n\nTodas as vacinacoes deste programa vao sair do sistema principal e do app do vacinador."
        : "Excluir esta vacinacao?\n\nEla vai sair do sistema principal e do app do vacinador."
    );

    if (!confirmed) {
      return;
    }

    try {
      const data = await deleteScheduleApi(id);

      setSchedules(data.schedules || []);
      writeJson("requests", data.requests || []);
      writeJson("vaccinatorNotifications", data.notifications || []);
    } catch (error) {
      console.log(error);
      alert(error.message || "Nao foi possivel excluir no servidor. Tente novamente.");
    }
  }

  async function addSchedule() {
    if (isSavingSchedule) {
      return;
    }

    setScheduleMessage("");
    const isMonthlySchedule = form.scheduleMode === "MES_INTEIRO";
    const isProgramSchedule = form.scheduleMode === "PROGRAMA_120_DIAS";

    if (!form.vaccinatorId) {
      alert("Selecione um vacinador cadastrado.");
      return;
    }

    const selectedVaccinator = vaccinators.find(
      (vaccinator) => String(vaccinator.id) === String(form.vaccinatorId)
    );

    if (!selectedVaccinator) {
      alert("Selecione um vacinador cadastrado.");
      return;
    }

    let periods = [];
    const selectedLot = birdLots.find((lot) => String(lot.id) === String(form.birdLotId));
    const programId = `programa-${Date.now()}`;

    if (isProgramSchedule) {
      if (!form.programStartDate) {
        alert("Informe a data de nascimento/inicio do programa.");
        return;
      }

      const programVaccinationRows = getProgramVaccinationRows();
      const incompleteProgramDate = programVaccinationRows.find((row) => (
        !row.vaccinationStartDate || !row.vaccinationEndDate
      ));

      if (incompleteProgramDate) {
        alert("Confira as datas do programa de 120 dias.");
        return;
      }

      const incompleteProgramUsage = programVaccinationRows.some((row) => (
        row.vaccineUsages.some((usage) => (
          !usage.vaccineId ||
          !usage.doses ||
          usage.doses <= 0
        ))
      ));

      if (incompleteProgramUsage) {
        alert("Nas vacinas preenchidas do programa, informe vacina e doses maiores que zero.");
        return;
      }

      periods = programVaccinationRows.map((row, index) => ({
        vaccinationStartDate: row.vaccinationStartDate,
        vaccinationEndDate: row.vaccinationEndDate,
        scheduleMode: "PROGRAMA_120_DIAS",
        programId,
        programDay: row.programDay,
        programSuggestedName: row.suggestedName,
        programStartDate: form.programStartDate,
        programEndDate: addDays(form.programStartDate, 119),
        productionEndDate: addWeeks(form.programStartDate, 100),
        applicationMethod: row.vaccineUsages[0]?.applicationMethod || row.defaultMethod || "",
        hasDebicagem: row.hasDebicagem || "NAO",
        vaccineUsages: row.vaccineUsages.filter((usage) => usage.vaccineId && usage.doses > 0),
        sequenceIndex: index,
      }));
    } else if (isMonthlySchedule) {
      if (!form.monthlyMonth) {
        alert("Selecione o mes que deseja agendar.");
        return;
      }

      const dates = getDatesForWeekdayInMonth(form.monthlyMonth, form.monthlyWeekday);
      const vaccinationDays = Math.max(1, Number(form.monthlyVaccinationDays) || 1);

      periods = dates.map((date) => ({
        vaccinationStartDate: date,
        vaccinationEndDate: addDays(date, vaccinationDays - 1),
        scheduleMode: "MES_INTEIRO",
        monthlyMonth: form.monthlyMonth,
        monthlyWeekday: form.monthlyWeekday,
      }));

      if (periods.length === 0) {
        alert("Nao encontramos esse dia da semana no mes escolhido.");
        return;
      }
    } else {
      if (
        !form.vaccinationStartDate ||
        !form.vaccinationEndDate
      ) {
        alert("Preencha o periodo de vacinacao.");
        return;
      }

      if (form.vaccinationEndDate < form.vaccinationStartDate) {
        alert("A data final da vacinacao nao pode ser antes da data inicial.");
        return;
      }

      periods = [{
        vaccinationStartDate: form.vaccinationStartDate,
        vaccinationEndDate: form.vaccinationEndDate,
        scheduleMode: "UNICO",
        applicationMethod: "",
      }];
    }

    const normalizedVaccineUsages = isProgramSchedule
      ? []
      : getNormalizedVaccineUsages();

    if (!isProgramSchedule && normalizedVaccineUsages.length === 0) {
      alert("Informe pelo menos uma vacina e a quantidade de doses.");
      return;
    }

    const incompleteUsage = normalizedVaccineUsages.find((usage) => (
      !usage.vaccineId ||
      !usage.doses ||
      usage.doses <= 0
    ));

    if (incompleteUsage) {
      alert("Preencha vacina e doses maiores que zero em todas as linhas.");
      return;
    }

    setIsSavingSchedule(true);
    setScheduleMessage("Salvando programa de vacinacao...");

    try {
    const baseScheduleId = Date.now();
    const farmProfile = getFarmProfile();
    const savedSchedules = [];
    const savedRequests = [];

    for (const [index, period] of periods.entries()) {
      const scheduleId = baseScheduleId + index;
      const periodUsages = period.vaccineUsages || normalizedVaccineUsages;
      const laborCost = getUsagesLaborCost(periodUsages);
      const newSchedule = {
        id: scheduleId,
        vaccinatorId: selectedVaccinator.id,
        vaccinatorName: selectedVaccinator.name,
        vaccinatorEmail: selectedVaccinator.email,
        vaccinatorPhone: selectedVaccinator.phone,
        vaccinatorNotificationContact: selectedVaccinator.notificationContact || "",
        farmName: farmProfile.farmName || "",
        farmCity: farmProfile.city || "",
        farmDocument: farmProfile.document || "",
        farmOwner: farmProfile.owner || farmProfile.responsible || "",
        farmAddress: farmProfile.address || "",
        farmLocation: farmProfile.location || "",
        observations: form.observations.trim(),
        hasDebicagem: period.hasDebicagem || form.hasDebicagem,
        laborCost,
        programLaborCost: laborCost,
        vaccinationStartDate: period.vaccinationStartDate,
        vaccinationEndDate: period.vaccinationEndDate,
        vaccineUsages: periodUsages,
        applicationMethod: period.applicationMethod || "",
        programId: period.programId || "",
        programDay: period.programDay || "",
        programSuggestedName: period.programSuggestedName || "",
        programStartDate: period.programStartDate || "",
        programEndDate: period.programEndDate || "",
        productionEndDate: period.productionEndDate || "",
        birdLotId: selectedLot?.id || "",
        birdLotName: selectedLot
          ? `${selectedLot.linhagem || "Lote"} - ${selectedLot.ranchoAtual || "Rancho"} - ${formatDate(selectedLot.dataAlojamento)}`
          : "",
        birdLotBirthDate: selectedLot?.dataAlojamento || "",
        scheduleMode: period.scheduleMode,
        monthlyMonth: period.monthlyMonth || "",
        monthlyWeekday: period.monthlyWeekday || "",
        status: "PENDENTE",
      };

      const newRequest = {
        ...newSchedule,
        id: `request-${scheduleId}`,
        scheduleId,
        farmName: farmProfile.farmName || "Granja",
        status: "PENDENTE",
        createdAt: new Date().toLocaleString("pt-BR"),
      };

      let savedSchedule = newSchedule;
      let savedRequest = newRequest;
      let apiSynced = false;

      try {
        const apiData = await createScheduleApi({
          ...newSchedule,
          requestId: newRequest.id,
        });

        savedSchedule = apiData.schedule;
        savedRequest = apiData.request;
        apiSynced = true;
      } catch (error) {
        console.log(error);
      }

      savedSchedules.push(savedSchedule);
      savedRequests.push(savedRequest);

      if (!apiSynced) {
        appendVaccinatorNotification({
          type: "SCHEDULE_REQUEST",
          requestId: savedRequest.id,
          scheduleId,
          vaccinatorId: selectedVaccinator.id,
          vaccinatorName: selectedVaccinator.name,
          vaccinatorEmail: selectedVaccinator.email,
          vaccinatorPhone: selectedVaccinator.phone,
          vaccinatorNotificationContact: selectedVaccinator.notificationContact || "",
          farmName: savedRequest.farmName,
          farmCity: savedRequest.farmCity,
          farmDocument: savedRequest.farmDocument,
          farmOwner: savedRequest.farmOwner,
          farmAddress: savedRequest.farmAddress,
          farmLocation: savedRequest.farmLocation,
          vaccineUsages: savedRequest.vaccineUsages || period.vaccineUsages || normalizedVaccineUsages,
          applicationMethod: savedRequest.applicationMethod || period.applicationMethod || "",
          hasDebicagem: savedRequest.hasDebicagem || period.hasDebicagem || form.hasDebicagem,
          laborCost: savedRequest.laborCost || 0,
          programLaborCost: savedRequest.programLaborCost || 0,
          programId: savedRequest.programId || period.programId || "",
          programDay: savedRequest.programDay || period.programDay || "",
          programSuggestedName: savedRequest.programSuggestedName || period.programSuggestedName || "",
          birdLotId: savedRequest.birdLotId || selectedLot?.id || "",
          birdLotName: savedRequest.birdLotName || "",
          observations: savedRequest.observations,
          title: "Pedido de vacinacao",
          message: `${savedRequest.farmName} enviou uma solicitacao de vacinacao${period.programDay ? ` do dia ${period.programDay}` : ""}.`,
        });
      }
    }

    setSchedules([
      ...savedSchedules,
      ...schedules.filter((schedule) => !savedSchedules.some((item) => String(item.id) === String(schedule.id))),
    ]);

    writeJson("requests", [
      ...savedRequests,
      ...readJson("requests", []).filter((request) => !savedRequests.some((item) => String(item.id) === String(request.id))),
    ]);

    resetForm();
    setShowForm(false);
    setScheduleMessage(`${savedSchedules.length} programa(s) criado(s) com sucesso.`);
    alert(`${savedSchedules.length} programa(s) criado(s).`);
    } catch (error) {
      console.log(error);
      setScheduleMessage(error.message || "Nao foi possivel finalizar o programa. Tente novamente.");
      alert(error.message || "Nao foi possivel finalizar o programa. Tente novamente.");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  function getScheduleVaccinatorName(schedule) {
    return schedule.vaccinatorName || schedule.vaccinator || "Vacinador";
  }

  function getVaccinationPeriod(schedule) {
    return formatPeriod(
      schedule.vaccinationStartDate || schedule.date,
      schedule.vaccinationEndDate || schedule.date
    );
  }

  function startVaccineEdit(schedule) {
    const usages = Array.isArray(schedule.vaccineUsages) && schedule.vaccineUsages.length > 0
      ? schedule.vaccineUsages
      : [{ id: `edit-${schedule.id}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", applicationMethod: schedule.applicationMethod || "Ocular" }];

    setEditingScheduleId(schedule.id);
    setEditingUsages(usages.map((usage, index) => ({
      id: usage.id || `edit-${schedule.id}-${index}`,
      vaccineId: usage.vaccineId || "",
      doses: usage.doses || "",
      flaskCc: getUsageFlaskCc(usage),
      dosePerBirdCc: getUsageDosePerBirdCc(usage),
      birdsVaccinated: getUsageBirdsVaccinated(usage),
      laborCost: getUsageLaborRate(usage),
      applicationMethod: usage.applicationMethod || schedule.applicationMethod || "Ocular",
    })));
  }

  function updateEditingUsage(id, field, value) {
    setEditingUsages((currentUsages) => currentUsages.map((usage) => (
      usage.id === id
        ? { ...usage, [field]: value }
        : usage
    )));
  }

  function addEditingUsage() {
    setEditingUsages((currentUsages) => (
      currentUsages.length >= MAX_PROGRAM_VACCINES_PER_DAY
        ? currentUsages
        : [
            ...currentUsages,
            { id: `edit-${Date.now()}-${currentUsages.length}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" },
          ]
    ));
  }

  function removeEditingUsage(id) {
    setEditingUsages((currentUsages) => (
      currentUsages.length === 1
        ? [{ id: `edit-${Date.now()}`, vaccineId: "", doses: "", flaskCc: "", dosePerBirdCc: "", birdsVaccinated: "", laborCost: "", applicationMethod: "Ocular" }]
        : currentUsages.filter((usage) => usage.id !== id)
    ));
  }

  async function saveVaccineReplacement(schedule) {
    const normalizedUsages = editingUsages
      .filter((usage) => (
        usage.vaccineId ||
        usage.doses ||
        getUsageFlaskCc(usage) ||
        getUsageDosePerBirdCc(usage) ||
        getUsageBirdsVaccinated(usage)
      ))
      .map((usage) => {
        const vaccine = getVaccine(usage.vaccineId);
        const metrics = getUsageMetrics(usage);
        const calculatedDoses = metrics.requiredCc || metrics.birdsPerFlask;

        return {
          id: usage.id,
          vaccineId: usage.vaccineId,
          vacina: vaccine?.nome || "Vacina",
          codigo: vaccine?.codigo || "-",
          fabricante: vaccine?.fabricante || usage.fabricante || "",
          doses: parseQuantity(usage.doses) || calculatedDoses,
          ...metrics,
          laborCost: getUsageLaborRate(usage),
          laborCostPerThousandBirds: getUsageLaborRate(usage),
          calculatedLaborCost: getUsageLaborCost(usage),
          applicationMethod: usage.applicationMethod || "Ocular",
        };
      });

    if (normalizedUsages.some((usage) => !usage.vaccineId || usage.doses <= 0)) {
      alert("Preencha vacina e doses maiores que zero para trocar a vacina.");
      return;
    }

    const invalidStock = getUsageStockError(normalizedUsages, 1);

    if (invalidStock) {
      const [vaccineId, doses] = invalidStock;
      const vaccine = getVaccine(vaccineId);

      alert(`Estoque insuficiente para ${vaccine?.nome || "a vacina"}. Necessario: ${doses}, estoque: ${calculateStock(vaccineId)}.`);
      return;
    }

    const confirmed = window.confirm("Trocar a vacina deste programa e notificar o vacinador?");

    if (!confirmed) {
      return;
    }

    try {
      const relatedRequest = readJson("requests", []).find((request) => (
        String(request.scheduleId) === String(schedule.id)
      ));
      const data = await updateRequestVaccinesApi(relatedRequest?.id || `request-${schedule.id}`, normalizedUsages);
      setSchedules(data.schedules || schedules);
      writeJson("requests", data.requests || readJson("requests", []));
      writeJson("vaccinatorNotifications", data.notifications || notifications);
      setNotifications(data.notifications || notifications);
    } catch (error) {
      console.log(error);
      const nextSchedules = schedules.map((item) => (
        String(item.id) === String(schedule.id)
          ? { ...item, vaccineUsages: normalizedUsages, applicationMethod: normalizedUsages[0]?.applicationMethod || item.applicationMethod }
          : item
      ));
      const nextRequests = readJson("requests", []).map((item) => (
        String(item.scheduleId) === String(schedule.id)
          ? { ...item, vaccineUsages: normalizedUsages, applicationMethod: normalizedUsages[0]?.applicationMethod || item.applicationMethod }
          : item
      ));

      setSchedules(nextSchedules);
      writeJson("requests", nextRequests);
      appendVaccinatorNotification({
        type: "VACCINE_CHANGED",
        requestId: `request-${schedule.id}`,
        scheduleId: schedule.id,
        vaccinatorId: schedule.vaccinatorId,
        vaccinatorName: schedule.vaccinatorName,
        vaccinatorEmail: schedule.vaccinatorEmail,
        vaccinatorPhone: schedule.vaccinatorPhone,
        vaccinatorNotificationContact: schedule.vaccinatorNotificationContact,
        farmName: schedule.farmName,
        vaccineUsages: normalizedUsages,
        title: "Vacina alterada",
        message: `A granja alterou a vacina do programa do dia ${schedule.programDay || "-"}.`,
      });
    }

    setEditingScheduleId(null);
    setEditingUsages([]);
  }

  function openProgramReport(schedule) {
    const programSchedules = schedules
      .filter((item) => (
        schedule.programId
          ? item.programId === schedule.programId
          : String(item.id) === String(schedule.id)
      ))
      .filter((item) => !item.programDay || Number(item.programDay) <= 120)
      .sort((first, second) => Number(first.programDay || 0) - Number(second.programDay || 0));
    const rows = programSchedules.length ? programSchedules : [schedule];
    const totalCost = rows.reduce((total, item) => {
      return total + (item.vaccineUsages || []).reduce((sum, usage) => (
        sum + (Number(usage.doses || 0) * getAverageDoseCost(usage.vaccineId))
      ), 0);
    }, 0);
    const laborCost = getProgramLaborCostFromRows(rows);
    const totalWithLabor = totalCost + laborCost;
    const reportWindow = window.open("", "_blank", "width=1000,height=800");

    if (!reportWindow) {
      alert("Permita pop-ups para gerar o relatorio.");
      return;
    }

    reportWindow.document.write(`
      <html>
        <head>
          <title>Relatorio 120 dias - ImmuHen</title>
          <style>
            body { font-family: Arial, sans-serif; color: #18181b; padding: 28px; }
            h1 { color: #14532d; margin-bottom: 6px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #bbf7d0; padding: 9px; text-align: left; vertical-align: top; }
            th { background: #dcfce7; color: #14532d; }
            .meta { color: #52525b; margin: 3px 0; }
            .total { margin-top: 16px; font-weight: 700; color: #14532d; }
          </style>
        </head>
        <body>
          <h1>Relatorio do programa de 120 dias</h1>
          <p class="meta">Granja: ${schedule.farmName || "-"}</p>
          <p class="meta">Lote: ${schedule.birdLotName || "-"}</p>
          <p class="meta">Inicio: ${formatDate(schedule.programStartDate || schedule.vaccinationStartDate)} | Janela 120 dias ate ${formatDate(schedule.programEndDate || schedule.vaccinationEndDate)}</p>
          <p class="meta">Fim previsto apos 100 semanas: ${formatDate(schedule.productionEndDate)}</p>
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Data</th>
                <th>Vacina / Evento</th>
                <th>Debicagem</th>
                <th>Via</th>
                <th>Doses</th>
                <th>CC/frasco</th>
                <th>CC/ave</th>
                <th>Aves/frasco</th>
                <th>Custo estimado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((item) => {
                const usages = item.vaccineUsages || [];
                const doses = usages.reduce((total, usage) => total + Number(usage.doses || 0), 0);
                const flaskCc = usages.map((usage) => usage.flaskCc || usage.flasks || usage.frascos).filter(Boolean).join(", ");
                const dosePerBirdCc = usages.map((usage) => usage.dosePerBirdCc).filter(Boolean).join(", ");
                const birdsPerFlask = usages.map((usage) => usage.birdsPerFlask || getUsageBirdsPerFlask(usage)).filter(Boolean).map(formatQuantity).join(", ");
                const cost = usages.reduce((total, usage) => total + (Number(usage.doses || 0) * getAverageDoseCost(usage.vaccineId)), 0);

                return `
                  <tr>
                    <td>${item.programDay || "-"}</td>
                    <td>${formatDate(item.vaccinationStartDate)}</td>
                    <td>${usages.map((usage) => usage.vacina).join(", ") || item.programSuggestedName || "-"}</td>
                    <td>${item.hasDebicagem === "SIM" ? "Sim" : "Nao"}</td>
                    <td>${item.applicationMethod || usages[0]?.applicationMethod || "-"}</td>
                    <td>${doses || "-"}</td>
                    <td>${flaskCc || "-"}</td>
                    <td>${dosePerBirdCc || "-"}</td>
                    <td>${birdsPerFlask || "-"}</td>
                    <td>${formatCurrency(cost)}</td>
                    <td>${normalizeRequestStatus(item.status)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
          <p class="total">Custo estimado das vacinas: ${formatCurrency(totalCost)}</p>
          <p class="total">Custo calculado por aves: ${formatCurrency(laborCost)}</p>
          <p class="total">Total estimado da janela: ${formatCurrency(totalWithLabor)}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  }

  function getTransferForm(program) {
    const lot = birdLots.find((item) => String(item.id) === String(program.birdLotId));

    return transferForms[program.programId] || {
      open: false,
      destinations: [
        {
          id: `destino-${program.programId}-1`,
          ranchoAtual: lot?.ranchoAtual || availableRanches[0]?.name || "Pinteiro",
          avesAlojadas: String(lot?.avesAlojadas || ""),
        },
      ],
    };
  }

  function updateTransferForm(program, nextForm) {
    setTransferForms((currentForms) => ({
      ...currentForms,
      [program.programId]: nextForm,
    }));
  }

  function toggleTransferForm(program) {
    const currentForm = getTransferForm(program);

    updateTransferForm(program, {
      ...currentForm,
      open: !currentForm.open,
    });
  }

  function updateTransferDestination(program, destinationId, field, value) {
    const currentForm = getTransferForm(program);

    updateTransferForm(program, {
      ...currentForm,
      destinations: currentForm.destinations.map((destination) => (
        destination.id === destinationId
          ? { ...destination, [field]: value }
          : destination
      )),
    });
  }

  function addTransferDestination(program) {
    const currentForm = getTransferForm(program);

    updateTransferForm(program, {
      ...currentForm,
      destinations: [
        ...currentForm.destinations,
        {
          id: `destino-${program.programId}-${Date.now()}`,
          ranchoAtual: availableRanches[0]?.name || "Pinteiro",
          avesAlojadas: "",
        },
      ],
    });
  }

  function removeTransferDestination(program, destinationId) {
    const currentForm = getTransferForm(program);
    const nextDestinations = currentForm.destinations.filter((destination) => destination.id !== destinationId);

    updateTransferForm(program, {
      ...currentForm,
      destinations: nextDestinations.length ? nextDestinations : currentForm.destinations,
    });
  }

  async function refreshBirdLots() {
    try {
      const data = await fetchBirdLotsApi();

      setBirdLots(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log(error);
    }
  }

  async function submitTransfer(program) {
    const lot = birdLots.find((item) => String(item.id) === String(program.birdLotId));

    if (!lot) {
      alert("Lote nao encontrado no controle de aves.");
      return;
    }

    const currentForm = getTransferForm(program);
    const destinations = currentForm.destinations
      .map((destination) => ({
        ...destination,
        ranchoAtual: String(destination.ranchoAtual || "").trim(),
        avesAlojadas: parseQuantity(destination.avesAlojadas),
      }))
      .filter((destination) => destination.ranchoAtual && destination.avesAlojadas > 0);

    if (destinations.length === 0) {
      alert("Informe pelo menos um rancho e a quantidade de aves.");
      return;
    }

    const totalBirds = destinations.reduce((total, destination) => total + destination.avesAlojadas, 0);
    const originalBirds = Number(lot.avesAlojadas || 0);

    if (originalBirds > 0 && totalBirds !== originalBirds) {
      alert(`A divisao precisa fechar ${originalBirds} aves. Informado: ${totalBirds}.`);
      return;
    }

    const confirmed = window.confirm("Confirmar transferencia do lote para os ranchos escolhidos?");

    if (!confirmed) {
      return;
    }

    const [firstDestination, ...extraDestinations] = destinations;
    const transferDate = new Date().toISOString().split("T")[0];
    const transferNote = `Transferencia do programa ${program.programId} registrada em ${new Date().toLocaleString("pt-BR")}.`;
    const originalMovements = Array.isArray(lot.movimentacoes) ? lot.movimentacoes : [];
    const basePayload = {
      linhagem: lot.linhagem || "",
      dataAlojamento: lot.dataAlojamento || program.programStartDate || "",
      idadeAtual: "120",
      observacoes: `${lot.observacoes || ""}\n${transferNote}`.trim(),
      status: lot.status || "Ativo",
    };

    await saveBirdLotApi({
      ...basePayload,
      avesAlojadas: firstDestination.avesAlojadas,
      ranchoAtual: firstDestination.ranchoAtual,
    }, lot.id);

    for (const destination of extraDestinations) {
      await saveBirdLotApi({
        ...basePayload,
        avesAlojadas: destination.avesAlojadas,
        ranchoAtual: destination.ranchoAtual,
        observacoes: `${basePayload.observacoes}\nDivisao do lote original #${lot.id}.`,
        movimentacoes: [
          ...originalMovements,
          {
            from: lot.ranchoAtual || "Pinteiro",
            to: destination.ranchoAtual,
            date: transferDate,
            age: 120,
            reason: `Transferencia 120 dias - ${program.programId}`,
          },
        ],
      });
    }

    await refreshBirdLots();
    updateTransferForm(program, {
      ...currentForm,
      open: false,
    });
    alert("Transferencia registrada no controle de aves.");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 md:text-5xl">
                Programa de Vacinacao
              </h1>

              <p className="mt-2 text-zinc-500">
                Gere o programa de 120 dias, acompanhe vias de aplicacao e custos por lote.
              </p>
            </div>

            <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-4 text-green-700">
              <p className="text-sm font-semibold uppercase tracking-wide">
                Programas
              </p>
              <p className="text-3xl font-bold">
                {activeSchedules.length}
              </p>
            </div>
          </div>
        </section>

        {overdueNotifications.length > 0 && (
          <section className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
            <h2 className="text-xl font-bold text-red-700">
              Vacinas atrasadas
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {overdueNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className="rounded-xl border border-red-100 bg-white p-4"
                >
                  <p className="font-bold text-zinc-900">
                    {notification.vaccinatorName || "Vacinador"}
                  </p>
                  <p className="mt-2 text-zinc-600">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    {notification.createdAt}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {programTransferGroups.length > 0 && (
          <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">
                  Transferencia de rancho aos 120 dias
                </h2>
                <p className="mt-1 text-zinc-500">
                  Programas que chegaram ao dia 120 podem ser transferidos para um ou mais ranchos e entram automaticamente no controle de aves.
                </p>
              </div>
              <span className="w-fit rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                {programTransferGroups.length} pendente(s)
              </span>
            </div>

            <div className="mt-5 grid gap-4">
              {programTransferGroups.map((program) => {
                const transferForm = getTransferForm(program);
                const lot = birdLots.find((item) => String(item.id) === String(program.birdLotId));
                const totalDestinations = transferForm.destinations.reduce(
                  (total, destination) => total + parseQuantity(destination.avesAlojadas),
                  0
                );
                const originalBirds = Number(lot?.avesAlojadas || 0);

                return (
                  <article
                    key={program.programId}
                    className="rounded-xl border border-green-100 bg-green-50 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                          Dia 120 liberado
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-zinc-900">
                          {program.birdLotName || "Registro de aves"}
                        </h3>
                        <p className="mt-1 text-sm text-zinc-600">
                          Inicio: {formatDate(program.programStartDate)} | Transferir a partir de {formatDate(program.programEndDate)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-zinc-700">
                          Aves atuais: {originalBirds || "-"} | Rancho atual: {lot?.ranchoAtual || "-"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleTransferForm(program)}
                        className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                      >
                        Transferir
                      </button>
                    </div>

                    {transferForm.open && (
                      <div className="mt-4 grid gap-3 rounded-xl border border-green-100 bg-white p-4">
                        <div className="grid gap-2">
                          <p className="font-bold text-zinc-900">
                            Destino das aves
                          </p>
                          <p className="text-sm text-zinc-500">
                            Para dividir o registro, informe a quantidade de aves em cada rancho. O total precisa fechar com as aves atuais.
                          </p>
                        </div>

                        {transferForm.destinations.map((destination, index) => (
                          <div
                            key={destination.id}
                            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end"
                          >
                            <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                              Rancho {index + 1}
                              <select
                                value={destination.ranchoAtual}
                                onChange={(event) => updateTransferDestination(program, destination.id, "ranchoAtual", event.target.value)}
                                className="min-w-0 rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                              >
                                {availableRanches.map((ranch) => (
                                  <option
                                    key={ranch.id || ranch.name}
                                    value={ranch.name}
                                  >
                                    {ranch.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                              Aves
                              <input
                                type="text"
                                inputMode="numeric"
                                value={destination.avesAlojadas}
                                onChange={(event) => updateTransferDestination(program, destination.id, "avesAlojadas", event.target.value)}
                                placeholder="0"
                                className="min-w-0 rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => removeTransferDestination(program, destination.id)}
                              className="rounded-xl bg-red-50 px-4 py-3 font-bold text-red-600 transition hover:bg-red-100"
                            >
                              Remover
                            </button>
                          </div>
                        ))}

                        <div className="flex flex-col gap-3 border-t border-green-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-bold text-zinc-700">
                            Total informado: {totalDestinations}{originalBirds ? ` / ${originalBirds}` : ""}
                          </p>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => addTransferDestination(program)}
                              className="rounded-xl border border-green-200 bg-white px-4 py-3 font-bold text-green-700 transition hover:bg-green-50"
                            >
                              Adicionar rancho
                            </button>
                            <button
                              type="button"
                              onClick={() => submitTransfer(program)}
                              className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white transition hover:bg-green-700"
                            >
                              Registrar no Aves
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {programLotSummaries.length > 0 && (
          <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">
                  Doses usadas por lote
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Soma automatica das doses confirmadas pelo vacinador no programa vinculado ao lote.
                </p>
              </div>
              <span className="w-fit rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">
                {programLotSummaries.length} lote(s)
              </span>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {programLotSummaries.map((summary) => (
                <article key={summary.id} className="rounded-xl border border-green-100 bg-green-50 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="font-bold text-zinc-900">
                        {summary.birdLotName}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {summary.programStartDate ? `Inicio: ${formatDate(summary.programStartDate)}` : "Inicio nao informado"}
                        {summary.programEndDate ? ` | 120 dias: ${formatDate(summary.programEndDate)}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-green-700">
                      {formatQuantity(summary.totalDoses)} doses
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {summary.vaccines.map((item) => (
                      <span
                        key={item.name}
                        className="rounded-full bg-white px-3 py-1 text-sm font-bold text-zinc-700"
                      >
                        {item.name}: {formatQuantity(item.doses)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Vacinas
                      </p>
                      <p className="mt-1 font-bold text-zinc-900">
                        {formatCurrency(summary.vaccineCost)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Custo calculado por aves
                      </p>
                      <p className="mt-1 font-bold text-zinc-900">
                        {formatCurrency(summary.laborCost)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Total
                      </p>
                      <p className="mt-1 font-bold text-zinc-900">
                        {formatCurrency(summary.totalCost)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700"
        >
          Novo Programa
        </button>

        {scheduleMessage && (
          <p className="mt-4 rounded-2xl border border-green-100 bg-white px-5 py-4 font-semibold text-green-700 shadow-sm">
            {scheduleMessage}
          </p>
        )}

        {showForm && (
          <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-zinc-900">
              Novo Programa de Vacinacao
            </h2>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                Tipo de programa
                <select
                  value={form.scheduleMode}
                  onChange={(event) => updateForm("scheduleMode", event.target.value)}
                  className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                >
                  <option value="PROGRAMA_120_DIAS">Programa 120 dias</option>
                  <option value="UNICO">Programa avulso</option>
                  <option value="MES_INTEIRO">Agendar o mes inteiro</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                Vacinador
                <select
                  value={form.vaccinatorId}
                  onChange={(event) => updateForm("vaccinatorId", event.target.value)}
                  className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                >
                  <option value="">
                    Selecione um vacinador cadastrado
                  </option>

                  {activeVaccinators.map((vaccinator) => (
                    <option
                      key={vaccinator.id}
                      value={vaccinator.id}
                    >
                      {vaccinator.name} - {vaccinator.phone}
                    </option>
                  ))}
                </select>
              </label>

              <section className="grid gap-4 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                <div>
                  <p className="font-bold text-zinc-900">
                    Custos do programa
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Informe o custo a cada mil aves em cada vacina. O total abaixo soma vacinas e custo por item.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-green-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                      Doses previstas
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatQuantity(getFormTotalDoses())}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                      Vacinas
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatCurrency(getFormVaccineCost())}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                      Total previsto
                    </p>
                    <p className="mt-2 font-bold text-zinc-900">
                      {formatCurrency(getFormTotalCost())}
                    </p>
                  </div>
                </div>
              </section>

              {form.scheduleMode === "PROGRAMA_120_DIAS" && (
                <section className="grid gap-4 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                  <div>
                    <p className="font-bold text-zinc-900">
                      Programa vinculado ao lote
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      O sistema gera a janela de 120 dias e mostra o fim previsto apos 100 semanas.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                      Lote / registro de nascimento
                      <select
                        value={form.birdLotId}
                        onChange={(event) => updateForm("birdLotId", event.target.value)}
                        className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                      >
                        <option value="">
                          Selecionar lote
                        </option>
                        {birdLots.map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.linhagem || "Lote"} | {lot.ranchoAtual || "Rancho"} | {formatDate(lot.dataAlojamento)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                      Inicio da vacinacao
                      <input
                        type="date"
                        value={form.programStartDate}
                        onChange={(event) => updateForm("programStartDate", event.target.value)}
                        className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                      />
                    </label>

                    <div className="rounded-xl border border-green-100 bg-white p-3">
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Fim apos 100 semanas
                      </p>
                      <p className="mt-2 font-bold text-zinc-900">
                        {form.programStartDate ? formatDate(addWeeks(form.programStartDate, 100)) : "-"}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {form.scheduleMode === "MES_INTEIRO" && (
                <div className="grid gap-4 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                  <div>
                    <p className="font-bold text-zinc-900">
                      Agendar o mes inteiro
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      O sistema cria um agendamento em todos os dias da semana escolhidos dentro do mes.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                      Mes
                      <input
                        type="month"
                        value={form.monthlyMonth}
                        onChange={(event) => updateForm("monthlyMonth", event.target.value)}
                        className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                      Dia da semana
                      <select
                        value={form.monthlyWeekday}
                        onChange={(event) => updateForm("monthlyWeekday", event.target.value)}
                        className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                      >
                        {WEEKDAYS.map((weekday) => (
                          <option key={weekday.value} value={weekday.value}>
                            {weekday.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                      Dias de vacinacao
                      <input
                        type="number"
                        min="1"
                        max="7"
                        value={form.monthlyVaccinationDays}
                        onChange={(event) => updateForm("monthlyVaccinationDays", event.target.value)}
                        className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                      />
                    </label>

                  </div>
                </div>
              )}

              {form.scheduleMode === "UNICO" && (
                <div className="grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                <p className="font-bold text-zinc-900">
                  Periodo da vacinacao
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                    Inicio
                    <input
                      type="date"
                      value={form.vaccinationStartDate}
                      onChange={(event) => updateForm("vaccinationStartDate", event.target.value)}
                      className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                    Fim
                    <input
                      type="date"
                      value={form.vaccinationEndDate}
                      onChange={(event) => updateForm("vaccinationEndDate", event.target.value)}
                      className="rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                    />
                  </label>
                </div>
              </div>
              )}

              {form.scheduleMode !== "PROGRAMA_120_DIAS" && (
              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Vai ocorrer debicagem?
                <select
                  value={form.hasDebicagem}
                  onChange={(event) => updateForm("hasDebicagem", event.target.value)}
                  className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                >
                  <option value="NAO">Nao</option>
                  <option value="SIM">Sim</option>
                </select>
              </label>
              )}

              {form.scheduleMode !== "PROGRAMA_120_DIAS" && (
              <section className="grid gap-4 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">
                      Vacinas e doses
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      O programa apenas planeja as doses. A baixa no estoque acontece quando o vacinador confirma o uso no app.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addVaccineUsage}
                    className="rounded-xl bg-white px-4 py-2 font-bold text-green-700 shadow-sm transition hover:bg-green-100"
                  >
                    Adicionar vacina
                  </button>
                </div>

                <div className="grid gap-3">
                  {vaccineUsages.map((usage) => (
                    <div
                      key={usage.id}
                      className="grid gap-3 rounded-xl border border-green-100 bg-white p-3"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          Vacina
                          <select
                            value={usage.vaccineId}
                            onChange={(event) => updateVaccineUsage(usage.id, "vaccineId", event.target.value)}
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          >
                            <option value="">
                              Selecione a vacina
                            </option>
                            {sortedVaccines.map((vaccine) => (
                              <option key={vaccine.id} value={vaccine.id}>
                                {vaccine.nome} | estoque: {calculateStock(vaccine.id)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() => removeVaccineUsage(usage.id)}
                          className="min-h-[48px] rounded-xl bg-red-50 px-4 py-3 font-bold text-red-600 transition hover:bg-red-100"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-9 xl:items-end">
                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          Doses/cc manual
                          <input
                            type="text"
                            inputMode="numeric"
                            value={usage.doses}
                            onChange={(event) => updateVaccineUsage(usage.id, "doses", event.target.value)}
                            placeholder="Auto"
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          />
                        </label>

                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          CC/frasco
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getUsageFlaskCc(usage)}
                            onChange={(event) => updateVaccineUsage(usage.id, "flaskCc", event.target.value)}
                            placeholder="5000"
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          />
                        </label>

                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          CC/ave
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getUsageDosePerBirdCc(usage)}
                            onChange={(event) => updateVaccineUsage(usage.id, "dosePerBirdCc", event.target.value)}
                            placeholder="0,3"
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          />
                        </label>

                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          Aves vacinadas
                          <input
                            type="text"
                            inputMode="numeric"
                            value={getUsageBirdsVaccinated(usage)}
                            onChange={(event) => updateVaccineUsage(usage.id, "birdsVaccinated", event.target.value)}
                            placeholder="10000"
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          />
                        </label>

                        <div className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          <span>Frascos necessarios</span>
                          <span className="flex min-h-[48px] items-center rounded-xl border border-green-100 bg-green-50 px-4 py-3 font-bold text-green-700">
                            {formatQuantity(getUsageRequiredFlasks(usage))}
                          </span>
                        </div>

                        <div className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          <span>Aves/frasco</span>
                          <span className="flex min-h-[48px] items-center rounded-xl border border-green-100 bg-green-50 px-4 py-3 font-bold text-green-700">
                            {formatQuantity(getUsageBirdsPerFlask(usage))}
                          </span>
                        </div>

                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          Via
                          <select
                            value={usage.applicationMethod || "Ocular"}
                            onChange={(event) => updateVaccineUsage(usage.id, "applicationMethod", event.target.value)}
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          >
                            {APPLICATION_METHODS.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          Custo a cada mil aves
                          <input
                            type="text"
                            inputMode="decimal"
                            value={usage.laborCost || ""}
                            onChange={(event) => updateVaccineUsage(usage.id, "laborCost", event.target.value)}
                            placeholder="0,00"
                            className="min-w-0 w-full rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                          />
                        </label>

                        <div className="grid min-w-0 gap-2 text-sm font-semibold text-zinc-700">
                          <span>Estoque atual</span>
                          <span className="flex min-h-[48px] items-center rounded-xl border border-green-100 bg-green-50 px-4 py-3 font-bold text-green-700">
                            {usage.vaccineId ? calculateStock(usage.vaccineId) : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {form.scheduleMode === "PROGRAMA_120_DIAS" && (
                <section className="grid gap-4 rounded-xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="font-bold text-zinc-900">
                        Janela de 120 dias
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Escolha ate 4 vacinas por dia. As doses podem ser calculadas por CC/frasco e CC por ave.
                      </p>
                    </div>

                    <div className="rounded-xl border border-green-100 bg-white px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                        Simulacao
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-600">
                        Frascos: {formatQuantity(getFormTotalFlasks())}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-600">
                        Vacinas: {formatCurrency(getFormVaccineCost())}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-600">
                        Custo calculado por aves: {formatCurrency(getFormLaborCost())}
                      </p>
                      <p className="mt-1 font-bold text-zinc-900">
                        Total: {formatCurrency(getFormTotalCost())}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {programRows.map((row) => (
                      <div
                        key={row.id}
                        className={`grid gap-3 rounded-xl border p-3 ${
                          row.milestone
                            ? "border-zinc-200 bg-white"
                            : "border-green-100 bg-white"
                        }`}
                      >
                        {row.milestone ? (
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-bold text-zinc-900">
                                Dia {row.programDay} - {row.suggestedName}
                              </p>
                              <p className="text-sm text-zinc-500">
                                {row.vaccinationStartDate ? formatDate(row.vaccinationStartDate) : "Aguardando data inicial"}
                              </p>
                            </div>
                            <span className="w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                              Marco do programa
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3">
                              <div className="grid gap-3 lg:grid-cols-[90px_165px_150px_minmax(0,1fr)] xl:grid-cols-[90px_165px_150px_minmax(0,1fr)_auto] xl:items-end">
                                <label className="grid gap-1 text-sm font-semibold text-zinc-700">
                                  Dia
                                  <input
                                    type="number"
                                    min="1"
                                    max="120"
                                    value={row.programDay}
                                    onChange={(event) => updateProgramDay(row.id, event.target.value)}
                                    className="rounded-xl border border-green-100 bg-green-50 p-3 font-bold text-green-700 outline-none transition focus:border-green-500 focus:bg-white"
                                  />
                                </label>

                                <label className="grid gap-1 text-sm font-semibold text-zinc-700">
                                  Data
                                  <input
                                    type="date"
                                    value={row.vaccinationStartDate}
                                    onChange={(event) => {
                                      updateProgramRow(row.id, "vaccinationStartDate", event.target.value);
                                      updateProgramRow(row.id, "vaccinationEndDate", event.target.value);
                                    }}
                                    className="rounded-xl border border-green-100 bg-green-50 p-3 font-bold text-zinc-800 outline-none transition focus:border-green-500 focus:bg-white"
                                  />
                                </label>

                                <label className="grid gap-1 text-sm font-semibold text-zinc-700">
                                  Debicagem
                                  <select
                                    value={row.hasDebicagem || "NAO"}
                                    onChange={(event) => updateProgramRow(row.id, "hasDebicagem", event.target.value)}
                                    className="rounded-xl border border-green-100 bg-green-50 p-3 font-bold text-zinc-800 outline-none transition focus:border-green-500 focus:bg-white"
                                  >
                                    <option value="NAO">Nao</option>
                                    <option value="SIM">Sim</option>
                                  </select>
                                </label>

                                <div className="grid gap-1 text-sm font-semibold text-zinc-700">
                                  Vacina sugerida
                                  <span className="rounded-xl bg-green-50 px-3 py-3 font-bold text-zinc-800">
                                    {row.suggestedName}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => addProgramUsage(row.id)}
                                  disabled={(row.usages || []).length >= MAX_PROGRAM_VACCINES_PER_DAY}
                                  className="w-full rounded-xl bg-green-600 px-4 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-zinc-300 xl:w-auto"
                                >
                                  Adicionar vacina ({(row.usages || []).length}/{MAX_PROGRAM_VACCINES_PER_DAY})
                                </button>
                              </div>

                              <div className="grid gap-2">
                                {(row.usages || []).map((usage) => (
                                  <div
                                    key={usage.id}
                                    className="grid gap-3 rounded-xl border border-green-100 bg-green-50 p-3"
                                  >
                                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Vacina estoque
                                        <select
                                          value={usage.vaccineId}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "vaccineId", event.target.value)}
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        >
                                          <option value="">
                                            Manter como evento
                                          </option>
                                          {sortedVaccines.map((vaccine) => (
                                            <option key={vaccine.id} value={vaccine.id}>
                                              {vaccine.nome} | estoque: {calculateStock(vaccine.id)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      <button
                                        type="button"
                                        onClick={() => removeProgramUsage(row.id, usage.id)}
                                        className="min-h-[48px] rounded-xl bg-red-50 px-4 py-3 font-bold text-red-600 transition hover:bg-red-100"
                                      >
                                        Remover
                                      </button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8 xl:items-end">
                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        CC/frasco
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={getUsageFlaskCc(usage)}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "flaskCc", event.target.value)}
                                          placeholder="5000"
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        />
                                      </label>

                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        CC/ave
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={getUsageDosePerBirdCc(usage)}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "dosePerBirdCc", event.target.value)}
                                          placeholder="0,3"
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        />
                                      </label>

                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Aves vacinadas
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={getUsageBirdsVaccinated(usage)}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "birdsVaccinated", event.target.value)}
                                          placeholder="10000"
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        />
                                      </label>

                                      <div className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Frascos necessarios
                                        <span className="min-h-[48px] rounded-xl bg-white px-3 py-3 font-bold text-green-700">
                                          {formatQuantity(getUsageRequiredFlasks(usage))}
                                        </span>
                                      </div>

                                      <div className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Aves/frasco
                                        <span className="min-h-[48px] rounded-xl bg-white px-3 py-3 font-bold text-green-700">
                                          {formatQuantity(getUsageBirdsPerFlask(usage))}
                                        </span>
                                      </div>

                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Via
                                        <select
                                          value={usage.applicationMethod || row.defaultMethod || "Ocular"}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "applicationMethod", event.target.value)}
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        >
                                          {APPLICATION_METHODS.map((method) => (
                                            <option key={method} value={method}>
                                              {method}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Custo a cada mil aves
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={usage.laborCost || ""}
                                          onChange={(event) => updateProgramUsage(row.id, usage.id, "laborCost", event.target.value)}
                                          placeholder="0,00"
                                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                                        />
                                      </label>

                                      <div className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-700">
                                        Custo
                                        <span className="min-h-[48px] rounded-xl bg-white px-3 py-3 font-bold text-green-700">
                                          {usage.vaccineId && (parseQuantity(usage.doses) || getUsageRequiredCc(usage) || getUsageBirdsPerFlask(usage))
                                            ? formatCurrency((getAverageDoseCost(usage.vaccineId) * (parseQuantity(usage.doses) || getUsageRequiredCc(usage) || getUsageBirdsPerFlask(usage))) + getUsageLaborCost(usage))
                                            : "-"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                Observacoes para o vacinador
                <textarea
                  value={form.observations}
                  onChange={(event) => updateForm("observations", event.target.value)}
                  placeholder="Ex.: entrada pelo portao lateral, falar com responsavel, lote especifico..."
                  rows={4}
                  className="resize-y rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addSchedule}
                disabled={isSavingSchedule}
                className="rounded-xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700"
              >
                {isSavingSchedule ? "Salvando..." : "Salvar Programa"}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-green-200 bg-white px-6 py-3 font-bold text-green-700 transition hover:bg-green-100"
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        {scheduleCalendarDays.length > 0 && (
          <section className="mt-6 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                  Calendario do programa
                </p>
                <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                  Vacinas separadas por dia
                </h2>
              </div>
              <span className="w-fit rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                {activeSchedules.length} evento(s)
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {scheduleCalendarDays.map((day) => (
                <article key={day.date} className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-green-800">{day.label}</strong>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-green-700">
                      {day.schedules.length}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {day.schedules.map((schedule) => (
                      <div key={`cal-${schedule.id}`} className="rounded-xl bg-white p-3 text-sm">
                        <p className="font-bold text-zinc-900">
                          {schedule.programDay ? `Dia ${schedule.programDay}` : "Vacina"}
                          {schedule.birdLotName ? ` | ${schedule.birdLotName}` : ""}
                        </p>
                        <p className="mt-1 text-zinc-500">
                          {getScheduleVaccinatorName(schedule)}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-5">
          {activeSchedules.length === 0 && (
            <div className="rounded-2xl border border-green-100 bg-white p-6 text-zinc-500 shadow-sm">
              Nenhum programa registrado.
            </div>
          )}

          {groupedActiveSchedules.map((group) => (
            <div
              key={group.id}
              className="rounded-3xl border border-green-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-green-100 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    {group.subtitle}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                    {group.title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Inicio: {formatDate(group.startDate)} | {group.schedules.length} vacinacao(oes)
                  </p>
                </div>

                <span className="w-fit rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                  Organizado por data
                </span>
              </div>

              <div className="mt-5 grid gap-5">
              {group.schedules.map((schedule) => (
            <article
              key={schedule.id}
              className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 md:text-3xl">
                    {getScheduleVaccinatorName(schedule)}
                  </h2>

                  <span
                    className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(schedule.status)}`}
                  >
                    {normalizeRequestStatus(schedule.status)}
                  </span>

                  {(schedule.vaccinatorEmail || schedule.vaccinatorPhone || schedule.vaccinatorNotificationContact) && (
                    <p className="mt-1 text-zinc-500">
                      Contato: {schedule.vaccinatorPhone || "-"} | {schedule.vaccinatorEmail || "-"}
                      {schedule.vaccinatorNotificationContact ? ` | Email de notificacao: ${schedule.vaccinatorNotificationContact}` : ""}
                    </p>
                  )}

                  {(schedule.programDay || schedule.birdLotName) && (
                    <p className="mt-2 text-sm font-semibold text-green-700">
                      {schedule.programDay ? `Dia ${schedule.programDay} do programa` : "Programa"}
                      {schedule.birdLotName ? ` | Lote: ${schedule.birdLotName}` : ""}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:min-w-[520px]">
                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Vacinacao
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {getVaccinationPeriod(schedule)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Debicagem
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {schedule.hasDebicagem === "SIM" ? "Sim" : "Nao"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Via
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {schedule.applicationMethod || schedule.vaccineUsages?.[0]?.applicationMethod || "-"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Frascos necessarios
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {formatQuantity(getScheduleTotalFlasks(schedule))}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Custo calculado por aves
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {formatCurrency(getLaborCost(schedule))}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Custo total
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {formatCurrency(getScheduleTotalCost(schedule))}
                    </p>
                  </div>

                  {schedule.productionEndDate && (
                    <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Fim 100 semanas
                      </p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">
                        {formatDate(schedule.productionEndDate)}
                      </p>
                    </div>
                  )}

                </div>
              </div>

              {Array.isArray(schedule.vaccineUsages) && schedule.vaccineUsages.length > 0 && (
                <div className="mt-5 rounded-xl border border-green-100 bg-green-50 p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    Vacinas usadas
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {schedule.vaccineUsages.map((usage, index) => {
                      const vaccine = getVaccine(usage.vaccineId);
                      const fabricante = usage.fabricante || vaccine?.fabricante || "-";
                      const flaskCc = getUsageFlaskCc(usage);
                      const dosePerBirdCc = getUsageDosePerBirdCc(usage);
                      const birdsVaccinated = getUsageBirdsVaccinated(usage);
                      const requiredFlasks = getUsageRequiredFlasks(usage);
                      const birdsPerFlask = getUsageBirdsPerFlask(usage);

                      return (
                        <div
                          key={`${usage.vaccineId}-${index}`}
                          className="rounded-2xl border border-green-100 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-bold text-zinc-900">
                                {usage.vacina || "Vacina"}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-zinc-500">
                                Fabricante: {fabricante}
                              </p>
                            </div>
                            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700">
                              {formatQuantity(usage.doses)} cc
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Frasco</span>
                              {flaskCc ? `${flaskCc} cc` : "-"}
                            </p>
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Dose/ave</span>
                              {dosePerBirdCc ? `${dosePerBirdCc} cc` : "-"}
                            </p>
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Aves vacinadas</span>
                              {birdsVaccinated ? formatQuantity(birdsVaccinated) : "-"}
                            </p>
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Frascos necessarios</span>
                              {requiredFlasks > 0 ? formatQuantity(requiredFlasks) : "-"}
                            </p>
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Aves/frasco</span>
                              {birdsPerFlask > 0 ? formatQuantity(birdsPerFlask) : "-"}
                            </p>
                            <p className="rounded-xl bg-green-50 p-3">
                              <span className="block font-bold text-green-700">Via</span>
                              {usage.applicationMethod || "-"}
                            </p>
                          </div>

                          {getUsageLaborCost(usage) > 0 && (
                            <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm font-bold text-zinc-700">
                              Custo calculado por aves: {formatCurrency(getUsageLaborCost(usage))}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(!Array.isArray(schedule.vaccineUsages) || schedule.vaccineUsages.length === 0) && schedule.programSuggestedName && (
                <div className="mt-5 rounded-xl border border-green-100 bg-green-50 p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    Evento do programa
                  </p>
                  <p className="mt-2 font-bold text-zinc-900">
                    {schedule.programSuggestedName}
                  </p>
                </div>
              )}

              {editingScheduleId === schedule.id && (
                <div className="mt-5 grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="font-bold text-zinc-900">
                      Trocar vacina deste programa
                    </p>
                    <button
                      type="button"
                      onClick={addEditingUsage}
                      disabled={editingUsages.length >= MAX_PROGRAM_VACCINES_PER_DAY}
                      className="w-fit rounded-xl bg-white px-4 py-2 font-bold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      Adicionar vacina ({editingUsages.length}/{MAX_PROGRAM_VACCINES_PER_DAY})
                    </button>
                  </div>

                  {editingUsages.map((usage) => (
                    <div
                      key={usage.id}
                      className="grid gap-3 rounded-xl border border-green-100 bg-white p-3"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <select
                          value={usage.vaccineId}
                          onChange={(event) => updateEditingUsage(usage.id, "vaccineId", event.target.value)}
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        >
                          <option value="">
                            Selecione a vacina
                          </option>
                          {sortedVaccines.map((vaccine) => (
                            <option key={vaccine.id} value={vaccine.id}>
                              {vaccine.nome} | estoque: {calculateStock(vaccine.id)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => removeEditingUsage(usage.id)}
                          className="min-h-[48px] rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7 xl:items-end">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getUsageFlaskCc(usage)}
                          onChange={(event) => updateEditingUsage(usage.id, "flaskCc", event.target.value)}
                          placeholder="CC/frasco"
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        />

                        <input
                          type="text"
                          inputMode="decimal"
                          value={getUsageDosePerBirdCc(usage)}
                          onChange={(event) => updateEditingUsage(usage.id, "dosePerBirdCc", event.target.value)}
                          placeholder="CC/ave"
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        />

                        <input
                          type="text"
                          inputMode="numeric"
                          value={getUsageBirdsVaccinated(usage)}
                          onChange={(event) => updateEditingUsage(usage.id, "birdsVaccinated", event.target.value)}
                          placeholder="Aves vacinadas"
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        />

                        <span className="min-h-[48px] rounded-xl bg-white px-3 py-3 font-bold text-green-700 ring-1 ring-green-100">
                          {formatQuantity(getUsageRequiredFlasks(usage))} frasco(s)
                        </span>

                        <span className="min-h-[48px] rounded-xl bg-white px-3 py-3 font-bold text-green-700 ring-1 ring-green-100">
                          {formatQuantity(getUsageBirdsPerFlask(usage))} aves/frasco
                        </span>

                        <select
                          value={usage.applicationMethod || "Ocular"}
                          onChange={(event) => updateEditingUsage(usage.id, "applicationMethod", event.target.value)}
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        >
                          {APPLICATION_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          inputMode="decimal"
                          value={usage.laborCost || ""}
                          onChange={(event) => updateEditingUsage(usage.id, "laborCost", event.target.value)}
                          placeholder="Custo a cada mil aves"
                          className="min-w-0 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => saveVaccineReplacement(schedule)}
                      className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                    >
                      Salvar troca e notificar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingScheduleId(null);
                        setEditingUsages([]);
                      }}
                      className="rounded-xl border border-green-200 bg-white px-5 py-3 font-bold text-green-700 transition hover:bg-green-100"
                    >
                      Cancelar troca
                    </button>
                  </div>
                </div>
              )}

              {(schedule.farmAddress || schedule.farmLocation || schedule.observations) && (
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-green-100 bg-white p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Endereco
                    </p>
                    <p className="mt-2 text-zinc-700">
                      {schedule.farmAddress || "Nao informado"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-green-100 bg-white p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Localizacao
                    </p>
                    {schedule.farmLocation ? (
                      <a
                        href={getMapsLink(schedule.farmLocation)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-words font-bold text-green-700 underline decoration-green-300 underline-offset-4"
                      >
                        Abrir no Google Maps
                      </a>
                    ) : (
                      <p className="mt-2 break-words text-zinc-700">Nao informada</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-green-100 bg-white p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                      Observacoes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-zinc-700">
                      {schedule.observations || "Nenhuma observacao"}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => startVaccineEdit(schedule)}
                  className="rounded-xl bg-green-50 px-5 py-3 font-bold text-green-700 transition hover:bg-green-100"
                >
                  Trocar vacina
                </button>

                {(schedule.programId || schedule.scheduleMode === "PROGRAMA_120_DIAS") && (
                  <button
                    type="button"
                    onClick={() => openProgramReport(schedule)}
                    className="rounded-xl bg-white px-5 py-3 font-bold text-green-700 ring-1 ring-green-200 transition hover:bg-green-50"
                  >
                    Relatorio 120 dias
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => cancelSchedule(schedule.id)}
                  className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
                >
                  Cancelar Programa
                </button>
              </div>
            </article>
              ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

export default Schedule;
