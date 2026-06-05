import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DEFAULT_RANCHES,
  getFarmProfile,
  hasAccountSession,
  normalizeImportantContacts,
  normalizeRanches,
  writeJson,
} from "../utils/vacitechStorage";
import { saveFarmProfileApi } from "../services/vacitechApi";

function FarmSetup() {
  const navigate = useNavigate();
  const savedProfile = getFarmProfile();

  const [form, setForm] = useState({
    farmName: savedProfile.farmName || "",
    city: savedProfile.city || "",
    address: savedProfile.address || "",
    location: savedProfile.location || "",
    notificationContact: savedProfile.notificationContact || "",
    document: savedProfile.document || "",
    owner: savedProfile.owner || savedProfile.responsible || "",
    ranches: normalizeRanches(savedProfile.ranches).length
      ? normalizeRanches(savedProfile.ranches)
      : DEFAULT_RANCHES,
    importantContacts: normalizeImportantContacts(savedProfile.importantContacts).length
      ? normalizeImportantContacts(savedProfile.importantContacts)
      : [{ id: "gerente", role: "Gerente", name: "", phone: "" }],
  });

  useEffect(() => {
    if (!hasAccountSession()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

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

  async function saveFarm(event) {
    event.preventDefault();

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
      ranches: normalizeRanches(form.ranches),
      importantContacts: normalizeImportantContacts(form.importantContacts),
      updatedAt: new Date().toLocaleString("pt-BR"),
    };

    writeJson("farmProfile", farmProfile);

    try {
      const apiProfile = await saveFarmProfileApi(farmProfile);
      writeJson("farmProfile", apiProfile);
    } catch (error) {
      console.log(error);
    }

    navigate("/home");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-500 p-6">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <section className="bg-zinc-950 p-8 text-white md:p-10">
            <h1 className="text-4xl font-bold">
              Conhecendo sua granja
            </h1>

            <p className="mt-4 text-zinc-300">
              Esse cadastro aparece no perfil e identifica a granja nas solicitacoes enviadas aos vacinadores.
            </p>

            <div className="mt-10 rounded-2xl border border-green-700 bg-green-900/30 p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-green-300">
                ImmuHen
              </p>
              <p className="mt-2 text-2xl font-bold">
                Primeira configuracao
              </p>
            </div>

            <Link
              to="/"
              className="mt-6 inline-flex rounded-xl border border-green-500 px-5 py-3 font-bold text-green-200 transition hover:bg-green-900"
            >
              Ja tenho conta
            </Link>
          </section>

          <form
            onSubmit={saveFarm}
            className="grid gap-5 p-8 md:p-10"
          >
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Nome da granja
              <input
                type="text"
                value={form.farmName}
                onChange={(event) => updateForm("farmName", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Cidade
              <input
                type="text"
                value={form.city}
                onChange={(event) => updateForm("city", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              CNPJ ou CPF
              <input
                type="text"
                value={form.document}
                onChange={(event) => updateForm("document", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Proprietario
              <input
                type="text"
                value={form.owner}
                onChange={(event) => updateForm("owner", event.target.value)}
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Endereco da granja
              <input
                type="text"
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
                placeholder="Estrada, bairro, numero, referencia"
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Localizacao
              <input
                type="text"
                value={form.location}
                onChange={(event) => updateForm("location", event.target.value)}
                placeholder="Link do Google Maps ou coordenadas"
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Email de notificacao
              <input
                type="email"
                value={form.notificationContact}
                onChange={(event) => updateForm("notificationContact", event.target.value)}
                placeholder="email@granja.com"
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <section className="rounded-2xl border border-green-100 bg-green-50 p-5 md:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">
                    Ranchos da granja
                  </h2>
                  <p className="text-sm text-zinc-500">
                    Cadastre os nomes usados no manejo, como Pinteiro e Rancho 1.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addRanch}
                  className="rounded-xl bg-white px-4 py-2 font-bold text-green-700 shadow-sm"
                >
                  Adicionar rancho
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {form.ranches.map((ranch, index) => (
                  <div key={ranch.id} className="flex gap-2">
                    <input
                      type="text"
                      value={ranch.name}
                      onChange={(event) => updateRanch(index, event.target.value)}
                      placeholder="Nome do rancho"
                      className="min-w-0 flex-1 rounded-xl border border-green-100 bg-white p-3 text-zinc-900 outline-none transition focus:border-green-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeRanch(index)}
                      className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-5 md:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">
                    Contatos importantes
                  </h2>
                  <p className="text-sm text-zinc-500">
                    Gerente, encarregado ou responsavel para acionar rapido.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addContact}
                  className="rounded-xl bg-green-50 px-4 py-2 font-bold text-green-700"
                >
                  Adicionar contato
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {form.importantContacts.map((contact, index) => (
                  <div key={contact.id} className="grid gap-2 md:grid-cols-[0.9fr_1fr_0.9fr_auto]">
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
                      className="rounded-xl bg-red-50 px-4 py-2 font-bold text-red-600"
                    >
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="submit"
              className="rounded-xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700"
            >
              Salvar e Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default FarmSetup;
