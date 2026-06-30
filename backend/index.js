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
const dns = require("dns");
const net = require("net");

const app = express();
const prisma = new PrismaClient();
dns.setDefaultResultOrder("ipv4first");
const appStateId = "immuhen-main";
const vacitechDataFile = process.env.VACITECH_DATA_FILE
  ? path.resolve(process.env.VACITECH_DATA_FILE)
  : path.join(__dirname, "vacitech-data.json");
const port = process.env.PORT || 3001;
const corsOrigin = process.env.CORS_ORIGIN || "*";
const stateStorage = String(process.env.VACITECH_STATE_STORAGE || (process.env.DATABASE_URL ? "database" : "file")).toLowerCase();
const subscriptionAdminKey = process.env.SUBSCRIPTION_ADMIN_KEY || "";
const ownerAdminKey = process.env.OWNER_ADMIN_KEY || subscriptionAdminKey || "";
const stockAccessKey = process.env.STOCK_ACCESS_KEY || "";
const mercadoPagoAccessToken = process.env.MP_ACCESS_TOKEN || "";
const apiPublicUrl = String(process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
const frontendPublicUrl = String(process.env.FRONTEND_PUBLIC_URL || "").replace(/\/$/, "");
const subscriptionPrice = Number(process.env.SUBSCRIPTION_PRICE || 99.9);
const subscriptionCurrency = process.env.SUBSCRIPTION_CURRENCY || "BRL";
const subscriptionEnforcement = String(process.env.SUBSCRIPTION_ENFORCEMENT || "on").toLowerCase() !== "off";
const authSecret = process.env.AUTH_SECRET || "granja-system-dev-secret";
const authTokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const smtpEndpoint = parseSmtpEndpoint(process.env.SMTP_HOST || "", process.env.SMTP_PORT || "");
const smtpHost = smtpEndpoint.host;
const smtpPort = Number(process.env.SMTP_PORT || smtpEndpoint.port || 587);
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPass = String(process.env.SMTP_PASS || "").trim();
const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpEndpoint.secure || smtpPort === 465;
const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
const notificationFromEmail = String(process.env.NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || smtpUser || "").trim();
const emailProvider = String(process.env.EMAIL_PROVIDER || (resendApiKey ? "resend" : "smtp")).trim().toLowerCase();
const defaultTenantPrimaryColor = "#16a34a";
const defaultTenantSecondaryColor = "#dcfce7";
const TENANT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const ACCESS_MODULES = Object.freeze({
  DASHBOARD: "DASHBOARD",
  CLIENTES: "CLIENTES",
  FINANCEIRO: "FINANCEIRO",
  ESTOQUE: "ESTOQUE",
  RELATORIOS: "RELATORIOS",
  CONFIGURACOES: "CONFIGURACOES",
  AVES: "AVES",
  VACINAS: "VACINAS",
  ENTRADAS: "ENTRADAS",
  PROGRAMA: "PROGRAMA",
  VACINADORES: "VACINADORES",
  SOLICITACOES: "SOLICITACOES",
  ADMINISTRADOR: "ADMINISTRADOR",
});
const ALL_ACCESS_MODULES = Object.freeze(Object.values(ACCESS_MODULES));
const ROLE_DEFINITIONS = Object.freeze({
  ADMIN: {
    label: "Administrador",
    permissions: ALL_ACCESS_MODULES,
  },
  GERENTE: {
    label: "Gerente",
    permissions: [
      ACCESS_MODULES.DASHBOARD,
      ACCESS_MODULES.CLIENTES,
      ACCESS_MODULES.FINANCEIRO,
      ACCESS_MODULES.ESTOQUE,
      ACCESS_MODULES.RELATORIOS,
      ACCESS_MODULES.CONFIGURACOES,
      ACCESS_MODULES.AVES,
      ACCESS_MODULES.VACINAS,
      ACCESS_MODULES.ENTRADAS,
      ACCESS_MODULES.PROGRAMA,
      ACCESS_MODULES.VACINADORES,
      ACCESS_MODULES.SOLICITACOES,
    ],
  },
  FUNCIONARIO: {
    label: "Funcionario",
    permissions: [
      ACCESS_MODULES.DASHBOARD,
      ACCESS_MODULES.AVES,
      ACCESS_MODULES.VACINAS,
      ACCESS_MODULES.ENTRADAS,
      ACCESS_MODULES.PROGRAMA,
      ACCESS_MODULES.SOLICITACOES,
    ],
  },
  VISUALIZADOR: {
    label: "Visualizador",
    permissions: [
      ACCESS_MODULES.DASHBOARD,
      ACCESS_MODULES.AVES,
      ACCESS_MODULES.VACINAS,
      ACCESS_MODULES.ESTOQUE,
      ACCESS_MODULES.RELATORIOS,
    ],
  },
});
const PERMISSION_DEFINITIONS = Object.freeze([
  { module: ACCESS_MODULES.DASHBOARD, label: "Dashboard" },
  { module: ACCESS_MODULES.CLIENTES, label: "Clientes" },
  { module: ACCESS_MODULES.FINANCEIRO, label: "Financeiro" },
  { module: ACCESS_MODULES.ESTOQUE, label: "Estoque" },
  { module: ACCESS_MODULES.RELATORIOS, label: "Relatorios" },
  { module: ACCESS_MODULES.CONFIGURACOES, label: "Configuracoes" },
  { module: ACCESS_MODULES.AVES, label: "Aves" },
  { module: ACCESS_MODULES.VACINAS, label: "Vacinas" },
  { module: ACCESS_MODULES.ENTRADAS, label: "Entradas" },
  { module: ACCESS_MODULES.PROGRAMA, label: "Programa" },
  { module: ACCESS_MODULES.VACINADORES, label: "Vacinadores" },
  { module: ACCESS_MODULES.SOLICITACOES, label: "Solicitacoes" },
  { module: ACCESS_MODULES.ADMINISTRADOR, label: "Administrador" },
]);
const LEGACY_ROLE_ALIASES = Object.freeze({
  admin: "ADMIN",
  administrador: "ADMIN",
  owner: "ADMIN",
  chefe: "ADMIN",
  gerente: "GERENTE",
  manager: "GERENTE",
  funcionario: "FUNCIONARIO",
  funcionaria: "FUNCIONARIO",
  employee: "FUNCIONARIO",
  visualizador: "VISUALIZADOR",
  viewer: "VISUALIZADOR",
});
const SAAS_ROLES = Object.freeze({
  ADMIN_GLOBAL: "ADMIN_GLOBAL",
  ADMIN_GRANJA: "ADMIN_GRANJA",
  FUNCIONARIO: "FUNCIONARIO",
  VISUALIZADOR: "VISUALIZADOR",
});
const ACTION_PERMISSIONS = Object.freeze({
  VACCINES_READ: "vaccines.read",
  VACCINES_CREATE: "vaccines.create",
  VACCINES_UPDATE: "vaccines.update",
  VACCINES_DELETE: "vaccines.delete",
  STOCK_READ: "stock.read",
  STOCK_ADJUST: "stock.adjust",
  SCHEDULE_READ: "schedule.read",
  SCHEDULE_CREATE: "schedule.create",
  SCHEDULE_UPDATE: "schedule.update",
  REQUESTS_READ: "requests.read",
  REQUESTS_UPDATE: "requests.update",
  REPORTS_READ: "reports.read",
  USERS_MANAGE: "users.manage",
  BILLING_MANAGE: "billing.manage",
});
const ALL_ACTION_PERMISSIONS = Object.freeze(Object.values(ACTION_PERMISSIONS));
const ROLE_ACTION_PERMISSIONS = Object.freeze({
  [SAAS_ROLES.ADMIN_GLOBAL]: ALL_ACTION_PERMISSIONS,
  [SAAS_ROLES.ADMIN_GRANJA]: ALL_ACTION_PERMISSIONS,
  [SAAS_ROLES.FUNCIONARIO]: [
    ACTION_PERMISSIONS.VACCINES_READ,
    ACTION_PERMISSIONS.VACCINES_CREATE,
    ACTION_PERMISSIONS.STOCK_READ,
    ACTION_PERMISSIONS.STOCK_ADJUST,
    ACTION_PERMISSIONS.SCHEDULE_READ,
    ACTION_PERMISSIONS.SCHEDULE_CREATE,
    ACTION_PERMISSIONS.SCHEDULE_UPDATE,
    ACTION_PERMISSIONS.REQUESTS_READ,
    ACTION_PERMISSIONS.REQUESTS_UPDATE,
    ACTION_PERMISSIONS.REPORTS_READ,
  ],
  [SAAS_ROLES.VISUALIZADOR]: [
    ACTION_PERMISSIONS.VACCINES_READ,
    ACTION_PERMISSIONS.STOCK_READ,
    ACTION_PERMISSIONS.SCHEDULE_READ,
    ACTION_PERMISSIONS.REQUESTS_READ,
    ACTION_PERMISSIONS.REPORTS_READ,
  ],
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
if (process.env.NODE_ENV === "production" && corsOrigin === "*") {
  console.warn("CORS_ORIGIN esta como * em producao. Configure os dominios do ImmuHen antes do uso comercial.");
}
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
  const account = normalizeAccountAccess(data.accounts.find((item) => (
    normalizeEmail(item.email) === normalizeEmail(email)
  )));

  if (account && verifyPassword(password, account.passwordHash)) {
    const tenantData = getTenantData(data, account.tenantId);
    const subscription = getSubscriptionStatus(tenantData.subscription);

    if (isTenantArchived(tenantData)) {
      return res.status(403).json({
        success: false,
        message: "Esta granja esta excluida temporariamente. Fale com o administrador do ImmuHen.",
      });
    }

    if (isTenantInactive(tenantData)) {
      return res.status(403).json({
        success: false,
        message: "Esta granja esta inativa. Fale com o administrador geral do ImmuHen.",
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

    await syncTenantRecord(account.tenantId, tenantData);

    return res.json({
      success: true,
      token: createAuthToken(account),
      user: sanitizeAccount(account),
      farmProfile: tenantData.farmProfile,
      tenant: getTenantPublicConfig(account.tenantId, tenantData),
      state: filterTenantDataForAccount(tenantData, account),
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
    role: "ADMIN",
    permissions: getDefaultPermissionsForRole("ADMIN"),
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
  tenantData.tenantSettings = normalizeTenantSettings(tenantId, {
    ...tenantData,
    tenantSettings: {
      name: tenantData.farmProfile.farmName,
      identifier: createTenantIdentifier(tenantData.farmProfile.farmName, tenantId),
      primaryColor: defaultTenantPrimaryColor,
      secondaryColor: defaultTenantSecondaryColor,
      status: TENANT_STATUS.ACTIVE,
    },
  });

  data.accounts.push(account);
  data.tenants[tenantId] = tenantData;
  await writeVacitechData(data);

  res.status(201).json({
    success: true,
    token: createAuthToken(account),
    user: sanitizeAccount(account),
    farmProfile: tenantData.farmProfile,
    tenant: getTenantPublicConfig(tenantId, tenantData),
    state: filterTenantDataForAccount(tenantData, account),
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
  await syncTenantRecords(data);

  res.json(getOwnerOverview(data));
});

app.post("/api/owner/tenants", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();
  const tenantId = `tenant-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const name = String(req.body.name || req.body.farmName || "").trim();
  const identifier = sanitizeTenantIdentifier(req.body.identifier || name, tenantId);
  const adminEmail = normalizeEmail(req.body.adminEmail || req.body.email);
  const adminPassword = String(req.body.adminPassword || req.body.password || "");

  if (!name) {
    return res.status(400).json({
      message: "Informe o nome da granja.",
    });
  }

  if (isTenantIdentifierInUse(data, identifier)) {
    return res.status(409).json({
      message: "Este identificador ja esta em uso por outra granja.",
    });
  }

  if (adminEmail && data.accounts.some((account) => normalizeEmail(account.email) === adminEmail)) {
    return res.status(409).json({
      message: "Este email de administrador ja esta cadastrado.",
    });
  }

  if (adminEmail && adminPassword.length < 6) {
    return res.status(400).json({
      message: "A senha do administrador da granja precisa ter pelo menos 6 caracteres.",
    });
  }

  const settings = normalizeTenantSettings(tenantId, {
    tenantSettings: {
      name,
      identifier,
      domain: req.body.domain,
      logoDataUrl: req.body.logoDataUrl,
      primaryColor: req.body.primaryColor,
      secondaryColor: req.body.secondaryColor,
      status: req.body.status,
    },
  });
  const tenantData = {
    ...getEmptyTenantData(),
    tenantSettings: settings,
    farmProfile: mergeTenantSettingsIntoProfile({
      farmName: name,
      city: String(req.body.city || "").trim(),
      document: String(req.body.document || "").trim(),
      owner: String(req.body.owner || "").trim(),
      address: String(req.body.address || "").trim(),
      location: String(req.body.location || "").trim(),
      notificationContact: String(req.body.notificationContact || "").trim(),
      updatedAt: new Date().toLocaleString("pt-BR"),
    }, settings),
  };

  data.tenants[tenantId] = tenantData;

  if (adminEmail) {
    data.accounts.push(normalizeAccountAccess({
      id: `account-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      tenantId,
      name: String(req.body.adminName || req.body.owner || "Administrador").trim(),
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "ADMIN",
      permissions: getDefaultPermissionsForRole("ADMIN"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  await writeVacitechData(data);

  res.status(201).json({
    tenant: getOwnerOverview(data).tenants.find((tenant) => tenant.tenantId === tenantId),
    overview: getOwnerOverview(data),
  });
});

app.put("/api/owner/tenants/:tenantId", requireOwnerAccess, async (req, res) => {
  const data = await readVacitechData();

  if (!data.tenants?.[req.params.tenantId]) {
    return res.status(404).json({
      message: "Granja nao encontrada.",
    });
  }

  const tenantData = getTenantData(data, req.params.tenantId);
  const nextSettings = normalizeTenantSettings(req.params.tenantId, {
    ...tenantData,
    tenantSettings: {
      ...tenantData.tenantSettings,
      name: req.body.name ?? req.body.farmName ?? tenantData.tenantSettings.name,
      identifier: req.body.identifier ?? tenantData.tenantSettings.identifier,
      domain: req.body.domain ?? tenantData.tenantSettings.domain,
      logoDataUrl: req.body.logoDataUrl ?? tenantData.tenantSettings.logoDataUrl,
      primaryColor: req.body.primaryColor ?? tenantData.tenantSettings.primaryColor,
      secondaryColor: req.body.secondaryColor ?? tenantData.tenantSettings.secondaryColor,
      status: req.body.status ?? tenantData.tenantSettings.status,
    },
  });

  if (isTenantIdentifierInUse(data, nextSettings.identifier, req.params.tenantId)) {
    return res.status(409).json({
      message: "Este identificador ja esta em uso por outra granja.",
    });
  }

  tenantData.tenantSettings = nextSettings;
  tenantData.farmProfile = mergeTenantSettingsIntoProfile({
    ...tenantData.farmProfile,
    farmName: nextSettings.name,
    city: req.body.city ?? tenantData.farmProfile.city ?? "",
    document: req.body.document ?? tenantData.farmProfile.document ?? "",
    owner: req.body.owner ?? tenantData.farmProfile.owner ?? "",
    address: req.body.address ?? tenantData.farmProfile.address ?? "",
    location: req.body.location ?? tenantData.farmProfile.location ?? "",
    notificationContact: req.body.notificationContact ?? tenantData.farmProfile.notificationContact ?? "",
    updatedAt: new Date().toLocaleString("pt-BR"),
  }, nextSettings);

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    tenant: getOwnerOverview(data).tenants.find((tenant) => tenant.tenantId === req.params.tenantId),
    overview: getOwnerOverview(data),
  });
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
  tenantData.tenantSettings = {
    ...tenantData.tenantSettings,
    status: TENANT_STATUS.INACTIVE,
  };
  tenantData.farmProfile = mergeTenantSettingsIntoProfile(tenantData.farmProfile, tenantData.tenantSettings);

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
  tenantData.tenantSettings = {
    ...tenantData.tenantSettings,
    status: TENANT_STATUS.ACTIVE,
  };
  tenantData.farmProfile = mergeTenantSettingsIntoProfile(tenantData.farmProfile, tenantData.tenantSettings);

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
  await deleteTenantRecord(req.params.tenantId);

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

app.post("/api/owner/tenants/:tenantId/admin-password", requireOwnerAccess, async (req, res) => {
  const password = String(req.body.password || "");

  if (password.length < 6) {
    return res.status(400).json({
      message: "A senha administrativa precisa ter pelo menos 6 caracteres.",
    });
  }

  const data = await readVacitechData();

  if (!data.tenants?.[req.params.tenantId]) {
    return res.status(404).json({
      message: "Granja nao encontrada.",
    });
  }

  const tenantData = getTenantData(data, req.params.tenantId);

  tenantData.adminAccess = {
    passwordHash: hashPassword(password),
    updatedAt: new Date().toISOString(),
  };

  data.tenants[req.params.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    tenant: getOwnerOverview(data).tenants.find((tenant) => tenant.tenantId === req.params.tenantId),
    overview: getOwnerOverview(data),
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

  if (isTenantInactive(tenantData)) {
    return res.status(403).json({
      message: "Esta granja esta inativa. Fale com o administrador geral do ImmuHen.",
    });
  }

  if (!subscription.active) {
    return res.status(402).json({
      message: "Assinatura vencida. Renove o acesso mensal para continuar usando.",
      subscription,
    });
  }

  req.account = normalizeAccountAccess(accountContext.account);
  req.tenantId = req.account.tenantId;
  req.tenantData = tenantData;
  req.saasRole = normalizeSaasRole(req.account.saasRole || req.account.role);
  req.actionPermissions = getAccountActionPermissions(req.account);
  syncTenantRecord(req.tenantId, tenantData).catch((error) => {
    console.log(error.message || error);
  });

  const routePermissions = getVacitechRoutePermissions(req);

  if (routePermissions.length > 0 && !hasAnyPermission(req.account, routePermissions)) {
    return res.status(403).json({
      message: "Seu usuario nao tem permissao para acessar este modulo.",
      requiredPermissions: routePermissions,
    });
  }

  return next();
});

/* =========================
   VACITECH SHARED DATA
========================= */

app.get("/api/vacitech/state", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = await syncOverdueVaccinationAlerts(data, req.tenantId);
  const filteredData = filterTenantDataForAccount(tenantData, req.account);

  res.json(pickStateFields(filteredData, req.query.fields));
});

app.get("/api/vacitech/notifications/status", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  res.json({
    configured: getEmailDeliveryConfigStatus(),
    contact: getFarmNotificationContact(data, req.tenantId, tenantData),
    recentOutbox: (tenantData.notificationOutbox || []).slice(0, 12),
  });
});

app.delete("/api/vacitech/notifications/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const notificationId = String(req.params.id || "");

  tenantData.notifications = tenantData.notifications.filter((notification) => (
    String(notification.id || "") !== notificationId
  ));
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    notifications: tenantData.notifications,
  });
});

app.delete("/api/vacitech/notifications", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  tenantData.notifications = [];
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    notifications: tenantData.notifications,
  });
});

app.post("/api/vacitech/stock-access", async (req, res) => {
  const password = String(req.body.password || "").trim();

  if (!hasPermission(req.account, ACCESS_MODULES.ESTOQUE)) {
    return res.status(403).json({
      message: "Seu usuario nao tem permissao para acessar o estoque.",
    });
  }

  if (!password) {
    return res.status(400).json({
      message: "Informe a senha administrativa.",
    });
  }

  const validAccountPassword = verifyAdminAccessPassword(password, req.account, req.tenantData);
  const validStockKey = stockAccessKey && password === stockAccessKey;

  if (!validAccountPassword && !validStockKey) {
    return res.status(401).json({
      message: "Senha administrativa incorreta.",
    });
  }

  res.json({
    success: true,
    role: req.account.role || "ADMIN",
  });
});

app.post("/api/vacitech/chief-access", async (req, res) => {
  const password = String(req.body.password || "").trim();

  if (!hasPermission(req.account, ACCESS_MODULES.ADMINISTRADOR)) {
    return res.status(403).json({
      message: "Seu usuario nao tem permissao para acessar este ambiente.",
    });
  }

  if (!password) {
    return res.status(400).json({
      message: "Informe a senha do administrador.",
    });
  }

  if (!verifyAdminAccessPassword(password, req.account, req.tenantData)) {
    return res.status(401).json({
      message: "Senha do administrador incorreta.",
    });
  }

  res.json({
    success: true,
    role: req.account.role || "ADMIN",
  });
});

app.put("/api/vacitech/admin-access-password", async (req, res) => {
  const password = String(req.body.password || "").trim();

  if (!isAdminAccount(req.account)) {
    return res.status(403).json({
      message: "Apenas usuario ADMIN pode alterar a senha administrativa.",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: "Informe uma senha com pelo menos 6 caracteres.",
    });
  }

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  tenantData.adminAccess = {
    passwordHash: hashPassword(password),
    updatedAt: new Date().toISOString(),
  };

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    updatedAt: tenantData.adminAccess.updatedAt,
  });
});

