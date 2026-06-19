import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearVaccinatorNotifications,
  getVaccinatorPortal,
  loginVaccinator,
  postponeVaccination,
  requestExtraDoses,
  sendRequestMessage,
  updateVaccinatorNotificationContact,
  updateRequestStatus,
  uploadTemperaturePhoto,
} from "./api";

function formatDate(date) {
  if (!date) {
    return "-";
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatPeriod(startDate, endDate) {
  if (!startDate && !endDate) {
    return "-";
  }

  if (!startDate || !endDate) {
    return formatDate(startDate || endDate);
  }

  return `${formatDate(startDate)} ate ${formatDate(endDate)}`;
}

function normalizeStatus(status) {
  if (status === "CONFIRMADO") {
    return "CONFIRMADA";
  }

  if (status === "RECUSADO") {
    return "RECUSADA";
  }

  if (status === "ACEITA") {
    return "CONFIRMADA";
  }

  if (status === "EM_EXECUCAO") {
    return "EM_ANDAMENTO";
  }

  if (status === "ENVIADA_PARA_CONFERENCIA") {
    return "AGUARDANDO_CONFIRMACAO_ADMIN";
  }

  return status || "PENDENTE";
}

function statusClass(status) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "CONFIRMADA") {
    return "status status-confirmed";
  }

  if (normalizedStatus === "RECUSADA") {
    return "status status-refused";
  }

  if (normalizedStatus === "EM_ANDAMENTO") {
    return "status status-progress";
  }

  if (normalizedStatus === "CONCLUIDA") {
    return "status status-done";
  }

  if (normalizedStatus === "AGUARDANDO_CONFIRMACAO_ADMIN") {
    return "status status-review";
  }

  if (normalizedStatus === "AJUSTE_SOLICITADO") {
    return "status status-adjustment";
  }

  if (normalizedStatus === "CONCLUIDA_CONFIRMADA") {
    return "status status-done";
  }

  return "status status-pending";
}

function isAwaitingAdminConfirmation(status) {
  const normalizedStatus = normalizeStatus(status);

  return normalizedStatus === "AGUARDANDO_CONFIRMACAO_ADMIN" || normalizedStatus === "CONCLUIDA";
}

function isStandaloneApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone
  );
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseQuantity(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }

  return parsed.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
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

  const usageCost = Array.isArray(record?.vaccineUsages)
    ? record.vaccineUsages.reduce((total, usage) => total + getUsageLaborCost(usage), 0)
    : 0;

  return usageCost || parseQuantity(record?.programLaborCost);
}

function getUsageLaborCost(usage) {
  return parseQuantity(usage?.laborCost ?? usage?.maoDeObra ?? 0);
}

function getRequestTotalDoses(request) {
  return (request.vaccineUsages || []).reduce((total, usage) => total + Number(usage.doses || 0), 0);
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

  return String(first?.farmName || "").localeCompare(String(second?.farmName || ""), "pt-BR");
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

function getUsageBirdsVaccinated(item) {
  return item?.birdsVaccinated ?? item?.avesVacinadas ?? "";
}

function getUsageRequiredFlasks(item) {
  return parseQuantity(item?.requiredFlasks ?? item?.totalFrascos) || calculateRequiredFlasks(
    item?.flaskCc || item?.flasks || item?.frascos,
    getUsageBirdsVaccinated(item),
    item?.dosePerBirdCc
  );
}

function getUsageTechnicalText(item) {
  const flaskCc = String(item.flaskCc || item.flasks || item.frascos || "").trim();
  const dosePerBirdCc = String(item.dosePerBirdCc || "").trim();
  const birdsVaccinated = String(getUsageBirdsVaccinated(item) || "").trim();
  const requiredFlasks = getUsageRequiredFlasks(item);
  const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);
  const parts = [];

  if (flaskCc) {
    parts.push(`${flaskCc} cc/frasco`);
  }

  if (dosePerBirdCc) {
    parts.push(`${dosePerBirdCc} cc/ave`);
  }

  if (birdsVaccinated) {
    parts.push(`${formatQuantity(birdsVaccinated)} aves vacinadas`);
  }

  if (requiredFlasks > 0) {
    parts.push(`${formatQuantity(requiredFlasks)} frasco(s) necessarios`);
  }

  if (birdsPerFlask > 0) {
    parts.push(`${formatQuantity(birdsPerFlask)} aves/frasco`);
  }

  return parts.join(" | ");
}

function getRecordMaterials(record) {
  const storedMaterials = Array.isArray(record.materialsUsed) && record.materialsUsed.length > 0
    ? record.materialsUsed
    : Array.isArray(record.actualVaccineUsages) && record.actualVaccineUsages.length > 0
      ? record.actualVaccineUsages.map((item) => ({
          ...item,
          doses: parseQuantity(item.quantityUsed || item.doses),
          source: "Uso real confirmado pela granja",
        }))
    : [
        ...(Array.isArray(record.vaccineUsages) ? record.vaccineUsages : []),
        ...(Array.isArray(record.doseRequest?.confirmedItems) ? record.doseRequest.confirmedItems : []),
      ];

  return storedMaterials
    .map((item) => ({
      id: item.id || item.vaccineId || item.codigo || item.vacina,
      vacina: item.vacina || item.name || "Vacina",
      fabricante: item.fabricante || item.manufacturer || "",
      doses: parseQuantity(item.doses),
      technicalDetails: item.technicalDetails || getUsageTechnicalText(item),
      source: item.source || "",
    }))
    .filter((item) => item.vacina && item.doses > 0);
}

