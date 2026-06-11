import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  DEFAULT_RANCHES,
  getFarmProfile,
  normalizeImportantContacts,
  normalizeRanches,
  writeJson,
} from "../utils/vacitechStorage";
import {
  fetchNotificationStatusApi,
  saveFarmProfileApi,
  sendNotificationTestApi,
} from "../services/vacitechApi";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const maxSize = 720;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };

      image.onerror = () => resolve(reader.result);
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

function FarmProfile() {
  const savedProfile = getFarmProfile();
  const [form, setForm] = useState({
    farmName: savedProfile.farmName || "",
    city: savedProfile.city || "",
    address: savedProfile.address || "",
    location: savedProfile.location || "",
    notificationContact: savedProfile.notificationContact || "",
    document: savedProfile.document || "",
    owner: savedProfile.owner || savedProfile.responsible || "",
    logoDataUrl: savedProfile.logoDataUrl || "",
    ranches: normalizeRanches(savedProfile.ranches).length
      ? normalizeRanches(savedProfile.ranches)
      : DEFAULT_RANCHES,
    importantContacts: normalizeImportantContacts(savedProfile.importantContacts).length
      ? normalizeImportantContacts(savedProfile.importantContacts)
      : [{ id: "gerente", role: "Gerente", name: "", phone: "" }],
  });
  const [notificationStatus, setNotificationStatus] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationTestLoading, setNotificationTestLoading] = useState(false);

  useEffect(() => {
    async function loadNotificationStatus() {
      try {
        const status = await fetchNotificationStatusApi();
        setNotificationStatus(status);
      } catch (error) {
        console.log(error);
      }
    }

    loadNotificationStatus();
  }, []);

  function updateForm(field, value) {
    setForm({
      ...form,
      [field]: value,
    });
  }

  function updateRanch(index, value) {
    setForm({
      ...form,
      ranches: form.ranches.map((ranch, ranchIndex) => (
        ranchIndex === index
          ? { ...ranch, name: value }
          : ranch
      )),
    });
  }

  function addRanch() {
    setForm({
      ...form,
      ranches: [
        ...form.ranches,
        { id: `rancho-${Date.now()}`, name: "" },
      ],
    });
  }

  function removeRanch(index) {
    setForm({
      ...form,
      ranches: form.ranches.filter((_, ranchIndex) => ranchIndex !== index),
    });
  }

  function updateContact(index, field, value) {
    setForm({
      ...form,
      importantContacts: form.importantContacts.map((contact, contactIndex) => (
        contactIndex === index
          ? { ...contact, [field]: value }
          : contact
      )),
    });
  }

  function addContact() {
    setForm({
      ...form,
      importantContacts: [
        ...form.importantContacts,
        { id: `contato-${Date.now()}`, role: "", name: "", phone: "" },
      ],
    });
  }

  function removeContact(index) {
    setForm({
      ...form,
      importantContacts: form.importantContacts.filter((_, contactIndex) => contactIndex !== index),
    });
  }

  async function handleLogoFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Selecione uma imagem para a logo.");
      return;
    }

    const logoDataUrl = await fileToDataUrl(file);

    setForm({
      ...form,
      logoDataUrl,
    });

    writeJson("farmProfile", {
      ...getFarmProfile(),
      logoDataUrl,
    });
  }

  function removeLogo() {
    setForm({
      ...form,
      logoDataUrl: "",
    });

    writeJson("farmProfile", {
      ...getFarmProfile(),
      logoDataUrl: "",
    });
  }

  async function saveProfile() {
    if (
      !form.farmName.trim() ||
      !form.city.trim() ||
      !form.document.trim() ||
      !form.owner.trim()
    ) {
      alert("Preencha todos os dados da granja.");
      return;
    }

    const farmProfile = {
      ...savedProfile,
      farmName: form.farmName.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      location: form.location.trim(),
      notificationContact: form.notificationContact.trim(),
      document: form.document.trim(),
      owner: form.owner.trim(),
      logoDataUrl: form.logoDataUrl,
      ranches: normalizeRanches(form.ranches),
      importantContacts: normalizeImportantContacts(form.importantContacts),
      updatedAt: new Date().toLocaleString("pt-BR"),
    };

    writeJson("farmProfile", farmProfile);

    try {
      const apiProfile = await saveFarmProfileApi(farmProfile);
      const syncedProfile = {
        ...farmProfile,
        ...apiProfile,
        logoDataUrl: apiProfile.logoDataUrl || farmProfile.logoDataUrl,
      };

      writeJson("farmProfile", syncedProfile);
    } catch (error) {
      console.log(error);
    }

    alert("Perfil salvo com sucesso!");
  }

  async function testNotification() {
    setNotificationTestLoading(true);
    setNotificationMessage("");

    try {
      const data = await sendNotificationTestApi();
      const statuses = data.delivered || [];
      const email = statuses.find((item) => item.channel === "EMAIL");
      const preferredStatus = email;

      if (!preferredStatus) {
        setNotificationMessage("Nenhum email de notificacao foi encontrado. Informe um email e salve o perfil.");
      } else if (preferredStatus.status === "SENT") {
        setNotificationMessage("Teste enviado por email.");
      } else {
        setNotificationMessage(`EMAIL: ${preferredStatus.status}. ${preferredStatus.lastError || ""}`.trim());
      }

      const status = await fetchNotificationStatusApi();
      setNotificationStatus(status);
    } catch (error) {
      setNotificationMessage(error.message);
    } finally {
      setNotificationTestLoading(false);
    }
  }

  const normalizedRanches = normalizeRanches(form.ranches);
  const normalizedContacts = normalizeImportantContacts(form.importantContacts);
  const logoInitial = (form.farmName.trim() || "I").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <section className="rounded-3xl bg-gradient-to-r from-green-700 to-green-500 p-6 text-white shadow-lg md:p-8">
          <p className="text-sm font-bold uppercase tracking-wide text-green-100">
            ImmuHen
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-5xl">
            Perfil da Granja
          </h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Organize a identidade, os ranchos e os contatos usados no sistema.
          </p>
        </section>

        <section className="mt-6 grid gap-6">
          <div className="grid gap-6">
            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm md:p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    Identidade visual
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                    Adicione sua logo
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center lg:min-w-[360px]">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-green-100 bg-green-50 p-2">
                    {form.logoDataUrl ? (
                      <img
                        src={form.logoDataUrl}
                        alt="Logo da granja"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-3xl font-bold text-green-700">
                        {logoInitial}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="cursor-pointer rounded-xl bg-green-600 px-5 py-3 text-center font-bold text-white transition hover:bg-green-700">
                      Escolher logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleLogoFile(event.target.files?.[0])}
                        className="hidden"
                      />
                    </label>

                    {form.logoDataUrl && (
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="rounded-xl bg-red-50 px-5 py-3 font-bold text-red-600 transition hover:bg-red-100"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5">
                <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                  Dados principais
                </p>
                <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                  Cadastro da granja
                </h2>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  Nome da granja
                  <input
                    type="text"
                    value={form.farmName}
                    onChange={(event) => updateForm("farmName", event.target.value)}
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  Cidade
                  <input
                    type="text"
                    value={form.city}
                    onChange={(event) => updateForm("city", event.target.value)}
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  CNPJ ou CPF
                  <input
                    type="text"
                    value={form.document}
                    onChange={(event) => updateForm("document", event.target.value)}
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                  Proprietario
                  <input
                    type="text"
                    value={form.owner}
                    onChange={(event) => updateForm("owner", event.target.value)}
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                  Endereco da granja
                  <input
                    type="text"
                    value={form.address}
                    onChange={(event) => updateForm("address", event.target.value)}
                    placeholder="Estrada, bairro, numero, referencia"
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                  Localizacao
                  <input
                    type="text"
                    value={form.location}
                    onChange={(event) => updateForm("location", event.target.value)}
                    placeholder="Link do Google Maps ou coordenadas"
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-zinc-700 lg:col-span-2">
                  Email de notificacao
                  <input
                    type="email"
                    value={form.notificationContact}
                    onChange={(event) => updateForm("notificationContact", event.target.value)}
                    placeholder="email@granja.com"
                    className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                  />
                </label>

                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 lg:col-span-2">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                        Envio externo
                      </p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Email: {notificationStatus?.configured?.email ? "configurado" : "nao configurado"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={testNotification}
                      disabled={notificationTestLoading}
                      className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {notificationTestLoading ? "Testando..." : "Testar notificacao"}
                    </button>
                  </div>

                  {notificationMessage && (
                    <p className="mt-3 rounded-xl border border-green-100 bg-white p-3 text-sm font-semibold text-zinc-700">
                      {notificationMessage}
                    </p>
                  )}

                  {notificationStatus?.recentOutbox?.[0]?.lastError && (
                    <p className="mt-2 text-sm text-red-600">
                      Ultimo erro: {notificationStatus.recentOutbox[0].lastError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    Manejo
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                    Ranchos da granja
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={addRanch}
                  className="rounded-xl bg-green-600 px-4 py-3 font-bold text-white transition hover:bg-green-700"
                >
                  Adicionar rancho
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {form.ranches.map((ranch, index) => (
                  <div key={ranch.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
                    <input
                      type="text"
                      value={ranch.name}
                      onChange={(event) => updateRanch(index, event.target.value)}
                      placeholder="Nome do rancho"
                      className="min-w-0 rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeRanch(index)}
                      className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                    Contatos
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                    Contatos importantes
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={addContact}
                  className="rounded-xl bg-green-50 px-4 py-3 font-bold text-green-700 transition hover:bg-green-100"
                >
                  Adicionar contato
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {form.importantContacts.map((contact, index) => (
                  <div key={contact.id} className="grid gap-2 xl:grid-cols-[0.85fr_1fr_0.9fr_120px]">
                    <input
                      type="text"
                      value={contact.role}
                      onChange={(event) => updateContact(index, "role", event.target.value)}
                      placeholder="Cargo"
                      className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                    />
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(event) => updateContact(index, "name", event.target.value)}
                      placeholder="Nome"
                      className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                    />
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(event) => updateContact(index, "phone", event.target.value)}
                      placeholder="Telefone"
                      className="rounded-xl border border-green-100 bg-green-50 p-3 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600 transition hover:bg-red-100"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={saveProfile}
              className="rounded-xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700"
            >
              Salvar Perfil
            </button>
          </div>

          <aside className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm md:p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-green-700">
              Resumo
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-900">
              Dados da granja
            </h2>

            <div className="mt-5 grid gap-4 rounded-2xl bg-green-50 p-4 sm:grid-cols-[80px_minmax(0,1fr)] sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-green-100 bg-white p-2">
                {form.logoDataUrl ? (
                  <img
                    src={form.logoDataUrl}
                    alt="Logo da granja"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-2xl font-bold text-green-700">
                    {logoInitial}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="break-words text-lg font-bold text-zinc-900">
                  {form.farmName || "Nao informada"}
                </p>
                <p className="text-sm text-zinc-500">
                  {form.city || "Cidade nao informada"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-green-100 p-4">
                <p className="font-bold text-zinc-900">Documento</p>
                <p className="mt-1 overflow-hidden break-words text-zinc-600">{form.document || "Nao informado"}</p>
              </div>

              <div className="rounded-xl border border-green-100 p-4">
                <p className="font-bold text-zinc-900">Proprietario</p>
                <p className="mt-1 overflow-hidden break-words text-zinc-600">{form.owner || "Nao informado"}</p>
              </div>

              <div className="rounded-xl border border-green-100 p-4">
                <p className="font-bold text-zinc-900">Endereco</p>
                <p className="mt-1 overflow-hidden break-words text-zinc-600">{form.address || "Nao informado"}</p>
              </div>

              <div className="rounded-xl border border-green-100 p-4">
                <p className="font-bold text-zinc-900">Localizacao</p>
                {form.location ? (
                  <a
                    href={getMapsLink(form.location)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block overflow-hidden break-words font-bold text-green-700 underline decoration-green-300 underline-offset-4"
                  >
                    Abrir no Google Maps
                  </a>
                ) : (
                  <p className="mt-1 overflow-hidden break-words text-zinc-600">Nao informada</p>
                )}
              </div>

              <div className="rounded-xl border border-green-100 p-4">
                <p className="font-bold text-zinc-900">Notificacoes</p>
                <p className="mt-1 overflow-hidden break-words text-zinc-600">{form.notificationContact || "Nao informado"}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-green-100 p-4">
              <p className="font-bold text-zinc-900">Ranchos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {normalizedRanches.length === 0 && (
                  <span className="text-sm text-zinc-500">Nenhum rancho informado</span>
                )}
                {normalizedRanches.map((ranch) => (
                  <span
                    key={ranch.id}
                    className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-green-700"
                  >
                    {ranch.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-green-100 p-4">
              <p className="font-bold text-zinc-900">Contatos</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {normalizedContacts.length === 0 && (
                  <p className="text-sm text-zinc-500">Nenhum contato informado</p>
                )}
                {normalizedContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-xl border border-green-100 bg-green-50 p-3"
                  >
                    <p className="font-bold text-zinc-900">
                      {contact.role || "Contato"}
                    </p>
                    <p className="text-sm text-zinc-600">{contact.name || "Nome nao informado"}</p>
                    <p className="text-sm text-zinc-600">{contact.phone || "Telefone nao informado"}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default FarmProfile;