app.get("/api/vacitech/users", requireAdminUserManagement, async (req, res) => {
  const data = await readVacitechData();

  res.json({
    users: getTenantAccounts(data, req.tenantId).map(sanitizeAccount),
    roles: getRoleDefinitionsPayload(),
    permissions: PERMISSION_DEFINITIONS,
  });
});

app.post("/api/vacitech/users", requireAdminUserManagement, async (req, res) => {
  const data = await readVacitechData();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const name = String(req.body.name || "").trim();
  const role = normalizeRole(req.body.role || "FUNCIONARIO");
  const permissions = normalizePermissions(req.body.permissions, role);

  if (!name || !email || password.length < 6) {
    return res.status(400).json({
      message: "Informe nome, email e senha com pelo menos 6 caracteres.",
    });
  }

  if (data.accounts.some((account) => normalizeEmail(account.email) === email)) {
    return res.status(409).json({
      message: "Este email ja esta cadastrado.",
    });
  }

  const account = normalizeAccountAccess({
    id: `account-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    tenantId: req.tenantId,
    name,
    email,
    passwordHash: hashPassword(password),
    role,
    permissions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  data.accounts.push(account);
  await writeVacitechData(data);

  res.status(201).json({
    user: sanitizeAccount(account),
    users: getTenantAccounts(data, req.tenantId).map(sanitizeAccount),
  });
});

app.put("/api/vacitech/users/:userId", requireAdminUserManagement, async (req, res) => {
  const data = await readVacitechData();
  const accountIndex = data.accounts.findIndex((account) => (
    account.id === req.params.userId &&
    account.tenantId === req.tenantId
  ));

  if (accountIndex === -1) {
    return res.status(404).json({
      message: "Usuario nao encontrado.",
    });
  }

  const currentAccount = normalizeAccountAccess(data.accounts[accountIndex]);
  const email = normalizeEmail(req.body.email ?? currentAccount.email);
  const name = String((req.body.name ?? currentAccount.name) || "").trim();
  const role = normalizeRole(req.body.role ?? currentAccount.role);
  const permissions = normalizePermissions(
    Array.isArray(req.body.permissions) ? req.body.permissions : currentAccount.permissions,
    role
  );
  const password = String(req.body.password || "");

  if (!name || !email) {
    return res.status(400).json({
      message: "Informe nome e email.",
    });
  }

  if (password && password.length < 6) {
    return res.status(400).json({
      message: "A nova senha precisa ter pelo menos 6 caracteres.",
    });
  }

  const emailInUse = data.accounts.some((account) => (
    account.id !== currentAccount.id &&
    normalizeEmail(account.email) === email
  ));

  if (emailInUse) {
    return res.status(409).json({
      message: "Este email ja esta cadastrado em outro usuario.",
    });
  }

  if (currentAccount.id === req.account.id && (role !== "ADMIN" || !permissions.includes(ACCESS_MODULES.ADMINISTRADOR))) {
    return res.status(400).json({
      message: "Voce nao pode remover seu proprio acesso de ADMIN.",
    });
  }

  const updatedAccount = normalizeAccountAccess({
    ...currentAccount,
    name,
    email,
    role,
    permissions,
    passwordHash: password ? hashPassword(password) : currentAccount.passwordHash,
    updatedAt: new Date().toISOString(),
  });

  data.accounts[accountIndex] = updatedAccount;
  await writeVacitechData(data);

  res.json({
    user: sanitizeAccount(updatedAccount),
    users: getTenantAccounts(data, req.tenantId).map(sanitizeAccount),
  });
});

app.delete("/api/vacitech/users/:userId", requireAdminUserManagement, async (req, res) => {
  const data = await readVacitechData();
  const account = data.accounts.find((item) => (
    item.id === req.params.userId &&
    item.tenantId === req.tenantId
  ));

  if (!account) {
    return res.status(404).json({
      message: "Usuario nao encontrado.",
    });
  }

  if (account.id === req.account.id) {
    return res.status(400).json({
      message: "Voce nao pode excluir seu proprio usuario.",
    });
  }

  data.accounts = data.accounts.filter((item) => item.id !== account.id);
  await writeVacitechData(data);

  res.json({
    success: true,
    users: getTenantAccounts(data, req.tenantId).map(sanitizeAccount),
  });
});

app.put("/api/vacitech/inventory-state", async (req, res) => {
  const inventoryPermissionChecks = [
    {
      fields: ["vaccines", "vaccineEditRequests", "vaccineAuditLog"],
      permissions: [ACCESS_MODULES.VACINAS, ACCESS_MODULES.ADMINISTRADOR],
    },
    {
      fields: ["entries", "entryEditRequests"],
      permissions: [ACCESS_MODULES.ENTRADAS, ACCESS_MODULES.FINANCEIRO, ACCESS_MODULES.ADMINISTRADOR],
    },
    {
      fields: ["outputs"],
      permissions: [ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.ADMINISTRADOR],
    },
    {
      fields: ["stockAlertLevels"],
      permissions: [ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.ADMINISTRADOR],
    },
  ];
  const blockedField = inventoryPermissionChecks.find((check) => (
    check.fields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field)) &&
    !hasAnyPermission(req.account, check.permissions)
  ));

  if (blockedField) {
    return res.status(403).json({
      message: "Seu usuario nao tem permissao para alterar este modulo.",
      requiredPermissions: blockedField.permissions,
    });
  }

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  tenantData.vaccines = Array.isArray(req.body.vaccines)
    ? tagItemsWithTenant(req.body.vaccines, req.tenantId)
    : tenantData.vaccines;
  tenantData.entries = Array.isArray(req.body.entries)
    ? tagItemsWithTenant(req.body.entries, req.tenantId)
    : tenantData.entries;
  tenantData.outputs = Array.isArray(req.body.outputs)
    ? tagItemsWithTenant(req.body.outputs, req.tenantId)
    : tenantData.outputs;
  tenantData.vaccineEditRequests = Array.isArray(req.body.vaccineEditRequests)
    ? tagItemsWithTenant(req.body.vaccineEditRequests, req.tenantId)
    : tenantData.vaccineEditRequests;
  tenantData.entryEditRequests = Array.isArray(req.body.entryEditRequests)
    ? tagItemsWithTenant(req.body.entryEditRequests, req.tenantId)
    : tenantData.entryEditRequests;
  tenantData.vaccineAuditLog = Array.isArray(req.body.vaccineAuditLog)
    ? tagItemsWithTenant(req.body.vaccineAuditLog, req.tenantId)
    : tenantData.vaccineAuditLog;
  tenantData.stockAlertLevels = req.body.stockAlertLevels && typeof req.body.stockAlertLevels === "object" && !Array.isArray(req.body.stockAlertLevels)
    ? req.body.stockAlertLevels
    : tenantData.stockAlertLevels;

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    inventoryState: {
      vaccines: tenantData.vaccines,
      entries: tenantData.entries,
      outputs: tenantData.outputs,
      stockAlertLevels: tenantData.stockAlertLevels,
      vaccineEditRequests: tenantData.vaccineEditRequests,
      entryEditRequests: tenantData.entryEditRequests,
      vaccineAuditLog: tenantData.vaccineAuditLog,
    },
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
  const currentSettings = normalizeTenantSettings(req.tenantId, tenantData);
  const nextSettings = normalizeTenantSettings(req.tenantId, {
    ...tenantData,
    tenantSettings: {
      ...currentSettings,
      name: req.body.farmName || req.body.name || currentSettings.name,
      identifier: req.body.identifier || currentSettings.identifier,
      domain: req.body.domain ?? currentSettings.domain,
      logoDataUrl: req.body.logoDataUrl ?? currentSettings.logoDataUrl,
      primaryColor: req.body.primaryColor ?? currentSettings.primaryColor,
      secondaryColor: req.body.secondaryColor ?? currentSettings.secondaryColor,
      status: currentSettings.status,
    },
  });

  if (isTenantIdentifierInUse(data, nextSettings.identifier, req.tenantId)) {
    return res.status(409).json({
      message: "Este identificador ja esta em uso por outra granja.",
    });
  }

  const farmProfile = {
    ...tenantData.farmProfile,
    ...req.body,
    ...mergeTenantSettingsIntoProfile(req.body, nextSettings),
    updatedAt: new Date().toLocaleString("pt-BR"),
  };

  tenantData.tenantSettings = nextSettings;
  tenantData.farmProfile = farmProfile;
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    farmProfile,
    tenant: getTenantPublicConfig(req.tenantId, tenantData),
  });
});

app.get("/api/vacitech/tenant-settings", async (req, res) => {
  res.json({
    tenant: getTenantPublicConfig(req.tenantId, req.tenantData),
  });
});

app.put("/api/vacitech/tenant-settings", async (req, res) => {
  if (!isAdminAccount(req.account)) {
    return res.status(403).json({
      message: "Apenas ADMIN da granja pode alterar as configuracoes da granja.",
    });
  }

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const nextSettings = normalizeTenantSettings(req.tenantId, {
    ...tenantData,
    tenantSettings: {
      ...tenantData.tenantSettings,
      name: req.body.name ?? tenantData.tenantSettings.name,
      identifier: req.body.identifier ?? tenantData.tenantSettings.identifier,
      domain: req.body.domain ?? tenantData.tenantSettings.domain,
      logoDataUrl: req.body.logoDataUrl ?? tenantData.tenantSettings.logoDataUrl,
      primaryColor: req.body.primaryColor ?? tenantData.tenantSettings.primaryColor,
      secondaryColor: req.body.secondaryColor ?? tenantData.tenantSettings.secondaryColor,
      status: tenantData.tenantSettings.status,
    },
  });

  if (isTenantIdentifierInUse(data, nextSettings.identifier, req.tenantId)) {
    return res.status(409).json({
      message: "Este identificador ja esta em uso por outra granja.",
    });
  }

  tenantData.tenantSettings = nextSettings;
  tenantData.farmProfile = mergeTenantSettingsIntoProfile(tenantData.farmProfile, nextSettings);
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    tenant: getTenantPublicConfig(req.tenantId, tenantData),
    farmProfile: tenantData.farmProfile,
  });
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

app.post("/api/vacitech/vaccinators/:id/notification-test", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const vaccinator = tenantData.vaccinators.find((item) => String(item.id) === String(req.params.id));

  if (!vaccinator) {
    return res.status(404).json({
      message: "Vacinador nao encontrado.",
    });
  }

  const notification = {
    id: `vaccinator-test-${Date.now()}`,
    type: "TEST_VACCINATOR_NOTIFICATION",
    title: "Teste de notificacao ImmuHen Vacinador",
    message: "Se voce recebeu este email, as notificacoes do vacinador estao funcionando.",
    vaccinatorId: vaccinator.id,
    vaccinatorName: vaccinator.name,
    vaccinatorEmail: vaccinator.email,
    vaccinatorPhone: vaccinator.phone,
    vaccinatorNotificationContact: vaccinator.notificationContact,
    farmName: tenantData.farmProfile?.farmName || "Granja",
    createdAt: new Date().toLocaleString("pt-BR"),
    read: false,
  };
  const delivered = await queueVaccinatorExternalNotification(tenantData, notification, vaccinator, {
    dedupeKey: `test-vaccinator-notification:${vaccinator.id}:${Date.now()}`,
  });

  tenantData.notifications.push(notification);
  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    notification,
    delivered,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
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
  const requestedStatus = normalizeRequestStatus(req.body.status);
  const hasUsageConfirmation = Boolean(
    req.body.usageConfirmation ||
    req.body.vaccineUsageConfirmation ||
    req.body.actualVaccineUsages
  );
  const status = requestedStatus === "CONCLUIDA" && hasUsageConfirmation
    ? "AGUARDANDO_CONFIRMACAO_ADMIN"
    : requestedStatus;
  const now = new Date();
  const answeredAt = now.toLocaleString("pt-BR");
  const statusTimestamps = getStatusTimestamps(status, answeredAt, now.toISOString());
  let updatedRequest = null;
  let notificationForFarm = null;

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

  const accessError = validateVaccinatorRequestAccess(req, updatedRequest);

  if (accessError) {
    return res.status(403).json({
      message: accessError,
    });
  }

  if (updatedRequest.stockConfirmedAt || normalizeRequestStatus(updatedRequest.status) === "CONCLUIDA_CONFIRMADA") {
    return res.status(409).json({
      message: "Esta vacinacao ja foi confirmada pela granja.",
    });
  }

  if (isAwaitingAdminConfirmationStatus(status)) {
    const usageConfirmation = normalizeVaccinationUsageConfirmation(
      req.body.usageConfirmation || req.body.vaccineUsageConfirmation || req.body.actualVaccineUsages,
      updatedRequest
    );
    const validationMessage = validateVaccinationUsageConfirmation(tenantData, updatedRequest, usageConfirmation);

    if (validationMessage) {
      return res.status(400).json({
        message: validationMessage,
      });
    }

    updatedRequest = {
      ...updatedRequest,
      status: "AGUARDANDO_CONFIRMACAO_ADMIN",
      usageConfirmation,
      actualVaccineUsages: usageConfirmation
        .filter((item) => item.quantityUsed > 0)
        .map((item) => ({
          ...item,
          doses: item.quantityUsed,
        })),
      completionObservation: String(req.body.completionObservation || req.body.observations || "").trim(),
      ...getStatusTimestamps("AGUARDANDO_CONFIRMACAO_ADMIN", answeredAt, now.toISOString()),
    };
    notificationForFarm = createVaccinationAwaitingAdminNotification(updatedRequest);

    tenantData.notifications = removeNotificationsForRequest(
      tenantData.notifications,
      updatedRequest.id,
      "VACCINATION_AWAITING_ADMIN"
    );
    tenantData.notifications.push(notificationForFarm);
  } else if (status === "RECUSADA") {
    updatedRequest = {
      ...updatedRequest,
      refusalReason: String(req.body.refusalReason || req.body.reason || "").trim(),
      statusReason: String(req.body.refusalReason || req.body.reason || "").trim(),
    };
  } else if (status === "AJUSTE_SOLICITADO") {
    updatedRequest = {
      ...updatedRequest,
      adjustmentReason: String(req.body.adjustmentReason || req.body.reason || "").trim(),
      statusReason: String(req.body.adjustmentReason || req.body.reason || "").trim(),
    };
  }

  tenantData.requests = tenantData.requests.map((request) => (
    String(request.id) === String(updatedRequest.id)
      ? updatedRequest
      : request
  ));

  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(updatedRequest.scheduleId)
      ? {
          ...schedule,
          status: updatedRequest.status,
          usageConfirmation: updatedRequest.usageConfirmation,
          actualVaccineUsages: updatedRequest.actualVaccineUsages,
          completionObservation: updatedRequest.completionObservation,
          refusalReason: updatedRequest.refusalReason,
          adjustmentReason: updatedRequest.adjustmentReason,
          ...statusTimestamps,
        }
      : schedule
  ));

  if (notificationForFarm) {
    await queueFarmExternalNotification(data, targetTenantId, tenantData, notificationForFarm, {
      dedupeKey: `vaccination-awaiting-admin:${updatedRequest.id}:${updatedRequest.awaitingAdminConfirmationAtIso || Date.now()}`,
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
  const laborCost = vaccineUsages.reduce((total, usage) => (
    total + parseDecimalValue(usage.laborCost ?? usage.maoDeObra ?? 0)
  ), 0);

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
      laborCost,
      programLaborCost: laborCost,
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
          laborCost,
          programLaborCost: laborCost,
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

  if (!isAwaitingAdminConfirmationStatus(request.status)) {
    return res.status(400).json({
      message: "A vacinacao precisa estar aguardando confirmacao do administrador.",
    });
  }

  const confirmedAtDate = new Date();
  const confirmedAt = confirmedAtDate.toLocaleString("pt-BR");
  const usageConfirmation = normalizeVaccinationUsageConfirmation(
    request.usageConfirmation || request.actualVaccineUsages,
    request
  );
  const stockUsageResult = applyVaccinationStockUsage(tenantData, request, usageConfirmation, {
    now: confirmedAtDate,
    responsible: req.account?.name || req.account?.email || "Administrador",
  });

  if (stockUsageResult.error) {
    return res.status(400).json({
      message: stockUsageResult.error,
    });
  }

  const requestWithStock = {
    ...request,
    usageConfirmation,
    actualVaccineUsages: stockUsageResult.actualUsages,
    reversedPlannedOutputs: stockUsageResult.reversedPlannedOutputs.map((output) => ({
      id: output.id,
      vaccineId: output.vaccineId,
      vacina: output.vacina,
      doses: Number(output.doses || 0),
      source: output.source || "",
    })),
    stockConfirmedAt: stockUsageResult.stockConfirmedAt,
    stockConfirmedAtIso: stockUsageResult.stockConfirmedAtIso,
  };
  const materialsUsed = buildVaccinationMaterials(requestWithStock);
  const returnedVaccines = normalizeReturnedVaccines(req.body.returnedVaccines);
  const completedRecord = {
    ...requestWithStock,
    status: "CONCLUIDA_CONFIRMADA",
    materialsUsed,
    returnedVaccines,
    completionTiming: String(req.body.completionTiming || "PONTUAL").toUpperCase(),
    completionSummary: buildVaccinationCompletionSummary(requestWithStock, materialsUsed),
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
          status: "CONCLUIDA_CONFIRMADA",
          usageConfirmation,
          actualVaccineUsages: stockUsageResult.actualUsages,
          stockConfirmedAt: stockUsageResult.stockConfirmedAt,
          stockConfirmedAtIso: stockUsageResult.stockConfirmedAtIso,
          systemConfirmedAt: confirmedAt,
          systemConfirmedAtIso: confirmedAtDate.toISOString(),
        }
      : schedule
  ));

  await recordAuditLog({
    tenantId: req.tenantId,
    userId: req.account?.id,
    action: "vaccination.confirmed",
    entity: "VaccinationRequest",
    entityId: request.id,
    oldValue: request,
    newValue: completedRecord,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  sendVaccinationCompletionPdf(res, completedRecord);
});

app.post("/api/vacitech/requests/:id/review", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const request = tenantData.requests.find((item) => String(item.id) === String(req.params.id));

  if (!request) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  if (!isAwaitingAdminConfirmationStatus(request.status) && normalizeRequestStatus(request.status) !== "AJUSTE_SOLICITADO") {
    return res.status(400).json({
      message: "Esta vacinacao nao esta aguardando revisao.",
    });
  }

  const action = String(req.body.action || "").trim().toUpperCase();
  const reason = String(req.body.reason || "").trim();
  const now = new Date();
  const nowLabel = now.toLocaleString("pt-BR");
  let nextStatus = "";
  let notification = null;

  if (action === "ADJUSTMENT" || action === "AJUSTE") {
    nextStatus = "AJUSTE_SOLICITADO";
  } else if (action === "REJECT" || action === "REJEITAR") {
    nextStatus = "RECUSADA";
  } else {
    return res.status(400).json({
      message: "Informe uma acao valida: ADJUSTMENT ou REJECT.",
    });
  }

  const timestamps = getStatusTimestamps(nextStatus, nowLabel, now.toISOString());
  const updatedRequest = {
    ...request,
    status: nextStatus,
    statusReason: reason,
    adjustmentReason: nextStatus === "AJUSTE_SOLICITADO" ? reason : request.adjustmentReason,
    rejectedReason: nextStatus === "RECUSADA" ? reason : request.rejectedReason,
    rejectedAt: nextStatus === "RECUSADA" ? nowLabel : request.rejectedAt,
    rejectedAtIso: nextStatus === "RECUSADA" ? now.toISOString() : request.rejectedAtIso,
    ...timestamps,
  };

  tenantData.requests = tenantData.requests.map((item) => (
    String(item.id) === String(request.id) ? updatedRequest : item
  ));
  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(request.scheduleId)
      ? {
          ...schedule,
          status: nextStatus,
          statusReason: reason,
          adjustmentReason: updatedRequest.adjustmentReason,
          rejectedReason: updatedRequest.rejectedReason,
          ...timestamps,
        }
      : schedule
  ));

  notification = nextStatus === "AJUSTE_SOLICITADO"
    ? createVaccinationAdjustmentNotification(updatedRequest, reason)
    : createVaccinationRejectedNotification(updatedRequest, reason);
  tenantData.notifications.push(notification);

  const vaccinator = tenantData.vaccinators.find((item) => matchesVaccinator(item, updatedRequest)) || updatedRequest;
  await queueVaccinatorExternalNotification(tenantData, notification, vaccinator, {
    dedupeKey: `${notification.type}:${updatedRequest.id}:${now.toISOString()}`,
  });

  await recordAuditLog({
    tenantId: req.tenantId,
    userId: req.account?.id,
    action: nextStatus === "AJUSTE_SOLICITADO" ? "vaccination.adjustment_requested" : "vaccination.rejected",
    entity: "VaccinationRequest",
    entityId: request.id,
    oldValue: request,
    newValue: updatedRequest,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    request: updatedRequest,
    requests: tenantData.requests,
    schedules: tenantData.schedules,
    notifications: tenantData.notifications,
    notificationOutbox: tenantData.notificationOutbox,
  });
});

app.post("/api/vacitech/requests/:id/messages", async (req, res) => {
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

  const request = tenantData.requests.find((item) => String(item.id) === String(req.params.id));

  if (!request) {
    return res.status(404).json({
      message: "Solicitacao nao encontrada",
    });
  }

  const text = String(req.body.message || req.body.text || "").trim();

  if (!text) {
    return res.status(400).json({
      message: "Escreva uma mensagem para enviar.",
    });
  }

  const senderType = req.tenantId ? "ADMIN" : "VACCINATOR";
  const accessError = senderType === "VACCINATOR"
    ? validateVaccinatorRequestAccess(req, request)
    : "";

  if (accessError) {
    return res.status(403).json({
      message: accessError,
    });
  }

  const createdAtDate = new Date();
  const message = {
    id: `msg-${createdAtDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    senderType,
    senderName: senderType === "ADMIN"
      ? (req.account?.name || req.account?.email || "Administrador")
      : (request.vaccinatorName || req.body.senderName || "Vacinador"),
    text,
    createdAt: createdAtDate.toLocaleString("pt-BR"),
    createdAtIso: createdAtDate.toISOString(),
  };
  let updatedRequest = {
    ...request,
    messages: [
      ...(Array.isArray(request.messages) ? request.messages : []),
      message,
    ],
  };

  tenantData.requests = tenantData.requests.map((item) => (
    String(item.id) === String(request.id) ? updatedRequest : item
  ));
  tenantData.schedules = tenantData.schedules.map((schedule) => (
    String(schedule.id) === String(request.scheduleId)
      ? {
          ...schedule,
          messages: updatedRequest.messages,
        }
      : schedule
  ));

  const notification = createVaccinationMessageNotification(updatedRequest, message);
  tenantData.notifications.push(notification);

  if (senderType === "ADMIN") {
    const vaccinator = tenantData.vaccinators.find((item) => matchesVaccinator(item, updatedRequest)) || updatedRequest;
    await queueVaccinatorExternalNotification(tenantData, notification, vaccinator, {
      dedupeKey: `vaccination-message:${updatedRequest.id}:${message.id}`,
    });
  } else {
    await queueFarmExternalNotification(data, targetTenantId, tenantData, notification, {
      dedupeKey: `vaccination-message:${updatedRequest.id}:${message.id}`,
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
    temperatureStatus: String(req.body.temperatureStatus || "NORMAL").toUpperCase(),
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

  const accessError = validateVaccinatorRequestAccess(req, updatedRequest);

  if (accessError) {
    return res.status(403).json({
      message: accessError,
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

app.get("/api/vacitech/mortality", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  res.json((tenantData.mortalityRecords || []).filter((record) => !record.deletedAt));
});

app.post("/api/vacitech/mortality", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const record = normalizeMortalityRecord(req.body, {
    tenantId: req.tenantId,
    responsible: req.account?.name || req.account?.email || "",
  });

  if (!record.date || !record.birdLotId || record.deaths <= 0) {
    return res.status(400).json({
      message: "Informe data, lote e quantidade de mortes maior que zero.",
    });
  }

  tenantData.mortalityRecords = [
    record,
    ...(tenantData.mortalityRecords || []),
  ];

  const mortalityAlert = createMortalityAlertIfNeeded(tenantData, record);
  if (mortalityAlert) {
    tenantData.notifications.push(mortalityAlert);
  }

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    record,
    mortalityRecords: tenantData.mortalityRecords.filter((item) => !item.deletedAt),
    notifications: tenantData.notifications,
  });
});

app.put("/api/vacitech/mortality/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const currentRecord = (tenantData.mortalityRecords || []).find((record) => String(record.id) === String(req.params.id));

  if (!currentRecord || currentRecord.deletedAt) {
    return res.status(404).json({
      message: "Registro de mortalidade nao encontrado.",
    });
  }

  const updatedRecord = normalizeMortalityRecord({
    ...currentRecord,
    ...req.body,
    id: currentRecord.id,
    createdAt: currentRecord.createdAt,
  }, {
    tenantId: req.tenantId,
    responsible: currentRecord.responsible || req.account?.name || req.account?.email || "",
  });

  tenantData.mortalityRecords = (tenantData.mortalityRecords || []).map((record) => (
    String(record.id) === String(req.params.id)
      ? {
          ...updatedRecord,
          updatedAt: new Date().toISOString(),
        }
      : record
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    record: updatedRecord,
    mortalityRecords: tenantData.mortalityRecords.filter((item) => !item.deletedAt),
  });
});

app.delete("/api/vacitech/mortality/:id", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const deletedAt = new Date().toISOString();

  tenantData.mortalityRecords = (tenantData.mortalityRecords || []).map((record) => (
    String(record.id) === String(req.params.id)
      ? {
          ...record,
          deletedAt,
          deletedBy: req.account?.name || req.account?.email || "Sistema",
        }
      : record
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
    mortalityRecords: tenantData.mortalityRecords.filter((item) => !item.deletedAt),
  });
});

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

});

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
    tenantId: req.tenantId,
    responsible: req.account?.name || req.account?.email || "",
  });

  if (!record.type || !record.date || !record.product) {
    return res.status(400).json({
      message: "Informe tipo, data e produto do registro sanitario.",
    });
  }

    record,
  ];

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    record,
  });
});

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);

  if (!currentRecord || currentRecord.deletedAt) {
    return res.status(404).json({
      message: "Registro sanitario nao encontrado.",
    });
  }

    ...currentRecord,
    ...req.body,
    id: currentRecord.id,
    createdAt: currentRecord.createdAt,
  }, {
    tenantId: req.tenantId,
    responsible: currentRecord.responsible || req.account?.name || req.account?.email || "",
  });

    String(record.id) === String(req.params.id)
      ? {
          ...updatedRecord,
          updatedAt: new Date().toISOString(),
        }
      : record
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    record: updatedRecord,
  });
});

  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const deletedAt = new Date().toISOString();

    String(record.id) === String(req.params.id)
      ? {
          ...record,
          deletedAt,
          deletedBy: req.account?.name || req.account?.email || "Sistema",
        }
      : record
  ));

  data.tenants[req.tenantId] = tenantData;
  await writeVacitechData(data);

  res.json({
    success: true,
  });
});

  const data = await readVacitechData();
  const tenantData = await syncOverdueVaccinationAlerts(data, req.tenantId);

  res.json(agenda);
});