function getRequestUsageItems(request) {
  return [
    ...(Array.isArray(request.vaccineUsages)
      ? request.vaccineUsages.map((item) => ({
          ...item,
          source: "Agendamento",
        }))
      : []),
    ...(Array.isArray(request.doseRequest?.confirmedItems)
      ? request.doseRequest.confirmedItems.map((item) => ({
          ...item,
          source: "Doses liberadas",
        }))
      : []),
  ]
    .map((item, index) => ({
      id: String(item.id || `${request.id}-uso-${index}`),
      vaccineId: String(item.vaccineId || "").trim(),
      vacina: item.vacina || item.name || "Vacina",
      codigo: item.codigo || "",
      fabricante: item.fabricante || item.manufacturer || "",
      plannedDoses: parseQuantity(item.doses),
      quantityTaken: String(item.quantityTaken ?? item.doses ?? ""),
      quantityUsed: String(item.quantityUsed ?? item.doses ?? ""),
      flaskCc: item.flaskCc || item.flasks || item.frascos || "",
      dosePerBirdCc: item.dosePerBirdCc || "",
      birdsVaccinated: getUsageBirdsVaccinated(item),
      requiredFlasks: item.requiredFlasks || item.totalFrascos || "",
      birdsPerFlask: item.birdsPerFlask || "",
      applicationMethod: item.applicationMethod || item.via || request.applicationMethod || "",
      source: item.source || "",
    }))
    .filter((item) => item.vaccineId && item.plannedDoses > 0);
}

function getUsageReturned(row) {
  return Math.max(0, parseQuantity(row.quantityTaken) - parseQuantity(row.quantityUsed));
}

function getRecordSummary(record) {
  if (record.completionSummary) {
    return record.completionSummary;
  }

  const materials = getRecordMaterials(record);
  const materialsText = materials.length > 0
    ? materials.map((item) => `${item.vacina} (${item.doses} dose(s)${item.technicalDetails ? `, ${item.technicalDetails}` : ""})`).join(", ")
    : "vacina nao informada";

  return `${record.vaccinatorName || "Vacinador"} efetuou ${materialsText} na granja ${record.farmName || "Granja"}.`;
}

function getNotifiedIds() {
  try {
    return JSON.parse(localStorage.getItem("shownNotificationIds") || "[]");
  } catch (error) {
    console.log(error);
    return [];
  }
}

function saveNotifiedIds(ids) {
  localStorage.setItem("shownNotificationIds", JSON.stringify(Array.from(new Set(ids)).slice(-80)));
}

async function showNativeNotification(notification) {
  const title = notification.title || "ImmuHen Vacinador";
  const options = {
    body: notification.message || "",
    tag: String(notification.id),
    data: {
      url: window.location.href,
    },
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return;
  }

  new Notification(title, options);
}

