import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  findVaccinatorByContact,
  formatPeriod,
  getFarmProfile,
  getStatusClass,
  hasCompleteFarmProfile,
  matchesVaccinator,
  normalizeRequestStatus,
  readJson,
  writeJson,
} from "../utils/vacitechStorage";

function getPortalSession() {
  return readJson("vaccinatorPortalSession", null);
}

function VaccinatorPortal() {
  const [session, setSession] = useState(getPortalSession);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notificationContact, setNotificationContact] = useState("");
  const [vaccinator, setVaccinator] = useState(null);
  const [requests, setRequests] = useState(() => readJson("requests", []));
  const [notifications, setNotifications] = useState(() => readJson("vaccinatorNotifications", []));
  const [farmProfile, setFarmProfile] = useState(getFarmProfile);

  function refreshPortalData() {
    const vaccinators = readJson("vaccinators", []);
    const currentSession = getPortalSession();

    if (currentSession) {
      const matchedVaccinator = vaccinators.find((item) => (
        String(item.id) === String(currentSession.vaccinatorId)
      )) || findVaccinatorByContact(
        vaccinators,
        currentSession.email,
        currentSession.phone
      );

      setVaccinator(matchedVaccinator || null);
      setNotificationContact(matchedVaccinator?.notificationContact || "");
    }

    setRequests(readJson("requests", []));
    setNotifications(readJson("vaccinatorNotifications", []));
    setFarmProfile(getFarmProfile());
  }

  useEffect(() => {
    refreshPortalData();

    window.addEventListener("storage", refreshPortalData);
    window.addEventListener("vacitech-storage", refreshPortalData);

    return () => {
      window.removeEventListener("storage", refreshPortalData);
      window.removeEventListener("vacitech-storage", refreshPortalData);
    };
  }, [session]);

  const vaccinatorNotifications = useMemo(() => {
    if (!vaccinator) {
      return [];
    }

    return notifications.filter((notification) => (
      matchesVaccinator(notification, vaccinator)
    ));
  }, [notifications, vaccinator]);

  const vaccinatorRequests = useMemo(() => {
    if (!vaccinator) {
      return [];
    }

    return requests.filter((request) => (
      matchesVaccinator(request, vaccinator) &&
      normalizeRequestStatus(request.status) !== "CONCLUIDA" &&
      normalizeRequestStatus(request.status) !== "RECUSADA"
    ));
  }, [requests, vaccinator]);

  const linkedFarms = useMemo(() => {
    const farms = [];

    if (hasCompleteFarmProfile(farmProfile) && vaccinator) {
      farms.push({
        farmName: farmProfile.farmName,
        city: farmProfile.city,
        document: farmProfile.document,
        owner: farmProfile.owner,
        address: farmProfile.address,
        location: farmProfile.location,
      });
    }

    return farms;
  }, [farmProfile, vaccinator]);

  function handleLogin(event) {
    event.preventDefault();

    const foundVaccinator = findVaccinatorByContact(
      readJson("vaccinators", []),
      email,
      phone
    );

    if (!foundVaccinator) {
      alert("Vacinador nao encontrado. Use o mesmo email e telefone cadastrados pela granja.");
      return;
    }

    if (foundVaccinator.status === "INATIVO") {
      alert("Este vacinador esta inativo no sistema da granja.");
      return;
    }

    const nextSession = {
      vaccinatorId: foundVaccinator.id,
      email: foundVaccinator.email,
      phone: foundVaccinator.phone,
    };

    writeJson("vaccinatorPortalSession", nextSession);
    setSession(nextSession);
    setVaccinator(foundVaccinator);
    setNotificationContact(foundVaccinator.notificationContact || "");
  }

  function logout() {
    localStorage.removeItem("vaccinatorPortalSession");
    setSession(null);
    setVaccinator(null);
    setEmail("");
    setPhone("");
    setNotificationContact("");
  }

  function saveNotificationContact() {
    const vaccinators = readJson("vaccinators", []);
    const nextVaccinators = vaccinators.map((item) => (
      String(item.id) === String(vaccinator.id)
        ? {
            ...item,
            notificationContact: notificationContact.trim(),
          }
        : item
    ));
    const updatedVaccinator = nextVaccinators.find((item) => String(item.id) === String(vaccinator.id));

    writeJson("vaccinators", nextVaccinators);
    setVaccinator(updatedVaccinator || vaccinator);
    alert("Contato de notificacao salvo.");
  }

  function answerRequest(request, status) {
    const answeredAt = new Date().toLocaleString("pt-BR");
    const nextRequests = requests.map((item) => {
      if (String(item.id) !== String(request.id)) {
        return item;
      }

      return {
        ...item,
        status,
        answeredAt,
      };
    });

    const schedules = readJson("schedules", []);
    const nextSchedules = schedules.map((schedule) => {
      if (String(schedule.id) !== String(request.scheduleId)) {
        return schedule;
      }

      return {
        ...schedule,
        status,
        answeredAt,
      };
    });

    setRequests(nextRequests);
    writeJson("requests", nextRequests);
    writeJson("schedules", nextSchedules);
  }

  if (!session || !vaccinator) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-500 p-6">
        <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-5xl items-center">
          <div className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
            <section className="bg-zinc-950 p-8 text-white md:p-10">
              <p className="text-sm font-bold uppercase tracking-wide text-green-300">
                ImmuHen
              </p>

              <h1 className="mt-4 text-4xl font-bold">
                ImmuHen Vacinador
              </h1>

              <p className="mt-4 text-zinc-300">
                Acesse com o email e telefone usados no cadastro da granja.
              </p>

              <Link
                to="/"
                className="mt-8 inline-flex rounded-xl border border-green-500 px-5 py-3 font-bold text-green-200 transition hover:bg-green-900"
              >
                Voltar ao Login
              </Link>
            </section>

            <form
              onSubmit={handleLogin}
              className="grid gap-5 p-8 md:p-10"
            >
              <h2 className="text-3xl font-bold text-zinc-900">
                Entrar ou Registrar
              </h2>

              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-zinc-700">
                Telefone
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700"
              >
                Acessar App
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-6 md:p-8">
      <main className="mx-auto max-w-6xl">
        <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-green-700">
                ImmuHen Vacinador
              </p>

              <h1 className="mt-2 text-3xl font-bold text-zinc-900 md:text-5xl">
                {vaccinator.name}
              </h1>

              <p className="mt-2 text-zinc-500">
                {vaccinator.email} | {vaccinator.phone}
              </p>

              {vaccinator.notificationContact && (
                <p className="mt-1 text-zinc-500">
                  Notificacoes: {vaccinator.notificationContact}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl bg-zinc-900 px-5 py-3 font-bold text-white transition hover:bg-zinc-800"
            >
              Sair
            </button>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-2 text-sm font-semibold text-zinc-700">
              Contato de notificacao
              <input
                type="text"
                value={notificationContact}
                onChange={(event) => setNotificationContact(event.target.value)}
                placeholder="Email ou WhatsApp"
                className="rounded-xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </label>

            <button
              type="button"
              onClick={saveNotificationContact}
              className="rounded-xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700"
            >
              Salvar contato
            </button>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="grid gap-6">
            <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-zinc-900">
                Granjas Vinculadas
              </h2>

              <div className="mt-5 grid gap-4">
                {linkedFarms.length === 0 && (
                  <p className="text-zinc-500">
                    Nenhuma granja vinculada.
                  </p>
                )}

                {linkedFarms.map((farm) => (
                  <article
                    key={`${farm.farmName}-${farm.document}`}
                    className="rounded-xl border border-green-100 bg-green-50 p-4"
                  >
                    <h3 className="text-xl font-bold text-zinc-900">
                      {farm.farmName}
                    </h3>

                    <p className="mt-2 text-zinc-600">
                      Cidade: {farm.city}
                    </p>

                    <p className="text-zinc-600">
                      CNPJ/CPF: {farm.document}
                    </p>

                    <p className="text-zinc-600">
                      Proprietario: {farm.owner}
                    </p>

                    <p className="text-zinc-600">
                      Endereco: {farm.address || "Nao informado"}
                    </p>

                    <p className="break-words text-zinc-600">
                      Localizacao: {farm.location || "Nao informada"}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-zinc-900">
                Notificacoes
              </h2>

              <div className="mt-5 grid gap-3">
                {vaccinatorNotifications.length === 0 && (
                  <p className="text-zinc-500">
                    Nenhuma notificacao no momento.
                  </p>
                )}

                {vaccinatorNotifications.map((notification) => (
                  <article
                    key={notification.id}
                    className="rounded-xl border border-green-100 bg-green-50 p-4"
                  >
                    <h3 className="font-bold text-zinc-900">
                      {notification.title || `${notification.farmName} te adicionou no ImmuHen`}
                    </h3>

                    <p className="mt-1 text-sm text-zinc-600">
                      {notification.message}
                    </p>

                    <p className="mt-3 text-xs font-semibold text-green-700">
                      {notification.createdAt}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-zinc-900">
              Agendamentos
            </h2>

            <div className="mt-5 grid gap-4">
              {vaccinatorRequests.length === 0 && (
                <p className="text-zinc-500">
                  Nenhum agendamento recebido.
                </p>
              )}

              {vaccinatorRequests.map((request) => {
                const status = normalizeRequestStatus(request.status);

                return (
                  <article
                    key={request.id}
                    className="rounded-xl border border-green-100 bg-green-50 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">
                          {request.farmName || "Granja"}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-600">
                          Proprietario: {request.farmOwner || "Nao informado"}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(status)}`}
                      >
                        {status}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-green-100 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                          Vacinacao
                        </p>
                        <p className="mt-2 font-bold text-zinc-900">
                          {formatPeriod(
                            request.vaccinationStartDate || request.date,
                            request.vaccinationEndDate || request.date
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-green-100 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                          Debicagem
                        </p>
                        <p className="mt-2 font-bold text-zinc-900">
                          {request.hasDebicagem === "SIM" ? "Sim" : "Nao"}
                        </p>
                      </div>

                    </div>

                    {Array.isArray(request.vaccineUsages) && request.vaccineUsages.length > 0 && (
                      <div className="mt-4 rounded-lg border border-green-100 bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                          Vacinas do agendamento
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {request.vaccineUsages.map((usage, index) => (
                            <span
                              key={`${usage.vaccineId}-${index}`}
                              className="rounded-full bg-green-50 px-3 py-1 text-sm font-bold text-zinc-700"
                            >
                              {usage.vacina || "Vacina"}: {usage.doses} doses
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(request.farmAddress || request.farmLocation || request.observations) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-green-100 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                            Endereco
                          </p>
                          <p className="mt-2 text-sm text-zinc-700">
                            {request.farmAddress || "Nao informado"}
                          </p>
                        </div>

                        <div className="rounded-lg border border-green-100 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                            Localizacao
                          </p>
                          <p className="mt-2 break-words text-sm text-zinc-700">
                            {request.farmLocation || "Nao informada"}
                          </p>
                        </div>

                        <div className="rounded-lg border border-green-100 bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                            Observacoes
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                            {request.observations || "Nenhuma observacao"}
                          </p>
                        </div>
                      </div>
                    )}

                    {status === "PENDENTE" && (
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => answerRequest(request, "CONFIRMADA")}
                          className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                        >
                          Confirmar
                        </button>

                        <button
                          type="button"
                          onClick={() => answerRequest(request, "RECUSADA")}
                          className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
                        >
                          Recusar
                        </button>
                      </div>
                    )}

                    {request.answeredAt && (
                      <p className="mt-4 text-sm text-zinc-500">
                        Respondido em {request.answeredAt}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default VaccinatorPortal;
