require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const prisma = new PrismaClient();
const appStateId = "immuhen-main";
const vacitechDataFile = process.env.VACITECH_DATA_FILE
  ? path.resolve(process.env.VACITECH_DATA_FILE)
  : path.join(__dirname, "vacitech-data.json");
const port = process.env.PORT || 3001;
const corsOrigin = process.env.CORS_ORIGIN || "*";
const stateStorage = String(process.env.VACITECH_STATE_STORAGE || (process.env.DATABASE_URL ? "database" : "file")).toLowerCase();
const subscriptionAdminKey = process.env.SUBSCRIPTION_ADMIN_KEY || "";
const ownerAdminKey = process.env.OWNER_ADMIN_KEY || subscriptionAdminKey || "";
const mercadoPagoAccessToken = process.env.MP_ACCESS_TOKEN || "";
const apiPublicUrl = String(process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
const frontendPublicUrl = String(process.env.FRONTEND_PUBLIC_URL || "").replace(/\/$/, "");
const subscriptionPrice = Number(process.env.SUBSCRIPTION_PRICE || 99.9);
const subscriptionCurrency = process.env.SUBSCRIPTION_CURRENCY || "BRL";
const subscriptionEnforcement = String(process.env.SUBSCRIPTION_ENFORCEMENT || "on").toLowerCase() !== "off";
const authSecret = process.env.AUTH_SECRET || "granja-system-dev-secret";
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpPort === 465;
const notificationFromEmail = process.env.NOTIFICATION_FROM_EMAIL || smtpUser || "";
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: corsOrigin === "*"
    ? "*"
    : corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
}));
app.use(express.json({ limit: "12mb" }));
app.use("/login", authLimiter);
app.use("/api/accounts/register", authLimiter);
app.use("/api/owner/login", authLimiter);
app.use("/api/vacitech/vaccinator-login", authLimiter);

/* =========================
   LOGIN ADMIN
========================= */

const adminUser = {
  email: "admin@granja.com",
  password: "123456",
};

app.post("/login", async (req, res) => {
  const data = await readVacitechData();
  const { email, password } = req.body;
  const account = data.accounts.find((item) => (
    normalizeEmail(item.email) === normalizeEmail(email)
  ));

  if (account && verifyPassword(password, account.passwordHash)) {
    const tenantData = getTenantData(data, account.tenantId);
    const subscription = getSubscriptionStatus(tenantData.subscription);

    if (isTenantArchived(tenantData)) {
      return res.status(403).json({
        success: false,
        message: "Esta granja esta excluida temporariamente. Fale com o administrador do ImmuHen.",
      });
    }

    if (!subscription.active) {
      return res.status(402).json({
        success: false,
        message: "Assinatura vencida. Renove o acesso mensal para continuar usando o ImmuHen.",
        subscription,
        accountEmail: account.email,
      });
    }

    return res.json({
      success: true,
      token: createAuthToken(account),
      user: {
        id: account.id,
        tenantId: account.tenantId,
        name: account.name,
        email: account.email,
        role: account.role || "admin",
      },
      farmProfile: tenantData.farmProfile,
      state: tenantData,
      subscription,
    });
  }

  return res.status(401).json({
    success: false,
    message: "Email ou senha invalidos",
  });
});

app.post("/api/accounts/register", async (req, res) => {
  const data = await readVacitechData();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password || password.length < 6) {
    return res.status(400).json({
      message: "Informe email e senha com pelo menos 6 caracteres.",
    });
  }

  if (data.accounts.some((account) => normalizeEmail(account.email) === email)) {
    return res.status(409).json({
      message: "Este email ja esta cadastrado. Use outro email ou entre na conta existente.",
    });
  }

  const requiredFields = ["farmName", "city", "document", "owner"];
  const missingField = requiredFields.find((field) => !String(req.body[field] || "").trim());

  if (missingField) {
    return res.status(400).json({
      message: "Preencha os dados principais da granja.",
    });
  }

  const tenantId = `tenant-${Date.now()}`;
  const account = {
    id: `account-${Date.now()}`,
    tenantId,
    name: String(req.body.owner || req.body.name || "Administrador").trim(),
    email,
    passwordHash: hashPassword(password),
    role: "admin",
    createdAt: new Date().toISOString(),
  };
  const tenantData = {
    ...getEmptyTenantData(),
    farmProfile: {
      farmName: String(req.body.farmName || "").trim(),
      city: String(req.body.city || "").trim(),
      document: String(req.body.document || "").trim(),
      owner: String(req.body.owner || "").trim(),
      address: String(req.body.address || "").trim(),
      location: String(req.body.location || "").trim(),
      notificationContact: String(req.body.notificationContact || "").trim(),
      ranches: normalizeProfileRanches(req.body.ranches),
      importantContacts: normalizeImportantContacts(req.body.importantContacts),
      updatedAt: new Date().toLocaleString("pt-BR"),
    },
  };

  data.accounts.push(account);
  data.tenants[tenantId] = tenantData;
  await writeVacitechData(data);

  res.status(201).json({
    success: true,
    token: createAuthToken(account),
    user: {
      id: account.id,
      tenantId: account.tenantId,
      name: account.name,
      email: account.email,
      role: account.role,
    },
    farmProfile: tenantData.farmProfile,
    state: tenantData,
    subscription: getSubscriptionStatus(tenantData.subscription),
  });
});

/* =========================
   TESTE BACKEND
========================= */

app.get("/", (req, res) => {
  res.send("Backend funcionando");
});

app.get("/api/subscription/status", async (req, res) => {
  const data = await readVacitechData();
  const accountContext = getRequestAccount(req, data);
  const tenantData = accountContext
    ? getTenantData(data, accountContext.account.tenantId)
    : getDefaultTenantData(data);

  res.json({
    subscription: getSubscriptionStatus(tenantData.subscription),
  });
});

app.post("/api/subscription/renew", async (req, res) => {
  const key = req.headers["x-admin-key"] || req.body.adminKey;

  if (!subscriptionAdminKey) {
    return res.status(500).json({
      message: "Configure SUBSCRIPTION_ADMIN_KEY no servidor para liberar renovacoes.",
    });
  }

  if (key !== subscriptionAdminKey) {
    return res.status(401).json({
      message: "Chave administrativa invalida.",
    });
  }

  const data = await readVacitechData();
  const accountContext = getRequestAccount(req, data);
  const tenantId = accountContext?.account.tenantId || getTenantIdByEmail(data, req.body.email) || getDefaultTenantId(data);
  const tenantData = getTenantData(data, tenantId);
  const months = Math.max(1, Math.min(Number(req.body.months) || 1, 24));
  renewSubscription(tenantData, months, {
    plan: req.body.plan || "MENSAL",
    source: "manual",
  });
  data.tenants[tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    subscription: getSubscriptionStatus(tenantData.subscription),
  });
});

app.post("/api/subscription/checkout", async (req, res) => {
  if (!mercadoPagoAccessToken) {
    return res.status(500).json({
      message: "Configure MP_ACCESS_TOKEN no servidor para gerar pagamentos do Mercado Pago.",
    });
  }

  try {
    const data = await readVacitechData();
    const accountContext = getRequestAccount(req, data);
    const tenantId = accountContext?.account.tenantId || getTenantIdByEmail(data, req.body.email) || getDefaultTenantId(data);
    const months = Math.max(1, Math.min(Number(req.body.months) || 1, 12));
    const preference = await createMercadoPagoPreference(months, tenantId);

    res.json({
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/api/subscription/pix", async (req, res) => {
  if (!mercadoPagoAccessToken) {
    return res.status(500).json({
      message: "Configure MP_ACCESS_TOKEN no servidor para gerar Pix pelo Mercado Pago.",
    });
  }

  try {
    const data = await readVacitechData();
    const accountContext = getRequestAccount(req, data);
    const tenantId = accountContext?.account.tenantId || getTenantIdByEmail(data, req.body.email) || getDefaultTenantId(data);
    const accountEmail = accountContext?.account.email || req.body.email || getAccountEmailByTenantId(data, tenantId);
    const months = Math.max(1, Math.min(Number(req.body.months) || 1, 12));
    const payment = await createMercadoPagoPixPayment(months, tenantId, accountEmail);

    res.json({
      paymentId: payment.id,
      status: payment.status,
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url || "",
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code || "",
      qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 || "",
      expiresAt: payment.date_of_expiration || "",
      amount: payment.transaction_amount,
      currency: payment.currency_id,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/api/payments/mercadopago/webhook", async (req, res) => {
  try {
    const paymentId =
      req.body?.data?.id ||
      req.body?.id ||
      req.query?.["data.id"] ||
      req.query?.id;

    if (!paymentId) {
      return res.sendStatus(200);
    }

    const payment = await fetchMercadoPagoPayment(paymentId);

    if (payment.status !== "approved") {
      return res.sendStatus(200);
    }

      const data = await readVacitechData();
      const tenantId = getTenantIdFromPayment(payment) || getDefaultTenantId(data);
      const tenantData = getTenantData(data, tenantId);
    const alreadyProcessed = tenantData.payments.some((item) => (
      String(item.provider) === "mercadopago" &&
      String(item.providerPaymentId) === String(payment.id)
    ));

    if (!alreadyProcessed) {
      const months = Math.max(1, Math.min(Number(payment.metadata?.months) || 1, 12));

      tenantData.payments.push({
        provider: "mercadopago",
        providerPaymentId: payment.id,
        status: payment.status,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        months,
        receivedAt: new Date().toISOString(),
        externalReference: payment.external_reference || "",
      });

      renewSubscription(tenantData, months, {
        plan: "MENSAL",
        source: "mercadopago",
        paymentId: payment.id,
      });

      data.tenants[tenantId] = tenantData;
      await writeVacitechData(data);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.log(error);
    return res.sendStatus(200);
  }
});

app.get("/owner-admin", (req, res) => {
  res.type("html").send(getOwnerAdminHtml());
});

app.post("/api/owner/login", (req, res) => {
  if (!ownerAdminKey) {
    return res.status(500).json({
      message: "Configure OWNER_ADMIN_KEY no servidor.",
    });
  }

  if (req.body.password !== ownerAdminKey) {
    return res.status(401).json({
      message: "Senha do dono invalida.",
    });
  }

  res.json({
    token: createOwnerToken(),
  });
});

app.get("/api/owner/overview", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();

  res.json(getOwnerOverview(data));
});

app.post("/api/owner/tenants/:tenantId/renew", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.params.tenantId);
  const months = Math.max(1, Math.min(Number(req.body.months) || 1, 24));

  renewSubscription(tenantData, months, {
    plan: "MENSAL",
    source: "owner-admin",
  });

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    subscription: getSubscriptionStatus(tenantData.subscription),
    overview: getOwnerOverview(data),
  });
});

app.post("/api/owner/tenants/:tenantId/expire", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.params.tenantId);

  tenantData.subscription = {
    ...tenantData.subscription,
    status: "EXPIRED",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    subscription: getSubscriptionStatus(tenantData.subscription),
    overview: getOwnerOverview(data),
  });
});

app.post("/api/owner/tenants/:tenantId/archive", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();

  if (!data.tenants?.[req.params.tenantId]) {
    return res.status(404).json({
      message: "Granja nao encontrada.",
    });
  }

  const tenantData = getTenantData(data, req.params.tenantId);
  tenantData.archivedAt = new Date().toISOString();
  tenantData.archivedReason = String(req.body.reason || "Excluida temporariamente pelo admin.").trim();

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    tenant: getOwnerOverview(data).tenants.find((tenant) => tenant.tenantId === req.params.tenantId),
    overview: getOwnerOverview(data),
  });
});

app.post("/api/owner/tenants/:tenantId/restore", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();

  if (!data.tenants?.[req.params.tenantId]) {
    return res.status(404).json({
      message: "Granja nao encontrada.",
    });
  }

  const tenantData = getTenantData(data, req.params.tenantId);
  delete tenantData.archivedAt;
  delete tenantData.archivedReason;

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    tenant: getOwnerOverview(data).tenants.find((tenant) => tenant.tenantId === req.params.tenantId),
    overview: getOwnerOverview(data),
  });
});

app.delete("/api/owner/tenants/:tenantId", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();
  const tenantData = data.tenants?.[req.params.tenantId];

  if (!tenantData) {
    return res.status(404).json({
      message: "Granja nao encontrada.",
    });
  }

  const removedAccounts = data.accounts.filter((account) => account.tenantId === req.params.tenantId).length;
  const removedVaccinators = Array.isArray(tenantData.vaccinators) ? tenantData.vaccinators.length : 0;

  data.accounts = data.accounts.filter((account) => account.tenantId !== req.params.tenantId);
  delete data.tenants[req.params.tenantId];
  await writeVacitechData(data);

  res.json({
    success: true,
    removed: {
      tenantId: req.params.tenantId,
      accounts: removedAccounts,
      vaccinators: removedVaccinators,
    },
    overview: getOwnerOverview(data),
  });
});

app.post("/api/owner/accounts/:accountId/reset-password", requireOwnerAccess, async (req, res) => {
  const password = String(req.body.password || "");

  if (password.length < 6) {
    return res.status(400).json({
      message: "A nova senha precisa ter pelo menos 6 caracteres.",
    });
  }

  const data = await readVacitechData();
  let updatedAccount = null;

  data.accounts = data.accounts.map((account) => {
    if (account.id !== req.params.accountId) {
      return account;
    }

    updatedAccount = {
      ...account,
      passwordHash: hashPassword(password),
      passwordResetAt: new Date().toISOString(),
    };

    return updatedAccount;
  });

  if (!updatedAccount) {
    return res.status(404).json({
      message: "Conta nao encontrada.",
    });
  }

  await writeVacitechData(data);

  res.json({
    success: true,
    account: sanitizeAccount(updatedAccount),
  });
});

app.delete("/api/owner/accounts/:accountId", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();
  const account = data.accounts.find((item) => item.id === req.params.accountId);

  if (!account) {
    return res.status(404).json({
      message: "Conta nao encontrada.",
    });
  }

  data.accounts = data.accounts.filter((item) => item.id !== req.params.accountId);
  await writeVacitechData(data);

  res.json({
    success: true,
    account: sanitizeAccount(account),
    overview: getOwnerOverview(data),
  });
});

