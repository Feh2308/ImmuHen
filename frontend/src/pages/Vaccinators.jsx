import Sidebar from "../components/Sidebar";
import { Copy, Download, ExternalLink, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import {
  appendVaccinatorNotification,
  getFarmProfile,
  readJson,
  writeJson,
} from "../utils/vacitechStorage";
import {
  createVaccinatorApi,
  deleteVaccinatorApi,
  fetchVaccinatorsApi,
  updateVaccinatorApi,
} from "../services/vacitechApi";

function getStoredVaccinators() {
  return readJson("vaccinators", []);
}

function saveVaccinators(nextVaccinators) {
  writeJson("vaccinators", nextVaccinators);
}

function getVaccinatorAppUrl() {
  const configuredUrl = import.meta.env.VITE_VACCINATOR_APP_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const { hostname, origin, port, protocol } = window.location;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);

  if (hostname.startsWith("app.")) {
    return `${protocol}//${hostname.replace(/^app\./, "vacinador.")}`;
  }

  if (isLocalHost && (port === "5173" || port === "4173")) {
    return `${protocol}//${hostname}:${port === "4173" ? "4174" : "5174"}`;
  }

  if (isLocalHost) {
    return `${protocol}//${hostname}:5174`;
  }

  return `${origin.replace(/\/$/, "")}/vacinador`;
}

