import Sidebar from "../components/Sidebar";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  PAYMENTS_ENABLED,
  createSubscriptionCheckoutApi,
  createSubscriptionPixApi,
  fetchBirdLotsApi,
  fetchSharedStateApi,
  fetchSubscriptionStatusApi,
} from "../services/vacitechApi";
import {
  clearAccountSession,
  getFarmProfile,
  hasAccountSession,
  hasCompleteFarmProfile,
  writeJson,
} from "../utils/vacitechStorage";

const STOCK_PASSWORD = "123456";

function Welcome() {

  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);
  const [subscription, setSubscription] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [pixPayment, setPixPayment] = useState(null);

  const [homeData, setHomeData] = useState({
    activeLots: 0,
    todayVaccinations: 0,
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

        const lots = await fetchBirdLotsApi();

        const activeLots = lots.filter(
          (lot) => String(lot.status || "").toLowerCase() === "ativo"
        ).length;

        setHomeData((currentData) => ({
          ...currentData,
          activeLots,
        }));

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
        const state = await fetchSharedStateApi();
        const apiProfile = state?.farmProfile;

        if (active && apiProfile) {
          const currentProfile = getFarmProfile();
          const syncedProfile = {
            ...currentProfile,
            ...apiProfile,
            logoDataUrl: apiProfile.logoDataUrl || currentProfile.logoDataUrl || "",
          };

          writeJson("farmProfile", syncedProfile);
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
    clearAccountSession();
    sessionStorage.removeItem("stockAuthorized");
    navigate("/", { replace: true });
  }

  function handleStockAccess() {

    if (password === STOCK_PASSWORD) {
      sessionStorage.setItem("stockAuthorized", "true");
      navigate("/estoque");
      return;
    }

    alert("Senha administrativa incorreta");
  }

  async function openSubscriptionCheckout() {
    setPaymentLoading(true);
    setSubscriptionMessage("");
    setPixPayment(null);

    try {
      const pix = await createSubscriptionPixApi(1);
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
    <div className="flex min-h-screen bg-white">

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

              {PAYMENTS_ENABLED && (
                <button
                  type="button"
                  onClick={openSubscriptionCheckout}
                  disabled={paymentLoading}
                  className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {paymentLoading ? "Abrindo pagamento..." : "Renovar mensalidade"}
                </button>
              )}
            </div>

            {PAYMENTS_ENABLED && pixPayment && (
              <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-5">
                <h3 className="text-xl font-bold text-green-800">
                  Pix da mensalidade
                </h3>

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
              className="mt-5 bg-green-600 hover:bg-green-700 transition text-white px-6 py-4 rounded-2xl font-bold"
            >
              Confirmar Acesso
            </button>

          </div>

        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Lotes Ativos
            </h2>

            <p className="text-5xl font-bold text-green-600 mt-4">
              {homeData.activeLots}
            </p>

          </div>

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Vacinações Hoje
            </h2>

            <p className="text-5xl font-bold text-green-600 mt-4">
              {homeData.todayVaccinations}
            </p>

          </div>

          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">

            <h2 className="text-zinc-500">
              Estoque Crítico
            </h2>

            <p className="text-5xl font-bold text-red-500 mt-4">
              {homeData.criticalStock}
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Welcome;