app.use("/api/vacitech", async (req, res, next) => {
  if (isPublicVaccinatorRoute(req)) {
    return next();
  }

  const data = await readVacitechData();
  const accountContext = getRequestAccount(req, data);

  if (!accountContext) {
    return res.status(401).json({
      message: "Entre na conta da granja para continuar.",
    });
  }

  const tenantData = getTenantData(data, accountContext.account.tenantId);
  const subscription = getSubscriptionStatus(tenantData.subscription);

  if (isTenantArchived(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta excluida temporariamente. Fale com o administrador do ImmuHen.",
    });
  }

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. Renove o acesso mensal para continuar usando.",
      subscription,
    });
  }

  req.account = accountContext.account;
  req.tenantId = accountContext.account.tenantId;
  req.tenantData = tenantData;
  return next();
});

/* =========================
   VACITECH SHARED DATA
========================= */

app.get("/api/vacitech/state", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = await syncOverdueVaccinationAlerts(data, req.tenantId);
  res.json(tenantData);
});

app.get("/api/vacitech/notifications/status", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  res.json({
    configured: {
      email: Boolean(getSmtpTransport()),
    },
    contact: getFarmNotificationContact(data, req.tenantId, tenantData),
    recentOutbox: (tenantData.notificationOutbox || []).slice(0, 12),
  });
});

app.post("/api/vacitech/notifications/test", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const notification = {
    id: `test-${Date.now()}`,
    type: "TEST_NOTIFICATION",
    title: "Teste de notificacao ImmuHen",
    message: "Se voce recebeu esta mensagem, o contato de notificacao esta funcionando.",
    farmName: tenantData.farmProfile?.farmName || "Granja",
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
  const delivered = await queueFarmExternalNotification(data, req.tenantId, tenantData, notification, {
    dedupeKey: `test-notification:${Date.now()}`,
  });

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    notification,
    delivered,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.put("/api/vacitech/farm-profile", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const farmProfile = {
    ...tenantData.farmProfile,
    ...req.body,
    updatedAt: new Date().toLocaleString("pt-BR"),
  };

  tenantData.farmProfile = farmProfile;
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({ farmProfile });
});

app.get("/api/vacitech/vaccinators", async (req, res) => {
  res.json(req.tenantData.vaccinators);
});

app.post("/api/vacitech/vaccinators", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const vaccinator = normalizeVaccinator(req.body);

  if (!vaccinator.name || !vaccinator.email || !vaccinator.phone) {
    return res.status(400).json({
      message: "Nome, email e telefone sao obrigatorios",
    });
  }

  const existingIndex = tenantData.vaccinators.findIndex((item) => (
    sameContact(item, vaccinator) || String(item.id) === String(vaccinator.id)
  ));

  if (existingIndex >= 0) {
    tenantData.vaccinators[existingIndex] = {
      ...tenantData.vaccinators[existingIndex],
      ...vaccinator,
    };
  } else {
    tenantData.vaccinators.push(vaccinator);
    const notification = createFarmLinkNotification(vaccinator, tenantData.farmProfile);
    tenantData.notifications.push(notification);
    await queueVaccinatorExternalNotification(tenantData, notification, vaccinator, {
      dedupeKey: `farm-linked:${vaccinator.id}:${tenantData.farmProfile?.farmName || ""}`,
    });
  }

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    vaccinator,
    vaccinators: tenantData.vaccinators,
  });
});

app.put("/api/vacitech/vaccinators/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const id = req.params.id;
  const nextVaccinator = normalizeVaccinator({
    ...req.body,
    id,
  });

  tenantData.vaccinators = tenantData.vaccinators.map((vaccinator) => (
    String(vaccinator.id) === String(id)
      ? {
          ...vaccinator,
          ...nextVaccinator,
        }
      : vaccinator
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    vaccinator: tenantData.vaccinators.find((vaccinator) => String(vaccinator.id) === String(id)),
    vaccinators: tenantData.vaccinators,
  });
});

app.delete("/api/vacitech/vaccinators/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  tenantData.vaccinators = tenantData.vaccinators.filter(
    (vaccinator) => String(vaccinator.id) !== String(req.params.id)
  );

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    vaccinators: tenantData.vaccinators,
  });
});

app.get("/api/vacitech/requests", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = await syncOverdueVaccinationAlerts(data, req.tenantId);
  res.json(tenantData.requests);
});

app.get("/api/vacitech/schedules", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = await syncOverdueVaccinationAlerts(data, req.tenantId);
  res.json(tenantData.schedules);
});

app.post("/api/vacitech/schedules", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const scheduleId = req.body.id || Date.now();
  const vaccinator = tenantData.vaccinators.find((item) => (
    String(item.id) === String(req.body.vaccinatorId)
  )) || req.body;
  const farmProfile = tenantData.farmProfile || {};

  const schedule = {
    id: scheduleId,
    vaccinatorId: vaccinator.id || req.body.vaccinatorId,
    vaccinatorName: vaccinator.name || req.body.vaccinatorName,
    vaccinatorEmail: vaccinator.email || req.body.vaccinatorEmail,
    vaccinatorPhone: vaccinator.phone || req.body.vaccinatorPhone,
    vaccinatorNotificationContact: vaccinator.notificationContact || req.body.vaccinatorNotificationContact || "",
    farmName: farmProfile.farmName || req.body.farmName || "Granja",
    farmCity: farmProfile.city || req.body.farmCity || "",
    farmDocument: farmProfile.document || req.body.farmDocument || "",
    farmOwner: farmProfile.owner || req.body.farmOwner || "",
    farmAddress: farmProfile.address || req.body.farmAddress || "",
    farmLocation: farmProfile.location || req.body.farmLocation || "",
    observations: req.body.observations || "",
    hasDebicagem: req.body.hasDebicagem || "NAO",
    laborCost: Number(req.body.laborCost || 0),
    programLaborCost: Number(req.body.programLaborCost || 0),
    vaccinationStartDate: req.body.vaccinationStartDate || "",
    vaccinationEndDate: req.body.vaccinationEndDate || "",
    vaccineUsages: normalizeVaccineUsages(req.body.vaccineUsages),
    applicationMethod: req.body.applicationMethod || req.body.vaccineUsages?.[0]?.applicationMethod || "",
    programId: req.body.programId || "",
    programDay: req.body.programDay || "",
    programSuggestedName: req.body.programSuggestedName || "",
    programStartDate: req.body.programStartDate || "",
    programEndDate: req.body.programEndDate || "",
    productionEndDate: req.body.productionEndDate || "",
    birdLotId: req.body.birdLotId || "",
    birdLotName: req.body.birdLotName || "",
    birdLotBirthDate: req.body.birdLotBirthDate || "",
    scheduleMode: req.body.scheduleMode || "UNICO",
    monthlyMonth: req.body.monthlyMonth || "",
    monthlyWeekday: req.body.monthlyWeekday || "",
    status: "PENDENTE",
    createdAt: new Date().toLocaleString("pt-BR"),
  };
  const request = {
    ...schedule,
    id: req.body.requestId || `request-${scheduleId}`,
    scheduleId,
    status: "PENDENTE",
  };

  tenantData.schedules = [
    schedule,
    ...tenantData.schedules.filter((item) => String(item.id) !== String(scheduleId)),
  ];
  tenantData.requests = [
    request,
    ...tenantData.requests.filter((item) => String(item.id) !== String(request.id)),
  ];
  const scheduleNotification = createScheduleNotification(request);
  tenantData.notifications.push(scheduleNotification);
  await queueVaccinatorExternalNotification(tenantData, scheduleNotification, vaccinator, {
    dedupeKey: `schedule-request:${request.id}`,
  });

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    schedule,
    request,
  });
});

app.delete("/api/vacitech/schedules/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const schedule = tenantData.schedules.find((item) => String(item.id) === String(req.params.id));

  if (!schedule) {
    return res.status(404).json({
      message: "Programa nao encontrado.",
    });
  }

  const scheduleIdsToDelete = new Set(
    tenantData.schedules
      .filter((item) => (
        schedule.programId
          ? String(item.programId || "") === String(schedule.programId)
          : String(item.id) === String(schedule.id)
      ))
      .map((item) => String(item.id))
  );
  const requestsToDelete = tenantData.requests.filter((request) => (
    scheduleIdsToDelete.has(String(request.scheduleId)) ||
    String(request.id) === String(req.body?.requestId || "")
  ));
  const requestIdsToDelete = new Set(requestsToDelete.map((request) => String(request.id)));

  tenantData.schedules = tenantData.schedules.filter((item) => (
    !scheduleIdsToDelete.has(String(item.id))
  ));
  tenantData.requests = tenantData.requests.filter((request) => (
    !requestIdsToDelete.has(String(request.id)) &&
    !scheduleIdsToDelete.has(String(request.scheduleId))
  ));
  tenantData.notifications = tenantData.notifications.filter((notification) => (
    !requestIdsToDelete.has(String(notification.requestId || "")) &&
    !scheduleIdsToDelete.has(String(notification.scheduleId || ""))
  ));
  tenantData.notificationOutbox = tenantData.notificationOutbox.filter((item) => (
    !requestIdsToDelete.has(String(item.requestId || "")) &&
    !scheduleIdsToDelete.has(String(item.scheduleId || ""))
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    deletedScheduleIds: Array.from(scheduleIdsToDelete),
    deletedRequestIds: Array.from(requestIdsToDelete),
    schedules: tenantData.schedules,
    requests: tenantData.requests,
    notifications: tenantData.notifications,
  });
});

app.patch("/api/vacitech/requests/:id/status", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  if (isTenantArchived(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta excluida temporariamente.",
    });
  }
  const status = normalizeRequestStatus(req.body.status);
  const now = new Date();
  const answeredAt = now.toLocaleString("pt-BR");
  const statusTimestamps = getStatusTimestamps(status, answeredAt, now.toISOString());
  let updatedRequest = null;

  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    updatedRequest = {
      ...request,
      status,
      ...statusTimestamps,
    };

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          status,
          ...statusTimestamps,
        }
      : schedule
  ));

  if (status === "CONCLUIDA") {
    const notification = createVaccinationCompletedNotification(updatedRequest);

    tenantData.notifications = removeNotificationsForRequest(
      tenantData.notifications,
      updatedRequest.id,
      "VACCINATION_COMPLETED"
    );
    tenantData.notifications.push(notification);
    await queueFarmExternalNotification(data, targetTenantId, tenantData, notification, {
      dedupeKey: `vaccination-completed:${updatedRequest.id}:${updatedRequest.completedAtIso || Date.now()}`,
    });
  }

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.patch("/api/vacitech/requests/:id/vaccines", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  const vaccineUsages = normalizeVaccineUsages(req.body.vaccineUsages);

  if (vaccineUsages.length === 0) {
    return res.status(400).json({
      message: "Informe pelo menos uma vacina para alterar.",
    });
  }

  let updatedRequest = null;
  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    updatedRequest = {
      ...request,
      vaccineUsages,
      applicationMethod: vaccineUsages[0]?.applicationMethod || request.applicationMethod || "",
      vaccineChangedAt: new Date().toLocaleString("pt-BR"),
    };

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          vaccineUsages,
          applicationMethod: vaccineUsages[0]?.applicationMethod || schedule.applicationMethod || "",
          vaccineChangedAt: updatedRequest.vaccineChangedAt,
        }
      : schedule
  ));

  const notification = createVaccineChangedNotification(updatedRequest);
  tenantData.notifications.push(notification);
  const vaccinator = tenantData.vaccinators.find((item) => (
    String(item.id) === String(updatedRequest.vaccinatorId)
  )) || updatedRequest;
  await queueVaccinatorExternalNotification(tenantData, notification, vaccinator, {
    dedupeKey: `vaccine-changed:${updatedRequest.id}:${Date.now()}`,
  });

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
  });
});

app.post("/api/vacitech/requests/:id/postpone", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  const newStartDate = String(req.body.vaccinationStartDate || "").trim();
  const newEndDate = String(req.body.vaccinationEndDate || newStartDate).trim();
  const reason = String(req.body.reason || "").trim();

  if (!newStartDate || !newEndDate) {
    return res.status(400).json({
      message: "Informe o novo periodo da vacinacao.",
    });
  }

  if (newEndDate < newStartDate) {
    return res.status(400).json({
      message: "A nova data final nao pode ser antes da inicial.",
    });
  }

  let updatedRequest = null;
  const postponedAt = new Date().toLocaleString("pt-BR");
  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    updatedRequest = {
      ...request,
      vaccinationStartDate: newStartDate,
      vaccinationEndDate: newEndDate,
      postponedAt,
      postponement: {
        requestedAt: postponedAt,
        previousStartDate: request.vaccinationStartDate || request.date || "",
        previousEndDate: request.vaccinationEndDate || request.date || "",
        vaccinationStartDate: newStartDate,
        vaccinationEndDate: newEndDate,
        reason,
        vaccinatorName: request.vaccinatorName || "Vacinador",
      },
    };

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          vaccinationStartDate: newStartDate,
          vaccinationEndDate: newEndDate,
          postponedAt,
          postponement: updatedRequest.postponement,
        }
      : schedule
  ));

  const notification = createVaccinationPostponedNotification(updatedRequest);
  tenantData.notifications.push(notification);
  await queueFarmExternalNotification(data, targetTenantId, tenantData, notification, {
    dedupeKey: `postponed:${updatedRequest.id}:${postponedAt}`,
  });

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
  });
});