app.get("/api/vacitech/lots/:id/traceability", async (req, res) => {
  const data = await readVacitechData();
  const tenantData = getTenantData(data, req.tenantId);
  const lot = await prisma.birdLot.findFirst({
    where: {
      id: Number(req.params.id),
      tenantId: req.tenantId,
    },
  });

  if (!lot) {
    return res.status(404).json({
      message: "Lote nao encontrado.",
    });
  }

  res.json(buildLotTraceability(lot, tenantData));
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

  if (!hasActiveVaccinatorLink(data, vaccinator)) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
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

  if (!hasActiveVaccinatorLink(data, vaccinator)) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
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

  if (!hasActiveVaccinatorLink(data, vaccinator)) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
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

  if (!hasActiveVaccinatorLink(data, vaccinator)) {
    return res.status(402).json({
      message: "Assinatura vencida. A granja precisa renovar a mensalidade para liberar o app do vacinador.",
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

    if (isTenantInactive(tenantData)) {
      return res.status(403).json({
        message: "Esta granja esta inativa. Fale com o administrador geral do ImmuHen.",
      });
    }

    if (!subscription.active) {
      return res.status(402).json({
        message: "Assinatura vencida. Renove o acesso mensal para continuar usando.",
        subscription,
      });
    }

    req.account = normalizeAccountAccess(accountContext.account);

    if (!hasPermission(req.account, ACCESS_MODULES.AVES)) {
      return res.status(403).json({
        message: "Seu usuario nao tem permissao para acessar aves.",
      });
    }

    req.tenantId = req.account.tenantId;
    await syncTenantRecord(req.tenantId, tenantData);
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
    tenantSettings: {
      name: "",
      identifier: "",
      domain: "",
      logoDataUrl: "",
      primaryColor: defaultTenantPrimaryColor,
      secondaryColor: defaultTenantSecondaryColor,
      status: TENANT_STATUS.ACTIVE,
    },
    adminAccess: {
      passwordHash: "",
      updatedAt: "",
    },
    vaccines: [],
    entries: [],
    outputs: [],
    stockAlertLevels: {},
    vaccineEditRequests: [],
    entryEditRequests: [],
    vaccineAuditLog: [],
    vaccinators: [],
    schedules: [],
    requests: [],
    completedVaccinations: [],
    mortalityRecords: [],
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
  const normalizedData = normalizeVacitechData(data);

  await prisma.appState.upsert({
    where: { id: appStateId },
    update: {
      data: normalizedData,
    },
    create: {
      id: appStateId,
      data: normalizedData,
    },
  });

  await syncTenantRecords(normalizedData);
}

function shouldUseDatabaseState() {
  return stateStorage === "database" || stateStorage === "db" || stateStorage === "postgres";
}

function normalizeVacitechData(data = {}) {
  const migratedData = migrateVacitechData(data);

  return {
    ...getEmptyVacitechData(),
    ...migratedData,
    accounts: Array.isArray(migratedData.accounts)
      ? migratedData.accounts.map(normalizeAccountAccess)
      : [],
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
    role: "ADMIN",
    permissions: getDefaultPermissionsForRole("ADMIN"),
    createdAt: new Date().toISOString(),
  };

  return {
    ...data,
    accounts: [account],
    tenants: {
      [tenantId]: {
        ...getEmptyTenantData(),
        farmProfile: data.farmProfile || {},
        tenantSettings: normalizeTenantSettings(tenantId, {
          tenantSettings: data.tenantSettings || {},
          farmProfile: data.farmProfile || {},
        }),
        vaccines: Array.isArray(data.vaccines) ? data.vaccines : [],
        entries: Array.isArray(data.entries) ? data.entries : [],
        outputs: Array.isArray(data.outputs) ? data.outputs : [],
        stockAlertLevels: data.stockAlertLevels && typeof data.stockAlertLevels === "object" && !Array.isArray(data.stockAlertLevels)
          ? data.stockAlertLevels
          : {},
        vaccineEditRequests: Array.isArray(data.vaccineEditRequests) ? data.vaccineEditRequests : [],
        entryEditRequests: Array.isArray(data.entryEditRequests) ? data.entryEditRequests : [],
        vaccineAuditLog: Array.isArray(data.vaccineAuditLog) ? data.vaccineAuditLog : [],
        vaccinators: Array.isArray(data.vaccinators) ? data.vaccinators : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
        requests: Array.isArray(data.requests) ? data.requests : [],
        completedVaccinations: Array.isArray(data.completedVaccinations) ? data.completedVaccinations : [],
        mortalityRecords: Array.isArray(data.mortalityRecords) ? data.mortalityRecords : [],
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
  const rawTenantData = data.tenants?.[tenantId] || {};

  return {
    ...getEmptyTenantData(),
    ...rawTenantData,
    farmProfile: rawTenantData.farmProfile || {},
    tenantSettings: normalizeTenantSettings(tenantId, rawTenantData),
    adminAccess: rawTenantData.adminAccess && typeof rawTenantData.adminAccess === "object"
      ? rawTenantData.adminAccess
      : { passwordHash: "", updatedAt: "" },
    vaccines: Array.isArray(rawTenantData.vaccines)
      ? rawTenantData.vaccines
      : [],
    entries: Array.isArray(rawTenantData.entries)
      ? rawTenantData.entries
      : [],
    outputs: Array.isArray(rawTenantData.outputs)
      ? rawTenantData.outputs
      : [],
    stockAlertLevels: rawTenantData.stockAlertLevels && typeof rawTenantData.stockAlertLevels === "object" && !Array.isArray(rawTenantData.stockAlertLevels)
      ? rawTenantData.stockAlertLevels
      : {},
    vaccineEditRequests: Array.isArray(rawTenantData.vaccineEditRequests)
      ? rawTenantData.vaccineEditRequests
      : [],
    entryEditRequests: Array.isArray(rawTenantData.entryEditRequests)
      ? rawTenantData.entryEditRequests
      : [],
    vaccineAuditLog: Array.isArray(rawTenantData.vaccineAuditLog)
      ? rawTenantData.vaccineAuditLog
      : [],
    vaccinators: Array.isArray(rawTenantData.vaccinators)
      ? rawTenantData.vaccinators
      : [],
    schedules: Array.isArray(rawTenantData.schedules)
      ? rawTenantData.schedules
      : [],
    requests: Array.isArray(rawTenantData.requests)
      ? rawTenantData.requests
      : [],
    completedVaccinations: Array.isArray(rawTenantData.completedVaccinations)
      ? rawTenantData.completedVaccinations
      : [],
    mortalityRecords: Array.isArray(rawTenantData.mortalityRecords)
      ? rawTenantData.mortalityRecords
      : [],
      : [],
    notifications: Array.isArray(rawTenantData.notifications)
      ? rawTenantData.notifications
      : [],
    notificationOutbox: Array.isArray(rawTenantData.notificationOutbox)
      ? rawTenantData.notificationOutbox
      : [],
    subscription: rawTenantData.subscription || createInitialSubscription(),
    payments: Array.isArray(rawTenantData.payments)
      ? rawTenantData.payments
      : [],
  };
}

function sanitizeTenantIdentifier(value, fallback = "") {
  const withoutUrl = String(value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
  const identifier = String(withoutUrl || fallback || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return identifier || String(fallback || "").trim().toLowerCase() || `granja-${Date.now()}`;
}

function normalizeTenantName(value, fallback = "Granja") {
  const name = String(value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return name || String(fallback || "Granja").trim() || "Granja";
}

function normalizeTenantDomain(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  const urlStart = rawValue.search(/https?:\/\//i);
  const cleanedValue = urlStart >= 0 ? rawValue.slice(urlStart) : rawValue;

  try {
    return new URL(cleanedValue.includes("://") ? cleanedValue : `https://${cleanedValue}`).hostname || "";
  } catch (error) {
    return cleanedValue
      .replace(/^https?:\/\//i, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

function createTenantIdentifier(name, tenantId) {
  const base = sanitizeTenantIdentifier(name, tenantId);

  return base || sanitizeTenantIdentifier(tenantId);
}

function normalizeHexColor(value, fallback) {
  const color = String(value || "").trim();

  return /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : fallback;
}

function normalizeTenantStatus(value) {
  const status = String(value || TENANT_STATUS.ACTIVE).trim().toUpperCase();

  return status === TENANT_STATUS.INACTIVE
    ? TENANT_STATUS.INACTIVE
    : TENANT_STATUS.ACTIVE;
}

function normalizeTenantSettings(tenantId, tenantData = {}) {
  const settings = tenantData.tenantSettings && typeof tenantData.tenantSettings === "object"
    ? tenantData.tenantSettings
    : {};
  const farmProfile = tenantData.farmProfile && typeof tenantData.farmProfile === "object"
    ? tenantData.farmProfile
    : {};

  return {
    name: normalizeTenantName(settings.name || farmProfile.farmName, tenantId || "Granja"),
    identifier: sanitizeTenantIdentifier(settings.identifier || farmProfile.identifier, tenantId),
    domain: normalizeTenantDomain(settings.domain || farmProfile.domain || ""),
    logoDataUrl: String(settings.logoDataUrl || farmProfile.logoDataUrl || "").trim(),
    primaryColor: normalizeHexColor(settings.primaryColor || farmProfile.primaryColor, defaultTenantPrimaryColor),
    secondaryColor: normalizeHexColor(settings.secondaryColor || farmProfile.secondaryColor, defaultTenantSecondaryColor),
    status: normalizeTenantStatus(settings.status || farmProfile.status || (tenantData.archivedAt ? TENANT_STATUS.INACTIVE : TENANT_STATUS.ACTIVE)),
  };
}

function getTenantPublicConfig(tenantId, tenantData = {}) {
  const settings = normalizeTenantSettings(tenantId, tenantData);

  return {
    tenantId,
    ...settings,
  };
}

function isTenantIdentifierInUse(data, identifier, excludeTenantId = "") {
  const normalizedIdentifier = sanitizeTenantIdentifier(identifier);

  return Object.entries(data.tenants || {}).some(([tenantId]) => (
    tenantId !== excludeTenantId &&
    normalizeTenantSettings(tenantId, getTenantData(data, tenantId)).identifier === normalizedIdentifier
  ));
}

function mergeTenantSettingsIntoProfile(profile = {}, settings = {}) {
  return {
    ...profile,
    farmName: settings.name || profile.farmName || "",
    identifier: settings.identifier || profile.identifier || "",
    domain: settings.domain || profile.domain || "",
    logoDataUrl: settings.logoDataUrl || profile.logoDataUrl || "",
    primaryColor: settings.primaryColor || profile.primaryColor || defaultTenantPrimaryColor,
    secondaryColor: settings.secondaryColor || profile.secondaryColor || defaultTenantSecondaryColor,
    status: settings.status || profile.status || TENANT_STATUS.ACTIVE,
  };
}

function isTenantInactive(tenantData = {}) {
  return normalizeTenantSettings("", tenantData).status === TENANT_STATUS.INACTIVE;
}

async function syncTenantRecord(tenantId, tenantData) {
  if (!shouldUseDatabaseState() || !tenantId) {
    return;
  }

  const settings = normalizeTenantSettings(tenantId, tenantData);

  try {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: {
        name: settings.name,
        identifier: settings.identifier,
        domain: settings.domain || null,
        logoDataUrl: settings.logoDataUrl || null,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        status: settings.status,
      },
      create: {
        id: tenantId,
        name: settings.name,
        identifier: settings.identifier,
        domain: settings.domain || null,
        logoDataUrl: settings.logoDataUrl || null,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        status: settings.status,
      },
    });
  } catch (error) {
    console.log(`Tenant sync ignored for ${tenantId}: ${error.message || error}`);
  }
}

async function syncTenantRecords(data = {}) {
  if (!shouldUseDatabaseState()) {
    return;
  }

  await Promise.all(
    Object.entries(data.tenants || {}).map(([tenantId, tenantData]) => (
      syncTenantRecord(tenantId, getTenantData(data, tenantId))
    ))
  );
}

async function deleteTenantRecord(tenantId) {
  if (!shouldUseDatabaseState() || !tenantId) {
    return;
  }

  try {
    await prisma.tenant.delete({
      where: { id: tenantId },
    });
  } catch (error) {
    console.log(`Tenant delete ignored for ${tenantId}: ${error.message || error}`);
  }
}

function normalizeRole(role) {
  const rawRole = String(role || "FUNCIONARIO").trim();
  const upperRole = rawRole.toUpperCase();

  if (ROLE_DEFINITIONS[upperRole]) {
    return upperRole;
  }

  return LEGACY_ROLE_ALIASES[rawRole.toLowerCase()] || "FUNCIONARIO";
}

function getDefaultPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);

  return [...(ROLE_DEFINITIONS[normalizedRole]?.permissions || ROLE_DEFINITIONS.FUNCIONARIO.permissions)];
}

function normalizePermissions(permissions, role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "ADMIN") {
    return getDefaultPermissionsForRole("ADMIN");
  }

  const source = Array.isArray(permissions) && permissions.length > 0
    ? permissions
    : getDefaultPermissionsForRole(normalizedRole);

  return Array.from(new Set(
    source
      .map((permission) => String(permission || "").trim().toUpperCase())
      .filter((permission) => ALL_ACCESS_MODULES.includes(permission))
  ));
}

function normalizeAccountAccess(account) {
  if (!account) {
    return null;
  }

  const role = normalizeRole(account.role || "FUNCIONARIO");

  return {
    ...account,
    role,
    permissions: normalizePermissions(account.permissions, role),
  };
}

function getTenantAccounts(data, tenantId) {
  return (data.accounts || [])
    .filter((account) => account.tenantId === tenantId)
    .map(normalizeAccountAccess);
}

function getRoleDefinitionsPayload() {
  return Object.entries(ROLE_DEFINITIONS).map(([role, definition]) => ({
    role,
    label: definition.label,
    permissions: [...definition.permissions],
  }));
}

function hasPermission(account, permission) {
  const normalizedAccount = normalizeAccountAccess(account);

  if (!normalizedAccount) {
    return false;
  }

  if (normalizedAccount.role === "ADMIN") {
    return true;
  }

  return normalizedAccount.permissions.includes(String(permission || "").trim().toUpperCase());
}

function hasAnyPermission(account, permissions = []) {
  return permissions.some((permission) => hasPermission(account, permission));
}

function normalizeSaasRole(role) {
  const normalizedRole = String(role || "").trim().toUpperCase();

  if (Object.values(SAAS_ROLES).includes(normalizedRole)) {
    return normalizedRole;
  }

  if (normalizedRole === "ADMIN") {
    return SAAS_ROLES.ADMIN_GRANJA;
  }

  if (normalizedRole === "GERENTE" || normalizedRole === "FUNCIONARIO") {
    return SAAS_ROLES.FUNCIONARIO;
  }

  return SAAS_ROLES.VISUALIZADOR;
}

function getAccountActionPermissions(account) {
  const normalizedAccount = normalizeAccountAccess(account);

  if (!normalizedAccount) {
    return [];
  }

  const saasRole = normalizeSaasRole(normalizedAccount.saasRole || normalizedAccount.role);
  const rolePermissions = ROLE_ACTION_PERMISSIONS[saasRole] || [];
  const directPermissions = Array.isArray(normalizedAccount.actionPermissions)
    ? normalizedAccount.actionPermissions
    : [];

  return Array.from(new Set([...rolePermissions, ...directPermissions]))
    .filter((permission) => ALL_ACTION_PERMISSIONS.includes(permission));
}

function hasActionPermission(account, permission) {
  return getAccountActionPermissions(account).includes(permission);
}

function requireTenant(req, res, next) {
  const tenantId = req.tenantId || req.account?.tenantId;

  if (!tenantId) {
    return res.status(403).json({
      message: "Tenant/granja nao identificado para esta operacao.",
    });
  }

  if (normalizeSaasRole(req.account?.saasRole || req.account?.role) === SAAS_ROLES.ADMIN_GLOBAL) {
    return res.status(403).json({
      message: "ADMIN_GLOBAL deve usar apenas rotas globais.",
    });
  }

  req.tenantId = tenantId;
  return next();
}

function requireActionPermission(permission) {
  return (req, res, next) => {
    if (!hasActionPermission(req.account, permission)) {
      return res.status(403).json({
        message: "Seu usuario nao tem permissao para esta acao.",
        requiredPermission: permission,
      });
    }

    return next();
  };
}

async function recordAuditLog({
  tenantId,
  userId,
  action,
  entity,
  entityId,
  oldValue,
  newValue,
  ip,
  userAgent,
} = {}) {
  if (!action || !entity) {
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId || null,
        userId: userId || null,
        action: String(action),
        entity: String(entity),
        entityId: entityId ? String(entityId) : null,
        oldValue: oldValue === undefined ? undefined : oldValue,
        newValue: newValue === undefined ? undefined : newValue,
        ip: ip || null,
        userAgent: userAgent || null,
      },
    });
  } catch (error) {
    console.log(`Audit log ignored: ${error.message || error}`);
  }
}

function tagItemsWithTenant(items = [], tenantId = "") {
  return items.map((item) => (
    item && typeof item === "object"
      ? {
          ...item,
          tenantId,
        }
      : item
  ));
}

function filterItemsForTenant(items = [], tenantId = "") {
  return items.filter((item) => (
    !item ||
    typeof item !== "object" ||
    !item.tenantId ||
    String(item.tenantId) === String(tenantId)
  ));
}

function getVacitechRoutePermissions(req) {
  const requestPath = req.path || "";

  if (requestPath === "/state") {
    return [];
  }

  if (requestPath.startsWith("/users")) {
    return [ACCESS_MODULES.ADMINISTRADOR];
  }

  if (requestPath === "/chief-access" || requestPath === "/admin-access-password") {
    return [ACCESS_MODULES.ADMINISTRADOR];
  }

  if (requestPath === "/stock-access") {
    return [ACCESS_MODULES.ESTOQUE];
  }

  if (requestPath.startsWith("/stock-alerts")) {
    return [ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.ENTRADAS];
  }

  if (requestPath === "/inventory-state") {
    return [
      ACCESS_MODULES.VACINAS,
      ACCESS_MODULES.ENTRADAS,
      ACCESS_MODULES.ESTOQUE,
      ACCESS_MODULES.FINANCEIRO,
      ACCESS_MODULES.PROGRAMA,
      ACCESS_MODULES.ADMINISTRADOR,
    ];
  }

  if (requestPath === "/farm-profile" || requestPath === "/tenant-settings") {
    return [ACCESS_MODULES.CONFIGURACOES];
  }

  if (requestPath.startsWith("/vaccinators")) {
    return [ACCESS_MODULES.VACINADORES];
  }

  if (requestPath.startsWith("/schedules")) {
    return [ACCESS_MODULES.PROGRAMA];
  }

  if (requestPath.startsWith("/mortality")) {
    return [ACCESS_MODULES.AVES];
  }

  if (requestPath.startsWith("/lots")) {
    return [ACCESS_MODULES.AVES];
  }

  if (requestPath.startsWith("/requests")) {
    return [ACCESS_MODULES.SOLICITACOES, ACCESS_MODULES.PROGRAMA];
  }

  if (requestPath.startsWith("/notifications")) {
    return [ACCESS_MODULES.CONFIGURACOES, ACCESS_MODULES.SOLICITACOES, ACCESS_MODULES.ESTOQUE];
  }

  return [];
}

function filterTenantDataForAccount(tenantData, account) {
  const tenantId = account?.tenantId || "";
  const filteredData = {
    ...tenantData,
    adminAccess: {
      updatedAt: tenantData?.adminAccess?.updatedAt || "",
    },
    vaccines: filterItemsForTenant(tenantData.vaccines || [], tenantId),
    entries: filterItemsForTenant(tenantData.entries || [], tenantId),
    outputs: filterItemsForTenant(tenantData.outputs || [], tenantId),
    vaccineEditRequests: filterItemsForTenant(tenantData.vaccineEditRequests || [], tenantId),
    entryEditRequests: filterItemsForTenant(tenantData.entryEditRequests || [], tenantId),
    vaccineAuditLog: filterItemsForTenant(tenantData.vaccineAuditLog || [], tenantId),
  };

  if (!hasPermission(account, ACCESS_MODULES.VACINAS)) {
    filteredData.vaccines = [];
    filteredData.vaccineEditRequests = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.ENTRADAS, ACCESS_MODULES.FINANCEIRO, ACCESS_MODULES.ADMINISTRADOR])) {
    filteredData.entries = [];
    filteredData.entryEditRequests = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.RELATORIOS, ACCESS_MODULES.ADMINISTRADOR])) {
    filteredData.outputs = [];
  }

  if (!hasPermission(account, ACCESS_MODULES.ESTOQUE)) {
    filteredData.stockAlertLevels = {};
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.RELATORIOS, ACCESS_MODULES.ADMINISTRADOR])) {
    filteredData.vaccineAuditLog = [];
    filteredData.completedVaccinations = [];
  }

  if (!hasPermission(account, ACCESS_MODULES.AVES)) {
    filteredData.mortalityRecords = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.SOLICITACOES, ACCESS_MODULES.ADMINISTRADOR])) {
  }

  if (!hasPermission(account, ACCESS_MODULES.VACINADORES)) {
    filteredData.vaccinators = [];
  }

  if (!hasPermission(account, ACCESS_MODULES.PROGRAMA)) {
    filteredData.schedules = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.SOLICITACOES, ACCESS_MODULES.PROGRAMA, ACCESS_MODULES.ESTOQUE])) {
    filteredData.requests = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.CONFIGURACOES, ACCESS_MODULES.SOLICITACOES, ACCESS_MODULES.ESTOQUE, ACCESS_MODULES.ADMINISTRADOR])) {
    filteredData.notifications = [];
    filteredData.notificationOutbox = [];
  }

  if (!hasAnyPermission(account, [ACCESS_MODULES.FINANCEIRO, ACCESS_MODULES.ADMINISTRADOR])) {
    filteredData.payments = [];
  }

  return filteredData;
}

