import Sidebar from "../components/Sidebar";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  PAYMENTS_ENABLED,
  authorizeStockAccessApi,
  createSubscriptionCheckoutApi,
  createSubscriptionPixApi,
  fetchBirdLotsApi,
  fetchSharedStateApi,
  fetchSubscriptionStatusApi,
} from "../services/vacitechApi";
import {
  clearAccountSession,
  clearTenantAccessSessions,
  getFarmProfile,
  getTenantSessionKey,
  hasAccountSession,
  hasCompleteFarmProfile,
  normalizeRequestStatus,
  writeJson,
} from "../utils/vacitechStorage";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function isOpenStatus(status) {
  return !["CONCLUIDA", "CONCLUIDA_CONFIRMADA", "RECUSADA", "CANCELADA"].includes(normalizeRequestStatus(status));
}

function getScheduleDate(schedule) {
  return schedule.vaccinationStartDate || schedule.date || "";
}

function getUsageDoses(schedule) {
  return (schedule.vaccineUsages || []).reduce((total, usage) => total + Number(usage.doses || usage.requiredCc || 0), 0);
}

function Welcome() {

  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [stockAccessLoading, setStockAccessLoading] = useState(false);
  const [stockAccessMessage, setStockAccessMessage] = useState("");
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState(null);

  const [homeData, setHomeData] = useState({
    activeLots: 0,
    totalBirds: 0,
    survivalRate: 100,
    scheduledVaccinations: 0,
    pendingRequests: 0,
    stockDays: "-",
    latestCompleted: null,
    criticalAlerts: 0,
    criticalStock: 0,
  });

  useEffect(() => {

    if (!hasAccountSession()) {
      navigate("/", { replace: true });
      return;
    }

    if (!hasCompleteFarmProfile(farmProfile)) {
      navigate("/cadastro-granja");
      return;
    }

    async function loadData() {

      try {

        const [lots, state] = await Promise.all([
          fetchBirdLotsApi(),
          fetchSharedStateApi([
            "schedules",
            "requests",
            "entries",
            "outputs",
            "vaccines",
            "stockAlertLevels",
            "completedVaccinations",
            "mortalityRecords",
            "notifications",
          ]),
        ]);

        const activeLots = lots.filter(
          (lot) => String(lot.status || "").toLowerCase() === "ativo"
        );
        const totalBirdsInitial = activeLots.reduce((total, lot) => total + Number(lot.avesAlojadas || 0), 0);
        const totalDeaths = (state.mortalityRecords || []).reduce((total, record) => total + Number(record.deaths || 0), 0);
        const totalBirds = Math.max(0, totalBirdsInitial - totalDeaths);
        const survivalRate = totalBirdsInitial > 0 ? (totalBirds / totalBirdsInitial) * 100 : 100;
        const today = getTodayKey();
        const openSchedules = (state.schedules || []).filter((schedule) => isOpenStatus(schedule.status));
        const nextThirtyDaysUsage = openSchedules.reduce((total, schedule) => {
          const scheduleDate = getScheduleDate(schedule);
          const normalizedScheduleDate = String(scheduleDate || "").slice(0, 10);
          const daysDiff = normalizedScheduleDate
            ? Math.ceil((new Date(`${normalizedScheduleDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
            : null;

          if (daysDiff === null || daysDiff < 0 || daysDiff > 30) {
            return total;
          }

          return total + getUsageDoses(schedule);
        }, 0);
        const totalEntries = (state.entries || []).reduce((total, item) => total + Number(item.doses || 0), 0);
        const totalOutputs = (state.outputs || [])
          .filter((item) => !item.clearedAt)
          .reduce((total, item) => total + Number(item.doses || 0), 0);
        const totalStock = Math.max(0, totalEntries - totalOutputs);
        const averageDailyUse = nextThirtyDaysUsage > 0 ? nextThirtyDaysUsage / 30 : 0;
        const stockDays = averageDailyUse > 0
          ? `${Math.floor(totalStock / averageDailyUse)} dias`
          : totalStock > 0
            ? "Sem consumo previsto"
            : "Sem estoque";
        const pendingRequests = (state.requests || []).filter((request) => {
          const status = normalizeRequestStatus(request.status);

          return ["PENDENTE", "CONFIRMADA", "EM_ANDAMENTO", "AJUSTE_SOLICITADO", "AGUARDANDO_CONFIRMACAO_ADMIN"].includes(status);
        }).length;
        const latestCompleted = [...(state.completedVaccinations || [])]
          .sort((a, b) => String(b.systemConfirmedAtIso || b.completedAtIso || b.date || "").localeCompare(String(a.systemConfirmedAtIso || a.completedAtIso || a.date || "")))[0] || null;
        const stockAlertLevels = state.stockAlertLevels || {};
        const criticalStock = (state.vaccines || []).filter((vaccine) => {
          const minimum = Number(stockAlertLevels[String(vaccine.id)] || 0);
          const currentStock = (state.entries || [])
            .filter((entry) => String(entry.vaccineId) === String(vaccine.id))
            .reduce((total, entry) => total + Number(entry.doses || 0), 0)
            - (state.outputs || [])
              .filter((output) => !output.clearedAt && String(output.vaccineId) === String(vaccine.id))
              .reduce((total, output) => total + Number(output.doses || 0), 0);

          return minimum > 0 && currentStock <= minimum;
        }).length;
        const criticalAlerts = (state.notifications || []).filter((notification) => !notification.deletedAtIso).length + criticalStock;

        setHomeData({
          activeLots: activeLots.length,
          totalBirds,
          survivalRate,
          scheduledVaccinations: openSchedules.length,
          pendingRequests,
          stockDays,
          latestCompleted,
          criticalAlerts,
          criticalStock,
        });

      } catch (error) {

        console.log(error);

      }
    }

    async function loadSubscription() {
      try {
        const status = await fetchSubscriptionStatusApi();
        setSubscription(status);
        setSubscriptionMessage("");
      } catch (error) {
        setSubscriptionMessage(error.message);
      }
    }

    loadData();
    loadSubscription();

  }, [farmProfile, navigate]);

  useEffect(() => {
    function refreshFarmProfile() {
      setFarmProfile(getFarmProfile());
    }

    window.addEventListener("storage", refreshFarmProfile);
    window.addEventListener("vacitech-storage", refreshFarmProfile);

    return () => {
      window.removeEventListener("storage", refreshFarmProfile);
      window.removeEventListener("vacitech-storage", refreshFarmProfile);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadFarmProfile() {
      if (!hasAccountSession()) {
        return;
      }

      try {
        const state = await fetchSharedStateApi(["farmProfile", "tenantSettings"]);
        const apiProfile = state?.farmProfile;
        const apiTenantSettings = state?.tenantSettings;

        if (active && apiProfile) {
          const currentProfile = getFarmProfile();
          const syncedProfile = {
            ...currentProfile,
            ...apiProfile,
            logoDataUrl: apiProfile.logoDataUrl || currentProfile.logoDataUrl || "",
          };

          writeJson("farmProfile", syncedProfile);

          if (apiTenantSettings) {
            writeJson("tenantSettings", apiTenantSettings);
          }

          setFarmProfile(syncedProfile);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadFarmProfile();

    return () => {
      active = false;
    };
  }, []);

  function closeSystem() {
    clearTenantAccessSessions();
    clearAccountSession();
    navigate("/", { replace: true });
  }

  async function handleStockAccess() {
    setStockAccessLoading(true);
    setStockAccessMessage("");

    try {
      await authorizeStockAccessApi(password);
      sessionStorage.removeItem("stockAuthorized");
      sessionStorage.setItem(getTenantSessionKey("stockAuthorized"), "true");
      navigate("/estoque");
    } catch (error) {
      setStockAccessMessage(error.message || "Senha administrativa incorreta");
    } finally {
      setStockAccessLoading(false);
    }
  }

  async function openSubscriptionCheckout() {
    setPaymentLoading(true);
    setSubscriptionMessage("");
    setPixPayment(null);

    try {
      const pix = await createSubscriptionPixApi(1, JSON.parse(sessionStorage.getItem("user") || "{}").email || "");
      setPixPayment(pix);
    } catch (error) {
      try {
        const checkout = await createSubscriptionCheckoutApi(1);
        window.location.href = checkout.initPoint || checkout.sandboxInitPoint;
      } catch (fallbackError) {
        setSubscriptionMessage(fallbackError.message || error.message);
      }
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">

      <Sidebar />

      <div className="flex-1 p-10">

        <div className="bg-gradient-to-r from-green-600 to-green-500 rounded-3xl p-10 text-white shadow-xl">

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-5xl font-bold">
                Bem vindo ao ImmuHen
              </h1>

              <p className="mt-4 text-xl text-green-50">
                {farmProfile.farmName || "Plataforma inteligente de gestao de vacinas avicola."}
              </p>
            </div>

            {farmProfile.logoDataUrl && (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl border border-white/50 bg-white p-3 shadow-lg">
                <img
                  src={farmProfile.logoDataUrl}
                  alt={`Logo ${farmProfile.farmName || "da granja"}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-4">

            <button
              onClick={() => setShowConfirm(true)}
              className="bg-white text-green-700 font-bold px-6 py-4 rounded-2xl hover:bg-zinc-100 transition"
            >
              Entrar no Estoque
            </button>

            <button
              onClick={() => navigate("/Aves")}
              className="border border-white px-6 py-4 rounded-2xl hover:bg-white hover:text-green-700 transition"
            >
              Gerenciar Aves
            </button>

            <button
              onClick={closeSystem}
              className="border border-white px-6 py-4 rounded-2xl hover:bg-white hover:text-green-700 transition"
            >
              Fechar Sistema
            </button>

          </div>

        </div>

        {(subscription || subscriptionMessage) && (
          <div className="mt-6 rounded-3xl border border-green-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                  Assinatura
                </p>
                {subscription ? (
                  <p className={`mt-2 ${subscription.active ? "text-zinc-600" : "text-red-600"}`}>
                    {subscription.active
                      ? `Plano ${subscription.plan} ativo por mais ${subscription.daysRemaining} dia(s).`
                      : "Assinatura vencida. Pague a mensalidade para liberar o sistema."}
                  </p>
                ) : (
                  <p className="mt-2 text-red-600">
                    {subscriptionMessage}
                  </p>
                )}
              </div>

              {(
                <button
                  type="button"
                  onClick={openSubscriptionCheckout}
                  disabled={paymentLoading}
                  className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {paymentLoading ? "Abrindo pagamento..." : "Pagar mensalidade antecipadamente"}
                </button>
              )}
            </div>

            {pixPayment && (
              <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-5">
                <h3 className="text-xl font-bold text-green-800">
                  Pix da mensalidade
                </h3>

                {pixPayment.pixKey && (
                  <p className="mt-3 rounded-xl border border-green-200 bg-white p-3 font-mono text-lg font-bold">
                    Chave PIX: {pixPayment.pixKey}
                  </p>
                )}

                {pixPayment.qrCodeBase64 && (
                  <img
                    src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="mt-4 h-48 w-48 rounded-xl border border-green-100 bg-white p-2"
                  />
                )}

                {pixPayment.qrCode && (
                  <textarea
                    readOnly
                    value={pixPayment.qrCode}
                    className="mt-4 h-24 w-full rounded-xl border border-green-200 bg-white p-3 text-xs"
                  />
                )}

                {pixPayment.ticketUrl && (
                  <a
                    href={pixPayment.ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block font-bold text-green-700 underline"
                  >
                    Abrir pagamento no Mercado Pago
                  </a>
                )}

                {pixPayment.whatsappUrl && (
                  <a href={pixPayment.whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 block rounded-xl bg-green-600 px-4 py-3 text-center font-bold text-white">
                    Enviar comprovante pelo WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {showConfirm && (

          <div className="mt-8 bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm max-w-xl">

            <h2 className="text-2xl font-bold text-zinc-900 mb-3">
              Confirmação Administrativa
            </h2>

            <p className="text-zinc-500 mb-6">
              Digite a senha do administrador para acessar o estoque.
            </p>

            <input
              type="password"
              placeholder="Digite a senha"
              className="w-full border border-zinc-300 rounded-2xl px-5 py-4 outline-none focus:border-green-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={handleStockAccess}
              disabled={stockAccessLoading}
              className="mt-5 bg-green-600 hover:bg-green-700 transition text-white px-6 py-4 rounded-2xl font-bold"
            >
              {stockAccessLoading ? "Verificando..." : "Confirmar Acesso"}
            </button>

            {stockAccessMessage && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
                {stockAccessMessage}
              </p>
            )}

          </div>

        )}

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Aves alojadas atuais
            </h2>

            <p className="mt-4 text-4xl font-bold text-green-600">
              {formatNumber(homeData.totalBirds)}
            </p>

          </div>

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Sobrevivencia geral
            </h2>

            <p className="mt-4 text-4xl font-bold text-green-600">
              {formatPercent(homeData.survivalRate)}
            </p>

          </div>

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Vacinacoes programadas
            </h2>

            <p className="mt-4 text-4xl font-bold text-green-600">
              {homeData.scheduledVaccinations}
            </p>

          </div>

          <DashboardCard title="Solicitacoes pendentes" value={homeData.pendingRequests} tone="amber" />
          <DashboardCard title="Estoque para" value={homeData.stockDays} compact />
          <DashboardCard
            title="Ultima vacinacao concluida"
            value={homeData.latestCompleted
              ? `${homeData.latestCompleted.vaccinatorName || "Vacinador"} - ${formatDate(homeData.latestCompleted.systemConfirmedAtIso || homeData.latestCompleted.completedAtIso || homeData.latestCompleted.date)}`
              : "Sem registro"}
            compact
          />
          <DashboardCard title="Lotes ativos" value={homeData.activeLots} />
          <DashboardCard title="Alertas criticos" value={homeData.criticalAlerts} tone="red" />

        </div>

      </div>

    </div>
  );
}

function DashboardCard({ title, value, tone = "green", compact = false }) {
  const colorClass = tone === "red"
    ? "text-red-500"
    : tone === "amber"
      ? "text-amber-600"
      : "text-green-600";

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-zinc-500">{title}</h2>
      <p className={`mt-4 font-bold ${colorClass} ${compact ? "text-2xl" : "text-4xl"}`}>
        {value}
      </p>
    </div>
  );
}

export default Welcome;