app.post("/api/vacitech/requests/:id/confirm-completion", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const request = tenantData.requests.find((item) => String(item.id) === String(req.params.id));

  if (!request) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  if (normalizeRequestStatus(request.status) !== "CONCLUIDA") {
    return res.status(400).json({
      message: "A vacinacao precisa estar marcada como concluida pelo vacinador antes da confirmacao.",
    });
  }

  const confirmedAtDate = new Date();
  const confirmedAt = confirmedAtDate.toLocaleString("pt-BR");
  const materialsUsed = buildVaccinationMaterials(request);
  const returnedVaccines = normalizeReturnedVaccines(req.body.returnedVaccines);
  const completedRecord = {
    ...request,
    status: "CONCLUIDA",
    materialsUsed,
    returnedVaccines,
    completionTiming: String(req.body.completionTiming || "PONTUAL").toUpperCase(),
    completionSummary: buildVaccinationCompletionSummary(request, materialsUsed),
    systemConfirmedAt: confirmedAt,
    systemConfirmedAtIso: confirmedAtDate.toISOString(),
    archivedAt: confirmedAt,
    archivedAtIso: confirmedAtDate.toISOString(),
  };

  tenantData.completedVaccinations = [
    completedRecord,
    ...tenantData.completedVaccinations.filter((item) => String(item.id) !== String(request.id)),
  ];
  tenantData.requests = tenantData.requests.filter((item) => String(item.id) !== String(request.id));
  tenantData.notifications = removeNotificationsForRequest(tenantData.notifications, request.id);
  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(request.scheduleId)
      ? {
          ...schedule,
          status: "CONCLUIDA",
          systemConfirmedAt: confirmedAt,
          systemConfirmedAtIso: confirmedAtDate.toISOString(),
        }
      : schedule
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  sendVaccinationCompletionPdf(res, completedRecord);
});

app.patch("/api/vacitech/requests/:id/temperature-photo", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  if (isTenantArchived(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta excluida temporariamente.",
    });
  }
  const temperaturePhoto = String(req.body.temperaturePhoto || "");
  const temperaturePhotoCaptureMode = String(req.body.temperaturePhotoCaptureMode || "").toUpperCase();
  const temperaturePhotoCapturedAt = String(req.body.temperaturePhotoCapturedAt || "");
  const capturedAtDate = new Date(temperaturePhotoCapturedAt);
  const captureAgeMs = Date.now() - capturedAtDate.getTime();
  const maxCaptureAgeMs = 15 * 60 * 1000;

  if (!temperaturePhoto.startsWith("data:image/")) {
    return res.status(400).json({
      message: "Envie uma foto valida da temperatura da vacina.",
    });
  }

  if (
    temperaturePhotoCaptureMode !== "CAMERA_LIVE" ||
    !temperaturePhotoCapturedAt ||
    Number.isNaN(capturedAtDate.getTime()) ||
    captureAgeMs < -120000 ||
    captureAgeMs > maxCaptureAgeMs
  ) {
    return res.status(400).json({
      message: "A foto da temperatura precisa ser tirada pela camera na hora.",
    });
  }

  const photoData = {
    temperaturePhoto,
    temperaturePhotoName: String(req.body.temperaturePhotoName || "temperatura-vacina"),
    temperatureNotes: String(req.body.temperatureNotes || ""),
    temperaturePhotoSource: String(req.body.temperaturePhotoSource || "VACINADOR").toUpperCase(),
    temperaturePhotoBy: String(req.body.temperaturePhotoBy || "").trim(),
    temperaturePhotoCaptureMode,
    temperaturePhotoCapturedAt,
    temperaturePhotoUploadedAt: new Date().toLocaleString("pt-BR"),
  };
  let updatedRequest = null;

  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    updatedRequest = {
      ...request,
      ...photoData,
    };

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest?.scheduleId)
      ? {
          ...schedule,
          ...photoData,
        }
      : schedule
  ));

  tenantData.notifications = removeNotificationsForRequest(
    tenantData.notifications,
    updatedRequest.id,
    "TEMPERATURE_PHOTO"
  );
  const notification = createTemperaturePhotoNotification(updatedRequest);
  tenantData.notifications.push(notification);
  await queueFarmExternalNotification(data, targetTenantId, tenantData, notification, {
    dedupeKey: `temperature-photo:${updatedRequest.id}:${updatedRequest.temperaturePhotoCapturedAt || Date.now()}`,
  });

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.post("/api/vacitech/requests/:id/dose-request", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  if (isTenantArchived(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta excluida temporariamente.",
    });
  }
  const requestedAt = new Date().toLocaleString("pt-BR");
  const message = String(req.body.message || "O vacinador solicitou doses adicionais.").trim();
  let updatedRequest = null;
  let doseNotification = null;

  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    const doseRequest = {
      message,
      requestedAt,
      status: "SOLICITADO",
      vaccinatorName: request.vaccinatorName,
    };

    updatedRequest = {
      ...request,
      doseRequest,
    };

    doseNotification = createDoseRequestNotification(updatedRequest, doseRequest);
    tenantData.notifications.push(doseNotification);

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          doseRequest: updatedRequest.doseRequest,
        }
      : schedule
  ));
  await queueFarmExternalNotification(data, targetTenantId, tenantData, doseNotification, {
    dedupeKey: `dose-request:${updatedRequest.id}:${requestedAt}`,
  });

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.post("/api/vacitech/requests/:id/dose-request/confirm", async (req, res) => {
  const data = await readVacitechData();
  const targetTenantId = req.tenantId || findTenantIdByRequestId(data, req.params.id);

  if (!targetTenantId) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const tenantData = getTenantData(data, targetTenantId);
  if (isTenantArchived(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta excluida temporariamente.",
    });
  }

  const confirmedItems = normalizeVaccineUsages(req.body.items);

  if (confirmedItems.length === 0) {
    return res.status(400).json({
      message: "Informe as vacinas e doses confirmadas.",
    });
  }

  const confirmedAt = new Date().toLocaleString("pt-BR");
  let updatedRequest = null;

  tenantData.requests = tenantData.requests.map((request) => {
    if (String(request.id) !== String(req.params.id)) {
      return request;
    }

    const doseRequest = {
      ...(request.doseRequest || {}),
      status: "CONFIRMADO",
      confirmedAt,
      confirmedItems,
    };

    updatedRequest = {
      ...request,
      doseRequest,
    };

    return updatedRequest;
  });

  if (!updatedRequest) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          doseRequest: updatedRequest.doseRequest,
        }
      : schedule
  ));
  tenantData.notifications = removeNotificationsForRequest(
    tenantData.notifications,
    updatedRequest.id,
    "DOSE_REQUEST"
  );

  data.tenants[targetTenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
  });
});

app.post("/api/vacitech/stock-alerts", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const minimumStock = Number(req.body.minimumStock || 0);
  const currentStock = Number(req.body.currentStock || 0);

  if (!req.body.vaccineId || !minimumStock) {
    return res.status(400).json({
      message: "Informe vacina e quantidade minima para alerta de estoque baixo.",
    });
  }

  const notification = createLowStockNotification({
    ...req.body,
    minimumStock,
    currentStock,
  });

  tenantData.notifications.push(notification);
  await queueFarmExternalNotification(data, req.tenantId, tenantData, notification, {
    dedupeKey: req.body.alertId || `low-stock:${req.body.vaccineId}:${minimumStock}:${Date.now()}`,
  });

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    notification,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.post("/api/vacitech/vaccinator-login", async (req, res) => {
  const data = await readVacitechData();
  const match = findVaccinatorAcrossTenants(data, req.body);
  const vaccinator = match?.vaccinator;

  if (!vaccinator || vaccinator.status === "INATIVO") {
    return res.status(404).json({
      message: "Vacinador nao encontrado ou inativo",
    });
  }

  const subscription = getSubscriptionStatus(match.tenantData.subscription);

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
      subscription,
    });
  }

  res.json(getPublicVaccinatorPortalData(data, vaccinator));
});

app.get("/api/vacitech/vaccinator-portal/:id", async (req, res) => {
  const data = await readVacitechData();
  const match = findVaccinatorAcrossTenants(data, { id: req.params.id });
  const vaccinator = match?.vaccinator;

  if (!vaccinator) {
    return res.status(404).json({
      message: "Vacinador nao encontrado",
    });
  }

  const subscription = getSubscriptionStatus(match.tenantData.subscription);

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
      subscription,
    });
  }

  res.json(getPublicVaccinatorPortalData(data, vaccinator));
});

app.patch("/api/vacitech/vaccinator-portal/:id/notification-contact", async (req, res) => {
  const data = await readVacitechData();
  const match = findVaccinatorAcrossTenants(data, { id: req.params.id });
  const vaccinator = match?.vaccinator;

  if (!vaccinator) {
    return res.status(404).json({
      message: "Vacinador nao encontrado",
    });
  }

  const subscription = getSubscriptionStatus(match.tenantData.subscription);

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
      subscription,
    });
  }

  const notificationContact = String(req.body.notificationContact || "").trim();
  const updatedVaccinator = {
    ...vaccinator,
    notificationContact,
  };

  Object.entries(data.tenants || {}).forEach(([tenantId]) => {
    const tenantData = getTenantData(data, tenantId);

    if (isTenantArchived(tenantData)) {
      return;
    }

    let changed = false;
    tenantData.vaccinators = tenantData.vaccinators.map((item) => {
      if (
        String(item.id) === String(vaccinator.id) ||
        matchesVaccinator(item, vaccinator) ||
        matchesVaccinatorEmail(item, vaccinator)
      ) {
        changed = true;
        return {
          ...item,
          notificationContact,
        };
      }

      return item;
    });

    if (changed) {
      data.tenants[tenantId] = tenantData;
    }
  });

  await writeVacitechData(data);

  res.json(getPublicVaccinatorPortalData(data, updatedVaccinator));
});

app.delete("/api/vacitech/vaccinator-portal/:id/notifications", async (req, res) => {
  const data = await readVacitechData();
  const match = findVaccinatorAcrossTenants(data, { id: req.params.id });
  const vaccinator = match?.vaccinator;

  if (!vaccinator) {
    return res.status(404).json({
      message: "Vacinador nao encontrado",
    });
  }

  const subscription = getSubscriptionStatus(match.tenantData.subscription);

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
      subscription,
    });
  }

  Object.entries(data.tenants || {}).forEach(([tenantId]) => {
    const tenantData = getTenantData(data, tenantId);

    if (isTenantArchived(tenantData)) {
      return;
    }

    const matchedVaccinator = tenantData.vaccinators.find((item) => (
      matchesVaccinator(item, vaccinator)
    ));

    if (!matchedVaccinator) {
      return;
    }

    tenantData.notifications = tenantData.notifications.filter((notification) => (
      !matchesVaccinator(notification, matchedVaccinator)
    ));
    data.tenants[tenantId] = tenantData;
  });

  await writeVacitechData(data);

  res.json(getPublicVaccinatorPortalData(data, vaccinator));
});

/* =========================
   BIRDLOTS (AVES / LOTES)
========================= */

