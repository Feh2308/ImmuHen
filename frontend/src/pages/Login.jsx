import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PAYMENTS_ENABLED,
  createSubscriptionCheckoutApi,
  createSubscriptionPixApi,
  loginApi,
} from "../services/vacitechApi";
import {
  clearTenantAccessSessions,
  getFarmProfile,
  hasCompleteFarmProfile,
  notifyTenantStorageReady,
  saveAccountSession,
  writeJson,
} from "../utils/vacitechStorage";

function pickServerArray(serverValue) {
  return Array.isArray(serverValue) ? serverValue : [];
}

function pickServerObject(serverValue) {
  if (serverValue && typeof serverValue === "object" && !Array.isArray(serverValue)) {
    return serverValue;
  }

  return {};
}

function getVaccinatorAppUrl() {
  const configured = String(import.meta.env.VITE_VACCINATOR_APP_URL || "").trim();
  if (configured) {
    return `${configured.replace(/\/+$/, "")}/`;
  }

  const { origin, hostname, port } = window.location;
  if (["localhost", "127.0.0.1", "::1"].includes(hostname) && ["5173", "4173"].includes(port)) {
    return `${window.location.protocol}//${hostname}:${port === "4173" ? "4174" : "5174"}/`;
  }

  return `${origin.replace(/\/+$/, "")}/vacinador/`;
}

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [message, setMessage] = useState(() => (
    new URLSearchParams(window.location.search).get("subscription") === "expired"
      ? "A assinatura venceu. Pague a mensalidade e aguarde a renovação pelo Admin Geral."
      : ""
  ));
  const [pixPayment, setPixPayment] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await loginApi({ email, password });

      clearTenantAccessSessions();
      saveAccountSession({ token: data.token, user: data.user }, { silent: true });
      writeJson("farmProfile", data.farmProfile || data.state?.farmProfile || {}, { silent: true });
      writeJson("tenantSettings", data.tenant || data.state?.tenantSettings || {}, { silent: true });
      writeJson("vaccines", pickServerArray(data.state?.vaccines, "vaccines"), { silent: true });
      writeJson("entries", pickServerArray(data.state?.entries, "entries"), { silent: true });
      writeJson("outputs", pickServerArray(data.state?.outputs, "outputs"), { silent: true });
      writeJson("stockAlertLevels", pickServerObject(data.state?.stockAlertLevels, "stockAlertLevels"), { silent: true });
      writeJson("vaccineEditRequests", pickServerArray(data.state?.vaccineEditRequests, "vaccineEditRequests"), { silent: true });
      writeJson("entryEditRequests", pickServerArray(data.state?.entryEditRequests, "entryEditRequests"), { silent: true });
      writeJson("vaccineAuditLog", pickServerArray(data.state?.vaccineAuditLog, "vaccineAuditLog"), { silent: true });
      writeJson("vaccinators", data.state?.vaccinators || [], { silent: true });
      writeJson("schedules", data.state?.schedules || [], { silent: true });
      writeJson("requests", data.state?.requests || [], { silent: true });
      writeJson("completedVaccinations", data.state?.completedVaccinations || [], { silent: true });
      writeJson("vaccinatorNotifications", data.state?.notifications || [], { silent: true });
      notifyTenantStorageReady();

      navigate(
        hasCompleteFarmProfile(data.farmProfile || getFarmProfile())
          ? "/home"
          : "/cadastro-granja"
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openSubscriptionCheckout() {
    setPaymentLoading(true);
    setMessage("");
    setPixPayment(null);

    try {
      const pix = await createSubscriptionPixApi(1, email);
      setPixPayment(pix);
    } catch (error) {
      try {
        const checkout = await createSubscriptionCheckoutApi(1, email);
        window.location.href = checkout.initPoint || checkout.sandboxInitPoint;
      } catch (fallbackError) {
        setMessage(fallbackError.message || error.message);
      }
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-600 to-green-500">
      <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl">
        <h1 className="text-4xl font-bold text-center text-green-700">
          ImmuHen
        </h1>

        <p className="text-center text-zinc-500 mt-3">
          Gestao de vacinas avicolas inteligente
        </p>

        <form onSubmit={handleLogin} className="mt-10 space-y-5">
          <input
            type="email"
            placeholder="Email"
            className="w-full border border-zinc-300 rounded-2xl px-5 py-4 outline-none focus:border-green-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Senha"
            className="w-full border border-zinc-300 rounded-2xl px-5 py-4 outline-none focus:border-green-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 transition text-white py-4 rounded-2xl font-bold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {message && (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {message}
          </p>
        )}

        {(message.toLowerCase().includes("assinatura") || message.toLowerCase().includes("inativa")) && (
          <button
            type="button"
            onClick={openSubscriptionCheckout}
            disabled={paymentLoading}
            className="mt-4 w-full rounded-2xl bg-zinc-900 px-5 py-4 text-center font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {paymentLoading ? "Abrindo pagamento..." : "Pagar mensalidade antecipadamente"}
          </button>
        )}

        {pixPayment && (
          <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5 text-zinc-800">
            <h2 className="text-xl font-bold text-green-800">
              Pix da mensalidade
            </h2>

            {pixPayment.pixKey && (
              <p className="mt-3 rounded-xl border border-green-200 bg-white p-3 font-mono text-lg font-bold">
                Chave PIX: {pixPayment.pixKey}
              </p>
            )}

            {pixPayment.qrCodeBase64 && (
              <img
                src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                alt="QR Code Pix"
                className="mx-auto mt-4 h-48 w-48 rounded-xl border border-green-100 bg-white p-2"
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

        <Link
          to="/cadastro"
          className="mt-5 block w-full rounded-2xl bg-zinc-900 px-5 py-4 text-center font-bold text-white transition hover:bg-zinc-800"
        >
          Cadastrar nova granja
        </Link>

        <a
          href={getVaccinatorAppUrl()}
          className="mt-4 block w-full rounded-2xl border border-green-200 px-5 py-4 text-center font-bold text-green-700 transition hover:bg-green-50"
        >
          Entrar como Vacinador
        </a>
      </div>
    </div>
  );
}

export default Login;