function App() {
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [session, setSession] = useState(() => {
    const storedSession = localStorage.getItem("vaccinatorSession");

    try {
      return storedSession
        ? JSON.parse(storedSession)
        : null;
    } catch (error) {
      localStorage.removeItem("vaccinatorSession");
      return null;
    }
  });
  const [credentials, setCredentials] = useState({
    credential: "",
    email: "",
    phone: "",
  });
  const [portalData, setPortalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installMessage, setInstallMessage] = useState("");
  const [temperatureForms, setTemperatureForms] = useState({});
  const [cameraRequestId, setCameraRequestId] = useState(null);
  const [doseMessages, setDoseMessages] = useState({});
  const [chatMessages, setChatMessages] = useState({});
  const [completionNotes, setCompletionNotes] = useState({});
  const [usageForms, setUsageForms] = useState({});
  const [postponeForms, setPostponeForms] = useState({});
  const [farmFilter, setFarmFilter] = useState("TODAS");
  const [notificationContactDraft, setNotificationContactDraft] = useState("");
  const [notificationContactDirty, setNotificationContactDirty] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  const farmFilterOptions = useMemo(() => {
    const names = [
      ...(portalData?.linkedFarms || []).map((farm) => farm.farmName),
      ...(portalData?.requests || []).map((request) => request.farmName),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean);

    return Array.from(new Set(names)).sort((first, second) => (
      first.localeCompare(second, "pt-BR")
    ));
  }, [portalData]);

  const activeRequests = useMemo(() => {
    return (portalData?.requests || [])
      .filter((request) => {
        const status = normalizeStatus(request.status);

        return ![
          "AGUARDANDO_CONFIRMACAO_ADMIN",
          "CONCLUIDA",
          "CONCLUIDA_CONFIRMADA",
          "RECUSADA",
          "CANCELADA",
        ].includes(status);
      })
      .filter((request) => (
        farmFilter === "TODAS" ||
        String(request.farmName || "").trim() === farmFilter
      ))
      .sort(sortVaccinationRecords);
  }, [portalData, farmFilter]);

  const reviewRequests = useMemo(() => {
    return (portalData?.requests || [])
      .filter((request) => isAwaitingAdminConfirmation(request.status))
      .filter((request) => (
        farmFilter === "TODAS" ||
        String(request.farmName || "").trim() === farmFilter
      ))
      .sort(sortVaccinationRecords);
  }, [portalData, farmFilter]);

  const refusedRequests = useMemo(() => {
    return (portalData?.requests || [])
      .filter((request) => normalizeStatus(request.status) === "RECUSADA")
      .filter((request) => (
        farmFilter === "TODAS" ||
        String(request.farmName || "").trim() === farmFilter
      ))
      .sort(sortVaccinationRecords);
  }, [portalData, farmFilter]);

  const pendingRequests = useMemo(() => {
    return activeRequests.filter((request) => (
      normalizeStatus(request.status) === "PENDENTE"
    ));
  }, [activeRequests]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayRequests = useMemo(() => (
    activeRequests.filter((request) => (
      (request.vaccinationStartDate || request.date) === todayKey
    ))
  ), [activeRequests, todayKey]);
  const overdueRequests = useMemo(() => (
    activeRequests.filter((request) => {
      const date = request.vaccinationEndDate || request.date || request.vaccinationStartDate;

      return date && date < todayKey;
    })
  ), [activeRequests, todayKey]);
  const nextRequest = useMemo(() => (
    activeRequests.find((request) => {
      const date = request.vaccinationStartDate || request.date;

      return date && date >= todayKey;
    })
  ), [activeRequests, todayKey]);

  const agendaDays = useMemo(() => {
    const grouped = new Map();

    activeRequests.forEach((request) => {
      const date = request.vaccinationStartDate || request.date || "sem-data";
      const group = grouped.get(date) || {
        date,
        label: date === "sem-data" ? "Sem data definida" : formatDate(date),
        requests: [],
      };

      group.requests.push(request);
      grouped.set(date, group);
    });

    return Array.from(grouped.values()).sort((first, second) => (
      first.date.localeCompare(second.date)
    ));
  }, [activeRequests]);

  const notificationCount = portalData?.notifications?.length || 0;
  const monthlyReports = portalData?.monthlyReports || [];
  const currentMonthReport = monthlyReports.find((report) => report.month === getCurrentMonthKey());

  async function loadPortal(nextSession = session) {
    if (!nextSession?.vaccinatorId) {
      return;
    }

    try {
      const data = await getVaccinatorPortal(nextSession.vaccinatorId);
      setPortalData(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message);

      if (error.status === 404 || error.status === 402) {
        localStorage.removeItem("vaccinatorSession");
        setSession(null);
        setPortalData(null);
      }
    }
  }

  useEffect(() => {
    loadPortal();

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        loadPortal();
      }
    }, 30000);
    const refreshOnFocus = () => {
      if (!document.hidden) {
        loadPortal();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [session]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const notifications = portalData?.notifications || [];
    const shownIds = getNotifiedIds();
    const newNotifications = notifications.filter((notification) => (
      notification.id && !shownIds.includes(notification.id)
    ));

    newNotifications.slice(-5).forEach((notification) => {
      showNativeNotification(notification).catch((error) => console.log(error));
    });

    if (newNotifications.length > 0) {
      saveNotifiedIds([
        ...shownIds,
        ...newNotifications.map((notification) => notification.id),
      ]);
    }
  }, [portalData]);

  useEffect(() => {
    if (!notificationContactDirty) {
      setNotificationContactDraft(portalData?.vaccinator?.notificationContact || "");
    }
  }, [portalData?.vaccinator?.notificationContact, notificationContactDirty]);

  useEffect(() => {
    if (farmFilter !== "TODAS" && !farmFilterOptions.includes(farmFilter)) {
      setFarmFilter("TODAS");
    }
  }, [farmFilter, farmFilterOptions]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallMessage("");
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setInstallMessage("App instalado no celular.");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopTemperatureCamera(false);
    };
  }, []);

  function updateCredentials(field, value) {
    setCredentials({
      ...credentials,
      [field]: value,
    });
  }

  function updateNotificationContact(value) {
    setNotificationContactDirty(true);
    setNotificationContactDraft(value);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await loginVaccinator(credentials);
      const nextSession = {
        vaccinatorId: data.vaccinator.id,
        name: data.vaccinator.name,
      };

      localStorage.setItem("vaccinatorSession", JSON.stringify(nextSession));
      setSession(nextSession);
      setPortalData(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function installApp() {
    if (isStandaloneApp()) {
      setInstallMessage("O app ja esta instalado neste aparelho.");
      return;
    }

    if (!installPrompt) {
      setInstallMessage("No celular, use o menu do navegador e toque em Adicionar a tela inicial.");
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function enableNativeNotifications() {
    if (!("Notification" in window)) {
      setInstallMessage("Este navegador nao suporta notificacoes nativas.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setInstallMessage("Notificacoes ativadas para o ImmuHen Vacinador.");
      return;
    }

    setInstallMessage("As notificacoes nao foram liberadas neste aparelho.");
  }

  function logout() {
    localStorage.removeItem("vaccinatorSession");
    setSession(null);
    setPortalData(null);
    setCredentials({
      credential: "",
      email: "",
      phone: "",
    });
  }

  async function answerRequest(request, status) {
    let payload = {
      vaccinatorId: session?.vaccinatorId || "",
      vaccinatorEmail: vaccinator?.email || "",
      vaccinatorPhone: vaccinator?.phone || "",
    };

    if (status === "RECUSADA") {
      const reason = window.prompt("Informe o motivo da recusa:");

      if (reason === null) {
        return;
      }

      if (!reason.trim()) {
        setMessage("Informe o motivo para recusar a vacinacao.");
        return;
      }

      const confirmed = window.confirm("Confirmar recusa desta vacinacao?");

      if (!confirmed) {
        return;
      }

      payload = {
        ...payload,
        refusalReason: reason.trim(),
      };
    }

    setLoading(true);
    setMessage("");

    try {
      await updateRequestStatus(request.id, status, payload);
      await loadPortal();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateDoseMessage(requestId, value) {
    setDoseMessages({
      ...doseMessages,
      [requestId]: value,
    });
  }

  function getUsageRows(request) {
    return usageForms[request.id] || getRequestUsageItems(request);
  }

  function updateUsageRow(request, rowId, field, value) {
    const rows = getUsageRows(request);

    setUsageForms({
      ...usageForms,
      [request.id]: rows.map((row) => (
        row.id === rowId
          ? { ...row, [field]: value }
          : row
      )),
    });
  }

  function updatePostponeForm(requestId, field, value) {
    setPostponeForms({
      ...postponeForms,
      [requestId]: {
        ...(postponeForms[requestId] || {}),
        [field]: value,
      },
    });
  }

  function updateTemperatureNotes(requestId, value) {
    setTemperatureForms({
      ...temperatureForms,
      [requestId]: {
        ...(temperatureForms[requestId] || {}),
        temperatureNotes: value,
      },
    });
  }

  function updateCompletionNotes(requestId, value) {
    setCompletionNotes({
      ...completionNotes,
      [requestId]: value,
    });
  }

  function updateChatMessage(requestId, value) {
    setChatMessages({
      ...chatMessages,
      [requestId]: value,
    });
  }

  function stopTemperatureCamera(updateState = true) {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    if (updateState) {
      setCameraRequestId(null);
    }
  }

  async function startTemperatureCamera(requestId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Este aparelho ou navegador nao liberou acesso direto a camera.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      stopTemperatureCamera(false);
      setCameraRequestId(requestId);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
        },
      });

      cameraStreamRef.current = stream;

      window.requestAnimationFrame(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        }
      });
    } catch (error) {
      setCameraRequestId(null);
      setMessage("Nao foi possivel abrir a camera. Verifique a permissao do navegador.");
    } finally {
      setLoading(false);
    }
  }

  function captureTemperaturePhoto(requestId) {
    const video = cameraVideoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("A camera ainda nao carregou a imagem. Tente novamente em alguns segundos.");
      return;
    }

    const maxSize = 900;
    const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const capturedAt = new Date().toISOString();

    setTemperatureForms((currentForms) => ({
      ...currentForms,
      [requestId]: {
        ...(currentForms[requestId] || {}),
        temperaturePhoto: canvas.toDataURL("image/jpeg", 0.58),
        temperaturePhotoName: `temperatura-vacina-${Date.now()}.jpg`,
        temperaturePhotoCaptureMode: "CAMERA_LIVE",
        temperaturePhotoCapturedAt: capturedAt,
      },
    }));
    setMessage("");
    stopTemperatureCamera();
  }

  async function saveTemperaturePhoto(request) {
    const form = temperatureForms[request.id] || {};

    if (!form.temperaturePhoto) {
      setMessage("Tire a foto da temperatura pela camera antes de salvar.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await uploadTemperaturePhoto(request.id, form);
      setTemperatureForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[request.id];
        return nextForms;
      });
      await loadPortal();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function completeRequest(request) {
    const form = temperatureForms[request.id] || {};
    const usageRows = getUsageRows(request);
    const invalidRow = usageRows.find((row) => {
      const taken = parseQuantity(row.quantityTaken);
      const used = parseQuantity(row.quantityUsed);

      return taken < 0 || used < 0 || used > taken;
    });
    const totalUsed = usageRows.reduce((total, row) => total + parseQuantity(row.quantityUsed), 0);

    if (usageRows.length === 0) {
      setMessage("Informe a vacina usada antes de concluir.");
      return;
    }

    if (invalidRow) {
      setMessage("A quantidade usada nao pode ser negativa nem maior que a quantidade levada.");
      return;
    }

    if (totalUsed <= 0) {
      setMessage("Informe a quantidade realmente usada antes de concluir.");
      return;
    }

    const confirmed = window.confirm(
      "Enviar esta vacinacao para conferencia da granja?\n\nO estoque so sera baixado depois que o administrador confirmar no sistema principal."
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (form.temperaturePhoto) {
        await uploadTemperaturePhoto(request.id, form);
      }

      await updateRequestStatus(request.id, "AGUARDANDO_CONFIRMACAO_ADMIN", {
        vaccinatorId: session?.vaccinatorId || "",
        vaccinatorEmail: vaccinator?.email || "",
        vaccinatorPhone: vaccinator?.phone || "",
        completionObservation: completionNotes[request.id] || "",
        usageConfirmation: usageRows.map((row) => ({
          id: row.id,
          vaccineId: row.vaccineId,
          vacina: row.vacina,
          codigo: row.codigo,
          fabricante: row.fabricante,
          quantityTaken: parseQuantity(row.quantityTaken),
          quantityUsed: parseQuantity(row.quantityUsed),
          quantityReturned: getUsageReturned(row),
          flaskCc: row.flaskCc,
          dosePerBirdCc: row.dosePerBirdCc,
          birdsVaccinated: row.birdsVaccinated,
          requiredFlasks: row.requiredFlasks,
          birdsPerFlask: row.birdsPerFlask,
          applicationMethod: row.applicationMethod,
          source: row.source,
        })),
      });
      setTemperatureForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[request.id];
        return nextForms;
      });
      setUsageForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[request.id];
        return nextForms;
      });
      setCompletionNotes((currentNotes) => {
        const nextNotes = { ...currentNotes };
        delete nextNotes[request.id];
        return nextNotes;
      });
      await loadPortal();
      setMessage("Vacinacao enviada para conferencia da granja. O estoque ainda nao foi baixado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendDoseRequest(request) {
    const message = doseMessages[request.id] || "";

    if (!message.trim()) {
      setMessage("Informe quais doses o vacinador precisa solicitar.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await requestExtraDoses(request.id, message.trim(), {
        vaccinatorId: session?.vaccinatorId || "",
        vaccinatorEmail: vaccinator?.email || "",
        vaccinatorPhone: vaccinator?.phone || "",
      });
      setDoseMessages({
        ...doseMessages,
        [request.id]: "",
      });
      await loadPortal();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendVaccinationMessage(request) {
    const message = String(chatMessages[request.id] || "").trim();

    if (!message) {
      setMessage("Escreva uma mensagem para enviar para a granja.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await sendRequestMessage(request.id, {
        message,
        vaccinatorId: session?.vaccinatorId || "",
        vaccinatorEmail: vaccinator?.email || "",
        vaccinatorPhone: vaccinator?.phone || "",
        senderName: vaccinator?.name || session.name || "Vacinador",
      });
      setChatMessages({
        ...chatMessages,
        [request.id]: "",
      });
      await loadPortal();
      setMessage("Mensagem enviada para a granja.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendPostponeRequest(request) {
    const form = postponeForms[request.id] || {};

    if (!form.vaccinationStartDate || !form.vaccinationEndDate) {
      setMessage("Informe o novo periodo para adiar a vacinacao.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await postponeVaccination(request.id, {
        vaccinationStartDate: form.vaccinationStartDate,
        vaccinationEndDate: form.vaccinationEndDate,
        reason: form.reason || "",
        vaccinatorId: session?.vaccinatorId || "",
        vaccinatorEmail: vaccinator?.email || "",
        vaccinatorPhone: vaccinator?.phone || "",
      });
      setPostponeForms({
        ...postponeForms,
        [request.id]: {},
      });
      await loadPortal();
      setMessage("Adiamento enviado e a granja foi notificada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveNotificationContact() {
    if (!session?.vaccinatorId) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await updateVaccinatorNotificationContact(
        session.vaccinatorId,
        notificationContactDraft.trim()
      );
      setNotificationContactDirty(false);
      setPortalData(data);
      setInstallMessage("Email de notificacao salvo.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function clearNotifications() {
    if (!session?.vaccinatorId || notificationCount === 0) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await clearVaccinatorNotifications(session.vaccinatorId);
      setPortalData(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-intro">
            <p className="eyebrow">ImmuHen</p>
            <h1>ImmuHen Vacinador</h1>
            <p>
              Entre com o mesmo email e telefone cadastrados pela granja no ImmuHen.
            </p>
            <button className="install-button" type="button" onClick={installApp}>
              Instalar app no celular
            </button>
            {installMessage && <p className="install-message">{installMessage}</p>}
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <h2>Acessar agenda</h2>

            <label>
              Email, telefone, CPF ou codigo
              <input
                type="text"
                value={credentials.credential}
                onChange={(event) => updateCredentials("credential", event.target.value)}
                placeholder="Digite seu identificador"
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={credentials.email}
                onChange={(event) => updateCredentials("email", event.target.value)}
                placeholder="email@exemplo.com"
              />
            </label>

            <label>
              Telefone
              <input
                type="tel"
                value={credentials.phone}
                onChange={(event) => updateCredentials("phone", event.target.value)}
                placeholder="(00) 00000-0000"
              />
            </label>

            {message && <p className="form-message">{message}</p>}

            <button type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const vaccinator = portalData?.vaccinator;

  return (
    <main className="app-page">
      <section className="topbar">
        <div>
          <p className="eyebrow">ImmuHen Vacinador</p>
          <h1>{vaccinator?.name || session.name}</h1>
          <p>{vaccinator?.email} | {vaccinator?.phone}</p>
          {vaccinator?.notificationContact && (
            <p>Email de notificacao: {vaccinator.notificationContact}</p>
          )}
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={installApp}>
            Instalar app
          </button>
          {notificationPermission !== "granted" && (
            <button className="ghost-button" onClick={enableNativeNotifications}>
              Ativar notificacoes
            </button>
          )}
          <button className="ghost-button" onClick={() => loadPortal()} disabled={loading}>
            Atualizar
          </button>
          <button className="dark-button" onClick={logout}>
            Sair
          </button>
        </div>
      </section>

      {message && <p className="page-message">{message}</p>}
      {installMessage && <p className="page-message success-message">{installMessage}</p>}

      <section className="notification-contact-panel">
        <label>
          Email de notificacao
          <input
            type="email"
            value={notificationContactDraft}
            onChange={(event) => updateNotificationContact(event.target.value)}
            placeholder="email@vacinador.com"
          />
        </label>
        <button type="button" onClick={saveNotificationContact} disabled={loading}>
          Salvar contato
        </button>
      </section>

      <section className="summary-grid">
        <article>
          <span>Pendentes</span>
          <strong>{pendingRequests.length}</strong>
        </article>
        <article>
          <span>Hoje</span>
          <strong>{todayRequests.length}</strong>
        </article>
        <article>
          <span>Atrasadas</span>
          <strong>{overdueRequests.length}</strong>
        </article>
        <article>
          <span>Em conferencia</span>
          <strong>{reviewRequests.length}</strong>
        </article>
        <article>
          <span>Granjas</span>
          <strong>{portalData?.linkedFarms?.length || 0}</strong>
        </article>
        <article>
          <span>Notificacoes</span>
          <strong>{notificationCount}</strong>
        </article>
        <article>
          <span>Feitas no mes</span>
          <strong>{currentMonthReport?.total || 0}</strong>
        </article>
        <article>
          <span>Proxima</span>
          <strong>{nextRequest ? formatDate(nextRequest.vaccinationStartDate || nextRequest.date) : "-"}</strong>
        </article>
      </section>

      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <h2>Granjas Vinculadas</h2>

            {(portalData?.linkedFarms || []).length === 0 && (
              <p className="muted">Nenhuma granja vinculada.</p>
            )}

            {(portalData?.linkedFarms || []).map((farm) => (
              <article className="farm-card" key={`${farm.farmName}-${farm.document}`}>
                <div className="farm-card-head">
                  <h3>{farm.farmName}</h3>
                  {farm.primaryColor && (
                    <span
                      className="farm-color"
                      style={{ backgroundColor: farm.primaryColor }}
                      aria-label={`Cor da granja ${farm.farmName}`}
                    />
                  )}
                </div>
                <p>Cidade: {farm.city || "-"}</p>
                <p>CNPJ/CPF: {farm.document || "-"}</p>
                <p>Proprietario: {farm.owner || "-"}</p>
                <p>Endereco: {farm.address || "-"}</p>
                <p>
                  Localizacao:{" "}
                  {farm.location ? (
                    <a href={getMapsLink(farm.location)} target="_blank" rel="noreferrer">
                      Abrir no Google Maps
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => setFarmFilter(farm.farmName || "TODAS")}
                >
                  Ver agenda desta granja
                </button>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Notificacoes</h2>
              {notificationCount > 0 && (
                <button
                  className="ghost-button compact-button"
                  type="button"
                  onClick={clearNotifications}
                  disabled={loading}
                >
                  Limpar notificacoes
                </button>
              )}
            </div>

            {(portalData?.notifications || []).length === 0 && (
              <p className="muted">Nenhuma notificacao.</p>
            )}

            {(portalData?.notifications || []).map((notification) => (
              <article className="notification-card" key={notification.id}>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <span>{notification.createdAt}</span>
              </article>
            ))}
          </section>

          <section className="panel">
            <h2>Relatorios mensais</h2>

            {monthlyReports.length === 0 && (
              <p className="muted">Nenhuma vacinacao concluida registrada.</p>
            )}

            {monthlyReports.map((report) => (
              <article className="report-card" key={report.month}>
                <div className="report-head">
                  <strong>{report.label}</strong>
                  <span>{report.total} feita(s)</span>
                </div>

                <div className="report-farms">
                  {report.farms.map((farm) => (
                    <p key={farm.farmName}>
                      {farm.farmName}: {farm.total}
                    </p>
                  ))}
                </div>

                <div className="report-records">
                  {report.records.map((record) => {
                    const materials = getRecordMaterials(record);

                    return (
                      <article className="report-record-item" key={record.id}>
                        <strong>{getRecordSummary(record)}</strong>
                        <span>{record.systemConfirmedAt || record.completedAt || "-"}</span>

                        {materials.length > 0 && (
                          <div className="report-materials">
                            {materials.map((material, index) => (
                              <em key={`${material.id}-${index}`}>
                                {material.vacina}: {material.doses} cc{material.technicalDetails ? ` | ${material.technicalDetails}` : ""}
                              </em>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Programas de vacinacao</h2>
              <p className="muted">
                Ordenados por granja, data e dia do programa.
              </p>
            </div>

            <label className="farm-filter">
              Granja
              <select
                value={farmFilter}
                onChange={(event) => setFarmFilter(event.target.value)}
              >
                <option value="TODAS">Todas as granjas</option>
                {farmFilterOptions.map((farmName) => (
                  <option key={farmName} value={farmName}>
                    {farmName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {activeRequests.length === 0 && (
            <p className="muted">
              {reviewRequests.length > 0
                ? "Nenhuma vacinacao em execucao. Existem pedidos aguardando conferencia abaixo."
                : farmFilter === "TODAS"
                ? "Nenhum programa recebido."
                : "Nenhum programa recebido para esta granja."}
            </p>
          )}

          {agendaDays.length > 0 && (
            <div className="agenda-board">
              {agendaDays.map((day) => (
                <section className="agenda-day" key={day.date}>
                  <div className="agenda-date">
                    <strong>{day.label}</strong>
                    <span>{day.requests.length} evento(s)</span>
                  </div>

                  <div className="agenda-events">
                    {day.requests.map((request) => (
                      <article className="agenda-event" key={`agenda-${request.id}`}>
                        <strong>{request.farmName || "Granja"}</strong>
                        <span>
                          {request.programDay ? `Dia ${request.programDay}` : "Vacina"}
                          {request.birdLotName ? ` | ${request.birdLotName}` : ""}
                        </span>
                        <em>{normalizeStatus(request.status)}</em>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {activeRequests.map((request) => {
            const status = normalizeStatus(request.status);

            return (
              <article className="request-card" key={request.id}>
                <div className="request-head">
                  <div>
                    <h3>{request.farmName || "Granja"}</h3>
                    <p>Proprietario: {request.farmOwner || "-"}</p>
                    {(request.programDay || request.birdLotName) && (
                      <p>
                        {request.programDay ? `Dia ${request.programDay} do programa` : "Programa"}
                        {request.birdLotName ? ` | Lote: ${request.birdLotName}` : ""}
                      </p>
                    )}
                  </div>
                  <span className={statusClass(status)}>{status}</span>
                </div>

                <div className="request-details">
                  <div>
                    <span>Vacinacao</span>
                    <strong>
                      {formatPeriod(
                        request.vaccinationStartDate || request.date,
                        request.vaccinationEndDate || request.date
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Debicagem</span>
                    <strong>{request.hasDebicagem === "SIM" ? "Sim" : "Nao"}</strong>
                  </div>
                  <div>
                    <span>Via</span>
                    <strong>{request.applicationMethod || request.vaccineUsages?.[0]?.applicationMethod || "-"}</strong>
                  </div>
                  <div>
                    <span>Frascos necessarios</span>
                    <strong>{formatQuantity((request.vaccineUsages || []).reduce((total, usage) => total + Number(usage.requiredFlasks || getUsageRequiredFlasks(usage) || 0), 0))}</strong>
                  </div>
                  <div>
                    <span>Mao de obra</span>
                    <strong>{formatCurrency(getLaborCost(request))}</strong>
                  </div>
                </div>

                {Array.isArray(request.vaccineUsages) && request.vaccineUsages.length > 0 && (
                  <div className="dose-box vaccine-list-box">
                    <strong>Vacinas planejadas</strong>
                    <div className="vaccine-usage-grid">
                      {request.vaccineUsages.map((usage, index) => {
                        const flaskCc = String(usage.flaskCc || usage.flasks || usage.frascos || "").trim();
                        const dosePerBirdCc = String(usage.dosePerBirdCc || "").trim();
                        const birdsVaccinated = String(getUsageBirdsVaccinated(usage) || "").trim();
                        const requiredFlasks = getUsageRequiredFlasks(usage);
                        const birdsPerFlask = Number(usage.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);

                        return (
                          <article className="vaccine-usage-card" key={`${usage.vaccineId}-${index}`}>
                            <div className="vaccine-usage-head">
                              <div>
                                <h4>{usage.vacina || "Vacina"}</h4>
                                <p>Fabricante: {usage.fabricante || usage.manufacturer || "-"}</p>
                              </div>
                              <span>{formatQuantity(usage.doses)} cc</span>
                            </div>

                            <div className="vaccine-usage-details">
                              <p><strong>Frasco</strong>{flaskCc ? `${flaskCc} cc` : "-"}</p>
                              <p><strong>Dose/ave</strong>{dosePerBirdCc ? `${dosePerBirdCc} cc` : "-"}</p>
                              <p><strong>Aves vacinadas</strong>{birdsVaccinated ? formatQuantity(birdsVaccinated) : "-"}</p>
                              <p><strong>Frascos necessarios</strong>{requiredFlasks > 0 ? formatQuantity(requiredFlasks) : "-"}</p>
                              <p><strong>Aves/frasco</strong>{birdsPerFlask > 0 ? formatQuantity(birdsPerFlask) : "-"}</p>
                              <p><strong>Via</strong>{usage.applicationMethod || "-"}</p>
                            </div>

                            {getUsageLaborCost(usage) > 0 && (
                              <p className="vaccine-labor">
                                Mao de obra: {formatCurrency(getUsageLaborCost(usage))}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(!Array.isArray(request.vaccineUsages) || request.vaccineUsages.length === 0) && request.programSuggestedName && (
                  <div className="dose-box">
                    <strong>Evento do programa</strong>
                    <p>{request.programSuggestedName}</p>
                  </div>
                )}

                {(request.farmAddress || request.farmLocation || request.observations) && (
                  <div className="request-extra">
                    <div>
                      <span>Endereco</span>
                      <p>{request.farmAddress || "-"}</p>
                    </div>
                    <div>
                      <span>Localizacao</span>
                      {request.farmLocation ? (
                        <p>
                          <a href={getMapsLink(request.farmLocation)} target="_blank" rel="noreferrer">
                            Abrir no Google Maps
                          </a>
                        </p>
                      ) : (
                        <p>-</p>
                      )}
                    </div>
                    <div>
                      <span>Observacoes</span>
                      <p>{request.observations || "-"}</p>
                    </div>
                  </div>
                )}

                <div className="dose-box chat-box">
                  <strong>Mensagens com a granja</strong>
                  <div className="chat-list">
                    {(request.messages || []).length === 0 && (
                      <p className="muted">Nenhuma mensagem nesta vacinacao.</p>
                    )}
                    {(request.messages || []).map((item) => (
                      <article
                        className={`chat-message ${item.senderType === "ADMIN" ? "chat-admin" : "chat-vaccinator"}`}
                        key={item.id}
                      >
                        <strong>{item.senderName || (item.senderType === "ADMIN" ? "Granja" : "Vacinador")}</strong>
                        <p>{item.text}</p>
                        <span>{item.createdAt}</span>
                      </article>
                    ))}
                  </div>
                  <textarea
                    value={chatMessages[request.id] || ""}
                    onChange={(event) => updateChatMessage(request.id, event.target.value)}
                    placeholder="Envie uma mensagem para a granja..."
                  />
                  <button
                    type="button"
                    onClick={() => sendVaccinationMessage(request)}
                    disabled={loading}
                  >
                    Enviar mensagem
                  </button>
                </div>

                {status === "PENDENTE" && (
                  <div className="request-actions">
                    <button
                      onClick={() => answerRequest(request, "CONFIRMADA")}
                      disabled={loading}
                    >
                      Confirmar
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => answerRequest(request, "RECUSADA")}
                      disabled={loading}
                    >
                      Recusar
                    </button>
                  </div>
                )}

                {status === "CONFIRMADA" && (
                  <div className="request-actions">
                    <button
                      onClick={() => answerRequest(request, "EM_ANDAMENTO")}
                      disabled={loading}
                    >
                      Iniciar vacinacao
                    </button>
                  </div>
                )}

                {status === "AJUSTE_SOLICITADO" && (
                  <div className="dose-box adjustment-box">
                    <strong>Ajuste solicitado pela granja</strong>
                    <p>{request.adjustmentReason || request.statusReason || "Revise as informacoes e envie novamente para conferencia."}</p>
                    <button
                      type="button"
                      onClick={() => answerRequest(request, "EM_ANDAMENTO")}
                      disabled={loading}
                    >
                      Corrigir informacoes
                    </button>
                  </div>
                )}

                {(status === "CONFIRMADA" || status === "EM_ANDAMENTO") && (
                  <div className="dose-box">
                    <label>
                      Solicitar doses
                      <textarea
                        value={doseMessages[request.id] || ""}
                        onChange={(event) => updateDoseMessage(request.id, event.target.value)}
                        placeholder="Ex.: preciso de mais 200 doses para concluir o lote."
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => sendDoseRequest(request)}
                      disabled={loading}
                    >
                      Enviar solicitacao
                    </button>
                  </div>
                )}

                {(status === "CONFIRMADA" || status === "EM_ANDAMENTO") && (
                  <div className="dose-box">
                    <strong>Adiar vacinacao</strong>
                    <div className="postpone-grid">
                      <label>
                        Novo inicio
                        <input
                          type="date"
                          value={postponeForms[request.id]?.vaccinationStartDate || ""}
                          onChange={(event) => updatePostponeForm(request.id, "vaccinationStartDate", event.target.value)}
                        />
                      </label>
                      <label>
                        Novo fim
                        <input
                          type="date"
                          value={postponeForms[request.id]?.vaccinationEndDate || ""}
                          onChange={(event) => updatePostponeForm(request.id, "vaccinationEndDate", event.target.value)}
                        />
                      </label>
                    </div>
                    <textarea
                      value={postponeForms[request.id]?.reason || ""}
                      onChange={(event) => updatePostponeForm(request.id, "reason", event.target.value)}
                      placeholder="Motivo do adiamento"
                    />
                    <button
                      type="button"
                      onClick={() => sendPostponeRequest(request)}
                      disabled={loading}
                    >
                      Enviar adiamento
                    </button>
                  </div>
                )}

                {request.postponement && (
                  <p className="answered-at">
                    Adiado para {formatPeriod(request.postponement.vaccinationStartDate, request.postponement.vaccinationEndDate)}
                    {request.postponement.reason ? ` - ${request.postponement.reason}` : ""}
                  </p>
                )}

                {status === "EM_ANDAMENTO" && (
                  <div className="dose-box vaccine-list-box">
                    <strong>Uso real das vacinas</strong>
                    <div className="vaccine-usage-grid">
                      {getUsageRows(request).map((row) => {
                        const returned = getUsageReturned(row);

                        return (
                          <article className="vaccine-usage-card" key={row.id}>
                            <div className="vaccine-usage-head">
                              <div>
                                <h4>{row.vacina || "Vacina"}</h4>
                                <p>
                                  {row.fabricante ? `Fabricante: ${row.fabricante}` : "Fabricante: -"}
                                  {row.source ? ` | ${row.source}` : ""}
                                </p>
                              </div>
                              <span>{formatQuantity(row.plannedDoses)} cc</span>
                            </div>

                            <div className="usage-confirm-grid">
                              <label>
                                Levou
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.quantityTaken}
                                  onChange={(event) => updateUsageRow(request, row.id, "quantityTaken", event.target.value)}
                                  placeholder="0"
                                />
                              </label>

                              <label>
                                Usou
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.quantityUsed}
                                  onChange={(event) => updateUsageRow(request, row.id, "quantityUsed", event.target.value)}
                                  placeholder="0"
                                />
                              </label>

                              <div>
                                <span>Sobrou</span>
                                <strong>{formatQuantity(returned) || "0"} cc</strong>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}

                {status === "EM_ANDAMENTO" && (
                  <div className="temperature-box">
                    <h4>Temperatura da vacina</h4>
                    {cameraRequestId === request.id && (
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="temperature-preview camera-preview"
                      />
                    )}
                    <div className="request-actions">
                      {cameraRequestId !== request.id && (
                        <button
                          type="button"
                          onClick={() => startTemperatureCamera(request.id)}
                          disabled={loading}
                        >
                          Abrir camera
                        </button>
                      )}
                      {cameraRequestId === request.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => captureTemperaturePhoto(request.id)}
                          >
                            Tirar foto agora
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => stopTemperatureCamera()}
                          >
                            Fechar camera
                          </button>
                        </>
                      )}
                    </div>
                    <textarea
                      value={temperatureForms[request.id]?.temperatureNotes || ""}
                      onChange={(event) => updateTemperatureNotes(request.id, event.target.value)}
                      placeholder="Observacao da temperatura registrada"
                    />
                    <textarea
                      value={completionNotes[request.id] || ""}
                      onChange={(event) => updateCompletionNotes(request.id, event.target.value)}
                      placeholder="Observacoes finais da aplicacao, sobras ou ocorrencias"
                    />
                    {temperatureForms[request.id]?.temperaturePhoto && (
                      <img
                        src={temperatureForms[request.id].temperaturePhoto}
                        alt="Previa da temperatura"
                        className="temperature-preview"
                      />
                    )}
                    {temperatureForms[request.id]?.temperaturePhotoCapturedAt && (
                      <p className="answered-at">
                        Capturada agora: {new Date(temperatureForms[request.id].temperaturePhotoCapturedAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                    <div className="request-actions">
                      <button
                        type="button"
                        onClick={() => saveTemperaturePhoto(request)}
                        disabled={loading}
                      >
                        Salvar foto
                      </button>
                      <button
                        type="button"
                        onClick={() => completeRequest(request)}
                        disabled={loading}
                      >
                        Enviar para conferencia
                      </button>
                    </div>
                  </div>
                )}

                {request.temperaturePhoto && (
                  <div className="temperature-box">
                    <h4>Foto da temperatura enviada</h4>
                    <img
                      src={request.temperaturePhoto}
                      alt="Temperatura da vacina"
                      className="temperature-preview"
                    />
                    {request.temperatureNotes && <p>{request.temperatureNotes}</p>}
                  </div>
                )}

                {request.doseRequest && (
                  <p className="answered-at">
                    Doses solicitadas: {request.doseRequest.message}
                  </p>
                )}

                {request.answeredAt && (
                  <p className="answered-at">Respondido em {request.answeredAt}</p>
                )}

                {request.startedAt && (
                  <p className="answered-at">Iniciado em {request.startedAt}</p>
                )}

                {request.completedAt && (
                  <p className="answered-at">Concluido em {request.completedAt}</p>
                )}
              </article>
            );
          })}

          {reviewRequests.length > 0 && (
            <div className="review-section">
              <h3>Enviadas para conferencia</h3>
              <p className="muted">
                Aguardando a granja conferir e confirmar oficialmente.
              </p>
              <div className="review-list">
                {reviewRequests.map((request) => (
                  <article className="review-card" key={`review-${request.id}`}>
                    <div>
                      <strong>{request.farmName || "Granja"}</strong>
                      <p>
                        {request.programDay ? `Dia ${request.programDay}` : "Vacina"}
                        {request.birdLotName ? ` | ${request.birdLotName}` : ""}
                      </p>
                      <span>{request.awaitingAdminConfirmationAt || request.completedAt || "-"}</span>
                    </div>
                    <span className={statusClass(request.status)}>
                      {normalizeStatus(request.status)}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          )}

          {refusedRequests.length > 0 && (
            <div className="review-section">
              <h3>Recusadas</h3>
              <div className="review-list">
                {refusedRequests.map((request) => (
                  <article className="review-card" key={`refused-${request.id}`}>
                    <div>
                      <strong>{request.farmName || "Granja"}</strong>
                      <p>{request.rejectedReason || request.refusalReason || request.statusReason || "Sem motivo informado."}</p>
                    </div>
                    <span className={statusClass(request.status)}>
                      {normalizeStatus(request.status)}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