app.use("/birdlots", async (req, res, next) => {
  try {
    const data = await readVacitechData();
    const accountContext = getRequestAccount(req, data);

    if (!accountContext) {
      return res.status(401).json({
        message: "Entre na conta da granja para acessar os registros de aves.",
      });
    }

    const tenantData = getTenantData(data, accountContext.account.tenantId);
    const subscription = getSubscriptionStatus(tenantData.subscription);

    if (isTenantArchived(tenantData)) {
      return res.status(403).json({
        message: "Esta granja esta excluida temporariamente. Fale com o administrador do ImmuHen.",
      });
    }

    if (!subscription.active) {
      return res.status(402).json({
        message: "Assinatura vencida. Renove o acesso mensal para continuar usando.",
        subscription,
      });
    }

    req.account = accountContext.account;
    req.tenantId = accountContext.account.tenantId;
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/birdlots", async (req, res) => {
  const lots = await prisma.birdLot.findMany({
    where: { tenantId: req.tenantId },
    orderBy: { id: "desc" },
  });

  res.json(lots);
});

app.post("/birdlots", async (req, res) => {
  const lotData = normalizeBirdLotData(req.body);

  const newLot = await prisma.birdLot.create({
    data: {
      ...lotData,
      tenantId: req.tenantId,
      movimentacoes: normalizeLotMovements(
        req.body.movimentacoes,
        createInitialLotMovement(lotData)
      ),
    },
  });

  res.json({ lot: newLot });
});

app.put("/birdlots/close-all", async (req, res) => {
  await prisma.birdLot.updateMany({
    where: { tenantId: req.tenantId, status: "Ativo" },
    data: { status: "Finalizado" },
  });

  res.json({ success: true });
});

app.put("/birdlots/:id", async (req, res) => {
  const currentLot = await prisma.birdLot.findUnique({
    where: { id: Number(req.params.id) },
  });

  if (!currentLot || currentLot.tenantId !== req.tenantId) {
    return res.status(404).json({ message: "Registro nao encontrado" });
  }

  const lotData = normalizeBirdLotData(req.body);
  const previousRanch = String(currentLot.ranchoAtual || "Pinteiro");
  const nextRanch = String(lotData.ranchoAtual || previousRanch);
  const movements = normalizeLotMovements(currentLot.movimentacoes);

  if (previousRanch !== nextRanch) {
    movements.push({
      from: previousRanch,
      to: nextRanch,
      date: new Date().toISOString().split("T")[0],
      age: lotData.idadeAtual,
      reason: "Mudanca de rancho",
    });
  }

  const updatedLot = await prisma.birdLot.update({
    where: { id: Number(req.params.id) },
    data: {
      ...lotData,
      tenantId: req.tenantId,
      movimentacoes: movements,
    },
  });

  res.json({ lot: updatedLot });
});

app.delete("/birdlots", async (req, res) => {
  await prisma.birdLot.deleteMany({
    where: { tenantId: req.tenantId },
  });

  res.json({
    success: true,
    message: "Todos os registros foram removidos",
  });
});

app.delete("/birdlots/:id", async (req, res) => {
  await prisma.birdLot.deleteMany({
    where: {
      id: Number(req.params.id),
      tenantId: req.tenantId,
    },
  });

  res.json({
    success: true,
    message: "Registro removido",
  });
});

/* =========================
   PDFS
========================= */

app.get("/birdlots/monthly-report/pdf", async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  const ranchFilter = String(req.query.rancho || req.query.lote || "").trim().toLowerCase();
  const lots = await prisma.birdLot.findMany({
    where: { tenantId: req.tenantId },
    orderBy: [{ idadeAtual: "asc" }, { dataAlojamento: "asc" }],
  });
  const monthlyLots = getLotsByMonth(lots, month).filter((lot) => {
    if (!ranchFilter) {
      return true;
    }

    return String(lot.ranchoAtual || "").toLowerCase().includes(ranchFilter);
  });
  const groupedByAge = groupLotsByAge(monthlyLots);
  const totalAves = monthlyLots.reduce(
    (total, lot) => total + Number(lot.avesAlojadas || 0),
    0
  );

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=relatorio-aves-${month}.pdf`
  );
  doc.pipe(res);

  doc.fontSize(20).font("Helvetica-Bold").text("Relatorio mensal de aves", {
    align: "center",
  });
  doc.moveDown(0.5);
  doc.fontSize(12).font("Helvetica").text(`Mes: ${getMonthLabel(month)}`, {
    align: "center",
  });
  doc.moveDown();

  doc.fontSize(12).font("Helvetica-Bold").text("Resumo");
  doc.font("Helvetica");
  if (ranchFilter) {
    doc.text(`Filtro de rancho: ${req.query.rancho || req.query.lote}`);
  }
  doc.text(`Registros no mes: ${monthlyLots.length}`);
  doc.text(`Total de aves alojadas: ${totalAves}`);
  doc.moveDown();

  if (!monthlyLots.length) {
    doc.text("Nenhum registro encontrado para este mes.");
    doc.end();
    return;
  }

  Object.keys(groupedByAge)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((age) => {
      const ageLots = groupedByAge[age];
      const ageTotal = ageLots.reduce(
        (total, lot) => total + Number(lot.avesAlojadas || 0),
        0
      );

      if (doc.y > 660) {
        doc.addPage();
      }

      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .text(
          `Idade atual: ${age} dias - ${ageLots.length} registro(s) - ${ageTotal} aves`
        );
      drawMonthlyReportTable(doc, ageLots);
      doc.moveDown();
    });

  doc.end();
});

app.get("/birdlots/:id/pdf", async (req, res) => {
  const lot = await prisma.birdLot.findFirst({
    where: {
      id: Number(req.params.id),
      tenantId: req.tenantId,
    },
  });

  if (!lot) {
    return res.status(404).json({ message: "Registro nao encontrado" });
  }

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(20).text("RELATORIO AVICOLA", { align: "center" });
  doc.moveDown();

  doc.text(`Linhagem: ${lot.linhagem}`);
  doc.text(`Rancho atual: ${lot.ranchoAtual || "Pinteiro"}`);
  doc.text(`Aves: ${lot.avesAlojadas}`);
  doc.text(`Data alojamento: ${lot.dataAlojamento}`);
  doc.text(`Idade atual: ${lot.idadeAtual} dias`);
  if (lot.observacoes) {
    doc.text(`Observacoes: ${lot.observacoes}`);
  }

  doc.moveDown();

  const movements = normalizeLotMovements(lot.movimentacoes);
  if (movements.length) {
    doc.text("HISTORICO DE RANCHO:");
    movements.forEach((movement) => {
      doc.text(
        `${movement.date || "-"} - ${movement.from || "Entrada"} para ${movement.to || "-"} - ${movement.reason || "-"}`
      );
    });
    doc.moveDown();
  }

  doc.text("CALENDARIO VACINAL:");

  gerarCalendario(lot.dataAlojamento).forEach((v) => {
    doc.text(`Dia ${v.dia} - ${v.data} - ${v.vacina}`);
  });

  doc.end();
});

/* =========================
   HELPERS
========================= */

function normalizeBirdLotData(data) {
  const ranchoAtual = String(data.ranchoAtual || data.lote || "Pinteiro").trim() || "Pinteiro";

  return {
    lote: ranchoAtual,
    proprietario: "",
    cidade: data.cidade || "",
    linhagem: data.linhagem || "",
    avesAlojadas: Number(data.avesAlojadas || 0),
    dataAlojamento: data.dataAlojamento || "",
    idadeAtual: Number(data.idadeAtual || 0),
    ranchoAtual,
    observacoes: String(data.observacoes || "").trim(),
    status: data.status || "Ativo",
  };
}

function normalizeLotMovements(value, fallbackMovement = null) {
  const movements = Array.isArray(value)
    ? value
    : [];
  const normalizedMovements = movements
    .map((movement) => ({
      from: String(movement?.from || "").trim(),
      to: String(movement?.to || "").trim(),
      date: String(movement?.date || "").trim(),
      age: Number(movement?.age || 0),
      reason: String(movement?.reason || "").trim(),
    }))
    .filter((movement) => movement.to || movement.from);

  if (!normalizedMovements.length && fallbackMovement) {
    return [fallbackMovement];
  }

  return normalizedMovements;
}

function createInitialLotMovement(lotData) {
  return {
    from: "",
    to: lotData.ranchoAtual || "Pinteiro",
    date: lotData.dataAlojamento || new Date().toISOString().split("T")[0],
    age: Number(lotData.idadeAtual || 0),
    reason: "Entrada inicial das aves",
  };
}

function normalizeProfileRanches(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((ranch, index) => ({
      id: String(ranch?.id || `rancho-${index + 1}`),
      name: String(ranch?.name || "").trim(),
    }))
    .filter((ranch) => ranch.name);
}

function normalizeImportantContacts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((contact, index) => ({
      id: String(contact?.id || `contato-${index + 1}`),
      role: String(contact?.role || "").trim(),
      name: String(contact?.name || "").trim(),
      phone: String(contact?.phone || "").trim(),
    }))
    .filter((contact) => contact.role || contact.name || contact.phone);
}

function getCurrentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${now.getFullYear()}-${month}`;
}

function getMonthLabel(month) {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Number(year), Number(monthNumber) - 1, 1);

  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function getLotsByMonth(lots, month) {
  return lots.filter((lot) => lot.dataAlojamento?.startsWith(month));
}

function groupLotsByAge(lots) {
  return lots.reduce((groups, lot) => {
    const age = Number(lot.idadeAtual || 0);

    if (!groups[age]) {
      groups[age] = [];
    }

    groups[age].push(lot);

    return groups;
  }, {});
}

function drawMonthlyReportTable(doc, lots) {
  const tableTop = doc.y + 10;
  const columns = {
    idade: 50,
    rancho: 125,
    linhagem: 280,
    aves: 450,
  };

  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Idade", columns.idade, tableTop);
  doc.text("Rancho", columns.rancho, tableTop);
  doc.text("Linhagem", columns.linhagem, tableTop);
  doc.text("Aves", columns.aves, tableTop);
  doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).stroke();

  doc.font("Helvetica").fontSize(10);

  let y = tableTop + 26;

  lots.forEach((lot) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }

    doc.text(`${lot.idadeAtual} dias`, columns.idade, y);
    doc.text(lot.ranchoAtual || "Pinteiro", columns.rancho, y, {
      width: 130,
    });
    doc.text(lot.linhagem || "-", columns.linhagem, y, {
      width: 100,
    });
    doc.text(String(lot.avesAlojadas || 0), columns.aves, y);

    y += 24;
  });

  doc.y = y;
}

function gerarCalendario(dataAlojamento) {
  const base = new Date(dataAlojamento);

  const regras = [
    { dia: 1, vacina: "Vacinacao inicial" },
    { dia: 7, vacina: "Ma5 + Clone30" },
    { dia: 14, vacina: "Gumboro" },
    { dia: 21, vacina: "Respiratoria" },
    { dia: 28, vacina: "Reforco geral" },
  ];

  return regras.map((r) => {
    const data = new Date(base);
    data.setDate(data.getDate() + r.dia - 1);

    return {
      dia: r.dia,
      data: data.toISOString().split("T")[0],
      vacina: r.vacina,
      status: "Agendado",
    };
  });
}

function getEmptyTenantData() {
  return {
    farmProfile: {},
    vaccinators: [],
    schedules: [],
    requests: [],
    completedVaccinations: [],
    notifications: [],
    notificationOutbox: [],
    subscription: createInitialSubscription(),
    payments: [],
  };
}

function getEmptyVacitechData() {
  return {
    ...getEmptyTenantData(),
    accounts: [],
    tenants: {},
  };
}

async function readVacitechData() {
  if (shouldUseDatabaseState()) {
    return readVacitechDataFromDatabase();
  }

  return readVacitechDataFromFile();
}

async function readVacitechDataFromFile() {
  try {
    const content = await fs.readFile(vacitechDataFile, "utf8");
    const data = JSON.parse(content);
    const normalizedData = normalizeVacitechData(data);

    if (!data.accounts || !data.tenants || !data.subscription) {
      await writeVacitechDataToFile(normalizedData);
    }

    return normalizedData;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.log(error);
      return getEmptyVacitechData();
    }

    const initialData = getEmptyVacitechData();
    await writeVacitechDataToFile(initialData);
    return initialData;
  }
}

async function readVacitechDataFromDatabase() {
  const storedState = await prisma.appState.findUnique({
    where: { id: appStateId },
  });

  if (storedState?.data) {
    const normalizedData = normalizeVacitechData(storedState.data);

    if (!storedState.data.accounts || !storedState.data.tenants || !storedState.data.subscription) {
      await writeVacitechDataToDatabase(normalizedData);
    }

    return normalizedData;
  }

  const initialData = await readInitialDataForDatabase();
  await writeVacitechDataToDatabase(initialData);
  return initialData;
}

async function readInitialDataForDatabase() {
  try {
    const content = await fs.readFile(vacitechDataFile, "utf8");
    return normalizeVacitechData(JSON.parse(content));
  } catch (error) {
    return getEmptyVacitechData();
  }
}

async function writeVacitechData(data) {
  if (shouldUseDatabaseState()) {
    return writeVacitechDataToDatabase(data);
  }

  return writeVacitechDataToFile(data);
}

async function writeVacitechDataToFile(data) {
  await fs.mkdir(path.dirname(vacitechDataFile), { recursive: true });
  await fs.writeFile(
    vacitechDataFile,
    JSON.stringify(normalizeVacitechData(data), null, 2)
  );
}

async function writeVacitechDataToDatabase(data) {
  await prisma.appState.upsert({
    where: { id: appStateId },
    update: {
      data: normalizeVacitechData(data),
    },
    create: {
      id: appStateId,
      data: normalizeVacitechData(data),
    },
  });
}

function shouldUseDatabaseState() {
  return stateStorage === "database" || stateStorage === "db" || stateStorage === "postgres";
}

function normalizeVacitechData(data = {}) {
  const migratedData = migrateVacitechData(data);

  return {
    ...getEmptyVacitechData(),
    ...migratedData,
    accounts: Array.isArray(migratedData.accounts) ? migratedData.accounts : [],
    tenants: migratedData.tenants || {},
  };
}

function migrateVacitechData(data = {}) {
  if (Array.isArray(data.accounts) && data.tenants) {
    return data;
  }

  const tenantId = "tenant-default";
  const account = {
    id: "account-default",
    tenantId,
    name: "Administrador",
    email: adminUser.email,
    passwordHash: hashPassword(adminUser.password),
    role: "admin",
    createdAt: new Date().toISOString(),
  };

  return {
    ...data,
    accounts: [account],
    tenants: {
      [tenantId]: {
        ...getEmptyTenantData(),
        farmProfile: data.farmProfile || {},
        vaccinators: Array.isArray(data.vaccinators) ? data.vaccinators : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
        requests: Array.isArray(data.requests) ? data.requests : [],
        completedVaccinations: Array.isArray(data.completedVaccinations) ? data.completedVaccinations : [],
        notifications: Array.isArray(data.notifications) ? data.notifications : [],
        notificationOutbox: Array.isArray(data.notificationOutbox) ? data.notificationOutbox : [],
        subscription: data.subscription || createInitialSubscription(),
        payments: Array.isArray(data.payments) ? data.payments : [],
      },
    },
  };
}

function getDefaultTenantId(data) {
  return data.accounts[0]?.tenantId || Object.keys(data.tenants || {})[0] || "tenant-default";
}

function getDefaultTenantData(data) {
  return getTenantData(data, getDefaultTenantId(data));
}

