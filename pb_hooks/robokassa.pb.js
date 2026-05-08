function getRequiredEnv(name) {
  const value = String($os.getenv(name) || "").trim();
  if (!value) {
    throw new InternalServerError(`Missing required env: ${name}`);
  }
  return value;
}

function getOptionalEnv(name, fallback = "") {
  const value = String($os.getenv(name) || "").trim();
  return value || fallback;
}

function toScalar(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : "";
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function getMergedRequestMap(e) {
  const info = e.requestInfo();
  const query = info.query || {};
  const body = info.body || {};

  return {
    ...query,
    ...body,
  };
}

function collectShpParams(requestMap) {
  const entries = [];

  for (const key of Object.keys(requestMap)) {
    if (!key.startsWith("Shp_")) {
      continue;
    }

    entries.push([key, toScalar(requestMap[key])]);
  }

  entries.sort((left, right) => left[0].localeCompare(right[0], "en"));
  return entries;
}

function resolveHashAlgo() {
  return getOptionalEnv("ROBOKASSA_HASH_ALGO", "md5").toLowerCase();
}

function hashByAlgo(value, algo) {
  if (algo === "md5") {
    return $security.md5(value);
  }

  if (algo === "sha256") {
    return $security.sha256(value);
  }

  if (algo === "sha512") {
    return $security.sha512(value);
  }

  throw new InternalServerError(
    "Unsupported ROBOKASSA_HASH_ALGO. Use md5, sha256 or sha512.",
  );
}

function buildSignatureBase(parts, shpParams) {
  let base = parts.join(":");

  for (const [key, value] of shpParams) {
    base += `:${key}=${value}`;
  }

  return base;
}

function calculatePaymentSignature({
  merchantLogin,
  outSum,
  invId,
  password1,
  shpParams,
}) {
  const algo = resolveHashAlgo();
  const base = buildSignatureBase(
    [merchantLogin, outSum, invId, password1],
    shpParams,
  );

  return hashByAlgo(base, algo);
}

function calculateResultSignature({ outSum, invId, password2, shpParams }) {
  const algo = resolveHashAlgo();
  const base = buildSignatureBase([outSum, invId, password2], shpParams);

  return hashByAlgo(base, algo);
}

function normalizePlanCode(planCode) {
  const normalized = String(planCode || "").trim().toLowerCase();
  if (normalized === "pro" || normalized === "expert") {
    return normalized;
  }
  return "";
}

function normalizeBillingPeriod(period) {
  const normalized = String(period || "").trim().toLowerCase();
  if (normalized === "month" || normalized === "year") {
    return normalized;
  }
  return "";
}

function parsePositiveAmount(rawValue) {
  const normalized = String(rawValue || "").trim().replace(",", ".");
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function formatOutSum(amount) {
  return amount.toFixed(2);
}

function requireAuthUser(e) {
  if (!e.auth) {
    throw new UnauthorizedError("Требуется авторизация");
  }

  return String(e.auth.id || e.auth.getString("id") || "").trim();
}

function generateInvId(ownerId) {
  const ts = Date.now();
  const rand = $security.randomString(6).toLowerCase();
  const shortOwner = ownerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "user";

  return `${ts}_${shortOwner}_${rand}`;
}

function ensureBillingTransactionCollection(app) {
  try {
    return app.findCollectionByNameOrId("billing_transactions");
  } catch (_) {
    throw new InternalServerError(
      "Collection billing_transactions not found. Apply migrations first.",
    );
  }
}

function findBillingTransactionByInvId(app, invId) {
  const found = app.findRecordsByFilter(
    "billing_transactions",
    `inv_id = \"${invId}\"`,
    "",
    1,
    0,
  );

  return found.length > 0 ? found[0] : null;
}

function addSubscriptionPeriod(baseDate, period) {
  const date = new Date(baseDate.getTime());

  if (period === "year") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    return date;
  }

  date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

function resolveSubscriptionBaseDate(userRecord) {
  const rawEndsAt = String(userRecord.get("subscription_ends_at") || "").trim();
  const endsAt = rawEndsAt ? new Date(rawEndsAt) : null;
  const now = new Date();

  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt > now) {
    return endsAt;
  }

  return now;
}

routerAdd("POST", "/api/billing/robokassa/create", (e) => {
  const ownerId = requireAuthUser(e);
  const payload = getMergedRequestMap(e);

  const planCode = normalizePlanCode(payload.plan_code);
  const billingPeriod = normalizeBillingPeriod(payload.billing_period);
  const amount = parsePositiveAmount(payload.amount);

  if (!planCode) {
    throw new BadRequestError("plan_code должен быть pro или expert");
  }

  if (!billingPeriod) {
    throw new BadRequestError("billing_period должен быть month или year");
  }

  if (!amount) {
    throw new BadRequestError("amount должен быть положительным числом");
  }

  const merchantLogin = getRequiredEnv("ROBOKASSA_LOGIN");
  const password1 = getRequiredEnv("ROBOKASSA_PASSWORD1");
  const isTestMode = getOptionalEnv("ROBOKASSA_TEST_MODE", "0") === "1";

  const invId = generateInvId(ownerId);
  const outSum = formatOutSum(amount);

  const shpParams = [
    ["Shp_userId", ownerId],
    ["Shp_plan", planCode],
    ["Shp_period", billingPeriod],
  ];

  const signatureValue = calculatePaymentSignature({
    merchantLogin,
    outSum,
    invId,
    password1,
    shpParams,
  });

  const txCollection = ensureBillingTransactionCollection(e.app);
  const txRecord = new Record(txCollection);

  txRecord.set("owner", ownerId);
  txRecord.set("provider", "robokassa");
  txRecord.set("inv_id", invId);
  txRecord.set("plan_code", planCode);
  txRecord.set("billing_period", billingPeriod);
  txRecord.set("amount", amount);
  txRecord.set("status", "pending");

  e.app.save(txRecord);

  const baseUrl = "https://auth.robokassa.ru/Merchant/Index.aspx";
  const params = [
    ["MerchantLogin", merchantLogin],
    ["OutSum", outSum],
    ["InvId", invId],
    ["Description", `Подписка ${planCode} (${billingPeriod})`],
    ["SignatureValue", signatureValue],
    ["Culture", "ru"],
    ["IsTest", isTestMode ? "1" : "0"],
    ...shpParams,
  ];

  const query = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return e.json(200, {
    invId,
    outSum,
    payUrl: `${baseUrl}?${query}`,
    isTestMode,
  });
});

const handleRobokassaResult = (e) => {
  const payload = getMergedRequestMap(e);

  const outSum = toScalar(payload.OutSum).trim();
  const invId = toScalar(payload.InvId).trim();
  const signatureValue = toScalar(payload.SignatureValue).trim();

  if (!outSum || !invId || !signatureValue) {
    throw new BadRequestError("Missing OutSum, InvId or SignatureValue");
  }

  const password2 = getRequiredEnv("ROBOKASSA_PASSWORD2");
  const shpParams = collectShpParams(payload);
  const expected = calculateResultSignature({
    outSum,
    invId,
    password2,
    shpParams,
  });

  if (expected.toLowerCase() !== signatureValue.toLowerCase()) {
    throw new BadRequestError("bad sign");
  }

  const txRecord = findBillingTransactionByInvId(e.app, invId);
  if (!txRecord) {
    throw new NotFoundError("invoice not found");
  }

  if (txRecord.getString("status") === "succeeded") {
    return e.string(200, `OK${invId}`);
  }

  const ownerId = txRecord.getString("owner");
  const planCode = normalizePlanCode(txRecord.getString("plan_code"));
  const billingPeriod = normalizeBillingPeriod(txRecord.getString("billing_period"));

  if (!ownerId || !planCode || !billingPeriod) {
    throw new InternalServerError("Invalid billing transaction payload");
  }

  const userRecord = e.app.findRecordById("users", ownerId);
  const baseDate = resolveSubscriptionBaseDate(userRecord);
  const nextEndsAt = addSubscriptionPeriod(baseDate, billingPeriod);

  userRecord.set("plan_code", planCode);
  userRecord.set("billing_period", billingPeriod);
  userRecord.set("subscription_status", "active");
  userRecord.set("subscription_ends_at", nextEndsAt.toISOString());

  txRecord.set("status", "succeeded");
  txRecord.set("provider_payment_id", toScalar(payload.OpKey || payload.opKey));
  txRecord.set("created_at_provider", new Date().toISOString());
  txRecord.set("raw_payload", payload);

  e.app.save(userRecord);
  e.app.save(txRecord);

  return e.string(200, `OK${invId}`);
};

routerAdd("POST", "/api/billing/robokassa/result", handleRobokassaResult);
routerAdd("GET", "/api/billing/robokassa/result", handleRobokassaResult);

routerAdd("GET", "/api/billing/robokassa/success", (e) => {
  const appSuccessUrl = getOptionalEnv("ROBOKASSA_SUCCESS_REDIRECT_URL", "");

  if (appSuccessUrl) {
    return e.redirect(302, appSuccessUrl);
  }

  return e.json(200, {
    status: "ok",
    message: "Платеж подтвержден",
  });
});

routerAdd("GET", "/api/billing/robokassa/fail", (e) => {
  const appFailUrl = getOptionalEnv("ROBOKASSA_FAIL_REDIRECT_URL", "");

  if (appFailUrl) {
    return e.redirect(302, appFailUrl);
  }

  return e.json(200, {
    status: "fail",
    message: "Платеж не выполнен",
  });
});