function Vaccinators() {
  const [vaccinators, setVaccinators] = useState(getStoredVaccinators);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    notificationContact: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    notificationContact: "",
  });
  const vaccinatorAppUrl = useMemo(getVaccinatorAppUrl, []);

  useEffect(() => {
    async function loadVaccinators() {
      try {
        const apiVaccinators = await fetchVaccinatorsApi();

        setVaccinators(apiVaccinators);
        saveVaccinators(apiVaccinators);
      } catch (error) {
        console.log(error);
      }
    }

    loadVaccinators();
  }, []);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(vaccinatorAppUrl, {
      margin: 2,
      width: 260,
      color: {
        dark: "#14532d",
        light: "#ffffff",
      },
    }).then((dataUrl) => {
      if (active) {
        setQrCodeUrl(dataUrl);
      }
    }).catch((error) => {
      console.log(error);
    });

    return () => {
      active = false;
    };
  }, [vaccinatorAppUrl]);

  function updateForm(field, value) {
    setForm({
      ...form,
      [field]: value,
    });
  }

  function updateEditForm(field, value) {
    setEditForm({
      ...editForm,
      [field]: value,
    });
  }

  async function addVaccinator() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      alert("Preencha nome, email e telefone do vacinador.");
      return;
    }

    let newVaccinator;

    try {
      newVaccinator = await createVaccinatorApi({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notificationContact: form.notificationContact.trim(),
        status: "ATIVO",
      });
    } catch (error) {
      console.log(error);
      newVaccinator = {
        id: Date.now(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notificationContact: form.notificationContact.trim(),
        status: "ATIVO",
      };

      const farmProfile = getFarmProfile();

      appendVaccinatorNotification({
        type: "FARM_LINKED",
        vaccinatorId: newVaccinator.id,
        vaccinatorName: newVaccinator.name,
        vaccinatorEmail: newVaccinator.email,
        vaccinatorPhone: newVaccinator.phone,
        vaccinatorNotificationContact: newVaccinator.notificationContact,
        farmName: farmProfile.farmName || "Granja",
        farmCity: farmProfile.city || "",
        farmDocument: farmProfile.document || "",
        farmOwner: farmProfile.owner || "",
        title: `${farmProfile.farmName || "Uma granja"} te adicionou no ImmuHen`,
        message: "Voce foi vinculado como vacinador desta granja.",
      });
    }

    const nextVaccinators = [
      ...vaccinators.filter((vaccinator) => (
        String(vaccinator.id) !== String(newVaccinator.id)
      )),
      newVaccinator,
    ];

    setVaccinators(nextVaccinators);
    saveVaccinators(nextVaccinators);

    setForm({
      name: "",
      email: "",
      phone: "",
      notificationContact: "",
    });
  }

  function startEdit(vaccinator) {
    setEditingId(vaccinator.id);
    setEditForm({
      name: vaccinator.name || "",
      email: vaccinator.email || "",
      phone: vaccinator.phone || "",
      notificationContact: vaccinator.notificationContact || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      name: "",
      email: "",
      phone: "",
      notificationContact: "",
    });
  }

  async function saveEdit(id) {
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      alert("Preencha nome, email e telefone do vacinador.");
      return;
    }

    const nextVaccinators = vaccinators.map((vaccinator) => {
      if (vaccinator.id !== id) {
        return vaccinator;
      }

      return {
        ...vaccinator,
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        notificationContact: editForm.notificationContact.trim(),
      };
    });

    setVaccinators(nextVaccinators);
    saveVaccinators(nextVaccinators);

    try {
      await updateVaccinatorApi(id, nextVaccinators.find((vaccinator) => (
        String(vaccinator.id) === String(id)
      )));
    } catch (error) {
      console.log(error);
    }

    cancelEdit();
  }

  async function toggleVaccinatorStatus(id) {
    const nextVaccinators = vaccinators.map((vaccinator) => {
      if (vaccinator.id !== id) {
        return vaccinator;
      }

      return {
        ...vaccinator,
        status:
          vaccinator.status === "ATIVO"
            ? "INATIVO"
            : "ATIVO",
      };
    });

    setVaccinators(nextVaccinators);
    saveVaccinators(nextVaccinators);

    try {
      await updateVaccinatorApi(id, nextVaccinators.find((vaccinator) => (
        String(vaccinator.id) === String(id)
      )));
    } catch (error) {
      console.log(error);
    }
  }

  async function deleteVaccinator(id) {
    const vaccinator = vaccinators.find(
      (item) => item.id === id
    );

    const confirmed = window.confirm(
      `Excluir ${vaccinator?.name || "este vacinador"}?`
    );

    if (!confirmed) {
      return;
    }

    const nextVaccinators = vaccinators.filter(
      (item) => item.id !== id
    );

    setVaccinators(nextVaccinators);
    saveVaccinators(nextVaccinators);

    try {
      await deleteVaccinatorApi(id);
    } catch (error) {
      console.log(error);
    }
  }

  async function copyVaccinatorAppLink() {
    try {
      await navigator.clipboard.writeText(vaccinatorAppUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch (error) {
      console.log(error);
      window.prompt("Copie o link do app do vacinador:", vaccinatorAppUrl);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="flex-1 p-6 md:p-8">
        <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 md:text-5xl">
                Vacinadores
              </h1>

              <p className="mt-2 text-zinc-500">
                Cadastre os vacinadores que poderao ser escolhidos na agenda.
              </p>
            </div>

            <div className="rounded-xl border border-green-100 bg-green-50 px-5 py-4 text-green-700">
              <p className="text-sm font-semibold uppercase tracking-wide">
                Ativos
              </p>
              <p className="text-3xl font-bold">
                {vaccinators.filter((vaccinator) => vaccinator.status !== "INATIVO").length}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-center">
            <div className="flex justify-center rounded-2xl border border-green-100 bg-green-50 p-4">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="QR Code do ImmuHen Vacinador"
                  className="h-56 w-56 rounded-xl bg-white p-3"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-white text-green-700">
                  <QrCode size={52} />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-green-100 p-3 text-green-700">
                  <QrCode size={24} />
                </span>
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900">
                    QR Code do ImmuHen Vacinador
                  </h2>
                  <p className="mt-1 text-zinc-500">
                    Acesso rapido para instalar no celular.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={copyVaccinatorAppLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  <Copy size={18} />
                  {copiedLink ? "Copiado" : "Copiar link"}
                </button>

                <a
                  href={vaccinatorAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 font-bold text-white transition hover:bg-zinc-800"
                >
                  <ExternalLink size={18} />
                  Abrir app
                </a>

                {qrCodeUrl && (
                  <a
                    href={qrCodeUrl}
                    download="qr-code-app-vacinador.png"
                    className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-white px-5 py-3 font-bold text-green-700 transition hover:bg-green-50"
                  >
                    <Download size={18} />
                    Baixar QR
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-zinc-900">
            Novo Vacinador
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Nome
              <input
                type="text"
                placeholder="Nome do vacinador"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Email
              <input
                type="email"
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Telefone de contato
              <input
                type="tel"
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Email de notificacao
              <input
                type="email"
                placeholder="email@vacinador.com"
                value={form.notificationContact}
                onChange={(event) => updateForm("notificationContact", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={addVaccinator}
            className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-bold text-white transition hover:bg-green-700"
          >
            Salvar Vacinador
          </button>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {vaccinators.length === 0 && (
            <div className="rounded-2xl border border-green-100 bg-white p-6 text-zinc-500 shadow-sm lg:col-span-2 xl:col-span-3">
              Nenhum vacinador cadastrado.
            </div>
          )}

          {vaccinators.map((vaccinator) => (
            <article
              key={vaccinator.id}
              className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900">
                    {vaccinator.name}
                  </h3>

                  <p className="mt-1 text-sm text-zinc-500">
                    {vaccinator.email || "Email nao informado"}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    vaccinator.status === "ATIVO"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {vaccinator.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-zinc-700">
                <p>
                  <span className="font-bold text-zinc-900">Email:</span>{" "}
                  {vaccinator.email || "Nao informado"}
                </p>

                <p>
                  <span className="font-bold text-zinc-900">Telefone:</span>{" "}
                  {vaccinator.phone || "Nao informado"}
                </p>

                <p>
                  <span className="font-bold text-zinc-900">Email de notificacao:</span>{" "}
                  {vaccinator.notificationContact || vaccinator.email || "Nao informado"}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => startEdit(vaccinator)}
                  className="rounded-xl bg-zinc-900 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800"
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => toggleVaccinatorStatus(vaccinator.id)}
                  className={`rounded-xl px-4 py-2 font-semibold text-white transition ${
                    vaccinator.status === "ATIVO"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {vaccinator.status === "ATIVO"
                    ? "Desativar"
                    : "Ativar"}
                </button>

                <button
                  type="button"
                  onClick={() => deleteVaccinator(vaccinator.id)}
                  className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800"
                >
                  Excluir
                </button>
              </div>

              {editingId === vaccinator.id && (
                <div className="mt-5 grid gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={editForm.name}
                    onChange={(event) => updateEditForm("name", event.target.value)}
                    className="rounded-lg border border-green-100 bg-white p-3 text-zinc-900 outline-none focus:border-green-500"
                  />

                  <input
                    type="email"
                    placeholder="Email"
                    value={editForm.email}
                    onChange={(event) => updateEditForm("email", event.target.value)}
                    className="rounded-lg border border-green-100 bg-white p-3 text-zinc-900 outline-none focus:border-green-500"
                  />

                  <input
                    type="tel"
                    placeholder="Telefone"
                    value={editForm.phone}
                    onChange={(event) => updateEditForm("phone", event.target.value)}
                    className="rounded-lg border border-green-100 bg-white p-3 text-zinc-900 outline-none focus:border-green-500"
                  />

                  <input
                    type="email"
                    placeholder="Email de notificacao"
                    value={editForm.notificationContact}
                    onChange={(event) => updateEditForm("notificationContact", event.target.value)}
                    className="rounded-lg border border-green-100 bg-white p-3 text-zinc-900 outline-none focus:border-green-500"
                  />

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => saveEdit(vaccinator.id)}
                      className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white transition hover:bg-green-700"
                    >
                      Salvar
                    </button>

                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-green-200 bg-white px-4 py-2 font-bold text-green-700 transition hover:bg-green-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export default Vaccinators;