function getTenantData(data, tenantId) {
  return {
    ...getEmptyTenantData(),
    ...(data.tenants?.[tenantId] || {}),
    farmProfile: data.tenants?.[tenantId]?.farmProfile || {},
    vaccinators: Array.isArray(data.tenants?.[tenantId]?.vaccinators)
      ? data.tenants[tenantId].vaccinators
      : [],
    schedules: Array.isArray(data.tenants?.[tenantId]?.schedules)
      ? data.tenants[tenantId].schedules
      : [],
    requests: Array.isArray(data.tenants?.[tenantId]?.requests)
      ? data.tenants[tenantId].requests
      : [],
    completedVaccinations: Array.isArray(data.tenants?.[tenantId]?.completedVaccinations)
      ? data.tenants[tenantId].completedVaccinations
      : [],
    notifications: Array.isArray(data.tenants?.[tenantId]?.notifications)
      ? data.tenants[tenantId].notifications
      : [],
    notificationOutbox: Array.isArray(data.tenants?.[tenantId]?.notificationOutbox)
      ? data.tenants[tenantId].notificationOutbox
      : [],
    subscription: data.tenants?.[tenantId]?.subscription || createInitialSubscription(),
    payments: Array.isArray(data.tenants?.[tenantId]?.payments)
      ? data.tenants[tenantId].payments
      : [],
  };
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function verifyPassword(password, passwordHash) {
  return (
    hashPassword(password) === passwordHash ||
    hashPasswordWithSecret(password, authSecret) === passwordHash ||
    hashPasswordWithSecret(password, "granja-system-dev-secret") === passwordHash
  );
}

function hashPasswordWithSecret(password, secret) {
  return crypto
    .createHash("sha256")
    .update(`${secret}:${password}`)
    .digest("hex");
}

function createAuthToken(account) {
  const payload = Buffer.from(JSON.stringify({
    accountId: account.id,
    tenantId: account.tenantId,
    email: account.email,
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", authSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function getRequestAccount(req, data) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", authSecret)
    .update(payload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const account = data.accounts.find((item) => (
      item.id === parsedPayload.accountId &&
      item.tenantId === parsedPayload.tenantId
    ));

    return account ? { account } : null;
  } catch (error) {
    return null;
  }
}

function getTenantIdByEmail(data, email) {
  return data.accounts.find((account) => (
    normalizeEmail(account.email) === normalizeEmail(email)
  ))?.tenantId;
}

function getAccountEmailByTenantId(data, tenantId) {
  return data.accounts.find((account) => (
    account.tenantId === tenantId
  ))?.email || "";
}

function isPublicVaccinatorRoute(req) {
  return (
    req.path === "/vaccinator-login" ||
    req.path.startsWith("/vaccinator-portal/") ||
    (req.method === "PATCH" && /^\/vaccinator-portal\/[^/]+\/notification-contact$/.test(req.path)) ||
    (req.method === "PATCH" && /^\/requests\/[^/]+\/status$/.test(req.path)) ||
    (req.method === "PATCH" && /^\/requests\/[^/]+\/temperature-photo$/.test(req.path)) ||
    (req.method === "POST" && /^\/requests\/[^/]+\/dose-request$/.test(req.path)) ||
    (req.method === "POST" && /^\/requests\/[^/]+\/postpone$/.test(req.path))
  );
}

function findTenantIdByRequestId(data, requestId) {
  return Object.entries(data.tenants || {}).find(([, tenantData]) => (
    (tenantData.requests || []).some((request) => String(request.id) === String(requestId))
  ))?.[0];
}

function findVaccinatorAcrossTenants(data, search) {
  let expiredMatch = null;

  for (const [tenantId, tenantData] of Object.entries(data.tenants || {})) {
    if (isTenantArchived(tenantData)) {
      continue;
    }

    const vaccinator = (tenantData.vaccinators || []).find((item) => (
      search.id
        ? String(item.id) === String(search.id)
        : sameContact(item, search)
    ));

    if (vaccinator) {
      const match = {
        tenantId,
        vaccinator,
        tenantData: getTenantData(data, tenantId),
      };

      if (getSubscriptionStatus(match.tenantData.subscription).active) {
        return match;
      }

      expiredMatch = expiredMatch || match;
    }
  }

  return expiredMatch;
}

function createInitialSubscription() {
  return {
    plan: "MENSAL",
    status: "ACTIVE",
    expiresAt: addMonths(new Date(), 1).toISOString(),
    renewedAt: new Date().toISOString(),
  };
}

function addMonths(date, months) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function getSubscriptionStatus(subscription = {}) {
  const expiresAt = subscription.expiresAt || createInitialSubscription().expiresAt;
  const expiresDate = new Date(expiresAt);
  const now = new Date();
  const paidAccessActive = subscription.status !== "EXPIRED" && expiresDate.getTime() > now.getTime();
  const active = !subscriptionEnforcement || paidAccessActive;
  const millisecondsRemaining = expiresDate.getTime() - now.getTime();

  return {
    plan: subscription.plan || "MENSAL",
    active,
    status: active ? "ACTIVE" : "EXPIRED",
    expiresAt,
    daysRemaining: active
      ? Math.max(0, Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24)))
      : 0,
    renewedAt: subscription.renewedAt || "",
    enforcement: subscriptionEnforcement ? "on" : "off",
  };
}

function renewSubscription(data, months, details = {}) {
  const currentStatus = getSubscriptionStatus(data.subscription);
  const baseDate = currentStatus.active
    ? new Date(currentStatus.expiresAt)
    : new Date();

  data.subscription = {
    plan: details.plan || currentStatus.plan || "MENSAL",
    status: "ACTIVE",
    expiresAt: addMonths(baseDate, months).toISOString(),
    renewedAt: new Date().toISOString(),
    lastPaymentProvider: details.source || data.subscription?.lastPaymentProvider || "",
    lastPaymentId: details.paymentId || data.subscription?.lastPaymentId || "",
  };

  return data.subscription;
}

function getStatusTimestamps(status, nowLabel, nowIso) {
  if (status === "CONFIRMADA" || status === "RECUSADA") {
    return {
      answeredAt: nowLabel,
      answeredAtIso: nowIso,
    };
  }

  if (status === "EM_ANDAMENTO") {
    return {
      startedAt: nowLabel,
      startedAtIso: nowIso,
    };
  }

  if (status === "CONCLUIDA") {
    return {
      completedAt: nowLabel,
      completedAtIso: nowIso,
    };
  }

  return {};
}

async function createMercadoPagoPreference(months, tenantId) {
  const paymentBaseUrl = apiPublicUrl
    ? `${apiPublicUrl}/api/payments/mercadopago/webhook`
    : undefined;
  const unitPrice = Number((subscriptionPrice * months).toFixed(2));
  const preferenceBody = {
    items: [
      {
        title: `ImmuHen - mensalidade (${months} mes${months > 1 ? "es" : ""})`,
        quantity: 1,
        currency_id: subscriptionCurrency,
        unit_price: unitPrice,
      },
    ],
    external_reference: `granja-system:${tenantId}:${Date.now()}`,
    metadata: {
      months,
      product: "granja-system",
      tenantId,
    },
    payment_methods: {
      excluded_payment_types: [],
      installments: 1,
    },
  };

  if (paymentBaseUrl) {
    preferenceBody.notification_url = paymentBaseUrl;
  }

  if (frontendPublicUrl) {
    preferenceBody.back_urls = {
      success: `${frontendPublicUrl}/home?payment=success`,
      failure: `${frontendPublicUrl}/home?payment=failure`,
      pending: `${frontendPublicUrl}/home?payment=pending`,
    };
    preferenceBody.auto_return = "approved";
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferenceBody),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel criar o pagamento no Mercado Pago.");
  }

  return data;
}

async function createMercadoPagoPixPayment(months, tenantId, payerEmail) {
  const paymentBaseUrl = apiPublicUrl
    ? `${apiPublicUrl}/api/payments/mercadopago/webhook`
    : undefined;
  const amount = Number((subscriptionPrice * months).toFixed(2));
  const paymentBody = {
    transaction_amount: amount,
    description: `ImmuHen - mensalidade (${months} mes${months > 1 ? "es" : ""})`,
    payment_method_id: "pix",
    payer: {
      email: payerEmail || `cliente-${tenantId}@vacitech.local`,
    },
    date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    external_reference: `granja-system:${tenantId}:${Date.now()}`,
    metadata: {
      months,
      product: "granja-system",
      tenantId,
    },
  };

  if (paymentBaseUrl) {
    paymentBody.notification_url = paymentBaseUrl;
  }

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(paymentBody),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel criar o Pix no Mercado Pago.");
  }

  return data;
}

function getTenantIdFromPayment(payment) {
  const metadataTenantId = payment.metadata?.tenant_id || payment.metadata?.tenantId;

  if (metadataTenantId) {
    return metadataTenantId;
  }

  const externalReference = String(payment.external_reference || "");
  const [, tenantId] = externalReference.split(":");

  return tenantId || "";
}

async function fetchMercadoPagoPayment(paymentId) {
  if (!mercadoPagoAccessToken) {
    throw new Error("MP_ACCESS_TOKEN nao configurado.");
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel validar o pagamento no Mercado Pago.");
  }

  return data;
}

function normalizeVaccinator(data = {}) {
  return {
    id: data.id || Date.now(),
    name: String(data.name || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    notificationContact: String(data.notificationContact || "").trim(),
    status: data.status || "ATIVO",
  };
}

function normalizeVaccineUsages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const flaskCc = String(item.flaskCc || item.ccPerFlask || item.flasks || item.frascos || "").trim();
      const dosePerBirdCc = String(item.dosePerBirdCc || item.ccPerBird || "").trim();
      const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);

      return {
        id: String(item.id || `vacina-${index + 1}`),
        vaccineId: String(item.vaccineId || "").trim(),
        vacina: String(item.vacina || item.name || "Vacina").trim(),
        codigo: String(item.codigo || "").trim(),
        doses: Number(item.doses || birdsPerFlask || 0),
        flaskCc,
        dosePerBirdCc,
        birdsPerFlask,
        flasks: flaskCc,
        applicationMethod: String(item.applicationMethod || item.via || "").trim(),
      };
    })
    .filter((item) => item.vaccineId && item.doses > 0);
}

function parseDecimalValue(value) {
  const parsed = Number(String(value || "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateBirdsPerFlask(flaskCc, dosePerBirdCc) {
  const flask = parseDecimalValue(flaskCc);
  const dose = parseDecimalValue(dosePerBirdCc);

  if (flask <= 0 || dose <= 0) {
    return 0;
  }

  return Math.floor(flask / dose);
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

function getLaborCost(record = {}) {
  return Number(record.programLaborCost ?? record.laborCost ?? 0) || 0;
}

function getVaccinationTotalDoses(request = {}) {
  return buildVaccinationMaterials(request).reduce((total, usage) => total + Number(usage.doses || 0), 0);
}

function getUsageTechnicalText(item) {
  const flaskCc = String(item.flaskCc || item.flasks || item.frascos || "").trim();
  const dosePerBirdCc = String(item.dosePerBirdCc || "").trim();
  const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);
  const parts = [];

  if (flaskCc) {
    parts.push(`${flaskCc} cc/frasco`);
  }

  if (dosePerBirdCc) {
    parts.push(`${dosePerBirdCc} cc/ave`);
  }

  if (birdsPerFlask > 0) {
    parts.push(`${formatQuantity(birdsPerFlask)} aves/frasco`);
  }

  return parts.join(" | ");
}

function normalizeReturnedVaccines(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => ({
      id: String(item.id || item.vaccineId || `devolucao-${index + 1}`),
      vaccineId: String(item.vaccineId || "").trim(),
      vacina: String(item.vacina || item.name || "Vacina").trim(),
      codigo: String(item.codigo || "").trim(),
      doses: Number(item.doses || 0),
    }))
    .filter((item) => item.vaccineId && item.doses > 0);
}

function buildVaccinationMaterials(request = {}) {
  const items = [
    ...(Array.isArray(request.vaccineUsages)
      ? request.vaccineUsages.map((item) => ({
          ...item,
          source: "Agendamento",
        }))
      : []),
    ...(Array.isArray(request.doseRequest?.confirmedItems)
      ? request.doseRequest.confirmedItems.map((item) => ({
          ...item,
          source: "Doses extras",
        }))
      : []),
  ];
  const grouped = new Map();

  items.forEach((item, index) => {
    const vaccineId = String(item.vaccineId || "").trim();
    const codigo = String(item.codigo || "").trim();
    const vacina = String(item.vacina || item.name || "Vacina").trim();
    const doses = Number(item.doses || 0);
    const flaskCc = String(item.flaskCc || item.flasks || item.frascos || "").trim();
    const dosePerBirdCc = String(item.dosePerBirdCc || "").trim();
    const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);
    const technicalText = getUsageTechnicalText({
      flaskCc,
      dosePerBirdCc,
      birdsPerFlask,
    });

    if (!vacina || doses <= 0) {
      return;
    }

    const key = vaccineId || codigo || vacina.toLowerCase() || `material-${index}`;
    const current = grouped.get(key) || {
      id: key,
      vaccineId,
      vacina,
      codigo,
      doses: 0,
      technicalDetails: [],
      sources: [],
    };

    current.doses += doses;

    if (technicalText && !current.technicalDetails.includes(technicalText)) {
      current.technicalDetails.push(technicalText);
    }

    if (item.source && !current.sources.includes(item.source)) {
      current.sources.push(item.source);
    }

    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    id: item.id,
    vaccineId: item.vaccineId,
    vacina: item.vacina,
    codigo: item.codigo,
    doses: item.doses,
    technicalDetails: item.technicalDetails.join(" | "),
    flasks: item.technicalDetails.join(" | "),
    source: item.sources.join(" + "),
  }));
}