function pickStateFields(data, fieldsQuery) {
  const fields = String(fieldsQuery || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    return data;
  }

  const allowedFields = new Set([
    "farmProfile",
    "tenantSettings",
    "subscription",
    "adminAccess",
    "vaccines",
    "entries",
    "outputs",
    "stockAlertLevels",
    "vaccineEditRequests",
    "entryEditRequests",
    "vaccineAuditLog",
    "vaccinators",
    "schedules",
    "requests",
    "completedVaccinations",
    "mortalityRecords",
    "notifications",
    "notificationOutbox",
    "payments",
  ]);
  const selectedFields = new Set(fields);

  return Array.from(selectedFields).reduce((payload, field) => {
    if (allowedFields.has(field) && Object.prototype.hasOwnProperty.call(data, field)) {
      payload[field] = data[field];
    }

    return payload;
  }, {});
}

function requireAdminUserManagement(req, res, next) {
  if (!isAdminAccount(req.account)) {
    return res.status(403).json({
      message: "Apenas usuario ADMIN pode gerenciar usuarios e permissoes.",
    });
  }

  return next();
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

function verifyAdminAccessPassword(password, account, tenantData) {
  const adminPasswordHash = tenantData?.adminAccess?.passwordHash;

  if (adminPasswordHash) {
    return verifyPassword(password, adminPasswordHash);
  }

  return verifyPassword(password, account.passwordHash);
}

function isAdminAccount(account) {
  return normalizeAccountAccess(account)?.role === "ADMIN";
}

function hashPasswordWithSecret(password, secret) {
  return crypto
    .createHash("sha256")
    .update(`${secret}:${password}`)
    .digest("hex");
}

function createAuthToken(account) {
  const normalizedAccount = normalizeAccountAccess(account);
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    accessType: "TENANT_USER",
    accountId: normalizedAccount.id,
    tenantId: normalizedAccount.tenantId,
    email: normalizedAccount.email,
    role: normalizedAccount.role,
    iat: issuedAt,
  };

  if (authTokenTtlSeconds > 0) {
    tokenPayload.exp = issuedAt + authTokenTtlSeconds;
  }

  const payload = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
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

    if (parsedPayload.exp && Date.now() >= Number(parsedPayload.exp) * 1000) {
      return null;
    }

    const account = data.accounts.find((item) => (
      item.id === parsedPayload.accountId &&
      item.tenantId === parsedPayload.tenantId
    ));

    return account ? { account: normalizeAccountAccess(account) } : null;
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
    (req.method === "POST" && /^\/requests\/[^/]+\/messages$/.test(req.path)) ||
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
        : matchesVaccinatorCredential(item, search) || sameContact(item, search)
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

function hasActiveVaccinatorLink(data, vaccinator) {
  return Object.entries(data.tenants || {}).some(([tenantId, rawTenantData]) => {
    const tenantData = getTenantData(data, tenantId);

    if (isTenantArchived(tenantData)) {
      return false;
    }

    const linked = tenantData.vaccinators.some((item) => (
      matchesVaccinator(item, vaccinator) || matchesVaccinatorEmail(item, vaccinator)
    ));

    return linked && getSubscriptionStatus(tenantData.subscription).active;
  });
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

  if (status === "AGUARDANDO_CONFIRMACAO_ADMIN") {
    return {
      completedAt: nowLabel,
      completedAtIso: nowIso,
      awaitingAdminConfirmationAt: nowLabel,
      awaitingAdminConfirmationAtIso: nowIso,
    };
  }

  if (status === "AJUSTE_SOLICITADO") {
    return {
      adjustmentRequestedAt: nowLabel,
      adjustmentRequestedAtIso: nowIso,
    };
  }

  if (status === "CONCLUIDA_CONFIRMADA") {
    return {
      systemConfirmedAt: nowLabel,
      systemConfirmedAtIso: nowIso,
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
    cpf: String(data.cpf || data.document || "").trim(),
    code: String(data.code || data.codigo || "").trim(),
    notificationContact: String(data.notificationContact || "").trim(),
    status: data.status || "ATIVO",
  };
}

function normalizeDateInput(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    return parsed.toISOString().split("T")[0];
  }

  return text.slice(0, 10);
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getDaysUntil(dateValue) {
  const date = new Date(`${normalizeDateInput(dateValue)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date(`${getTodayKey()}T00:00:00`);

  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getCurrentStockForVaccine(tenantData, vaccineId) {
  const entries = tenantData.entries || [];
  const outputs = tenantData.outputs || [];
  const totalEntries = entries
    .filter((entry) => String(entry.vaccineId) === String(vaccineId))
    .reduce((total, entry) => total + Number(entry.doses || 0), 0);
  const totalOutputs = outputs
    .filter((output) => String(output.vaccineId) === String(vaccineId) && !output.clearedAt)
    .reduce((total, output) => total + Number(output.doses || 0), 0);

  return totalEntries - totalOutputs;
}

function normalizeMortalityRecord(value = {}, context = {}) {
  const now = new Date();
  const deaths = Number(String(value.deaths ?? value.quantidade ?? value.mortes ?? "0").replace(",", "."));

  return {
    id: String(value.id || `mortality-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`),
    tenantId: context.tenantId || value.tenantId || "",
    date: normalizeDateInput(value.date || value.data) || getTodayKey(),
    birdLotId: String(value.birdLotId || value.loteId || value.lotId || ""),
    birdLotName: String(value.birdLotName || value.lote || value.lotName || "").trim(),
    initialBirds: Number(value.initialBirds || value.avesAlojadas || 0),
    deaths: Number.isFinite(deaths) ? Math.max(0, deaths) : 0,
    observation: String(value.observation || value.observacao || value.notes || "").trim(),
    responsible: String(value.responsible || value.responsavel || context.responsible || "").trim(),
    createdAt: value.createdAt || now.toISOString(),
    updatedAt: value.updatedAt || now.toISOString(),
    deletedAt: value.deletedAt || "",
    deletedBy: value.deletedBy || "",
  };
}

function getActiveMortalityRecords(tenantData, birdLotId = "") {
  return (tenantData.mortalityRecords || []).filter((record) => (
    !record.deletedAt &&
    (!birdLotId || String(record.birdLotId) === String(birdLotId))
  ));
}

function getMortalitySummaryForLot(lot, tenantData) {
  const records = getActiveMortalityRecords(tenantData, lot.id);
  const initialBirds = Number(lot.avesAlojadas || 0);
  const totalDeaths = records.reduce((total, record) => total + Number(record.deaths || 0), 0);
  const currentBirds = Math.max(0, initialBirds - totalDeaths);
  const survivalRate = initialBirds > 0
    ? (currentBirds / initialBirds) * 100
    : 0;

  return {
    initialBirds,
    totalDeaths,
    currentBirds,
    survivalRate,
    records,
  };
}

function createMortalityAlertIfNeeded(tenantData, record) {
  const initialBirds = Number(record.initialBirds || 0);
  const existingDeaths = getActiveMortalityRecords(tenantData, record.birdLotId)
    .filter((item) => String(item.id) !== String(record.id))
    .reduce((total, item) => total + Number(item.deaths || 0), 0);
  const totalDeaths = existingDeaths + Number(record.deaths || 0);
  const mortalityRate = initialBirds > 0
    ? (totalDeaths / initialBirds) * 100
    : Number(record.deaths || 0) >= 50
      ? 3
      : 0;

  if (mortalityRate < 3) {
    return null;
  }

  return {
    id: `mortality-alert-${record.id}`,
    type: "HIGH_MORTALITY",
    title: "Mortalidade alta",
    message: `Lote ${record.birdLotName || record.birdLotId} atingiu ${mortalityRate.toFixed(2)}% de mortalidade acumulada.`,
    birdLotId: record.birdLotId,
    birdLotName: record.birdLotName,
    mortalityRate,
    createdAt: new Date().toLocaleString("pt-BR"),
    createdAtIso: new Date().toISOString(),
  };
}

function buildLotTraceability(lot, tenantData) {
  const mortality = getMortalitySummaryForLot(lot, tenantData);
  const lotId = String(lot.id);
  const schedules = (tenantData.schedules || []).filter((schedule) => String(schedule.birdLotId || "") === lotId);
  const requests = (tenantData.requests || []).filter((request) => String(request.birdLotId || "") === lotId);
  const completedVaccinations = (tenantData.completedVaccinations || []).filter((record) => String(record.birdLotId || "") === lotId);
  const temperaturePhotos = [
    ...requests,
    ...completedVaccinations,
  ]
    .filter((record) => record.temperaturePhoto || record.temperatureNotes)
    .map((record) => ({
      requestId: record.id,
      scheduleId: record.scheduleId || "",
      vaccine: (record.vaccineUsages || record.actualVaccineUsages || []).map((usage) => usage.vacina).filter(Boolean).join(", "),
      photo: record.temperaturePhoto || "",
      notes: record.temperatureNotes || "",
      status: record.temperatureStatus || "",
      source: record.temperaturePhotoSource || "",
      capturedAt: record.temperaturePhotoCapturedAt || "",
      uploadedAt: record.temperaturePhotoUploadedAt || "",
    }));

  return {
    lot,
    summary: {
      initialBirds: mortality.initialBirds,
      totalDeaths: mortality.totalDeaths,
      currentBirds: mortality.currentBirds,
      survivalRate: mortality.survivalRate,
    },
    vaccinations: [
      ...completedVaccinations,
      ...requests,
      ...schedules,
    ],
    mortalityRecords: mortality.records,
    temperaturePhotos,
    stockMovements: (tenantData.outputs || []).filter((output) => (
      String(output.birdLotId || "") === lotId ||
      String(output.birdLotName || output.destino || "").includes(String(lot.id))
    )),
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
      const birdsVaccinated = String(item.birdsVaccinated || item.avesVacinadas || "").trim();
      const requiredCc = Number(item.requiredCc || item.totalCc || calculateRequiredCc(birdsVaccinated, dosePerBirdCc) || 0);
      const requiredFlasks = Number(item.requiredFlasks || item.totalFrascos || calculateRequiredFlasks(flaskCc, birdsVaccinated, dosePerBirdCc) || 0);
      const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);

      return {
        id: String(item.id || `vacina-${index + 1}`),
        vaccineId: String(item.vaccineId || "").trim(),
        vacina: String(item.vacina || item.name || "Vacina").trim(),
        codigo: String(item.codigo || "").trim(),
        fabricante: String(item.fabricante || item.manufacturer || "").trim(),
        doses: Number(item.doses || requiredCc || birdsPerFlask || 0),
        flaskCc,
        dosePerBirdCc,
        birdsVaccinated,
        requiredCc,
        requiredFlasks,
        birdsPerFlask,
        flasks: flaskCc,
        laborCost: parseDecimalValue(item.laborCost ?? item.maoDeObra ?? 0),
        applicationMethod: String(item.applicationMethod || item.via || "").trim(),
      };
    })
    .filter((item) => item.vaccineId && item.doses > 0);
}

function isActiveStockOutput(output = {}) {
  return !output.clearedAt;
}

function getTenantVaccineStock(tenantData = {}, vaccineId = "") {
  const entrada = (tenantData.entries || [])
    .filter((entry) => String(entry.vaccineId) === String(vaccineId))
    .reduce((total, item) => total + Number(item.doses || 0), 0);
  const saida = (tenantData.outputs || [])
    .filter((output) => isActiveStockOutput(output) && String(output.vaccineId) === String(vaccineId))
    .reduce((total, item) => total + Number(item.doses || 0), 0);

  return entrada - saida;
}

function groupDoseTotals(items = [], field = "doses") {
  return items.reduce((totals, item) => {
    const vaccineId = String(item.vaccineId || "").trim();

    if (!vaccineId) {
      return totals;
    }

    totals[vaccineId] = (totals[vaccineId] || 0) + Number(item[field] || 0);
    return totals;
  }, {});
}

function getPlannedOutputsForRequest(tenantData = {}, request = {}) {
  const requestId = String(request.id || "");
  const scheduleId = String(request.scheduleId || "");
  const plannedSources = new Set(["AGENDAMENTO", "SOLICITACAO_DOSES"]);

  return (tenantData.outputs || []).filter((output) => (
    isActiveStockOutput(output) &&
    plannedSources.has(String(output.source || "").toUpperCase()) &&
    (
      (requestId && String(output.requestId || "") === requestId) ||
      (scheduleId && String(output.scheduleId || "") === scheduleId)
    )
  ));
}

function normalizeVaccinationUsageConfirmation(value, request = {}) {
  const sourceItems = Array.isArray(value) && value.length > 0
    ? value
    : buildVaccinationMaterials(request).map((item) => ({
        ...item,
        quantityTaken: item.doses,
        quantityUsed: item.doses,
        quantityReturned: 0,
      }));

  return sourceItems
    .map((item, index) => {
      const quantityUsed = parseDecimalValue(
        item.quantityUsed ??
        item.usedDoses ??
        item.dosesUsed ??
        item.quantidadeUsada ??
        item.usada ??
        item.used ??
        item.doses ??
        0
      );
      const quantityTakenRaw = parseDecimalValue(
        item.quantityTaken ??
        item.takenDoses ??
        item.dosesTaken ??
        item.quantidadeLevada ??
        item.levada ??
        item.taken ??
        item.doses ??
        quantityUsed
      );
      const quantityTaken = quantityTakenRaw > 0 ? quantityTakenRaw : quantityUsed;
      const quantityReturned = Math.max(0, Number((quantityTaken - quantityUsed).toFixed(4)));

      return {
        id: String(item.id || item.vaccineId || `uso-real-${index + 1}`),
        vaccineId: String(item.vaccineId || "").trim(),
        vacina: String(item.vacina || item.name || "Vacina").trim(),
        codigo: String(item.codigo || "").trim(),
        fabricante: String(item.fabricante || item.manufacturer || "").trim(),
        quantityTaken,
        quantityUsed,
        quantityReturned,
        doses: quantityUsed,
        flaskCc: String(item.flaskCc || item.flasks || item.frascos || "").trim(),
        dosePerBirdCc: String(item.dosePerBirdCc || "").trim(),
        birdsVaccinated: String(item.birdsVaccinated || item.avesVacinadas || "").trim(),
        requiredCc: Number(item.requiredCc || item.totalCc || 0),
        requiredFlasks: Number(item.requiredFlasks || item.totalFrascos || 0),
        birdsPerFlask: Number(item.birdsPerFlask || 0),
        applicationMethod: String(item.applicationMethod || item.via || "").trim(),
        notes: String(item.notes || item.observacoes || "").trim(),
      };
    })
    .filter((item) => item.vaccineId && (item.quantityTaken > 0 || item.quantityUsed > 0));
}

function validateVaccinationUsageConfirmation(tenantData, request, usageConfirmation) {
  if (!usageConfirmation.length) {
    return "Informe a vacina usada, quantidade levada e quantidade usada.";
  }

  const invalidNegative = usageConfirmation.find((item) => (
    item.quantityTaken < 0 ||
    item.quantityUsed < 0 ||
    item.quantityReturned < 0
  ));

  if (invalidNegative) {
    return "As quantidades nao podem ser negativas.";
  }

  const invalidUsed = usageConfirmation.find((item) => item.quantityUsed > item.quantityTaken);

  if (invalidUsed) {
    return `A quantidade usada de ${invalidUsed.vacina || "vacina"} nao pode ser maior que a quantidade levada.`;
  }

  const plannedByVaccine = groupDoseTotals(getPlannedOutputsForRequest(tenantData, request), "doses");
  const usedByVaccine = groupDoseTotals(usageConfirmation, "quantityUsed");
  const invalidStock = Object.entries(usedByVaccine).find(([vaccineId, used]) => {
    const availableStock = getTenantVaccineStock(tenantData, vaccineId) + Number(plannedByVaccine[vaccineId] || 0);

    return used > availableStock;
  });

  if (invalidStock) {
    const [vaccineId, used] = invalidStock;
    const vaccine = (tenantData.vaccines || []).find((item) => String(item.id) === String(vaccineId));
    const availableStock = getTenantVaccineStock(tenantData, vaccineId) + Number(plannedByVaccine[vaccineId] || 0);

    return `Quantidade usada maior que o estoque disponivel para ${vaccine?.nome || "a vacina"}. Usado: ${used}, estoque: ${availableStock}.`;
  }

  return "";
}

function applyVaccinationStockUsage(tenantData, request, usageConfirmation, metadata = {}) {
  const actualStockSources = new Set(["VACINACAO_CONFIRMADA_APP", "VACINACAO_CONFIRMADA_ADMIN"]);
  const existingActualOutputs = (tenantData.outputs || []).filter((output) => (
    isActiveStockOutput(output) &&
    actualStockSources.has(String(output.source || "").toUpperCase()) &&
    String(output.requestId || "") === String(request.id)
  ));

  if (request.stockConfirmedAt || existingActualOutputs.length > 0) {
    return {
      actualUsages: Array.isArray(request.actualVaccineUsages) && request.actualVaccineUsages.length > 0
        ? request.actualVaccineUsages
        : usageConfirmation.filter((item) => item.quantityUsed > 0).map((item) => ({
            ...item,
            doses: item.quantityUsed,
          })),
      reversedPlannedOutputs: Array.isArray(request.reversedPlannedOutputs) ? request.reversedPlannedOutputs : [],
      stockConfirmedAt: request.stockConfirmedAt || existingActualOutputs[0]?.createdAt || new Date().toLocaleString("pt-BR"),
      stockConfirmedAtIso: request.stockConfirmedAtIso || new Date().toISOString(),
    };
  }

  const validationMessage = validateVaccinationUsageConfirmation(tenantData, request, usageConfirmation);

  if (validationMessage) {
    return { error: validationMessage };
  }

  const now = metadata.now || new Date();
  const createdAt = now.toLocaleString("pt-BR");
  const plannedOutputs = getPlannedOutputsForRequest(tenantData, request);
  const outputBaseId = Date.now() + 300000;
  const entryBaseId = Date.now() + 400000;
  const actualUsages = usageConfirmation
    .filter((item) => item.quantityUsed > 0)
    .map((item, index) => ({
      ...item,
      id: item.id || `uso-real-${request.id}-${index}`,
      doses: item.quantityUsed,
    }));

  plannedOutputs.forEach((output, index) => {
    tenantData.entries.push({
      id: entryBaseId + index,
      source: "REVERSAO_BAIXA_PLANEJADA",
      vaccineId: output.vaccineId,
      vacina: output.vacina,
      codigo: output.codigo || "-",
      lote: `Reversao ${request.id}`,
      doses: Number(output.doses || 0),
      valorDose: 0,
      valorTotal: 0,
      valor: 0,
      fornecedor: "Sistema",
      observacao: `Reversao de baixa planejada (${output.source || "AGENDAMENTO"}) antes do uso real confirmado pelo vacinador.`,
      requestId: request.id,
      scheduleId: request.scheduleId || "",
      data: now.toLocaleDateString("pt-BR"),
      createdAt,
    });
  });

  actualUsages.forEach((item, index) => {
    tenantData.outputs.push({
      id: outputBaseId + index,
      groupId: `uso-real-${request.id}`,
      source: "VACINACAO_CONFIRMADA_ADMIN",
      scheduleId: request.scheduleId || "",
      requestId: request.id,
      vaccineId: item.vaccineId,
      vacina: item.vacina,
      codigo: item.codigo,
      fabricante: item.fabricante || "",
      doses: item.quantityUsed,
      quantityTaken: item.quantityTaken,
      quantityUsed: item.quantityUsed,
      quantityReturned: item.quantityReturned,
      applicationMethod: item.applicationMethod || request.applicationMethod || "",
      flaskCc: item.flaskCc,
      dosePerBirdCc: item.dosePerBirdCc,
      birdsVaccinated: item.birdsVaccinated,
      requiredCc: item.requiredCc,
      requiredFlasks: item.requiredFlasks,
      birdsPerFlask: item.birdsPerFlask,
      flasks: item.flaskCc,
      birdLotId: request.birdLotId || "",
      birdLotName: request.birdLotName || "",
      programId: request.programId || "",
      programDay: request.programDay || "",
      destino: request.birdLotName || request.farmName || "Vacinacao",
      responsavel: request.vaccinatorName || metadata.responsible || "Vacinador",
      observacao: `Uso real confirmado pelo administrador. Levou ${formatQuantity(item.quantityTaken)} dose(s), usou ${formatQuantity(item.quantityUsed)} dose(s), sobrou ${formatQuantity(item.quantityReturned) || 0} dose(s).`,
      data: now.toLocaleDateString("pt-BR"),
      createdAt,
    });
  });

  tenantData.vaccineAuditLog = [
    {
      id: `audit-vaccination-stock-${Date.now()}`,
      type: "vaccination-stock-confirmed",
      requestId: request.id,
      scheduleId: request.scheduleId || "",
      vaccineName: "Vacinacao concluida",
      reason: "Baixa real de estoque confirmada pelo administrador apos conferencia do app do vacinador.",
      responsible: metadata.responsible || "Administrador",
      usageConfirmation,
      reversedPlannedOutputs: plannedOutputs.map((output) => ({
        id: output.id,
        vaccineId: output.vaccineId,
        vacina: output.vacina,
        doses: Number(output.doses || 0),
        source: output.source || "",
      })),
      createdAt,
    },
    ...(tenantData.vaccineAuditLog || []),
  ];

  return {
    actualUsages,
    reversedPlannedOutputs: plannedOutputs,
    stockConfirmedAt: createdAt,
    stockConfirmedAtIso: now.toISOString(),
  };
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

function calculateRequiredCc(birdsVaccinated, dosePerBirdCc) {
  const birds = parseDecimalValue(birdsVaccinated);
  const dose = parseDecimalValue(dosePerBirdCc);

  if (birds <= 0 || dose <= 0) {
    return 0;
  }

  return Number((birds * dose).toFixed(2));
}

function calculateRequiredFlasks(flaskCc, birdsVaccinated, dosePerBirdCc) {
  const flask = parseDecimalValue(flaskCc);
  const requiredCc = calculateRequiredCc(birdsVaccinated, dosePerBirdCc);

  if (flask <= 0 || requiredCc <= 0) {
    return 0;
  }

  return Math.ceil(requiredCc / flask);
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
  const directCost = Number(record.laborCost || 0);

  if (directCost > 0) {
    return directCost;
  }

  const usageCost = Array.isArray(record.vaccineUsages)
    ? record.vaccineUsages.reduce((total, usage) => (
        total + parseDecimalValue(usage.laborCost ?? usage.maoDeObra ?? 0)
      ), 0)
    : 0;

  if (usageCost > 0) {
    return usageCost;
  }

  return Number(record.programLaborCost || 0) || 0;
}

function getVaccinationTotalDoses(request = {}) {
  return buildVaccinationMaterials(request).reduce((total, usage) => total + Number(usage.doses || 0), 0);
}

function getUsageTechnicalText(item) {
  const flaskCc = String(item.flaskCc || item.flasks || item.frascos || "").trim();
  const dosePerBirdCc = String(item.dosePerBirdCc || "").trim();
  const birdsVaccinated = String(item.birdsVaccinated || item.avesVacinadas || "").trim();
  const requiredCc = Number(item.requiredCc || item.totalCc || calculateRequiredCc(birdsVaccinated, dosePerBirdCc) || 0);
  const requiredFlasks = Number(item.requiredFlasks || item.totalFrascos || calculateRequiredFlasks(flaskCc, birdsVaccinated, dosePerBirdCc) || 0);
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
  const hasActualUsages = Array.isArray(request.actualVaccineUsages) && request.actualVaccineUsages.length > 0;
  const items = [
    ...(hasActualUsages
      ? request.actualVaccineUsages.map((item) => ({
          ...item,
          doses: Number(item.quantityUsed || item.doses || 0),
          source: "Uso real confirmado",
        }))
      : []),
    ...(!hasActualUsages && Array.isArray(request.vaccineUsages)
      ? request.vaccineUsages.map((item) => ({
          ...item,
          source: "Agendamento",
        }))
      : []),
    ...(!hasActualUsages && Array.isArray(request.doseRequest?.confirmedItems)
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
    const birdsVaccinated = String(item.birdsVaccinated || item.avesVacinadas || "").trim();
    const requiredCc = Number(item.requiredCc || item.totalCc || calculateRequiredCc(birdsVaccinated, dosePerBirdCc) || 0);
    const requiredFlasks = Number(item.requiredFlasks || item.totalFrascos || calculateRequiredFlasks(flaskCc, birdsVaccinated, dosePerBirdCc) || 0);
    const birdsPerFlask = Number(item.birdsPerFlask || calculateBirdsPerFlask(flaskCc, dosePerBirdCc) || 0);
    const technicalText = getUsageTechnicalText({
      flaskCc,
      dosePerBirdCc,
      birdsVaccinated,
      requiredCc,
      requiredFlasks,
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

function parseSmtpEndpoint(hostValue, portValue = "") {
  let value = String(hostValue || "").trim();
  let secure = false;

  if (!value) {
    return {
      host: "",
      port: Number(portValue || 0) || 0,
      secure,
    };
  }

  if (value.startsWith("smtps://")) {
    secure = true;
    value = value.replace(/^smtps:\/\//i, "");
  } else {
    value = value.replace(/^smtp:\/\//i, "");
  }

  value = value.replace(/\/+$/, "");

  const hostPortMatch = value.match(/^([^:/]+):(\d+)$/);

  if (hostPortMatch) {
    return {
      host: hostPortMatch[1].trim(),
      port: Number(portValue || hostPortMatch[2] || 0) || 0,
      secure,
    };
  }

  return {
    host: value,
    port: Number(portValue || 0) || 0,
    secure,
  };
}

let smtpTransportPromise = null;

function hasSmtpConfig() {
  return Boolean(smtpHost && smtpUser && smtpPass && notificationFromEmail);
}

function hasResendConfig() {
  return Boolean(resendApiKey && notificationFromEmail);
}

function hasEmailConfig() {
  return hasResendConfig() || hasSmtpConfig();
}

function getEmailDeliveryConfigStatus() {
  return {
    provider: hasResendConfig() && emailProvider === "resend" ? "resend" : "smtp",
    email: hasEmailConfig(),
    smtp: {
      configured: hasSmtpConfig(),
      host: smtpHost ? smtpHost.replace(/^(.{3}).+(.{3})$/, "$1***$2") : "",
      port: smtpPort,
      secure: smtpSecure,
      userConfigured: Boolean(smtpUser),
      fromConfigured: Boolean(notificationFromEmail),
    },
    resend: {
      configured: hasResendConfig(),
      fromConfigured: Boolean(notificationFromEmail),
    },
  };
}

async function createSmtpTransport() {
  const hostConfig = await resolveSmtpHostForTransport();

  return nodemailer.createTransport({
    host: hostConfig.host,
    port: smtpPort,
    secure: smtpSecure,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    family: 4,
    tls: {
      servername: smtpHost,
    },
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

async function resolveSmtpHostForTransport() {
  if (net.isIP(smtpHost)) {
    return { host: smtpHost };
  }

  try {
    const addresses = await dns.promises.resolve4(smtpHost);
    const host = addresses.find(Boolean);

    if (host) {
      return { host };
    }
  } catch (error) {
    console.log(`Nao foi possivel resolver SMTP em IPv4: ${error.message}`);
  }

  return { host: smtpHost };
}

async function getSmtpTransport() {
  if (!smtpHost || !smtpUser || !smtpPass || !notificationFromEmail) {
    return null;
  }

  if (!smtpTransportPromise) {
    smtpTransportPromise = createSmtpTransport();
  }

  return smtpTransportPromise;
}

async function sendEmailWithResend(outboxItem) {
  if (!hasResendConfig()) {
    outboxItem.status = "PENDING_CONFIG";
    outboxItem.lastError = "Configure RESEND_API_KEY e NOTIFICATION_FROM_EMAIL.";
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: notificationFromEmail,
      to: [outboxItem.to],
      subject: outboxItem.subject,
      text: outboxItem.message,
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Nao foi possivel enviar email pelo Resend.");
  }

  outboxItem.providerMessageId = data.id || "";
  return true;
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
      if (hasResendConfig() && emailProvider === "resend") {
        const sentByResend = await sendEmailWithResend(outboxItem);

        if (!sentByResend) {
          return outboxItem;
        }
      } else {
        const transport = await getSmtpTransport();

        if (!transport) {
          outboxItem.status = "PENDING_CONFIG";
          outboxItem.lastError = hasResendConfig()
            ? "EMAIL_PROVIDER esta como SMTP. Configure SMTP ou defina EMAIL_PROVIDER=resend."
            : "Configure SMTP_HOST, SMTP_USER, SMTP_PASS e NOTIFICATION_FROM_EMAIL, ou use RESEND_API_KEY.";
          return outboxItem;
        }

        await transport.sendMail({
          from: notificationFromEmail,
          to: outboxItem.to,
          subject: outboxItem.subject,
          text: outboxItem.message,
        });
      }
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

  if (
    status === "CONCLUIDA" ||
    status === "CONCLUIDA_CONFIRMADA" ||
    status === "AGUARDANDO_CONFIRMACAO_ADMIN" ||
    status === "RECUSADA" ||
    status === "CANCELADA"
  ) {
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

function normalizeCredential(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesVaccinatorCredential(item, search = {}) {
  const credential = normalizeCredential(
    search.credential ||
    search.login ||
    search.code ||
    search.cpf ||
    search.email ||
    search.phone
  );

  if (!credential) {
    return false;
  }

  const credentialDigits = normalizePhone(credential);
  const candidates = [
    item.email,
    item.vaccinatorEmail,
    item.phone,
    item.vaccinatorPhone,
    item.cpf,
    item.document,
    item.code,
    item.codigo,
  ]
    .map((value) => normalizeCredential(value))
    .filter(Boolean);

  return candidates.some((candidate) => (
    candidate === credential ||
    (credentialDigits && normalizePhone(candidate) === credentialDigits)
  ));
}

function validateVaccinatorRequestAccess(req, request) {
  if (req.tenantId) {
    return "";
  }

  const requestVaccinatorId = String(request.vaccinatorId || "").trim();
  const providedVaccinatorId = String(req.body.vaccinatorId || "").trim();

  if (providedVaccinatorId && requestVaccinatorId && providedVaccinatorId !== requestVaccinatorId) {
    return "Este vacinador nao tem permissao para alterar esta vacinacao.";
  }

  const providedEmail = normalizeEmail(req.body.vaccinatorEmail || req.body.email);
  const requestEmail = normalizeEmail(request.vaccinatorEmail);

  if (providedEmail && requestEmail && providedEmail !== requestEmail) {
    return "Este vacinador nao tem permissao para alterar esta vacinacao.";
  }

  const providedPhone = normalizePhone(req.body.vaccinatorPhone || req.body.phone);
  const requestPhone = normalizePhone(request.vaccinatorPhone);

  if (providedPhone && requestPhone && providedPhone !== requestPhone) {
    return "Este vacinador nao tem permissao para alterar esta vacinacao.";
  }

  return "";
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

  if (status === "ACEITA") {
    return "CONFIRMADA";
  }

  if (status === "EM_EXECUCAO") {
    return "EM_ANDAMENTO";
  }

  if (status === "ENVIADA_PARA_CONFERENCIA") {
    return "AGUARDANDO_CONFIRMACAO_ADMIN";
  }

  if (
    status === "CONFIRMADA" ||
    status === "RECUSADA" ||
    status === "EM_ANDAMENTO" ||
    status === "CONCLUIDA" ||
    status === "AGUARDANDO_CONFIRMACAO_ADMIN" ||
    status === "CONCLUIDA_CONFIRMADA" ||
    status === "AJUSTE_SOLICITADO" ||
    status === "CANCELADA"
  ) {
    return status;
  }

  return "PENDENTE";
}

function isAwaitingAdminConfirmationStatus(status) {
  const normalizedStatus = normalizeRequestStatus(status);

  return (
    normalizedStatus === "AGUARDANDO_CONFIRMACAO_ADMIN" ||
    normalizedStatus === "CONCLUIDA"
  );
}

function isClosedVaccinationStatus(status) {
  const normalizedStatus = normalizeRequestStatus(status);

  return (
    normalizedStatus === "CONCLUIDA_CONFIRMADA" ||
    normalizedStatus === "CANCELADA"
  );
}

function isTenantArchived(tenantData) {
  return Boolean(tenantData?.archivedAt);
}

function shouldShowInVaccinatorApp(request) {
  const status = normalizeRequestStatus(request.status);

  return !isClosedVaccinationStatus(status);
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

function createVaccinationAwaitingAdminNotification(request) {
  const usageTotal = (request.actualVaccineUsages || request.usageConfirmation || [])
    .reduce((total, item) => total + Number(item.quantityUsed || item.doses || 0), 0);

  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_AWAITING_ADMIN",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacinacao aguardando confirmacao",
    message: `${request.vaccinatorName || "Vacinador"} enviou a vacinacao para conferencia. Quantidade usada informada: ${formatQuantity(usageTotal) || 0} dose(s).`,
    createdAt: request.awaitingAdminConfirmationAt || request.completedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccinationAdjustmentNotification(request, reason = "") {
  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_ADJUSTMENT_REQUESTED",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Ajuste solicitado na vacinacao",
    message: `A granja solicitou ajuste nas informacoes da vacinacao.${reason ? ` Motivo: ${reason}` : ""}`,
    createdAt: request.adjustmentRequestedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccinationRejectedNotification(request, reason = "") {
  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_REJECTED",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Vacinacao rejeitada",
    message: `A granja rejeitou esta conclusao de vacinacao.${reason ? ` Motivo: ${reason}` : ""}`,
    createdAt: request.rejectedAt || new Date().toLocaleString("pt-BR"),
    read: false,
  };
}

function createVaccinationMessageNotification(request, message) {
  const senderLabel = message.senderType === "ADMIN" ? "Granja" : "Vacinador";

  return {
    id: Date.now() + Math.random(),
    type: "VACCINATION_MESSAGE",
    requestId: request.id,
    scheduleId: request.scheduleId,
    vaccinatorId: request.vaccinatorId,
    vaccinatorName: request.vaccinatorName,
    vaccinatorEmail: request.vaccinatorEmail,
    vaccinatorPhone: request.vaccinatorPhone,
    vaccinatorNotificationContact: request.vaccinatorNotificationContact,
    farmName: request.farmName,
    title: "Nova mensagem na vacinacao",
    message: `${senderLabel}: ${message.text}`,
    createdAt: message.createdAt,
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
        tenantId: data.tenantId || "",
        farmName: data.farmProfile.farmName,
        city: data.farmProfile.city || "",
        document: data.farmProfile.document || "",
        owner: data.farmProfile.owner || "",
        address: data.farmProfile.address || "",
        location: data.farmProfile.location || "",
        logoDataUrl: data.tenantSettings?.logoDataUrl || data.farmProfile.logoDataUrl || "",
        primaryColor: data.tenantSettings?.primaryColor || data.farmProfile.primaryColor || "",
        secondaryColor: data.tenantSettings?.secondaryColor || data.farmProfile.secondaryColor || "",
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
    if (isTenantArchived(tenantData) || !getSubscriptionStatus(tenantData.subscription).active) {
      return;
    }

    const matchedVaccinator = tenantData.vaccinators.find((item) => (
      matchesVaccinator(item, vaccinator) || matchesVaccinatorEmail(item, vaccinator)
    ));

    if (!matchedVaccinator) {
      return;
    }

    if (tenantData.farmProfile?.farmName) {
      const tenantSettings = normalizeTenantSettings(tenantId, tenantData);
      linkedFarms.push({
        tenantId,
        farmName: tenantData.farmProfile.farmName,
        city: tenantData.farmProfile.city || "",
        document: tenantData.farmProfile.document || "",
        owner: tenantData.farmProfile.owner || "",
        address: tenantData.farmProfile.address || "",
        location: tenantData.farmProfile.location || "",
        logoDataUrl: tenantSettings.logoDataUrl || "",
        primaryColor: tenantSettings.primaryColor || "",
        secondaryColor: tenantSettings.secondaryColor || "",
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
    accessType: "GLOBAL_ADMIN",
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
  const normalizedAccount = normalizeAccountAccess(account);

  return {
    id: normalizedAccount.id,
    tenantId: normalizedAccount.tenantId,
    name: normalizedAccount.name,
    email: normalizedAccount.email,
    role: normalizedAccount.role,
    permissions: normalizedAccount.permissions,
    createdAt: normalizedAccount.createdAt || "",
    updatedAt: normalizedAccount.updatedAt || "",
    passwordResetAt: normalizedAccount.passwordResetAt || "",
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
      tenant: getTenantPublicConfig(tenantId, tenantData),
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

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const safeError = getSafeApiError(error);
  console.error(`[${safeError.code}] ${error?.stack || error?.message || error}`);

  return res.status(safeError.status).json({
    message: safeError.message,
    code: safeError.code,
  });
});

function getSafeApiError(error) {
  const message = String(error?.message || "");
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("data transfer quota") ||
    normalizedMessage.includes("exceeded the data transfer quota")
  ) {
    return {
      status: 503,
      code: "DATABASE_TRANSFER_QUOTA_EXCEEDED",
      message: "Banco de dados temporariamente indisponivel: o provedor PostgreSQL excedeu a quota de transferencia. Ajuste o plano/quota do banco ou troque a DATABASE_URL para o banco ativo.",
    };
  }

  if (
    error?.name === "PrismaClientInitializationError" ||
    error?.name === "PrismaClientKnownRequestError" ||
    normalizedMessage.includes("error querying the database")
  ) {
    return {
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "Banco de dados temporariamente indisponivel. Tente novamente em alguns minutos ou verifique o provedor do banco.",
    };
  }

  return {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Erro interno no servidor ImmuHen. Tente novamente em alguns minutos.",
  };
}

/* =========================
   START SERVER
========================= */

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