function buildVaccinationCompletionSummary(request = {}, materials = buildVaccinationMaterials(request)) {
  const vaccinatorName = request.vaccinatorName || request.vaccinator || "Vacinador";
  const farmName = request.farmName || "Granja";
  const vaccinesText = materials.length > 0
    ? materials.map((item) => `${item.vacina || "Vacina"} (${item.doses || 0} dose(s)${item.technicalDetails || item.flasks ? `, ${item.technicalDetails || item.flasks}` : ""})`).join(", ")
    : "vacina nao informada";

  return `${vaccinatorName} efetuou ${vaccinesText} na granja ${farmName}.`;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

let smtpTransport = null;

function getSmtpTransport() {
  if (!smtpHost || !smtpUser || !smtpPass || !notificationFromEmail) {
    return null;
  }

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  return smtpTransport;
}

function resolveNotificationTargets(primaryContact, fallbackEmail = "") {
  const contact = String(primaryContact || "").trim();

  return {
    email: contact.includes("@")
      ? normalizeEmail(contact)
      : normalizeEmail(fallbackEmail),
  };
}

async function deliverOutboxItem(outboxItem) {
  outboxItem.attempts = Number(outboxItem.attempts || 0) + 1;

  try {
    if (outboxItem.channel === "EMAIL") {
      const transport = getSmtpTransport();

      if (!transport) {
        outboxItem.status = "PENDING_CONFIG";
        outboxItem.lastError = "Configure SMTP_HOST, SMTP_USER, SMTP_PASS e NOTIFICATION_FROM_EMAIL.";
        return outboxItem;
      }

      await transport.sendMail({
        from: notificationFromEmail,
        to: outboxItem.to,
        subject: outboxItem.subject,
        text: outboxItem.message,
      });
    } else {
      outboxItem.status = "FAILED";
      outboxItem.lastError = "Canal de notificacao nao suportado. Use EMAIL.";
      return outboxItem;
    }

    outboxItem.status = "SENT";
    outboxItem.sentAt = new Date().toISOString();
    outboxItem.lastError = "";
  } catch (error) {
    outboxItem.status = "FAILED";
    outboxItem.lastError = error.message;
  }

  return outboxItem;
}

async function queueExternalNotification(tenantData, item) {
  if (!item.to) {
    return null;
  }

  const alreadyQueued = tenantData.notificationOutbox.find((outboxItem) => (
    outboxItem.channel === item.channel &&
    outboxItem.to === item.to &&
    outboxItem.dedupeKey === item.dedupeKey
  ));

  if (alreadyQueued) {
    return alreadyQueued;
  }

  const outboxItem = {
    id: `outbox-${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    status: "QUEUED",
    attempts: 0,
    ...item,
  };

  tenantData.notificationOutbox = [
    outboxItem,
    ...tenantData.notificationOutbox,
  ].slice(0, 500);

  await deliverOutboxItem(outboxItem);
  return outboxItem;
}

async function queueVaccinatorExternalNotification(tenantData, notification, vaccinator, options = {}) {
  const subject = notification.title || "ImmuHen Vacinador";
  const message = `${subject}\n\n${notification.message || ""}\n\nGranja: ${notification.farmName || tenantData.farmProfile?.farmName || "-"}`;
  const dedupeKey = options.dedupeKey || `${notification.type}:${notification.requestId || notification.id}`;
  const targets = resolveNotificationTargets(
    vaccinator.notificationContact || notification.vaccinatorNotificationContact,
    vaccinator.email || notification.vaccinatorEmail
  );

  const emailItem = await queueExternalNotification(tenantData, {
    channel: "EMAIL",
    to: targets.email,
    subject,
    message,
    dedupeKey,
  });

  return [emailItem].filter(Boolean);
}

function getFarmNotificationContact(data, tenantId, tenantData) {
  const farmProfile = tenantData.farmProfile || {};
  const accountEmail = getAccountEmailByTenantId(data, tenantId);

  return resolveNotificationTargets(farmProfile.notificationContact, accountEmail);
}

async function queueFarmExternalNotification(data, tenantId, tenantData, notification, options = {}) {
  const contact = getFarmNotificationContact(data, tenantId, tenantData);
  const subject = notification.title || "Aviso ImmuHen";
  const message = `${subject}\n\n${notification.message || ""}\n\nGranja: ${tenantData.farmProfile?.farmName || "-"}`;
  const dedupeKey = options.dedupeKey || `${notification.type}:${notification.requestId || notification.id}`;

  const emailItem = await queueExternalNotification(tenantData, {
    channel: "EMAIL",
    to: normalizeEmail(contact.email),
    subject,
    message,
    dedupeKey,
  });

  return [emailItem].filter(Boolean);
}

function getDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isVaccinationOverdue(request, todayStart) {
  const status = normalizeRequestStatus(request.status);

  if (status === "CONCLUIDA" || status === "RECUSADA") {
    return false;
  }

  const dueDate = getDateOnly(request.vaccinationEndDate || request.date || request.vaccinationStartDate);

  return Boolean(dueDate && dueDate.getTime() < todayStart.getTime());
}

function createOverdueVaccinationNotification(request, alertDate) {
  return {
    id: Date.now() + Math.random(),
    type: "OVERDUE_VACCINATION",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacina atrasada",
    message: `A vacinacao com ${request.vaccinatorName || "vacinador"} esta atrasada desde ${request.vaccinationEndDate || request.date || "-"}.`,
    alertDate,
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

async function syncOverdueVaccinationAlerts(data, tenantId) {
  const tenantData = getTenantData(data, tenantId);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const alertDate = todayStart.toISOString().slice(0, 10);
  let changed = false;

  for (const request of tenantData.requests) {
    if (!isVaccinationOverdue(request, todayStart)) {
      continue;
    }

    const alreadyNotifiedToday = tenantData.notifications.some((notification) => (
      notification.type === "OVERDUE_VACCINATION" &&
      String(notification.requestId) === String(request.id) &&
      notification.alertDate === alertDate
    ));

    if (alreadyNotifiedToday) {
      continue;
    }

    const notification = createOverdueVaccinationNotification(request, alertDate);
    tenantData.notifications.push(notification);
    await queueFarmExternalNotification(data, tenantId, tenantData, notification, {
      dedupeKey: `overdue:${request.id}:${alertDate}`,
    });
    changed = true;
  }

  if (changed) {
    data.tenants[tenantId] = tenantData;
    await writeVacitechData(data);
  }

  return tenantData;
}

function sameContact(first, second) {
  return (
    normalizeEmail(first.email || first.vaccinatorEmail) === normalizeEmail(second.email || second.vaccinatorEmail) &&
    normalizePhone(first.phone || first.vaccinatorPhone) === normalizePhone(second.phone || second.vaccinatorPhone)
  );
}

function matchesVaccinator(item, vaccinator) {
  if (!item || !vaccinator) {
    return false;
  }

  if (
    item.vaccinatorId &&
    vaccinator.id &&
    String(item.vaccinatorId) === String(vaccinator.id)
  ) {
    return true;
  }

  return sameContact(item, vaccinator);
}

function normalizeRequestStatus(status) {
  if (status === "CONFIRMADO") {
    return "CONFIRMADA";
  }

  if (status === "RECUSADO") {
    return "RECUSADA";
  }

  if (
    status === "CONFIRMADA" ||
    status === "RECUSADA" ||
    status === "EM_ANDAMENTO" ||
    status === "CONCLUIDA"
  ) {
    return status;
  }

  return "PENDENTE";
}

function isTenantArchived(tenantData) {
  return Boolean(tenantData?.archivedAt);
}

function shouldShowInVaccinatorApp(request) {
  const status = normalizeRequestStatus(request.status);

  return status !== "CONCLUIDA" && status !== "RECUSADA";
}

function matchesVaccinatorEmail(item, vaccinator) {
  const itemEmail = normalizeEmail(item.email || item.vaccinatorEmail);
  const vaccinatorEmail = normalizeEmail(vaccinator.email || vaccinator.vaccinatorEmail);

  return Boolean(itemEmail && vaccinatorEmail && itemEmail === vaccinatorEmail);
}

function matchesVaccinatorReport(item, vaccinator) {
  return matchesVaccinator(item, vaccinator) || matchesVaccinatorEmail(item, vaccinator);
}

function getCompletionDate(record) {
  const isoValue = record.systemConfirmedAtIso || record.completedAtIso || record.archivedAtIso || "";

  if (isoValue) {
    const date = new Date(isoValue);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

function buildVaccinatorMonthlyReports(records = []) {
  const grouped = new Map();

  records.forEach((record) => {
    const date = getCompletionDate(record);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const group = grouped.get(monthKey) || {
      month: monthKey,
      label: date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      total: 0,
      farms: {},
      records: [],
    };

    group.total += 1;
    group.farms[record.farmName || "Granja"] = (group.farms[record.farmName || "Granja"] || 0) + 1;
    group.records.push(record);
    grouped.set(monthKey, group);
  });

  return Array.from(grouped.values())
    .sort((first, second) => second.month.localeCompare(first.month))
    .map((group) => ({
      month: group.month,
      label: group.label,
      total: group.total,
      farms: Object.entries(group.farms).map(([farmName, total]) => ({ farmName, total })),
      records: group.records
        .sort((first, second) => getCompletionDate(second).getTime() - getCompletionDate(first).getTime())
        .slice(0, 12),
    }));
}

function removeNotificationsForRequest(notifications = [], requestId, type) {
  return notifications.filter((notification) => !(
    String(notification.requestId || "") === String(requestId) &&
    (!type || notification.type === type)
  ));
}

function writePdfField(doc, label, value) {
  doc
    .font("Helvetica-Bold")
    .fillColor("#14532d")
    .text(label, { continued: true })
    .font("Helvetica")
    .fillColor("#18181b")
    .text(` ${value || "-"}`);
}

function addPdfDataImage(doc, dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);

  if (!match) {
    return false;
  }

  try {
    const imageBuffer = Buffer.from(match[1], "base64");
    doc.image(imageBuffer, {
      fit: [240, 180],
      align: "left",
    });
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

function sendVaccinationCompletionPdf(res, request) {
  const filename = `comprovante-vacinacao-${String(request.id || Date.now()).replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  const doc = new PDFDocument({ margin: 48 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);

  doc
    .fillColor("#14532d")
    .fontSize(22)
    .font("Helvetica-Bold")
    .text("Comprovante de Vacinacao Concluida");

  doc
    .moveDown(0.5)
    .fillColor("#52525b")
    .fontSize(11)
    .font("Helvetica")
    .text("Documento gerado pelo ImmuHen apos confirmacao da granja.");

  doc.moveDown();
  writePdfField(doc, "Granja:", request.farmName || "Granja");
  writePdfField(doc, "Cidade:", request.farmCity);
  writePdfField(doc, "Documento:", request.farmDocument);
  writePdfField(doc, "Proprietario:", request.farmOwner);
  writePdfField(doc, "Vacinador:", request.vaccinatorName || "Vacinador");
  writePdfField(doc, "Email do vacinador:", request.vaccinatorEmail);
  writePdfField(doc, "Telefone do vacinador:", request.vaccinatorPhone);

  doc.moveDown();
  writePdfField(doc, "Periodo da vacinacao:", `${request.vaccinationStartDate || request.date || "-"} ate ${request.vaccinationEndDate || request.date || "-"}`);
  writePdfField(doc, "Debicagem:", request.hasDebicagem === "SIM" ? "Sim" : "Nao");
  writePdfField(doc, "Doses usadas:", formatQuantity(getVaccinationTotalDoses(request)) || "0");
  writePdfField(doc, "Mao de obra:", formatCurrency(getLaborCost(request)));
  writePdfField(doc, "Concluida pelo vacinador em:", request.completedAt);
  writePdfField(doc, "Confirmada pela granja em:", request.systemConfirmedAt);
  writePdfField(doc, "Execucao:", request.completionTiming || "PONTUAL");

  const materialsUsed = Array.isArray(request.materialsUsed) && request.materialsUsed.length > 0
    ? request.materialsUsed
    : buildVaccinationMaterials(request);

  if (materialsUsed.length > 0) {
    doc.moveDown();
    doc.font("Helvetica-Bold").fillColor("#14532d").text("Materiais utilizados");
    materialsUsed.forEach((usage) => {
      const technicalText = usage.technicalDetails || getUsageTechnicalText(usage);
      const technical = technicalText ? ` - ${technicalText}` : "";
      doc.font("Helvetica").fillColor("#18181b").text(`${usage.vacina || "Vacina"} - ${usage.doses || 0} dose(s)${technical}`);
    });
  }

  if (Array.isArray(request.returnedVaccines) && request.returnedVaccines.length > 0) {
    doc.moveDown();
    doc.font("Helvetica-Bold").fillColor("#14532d").text("Devolucao de vacinas");
    request.returnedVaccines.forEach((usage) => {
      doc.font("Helvetica").fillColor("#18181b").text(`${usage.vacina || "Vacina"} - ${usage.doses || 0} dose(s) devolvida(s)`);
    });
  }

  if (request.observations) {
    doc.moveDown();
    doc.font("Helvetica-Bold").fillColor("#14532d").text("Observacoes");
    doc.font("Helvetica").fillColor("#18181b").text(request.observations);
  }

  if (request.temperaturePhoto || request.temperatureNotes) {
    doc.moveDown();
    doc.font("Helvetica-Bold").fillColor("#14532d").text("Temperatura da vacina");
    if (request.temperatureNotes) {
      doc.font("Helvetica").fillColor("#18181b").text(request.temperatureNotes);
    }
    if (request.temperaturePhoto) {
      doc.moveDown(0.5);
      if (!addPdfDataImage(doc, request.temperaturePhoto)) {
        doc.font("Helvetica").fillColor("#52525b").text("Foto anexada no sistema.");
      }
    }
  }

  doc.moveDown(1.5);
  doc
    .fontSize(9)
    .fillColor("#71717a")
    .text(`ID da solicitacao: ${request.id || "-"} | Gerado em ${new Date().toLocaleString("pt-BR")}`);

  doc.end();
}

function createFarmLinkNotification(vaccinator, farmProfile) {
  return {
    id: Date.now() + Math.random(),
    type: "FARM_LINKED",
    vaccinatorId: vaccinator.id,
    vaccinatorName: vaccinator.name,
    vaccinatorEmail: vaccinator.email,
    vaccinatorPhone: vaccinator.phone,
    vaccinatorNotificationContact: vaccinator.notificationContact,
    farmName: farmProfile.farmName || "Granja",
    farmCity: farmProfile.city || "",
    farmDocument: farmProfile.document || "",
    farmOwner: farmProfile.owner || "",
    farmAddress: farmProfile.address || "",
    farmLocation: farmProfile.location || "",
    title: `${farmProfile.farmName || "Uma granja"} te adicionou no ImmuHen`,
    message: "Voce foi vinculado como vacinador desta granja.",
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createScheduleNotification(request) {
  return {
    id: Date.now() + Math.random(),
    type: "SCHEDULE_REQUEST",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    farmCity: request.farmCity,
    farmDocument: request.farmDocument,
    farmOwner: request.farmOwner,
    farmAddress: request.farmAddress || "",
    farmLocation: request.farmLocation || "",
    vaccineUsages: request.vaccineUsages || [],
    applicationMethod: request.applicationMethod || "",
    programId: request.programId || "",
    programDay: request.programDay || "",
    programSuggestedName: request.programSuggestedName || "",
    programStartDate: request.programStartDate || "",
    programEndDate: request.programEndDate || "",
    productionEndDate: request.productionEndDate || "",
    birdLotId: request.birdLotId || "",
    birdLotName: request.birdLotName || "",
    observations: request.observations || "",
    title: "Pedido de vacinacao",
    message: `${request.farmName} enviou uma solicitacao de vacinacao${request.programDay ? ` do dia ${request.programDay}` : ""}.`,
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createDoseRequestNotification(request, doseRequest) {
  return {
    id: Date.now() + Math.random(),
    type: "DOSE_REQUEST",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Solicitacao de doses",
    message: `${request.vaccinatorName || "Vacinador"} solicitou doses: ${doseRequest.message}`,
    createdAt: doseRequest.requestedAt,
    read: false,
  };
}

function createLowStockNotification(alert) {
  const vaccineName = String(alert.vaccineName || alert.vacina || "Vacina").trim();
  const currentStock = Number(alert.currentStock || 0);
  const minimumStock = Number(alert.minimumStock || 0);

  return {
    id: alert.alertId || Date.now() + Math.random(),
    type: "LOW_STOCK",
    vaccineId: alert.vaccineId || "",
    vaccineName,
    currentStock,
    minimumStock,
    source: alert.source || "ESTOQUE",
    title: "Estoque baixo",
    message: `${vaccineName} esta com ${currentStock} dose(s) em estoque. Limite configurado: ${minimumStock} dose(s).`,
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createTemperaturePhotoNotification(request) {
  const source = request.temperaturePhotoSource === "GRANJA"
    ? (request.temperaturePhotoBy || request.farmName || "Granja")
    : (request.vaccinatorName || "Vacinador");

  return {
    id: Date.now() + Math.random(),
    type: "TEMPERATURE_PHOTO",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Foto da temperatura enviada",
    message: `${source} enviou a foto da temperatura da vacina.`,
    createdAt: request.temperaturePhotoUploadedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccinationCompletedNotification(request) {
  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_COMPLETED",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacinacao concluida",
    message: `${request.vaccinatorName || "Vacinador"} marcou a vacinacao como concluida.`,
    createdAt: request.completedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccineChangedNotification(request) {
  const vaccineNames = (request.vaccineUsages || [])
    .map((usage) => `${usage.vacina || "Vacina"} (${usage.doses || 0} dose(s))`)
    .join(", ");

  return {
    id: Date.now() + Math.random(),
    type: "VACCINE_CHANGED",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacina alterada",
    message: `A granja alterou a vacina do programa${request.programDay ? ` do dia ${request.programDay}` : ""}: ${vaccineNames || "verifique o programa"}.`,
    createdAt: request.vaccineChangedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccinationPostponedNotification(request) {
  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_POSTPONED",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacinacao adiada",
    message: `${request.vaccinatorName || "Vacinador"} adiou a vacinacao para ${request.vaccinationStartDate || "-"} ate ${request.vaccinationEndDate || "-"}.${request.postponement?.reason ? ` Motivo: ${request.postponement.reason}` : ""}`,
    createdAt: request.postponedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function getVaccinatorPortalData(data, vaccinator) {
  const linkedFarms = data.farmProfile?.farmName
    ? [{
        farmName: data.farmProfile.farmName,
        city: data.farmProfile.city || "",
        document: data.farmProfile.document || "",
        owner: data.farmProfile.owner || "",
        address: data.farmProfile.address || "",
        location: data.farmProfile.location || "",
      }]
    : [];

  return {
    vaccinator,
    farmProfile: data.farmProfile,
    linkedFarms,
    notifications: data.notifications.filter((notification) => (
      matchesVaccinator(notification, vaccinator)
    )),
    requests: data.requests.filter((request) => (
      matchesVaccinator(request, vaccinator) && shouldShowInVaccinatorApp(request)
    )),
    completedVaccinations: (data.completedVaccinations || [])
      .filter((request) => matchesVaccinatorReport(request, vaccinator)),
    monthlyReports: buildVaccinatorMonthlyReports((data.completedVaccinations || [])
      .filter((request) => matchesVaccinatorReport(request, vaccinator))),
  };
}

function getPublicVaccinatorPortalData(data, vaccinator) {
  const linkedFarms = [];
  const notifications = [];
  const requests = [];
  const completedVaccinationMap = new Map();

  Object.entries(data.tenants || {}).forEach(([tenantId, rawTenantData]) => {
    const tenantData = getTenantData(data, tenantId);
    if (isTenantArchived(tenantData)) {
      return;
    }

    const matchedVaccinator = tenantData.vaccinators.find((item) => (
      matchesVaccinator(item, vaccinator) || matchesVaccinatorEmail(item, vaccinator)
    ));

    if (!matchedVaccinator) {
      return;
    }

    if (tenantData.farmProfile?.farmName) {
      linkedFarms.push({
        farmName: tenantData.farmProfile.farmName,
        city: tenantData.farmProfile.city || "",
        document: tenantData.farmProfile.document || "",
        owner: tenantData.farmProfile.owner || "",
        address: tenantData.farmProfile.address || "",
        location: tenantData.farmProfile.location || "",
      });
    }

    notifications.push(
      ...tenantData.notifications.filter((notification) => (
        matchesVaccinator(notification, matchedVaccinator)
      ))
    );
    requests.push(
      ...tenantData.requests.filter((request) => (
        matchesVaccinator(request, matchedVaccinator) && shouldShowInVaccinatorApp(request)
      ))
    );

    tenantData.completedVaccinations
      .filter((record) => matchesVaccinatorReport(record, matchedVaccinator))
      .forEach((record) => {
        const key = String(record.id || `${record.farmName}-${record.completedAt}-${record.systemConfirmedAt}`);

        if (!completedVaccinationMap.has(key)) {
          completedVaccinationMap.set(key, {
            ...record,
            tenantId,
            farmName: record.farmName || tenantData.farmProfile?.farmName || "Granja",
          });
        }
      });
  });

  const completedVaccinations = Array.from(completedVaccinationMap.values())
    .sort((first, second) => getCompletionDate(second).getTime() - getCompletionDate(first).getTime());

  return {
    vaccinator,
    linkedFarms,
    notifications,
    requests,
    completedVaccinations,
    monthlyReports: buildVaccinatorMonthlyReports(completedVaccinations),
  };
}

function createOwnerToken() {
  const payload = Buffer.from(JSON.stringify({
    role: "owner",
    createdAt: Date.now(),
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ownerAdminKey || authSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyOwnerToken(token) {
  if (!ownerAdminKey || !token || !token.includes(".")) {
    return false;
  }

  const [payload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", ownerAdminKey)
    .update(payload)
    .digest("base64url");

  return signature === expectedSignature;
}

function requireOwnerAccess(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!verifyOwnerToken(token)) {
    return res.status(401).json({
      message: "Acesso do dono nao autorizado.",
    });
  }

  return next();
}

function sanitizeAccount(account) {
  return {
    id: account.id,
    tenantId: account.tenantId,
    name: account.name,
    email: account.email,
    role: account.role,
    createdAt: account.createdAt,
    passwordResetAt: account.passwordResetAt || "",
  };
}

function getOwnerOverview(data) {
  const tenants = Object.entries(data.tenants || {}).map(([tenantId, rawTenantData]) => {
    const tenantData = getTenantData(data, tenantId);
    const accounts = data.accounts
      .filter((account) => account.tenantId === tenantId)
      .map(sanitizeAccount);

    return {
      tenantId,
      farmProfile: tenantData.farmProfile,
      subscription: getSubscriptionStatus(tenantData.subscription),
      archivedAt: tenantData.archivedAt || "",
      archivedReason: tenantData.archivedReason || "",
      accounts,
      vaccinators: tenantData.vaccinators,
      requests: tenantData.requests,
      notifications: tenantData.notifications,
      payments: tenantData.payments,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      tenants: tenants.length,
      accounts: data.accounts.length,
      vaccinators: tenants.reduce((total, tenant) => total + tenant.vaccinators.length, 0),
      requests: tenants.reduce((total, tenant) => total + tenant.requests.length, 0),
      expired: tenants.filter((tenant) => !tenant.subscription.active && !tenant.archivedAt).length,
      archived: tenants.filter((tenant) => tenant.archivedAt).length,
    },
    tenants,
  };
}

function getOwnerAdminHtml() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ImmuHen Admin</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #eefdf3;
        color: #18181b;
        font-family: Inter, Arial, sans-serif;
      }
      main {
        margin: 0 auto;
        max-width: 1320px;
        padding: 24px;
      }
      .hero {
        align-items: center;
        background: linear-gradient(135deg, #14532d, #16a34a);
        border-radius: 24px;
        box-shadow: 0 22px 60px rgba(20, 83, 45, 0.22);
        color: #fff;
        display: flex;
        gap: 24px;
        justify-content: space-between;
        padding: 28px;
      }
      .eyebrow {
        color: #bbf7d0;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        margin: 0 0 8px;
        text-transform: uppercase;
      }
      h1 {
        font-size: clamp(32px, 5vw, 56px);
        line-height: 1;
        margin: 0;
      }
      h2, h3 {
        margin: 0;
      }
      p {
        line-height: 1.5;
      }
      .muted {
        color: #52525b;
      }
      .hero .muted {
        color: #dcfce7;
        margin: 12px 0 0;
      }
      .login-card, .panel, .stat-card, .tenant-card {
        background: #fff;
        border: 1px solid #bbf7d0;
        border-radius: 18px;
        box-shadow: 0 14px 34px rgba(20, 83, 45, 0.08);
      }
      .login-card {
        display: grid;
        gap: 12px;
        margin-top: 18px;
        max-width: 460px;
        padding: 20px;
      }
      input, select, button {
        border-radius: 12px;
        font: inherit;
        padding: 12px 14px;
      }
      input, select {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #18181b;
        outline: none;
        width: 100%;
      }
      input:focus, select:focus {
        background: #fff;
        border-color: #16a34a;
      }
      button {
        border: 0;
        background: #16a34a;
        color: #fff;
        cursor: pointer;
        font-weight: 800;
      }
      button.dark {
        background: #18181b;
      }
      button.red {
        background: #dc2626;
      }
      button.ghost {
        background: #dcfce7;
        color: #15803d;
      }
      .top-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .stats {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        margin-top: 20px;
      }
      .stat-card {
        padding: 18px;
      }
      .stat-card span {
        color: #15803d;
        display: block;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .stat-card strong {
        display: block;
        font-size: 38px;
        line-height: 1;
        margin-top: 12px;
      }
      .toolbar {
        align-items: end;
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(260px, 1fr) 220px 160px;
        margin-top: 18px;
      }
      .panel {
        padding: 18px;
      }
      .tenant-list {
        display: grid;
        gap: 18px;
        margin-top: 18px;
      }
      .tenant-card {
        overflow: hidden;
      }
      .tenant-head {
        align-items: flex-start;
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr auto;
        padding: 20px;
      }
      .tenant-title {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .tenant-title h2 {
        font-size: 26px;
      }
      .tenant-meta {
        color: #52525b;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 8px 0 0;
      }
      .pill {
        border: 1px solid;
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px;
        font-weight: 900;
        padding: 7px 10px;
        white-space: nowrap;
      }
      .active {
        background: #dcfce7;
        border-color: #bbf7d0;
        color: #15803d;
      }
      .expired {
        background: #fee2e2;
        border-color: #fecaca;
        color: #b91c1c;
      }
      .pending {
        background: #fef9c3;
        border-color: #fde68a;
        color: #a16207;
      }
      .archived {
        background: #f4f4f5;
        border-color: #d4d4d8;
        color: #3f3f46;
      }
      .info-grid {
        border-top: 1px solid #dcfce7;
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding: 16px 20px 20px;
      }
      .mini-card {
        background: #f0fdf4;
        border: 1px solid #dcfce7;
        border-radius: 14px;
        padding: 14px;
      }
      .mini-card span {
        color: #15803d;
        display: block;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.07em;
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .mini-card strong {
        font-size: 24px;
      }
      .sections {
        border-top: 1px solid #dcfce7;
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding: 20px;
      }
      .section-box {
        background: #fff;
        border: 1px solid #e4e4e7;
        border-radius: 14px;
        padding: 14px;
      }
      .row {
        border-top: 1px solid #f4f4f5;
        display: grid;
        gap: 6px;
        padding: 10px 0;
      }
      .row:first-of-type {
        border-top: 0;
      }
      .row-title {
        color: #18181b;
        font-weight: 800;
        overflow-wrap: anywhere;
      }
      .row-sub {
        color: #52525b;
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .row-actions button {
        padding: 10px 12px;
      }
      details {
        border-top: 1px solid #dcfce7;
        padding: 0 20px 20px;
      }
      summary {
        cursor: pointer;
        font-weight: 800;
        padding: 14px 0;
      }
      pre {
        background: #052e16;
        border-radius: 12px;
        color: #dcfce7;
        overflow: auto;
        padding: 14px;
      }
      .empty {
        border: 1px dashed #bbf7d0;
        border-radius: 14px;
        color: #52525b;
        padding: 18px;
        text-align: center;
      }
      .hidden {
        display: none !important;
      }
      @media (max-width: 980px) {
        .hero, .tenant-head {
          grid-template-columns: 1fr;
        }
        .hero {
          align-items: flex-start;
          flex-direction: column;
        }
        .stats, .info-grid, .sections, .toolbar {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <p class="eyebrow">ImmuHen Admin</p>
          <h1>Painel Administrativo</h1>
          <p class="muted">Gerencie granjas, contas, vacinadores, mensalidades e solicitacoes em um painel unico.</p>
        </div>
        <div class="top-actions">
          <button id="refreshButton" class="ghost" type="button">Atualizar</button>
          <button id="logoutButton" class="dark" type="button">Sair</button>
        </div>
      </section>

      <section id="login" class="login-card">
        <h2>Acesso ImmuHen</h2>
        <p class="muted">Use a senha configurada em OWNER_ADMIN_KEY. Senhas de clientes nao aparecem aqui; use redefinicao quando precisar.</p>
        <input id="password" type="password" placeholder="Senha OWNER_ADMIN_KEY" />
        <button id="loginButton" type="button">Entrar</button>
      </section>

      <div id="content"></div>
    </main>
    <script>
      const ownerStorage = (() => {
        try {
          if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        } catch (error) {}

        let fallbackToken = "";
        return {
          getItem(key) {
            return key === "ownerToken" ? fallbackToken : null;
          },
          setItem(key, value) {
            if (key === "ownerToken") fallbackToken = String(value || "");
          },
          removeItem(key) {
            if (key === "ownerToken") fallbackToken = "";
          }
        };
      })();
      let token = ownerStorage.getItem("ownerToken") || "";
      let currentData = null;
      let searchTerm = "";
      let statusFilter = "TODAS";
      const content = document.getElementById("content");
      const loginBox = document.getElementById("login");

      function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, function(character) {
          return ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
          })[character];
        });
      }

      function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return escapeHtml(value);
        return date.toLocaleString("pt-BR");
      }

      function statusLabel(status) {
        return status || "PENDENTE";
      }

      async function login() {
        const password = document.getElementById("password").value;
        const response = await fetch("/api/owner/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (!response.ok) { alert(data.message || "Erro ao entrar"); return; }
        token = data.token;
        ownerStorage.setItem("ownerToken", token);
        load();
      }

      function logout() {
        ownerStorage.removeItem("ownerToken");
        token = "";
        currentData = null;
        loginBox.classList.remove("hidden");
        content.innerHTML = "";
      }

      async function ownerFetch(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            ...(options.headers || {})
          }
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.message || "Erro"); }
        return data;
      }

      async function load() {
        if (!token) return;
        try {
          const data = await ownerFetch("/api/owner/overview");
          currentData = data;
          loginBox.classList.add("hidden");
          render();
        } catch (error) {
          loginBox.classList.remove("hidden");
          content.innerHTML = '<section class="panel"><p class="muted">' + escapeHtml(error.message) + '</p></section>';
        }
      }

      async function renew(tenantId) {
        await ownerFetch("/api/owner/tenants/" + tenantId + "/renew", {
          method: "POST",
          body: JSON.stringify({ months: 1 })
        });
        load();
      }

      async function expire(tenantId) {
        if (!confirm("Bloquear esta granja agora?")) return;
        await ownerFetch("/api/owner/tenants/" + tenantId + "/expire", { method: "POST" });
        load();
      }

      async function archiveTenant(tenantId) {
        const tenant = (currentData?.tenants || []).find(function(item) { return item.tenantId === tenantId; });
        const farmName = tenant?.farmProfile?.farmName || tenantId;
        if (!confirm("Excluir temporariamente a granja " + farmName + "?\\n\\nEla fica bloqueada, mas voce pode restaurar depois.")) return;

        await ownerFetch("/api/owner/tenants/" + tenantId + "/archive", {
          method: "POST",
          body: JSON.stringify({ reason: "Excluida temporariamente pelo admin." })
        });
        load();
      }

      async function restoreTenant(tenantId) {
        if (!confirm("Restaurar esta granja?")) return;
        await ownerFetch("/api/owner/tenants/" + tenantId + "/restore", { method: "POST" });
        load();
      }

      async function deleteTenant(tenantId) {
        const tenant = (currentData?.tenants || []).find(function(item) { return item.tenantId === tenantId; });
        const farmName = tenant?.farmProfile?.farmName || tenantId;
        const expected = "EXCLUIR " + farmName;
        const typed = prompt(
          "Exclusao permanente da granja " + farmName + ".\\n\\n" +
          "Isso apaga contas, vacinadores, solicitacoes, notificacoes e pagamentos dessa granja.\\n" +
          "Digite exatamente: " + expected
        );
        if (typed !== expected) return;

        await ownerFetch("/api/owner/tenants/" + tenantId, { method: "DELETE" });
        load();
      }

      async function resetPassword(accountId) {
        const password = prompt("Nova senha com pelo menos 6 caracteres:");
        if (!password) return;
        await ownerFetch("/api/owner/accounts/" + accountId + "/reset-password", {
          method: "POST",
          body: JSON.stringify({ password })
        });
        alert("Senha redefinida.");
      }

      async function deleteAccount(accountId) {
        const account = (currentData?.tenants || [])
          .flatMap(function(tenant) { return tenant.accounts || []; })
          .find(function(item) { return item.id === accountId; });
        const accountEmail = account?.email || "este usuario";
        const message = "Excluir o usuario " + accountEmail + "?\\n\\nIsso remove apenas o acesso dessa conta. Os dados da granja continuam no sistema.";
        if (!confirm(message)) return;

        await ownerFetch("/api/owner/accounts/" + accountId, { method: "DELETE" });
        load();
      }

      function setSearch(value) {
        searchTerm = value.toLowerCase();
        render();
      }

      function setStatus(value) {
        statusFilter = value;
        render();
      }

      function getFilteredTenants() {
        if (!currentData) return [];
        return currentData.tenants.filter(function(tenant) {
          const farm = tenant.farmProfile || {};
          const haystack = [
            tenant.tenantId,
            farm.farmName,
            farm.city,
            farm.document,
            farm.owner,
            tenant.accounts.map(function(account) { return account.email; }).join(" "),
            tenant.vaccinators.map(function(vaccinator) { return vaccinator.name + " " + vaccinator.email; }).join(" ")
          ].join(" ").toLowerCase();
          const matchesSearch = !searchTerm || haystack.includes(searchTerm);
          const isArchived = Boolean(tenant.archivedAt);
          const isActive = tenant.subscription && tenant.subscription.active && !isArchived;
          const matchesStatus =
            statusFilter === "TODAS" ||
            (statusFilter === "ATIVAS" && isActive) ||
            (statusFilter === "VENCIDAS" && !isActive && !isArchived) ||
            (statusFilter === "ARQUIVADAS" && isArchived);
          return matchesSearch && matchesStatus;
        });
      }

      function render() {
        if (!currentData) return;
        const tenants = getFilteredTenants();
        content.innerHTML =
          renderStats(currentData) +
          renderToolbar() +
          '<section class="tenant-list">' +
          (tenants.length ? tenants.map(renderTenant).join("") : '<div class="empty">Nenhuma granja encontrada com esse filtro.</div>') +
          '</section>';
      }

      function renderStats(data) {
        return '<section class="stats">' +
          '<article class="stat-card"><span>Granjas</span><strong>' + data.totals.tenants + '</strong></article>' +
          '<article class="stat-card"><span>Contas</span><strong>' + data.totals.accounts + '</strong></article>' +
          '<article class="stat-card"><span>Vacinadores</span><strong>' + data.totals.vaccinators + '</strong></article>' +
          '<article class="stat-card"><span>Mensalidades vencidas</span><strong>' + data.totals.expired + '</strong></article>' +
          '<article class="stat-card"><span>Excluidas temp.</span><strong>' + (data.totals.archived || 0) + '</strong></article>' +
          '</section>';
      }

      function renderToolbar() {
        return '<section class="panel toolbar">' +
          '<label><strong>Buscar</strong><input value="' + escapeHtml(searchTerm) + '" oninput="setSearch(this.value)" placeholder="Granja, email, documento ou vacinador" /></label>' +
          '<label><strong>Status</strong><select onchange="setStatus(this.value)">' +
            '<option value="TODAS"' + (statusFilter === "TODAS" ? " selected" : "") + '>Todas</option>' +
            '<option value="ATIVAS"' + (statusFilter === "ATIVAS" ? " selected" : "") + '>Ativas</option>' +
            '<option value="VENCIDAS"' + (statusFilter === "VENCIDAS" ? " selected" : "") + '>Vencidas</option>' +
            '<option value="ARQUIVADAS"' + (statusFilter === "ARQUIVADAS" ? " selected" : "") + '>Excluidas temp.</option>' +
          '</select></label>' +
          '<button onclick="load()">Atualizar</button>' +
          '</section>';
      }

      function renderTenant(tenant) {
        const farm = tenant.farmProfile || {};
        const subscription = tenant.subscription || {};
        const isArchived = Boolean(tenant.archivedAt);
        const statusClass = isArchived ? "pill archived" : subscription.active ? "pill active" : "pill expired";
        const statusText = isArchived ? "EXCLUIDA TEMP." : (subscription.status || "-");
        const pendingRequests = tenant.requests.filter(function(request) {
          return statusLabel(request.status) === "PENDENTE";
        }).length;
        const completedRequests = tenant.requests.filter(function(request) {
          return statusLabel(request.status) === "CONCLUIDA";
        }).length;

        return '<article class="tenant-card">' +
          '<div class="tenant-head">' +
            '<div>' +
              '<div class="tenant-title">' +
                '<h2>' + escapeHtml(farm.farmName || tenant.tenantId) + '</h2>' +
                '<span class="' + statusClass + '">' + escapeHtml(statusText) + '</span>' +
              '</div>' +
              '<div class="tenant-meta">' +
                '<span>Cidade: ' + escapeHtml(farm.city || "-") + '</span>' +
                '<span>Documento: ' + escapeHtml(farm.document || "-") + '</span>' +
                '<span>Proprietario: ' + escapeHtml(farm.owner || "-") + '</span>' +
              '</div>' +
              '<p class="muted">Vence em ' + escapeHtml(formatDate(subscription.expiresAt)) + ' | ' + (subscription.daysRemaining || 0) + ' dia(s) restantes</p>' +
              (isArchived ? '<p class="muted">Excluida temporariamente em ' + escapeHtml(formatDate(tenant.archivedAt)) + '</p>' : '') +
            '</div>' +
            '<div class="actions">' +
              (isArchived
                ? '<button onclick="restoreTenant(\\'' + escapeHtml(tenant.tenantId) + '\\')">Restaurar</button>'
                : '<button onclick="renew(\\'' + escapeHtml(tenant.tenantId) + '\\')">Renovar 1 mes</button>' +
                  '<button class="red" onclick="expire(\\'' + escapeHtml(tenant.tenantId) + '\\')">Bloquear</button>' +
                  '<button class="dark" onclick="archiveTenant(\\'' + escapeHtml(tenant.tenantId) + '\\')">Excluir temp.</button>') +
              '<button class="red" onclick="deleteTenant(\\'' + escapeHtml(tenant.tenantId) + '\\')">Excluir definitivo</button>' +
            '</div>' +
          '</div>' +
          '<div class="info-grid">' +
            '<div class="mini-card"><span>Contas</span><strong>' + tenant.accounts.length + '</strong></div>' +
            '<div class="mini-card"><span>Vacinadores</span><strong>' + tenant.vaccinators.length + '</strong></div>' +
            '<div class="mini-card"><span>Pendentes</span><strong>' + pendingRequests + '</strong></div>' +
            '<div class="mini-card"><span>Concluidas</span><strong>' + completedRequests + '</strong></div>' +
          '</div>' +
          '<div class="sections">' +
            renderAccounts(tenant.accounts) +
            renderVaccinators(tenant.vaccinators) +
            renderRequests(tenant.requests) +
            renderNotifications(tenant.notifications) +
            renderPayments(tenant.payments) +
            renderFarmDetails(farm) +
          '</div>' +
          '<details><summary>Dados tecnicos JSON</summary><pre>' + escapeHtml(JSON.stringify(tenant, null, 2)) + '</pre></details>' +
          '</article>';
      }

      function renderAccounts(accounts) {
        return '<section class="section-box"><h3>Contas da granja</h3>' +
          (accounts.length ? accounts.map(function(account) {
            return '<div class="row">' +
              '<div class="row-title">' + escapeHtml(account.email) + '</div>' +
              '<div class="row-sub">' + escapeHtml(account.name || "-") + ' | ' + escapeHtml(account.role || "-") + '</div>' +
              '<div class="row-actions">' +
                '<button class="dark" onclick="resetPassword(\\'' + escapeHtml(account.id) + '\\')">Redefinir senha</button>' +
                '<button class="red" onclick="deleteAccount(\\'' + escapeHtml(account.id) + '\\')">Excluir usuario</button>' +
              '</div>' +
            '</div>';
          }).join("") : '<p class="muted">Nenhuma conta cadastrada.</p>') +
          '</section>';
      }

      function renderVaccinators(vaccinators) {
        return '<section class="section-box"><h3>Vacinadores</h3>' +
          (vaccinators.length ? vaccinators.map(function(vaccinator) {
            return '<div class="row">' +
              '<div class="row-title">' + escapeHtml(vaccinator.name || "-") + '</div>' +
              '<div class="row-sub">' + escapeHtml(vaccinator.email || "-") + '</div>' +
              '<div class="row-sub">' + escapeHtml(vaccinator.phone || "-") + ' | ' + escapeHtml(vaccinator.status || "-") + '</div>' +
            '</div>';
          }).join("") : '<p class="muted">Nenhum vacinador cadastrado.</p>') +
          '</section>';
      }

      function renderRequests(requests) {
        const latestRequests = requests.slice(0, 8);
        return '<section class="section-box"><h3>Solicitacoes recentes</h3>' +
          (latestRequests.length ? latestRequests.map(function(request) {
            const pillClass = request.status === "PENDENTE" ? "pill pending" : request.status === "RECUSADA" ? "pill expired" : "pill active";
            return '<div class="row">' +
              '<div class="row-title">' + escapeHtml(request.vaccinatorName || "-") + '</div>' +
              '<div><span class="' + pillClass + '">' + escapeHtml(statusLabel(request.status)) + '</span></div>' +
              '<div class="row-sub">' + escapeHtml(request.vaccinationStartDate || "-") + ' ate ' + escapeHtml(request.vaccinationEndDate || "-") + '</div>' +
            '</div>';
          }).join("") : '<p class="muted">Nenhuma solicitacao registrada.</p>') +
          '</section>';
      }

      function renderNotifications(notifications) {
        const latestNotifications = notifications.slice(-6).reverse();
        return '<section class="section-box"><h3>Notificacoes</h3>' +
          (latestNotifications.length ? latestNotifications.map(function(notification) {
            return '<div class="row">' +
              '<div class="row-title">' + escapeHtml(notification.title || notification.type || "-") + '</div>' +
              '<div class="row-sub">' + escapeHtml(notification.message || "-") + '</div>' +
              '<div class="row-sub">' + escapeHtml(notification.createdAt || "-") + '</div>' +
            '</div>';
          }).join("") : '<p class="muted">Nenhuma notificacao.</p>') +
          '</section>';
      }

      function renderPayments(payments) {
        const latestPayments = payments.slice(-5).reverse();
        return '<section class="section-box"><h3>Pagamentos</h3>' +
          (latestPayments.length ? latestPayments.map(function(payment) {
            return '<div class="row">' +
              '<div class="row-title">' + escapeHtml(payment.provider || "-") + ' | ' + escapeHtml(payment.status || "-") + '</div>' +
              '<div class="row-sub">R$ ' + escapeHtml(payment.amount || "-") + ' | ' + escapeHtml(payment.receivedAt || "-") + '</div>' +
            '</div>';
          }).join("") : '<p class="muted">Nenhum pagamento registrado.</p>') +
          '</section>';
      }

      function renderFarmDetails(farm) {
        return '<section class="section-box"><h3>Dados da granja</h3>' +
          '<div class="row"><div class="row-title">Endereco</div><div class="row-sub">' + escapeHtml(farm.address || "-") + '</div></div>' +
          '<div class="row"><div class="row-title">Localizacao</div><div class="row-sub">' + escapeHtml(farm.location || "-") + '</div></div>' +
          '</section>';
      }

      Object.assign(window, {
        archiveTenant,
        deleteTenant,
        expire,
        load,
        login,
        logout,
        renew,
        deleteAccount,
        resetPassword,
        restoreTenant,
        setSearch,
        setStatus
      });
      document.documentElement.setAttribute("data-owner-admin-ready", "true");
      document.getElementById("loginButton").addEventListener("click", login);
      document.getElementById("refreshButton").addEventListener("click", load);
      document.getElementById("logoutButton").addEventListener("click", logout);
      document.getElementById("password").addEventListener("keydown", function(event) {
        if (event.key === "Enter") login();
      });
      load();
    </script>
  </body>
</html>`;
}

/* =========================
   START SERVER
========================= */

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
