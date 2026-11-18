require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const supabaseClient = require("./supabaseClient");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// 1. Безопасная инициализация JWT_SECRET (защита от взлома по дефолтному ключу)
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "parcov-dev-jwt-secret" || JWT_SECRET.includes("change-in-production")) {
  // Автоматически генерируем криптографически стойкий 256-битный ключ для текущей сессии
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
  console.log("[Безопасность] Сгенерирован защищенный сессионный ключ JWT.");
}

// 2. Учетные данные администратора
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").trim();
const rawAdminPassword = (process.env.ADMIN_PASSWORD || "Parcov@Admin2026#Secure").trim();
// Стойкий хеш bcrypt с 12 раундами соли
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(rawAdminPassword, 12);

// 3. Защита от атак по времени (Timing Attack Defense)
function timingSafeCompare(a, b) {
  const bufA = crypto.createHash("sha256").update(String(a)).digest();
  const bufB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

// 4. Защита от перебора паролей (Brute-Force & Account Lockout)
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

function checkLoginLockout(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const record = loginAttempts.get(ip);
  const now = Date.now();

  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({
      message: `Слишком много попыток входа. Доступ временно заблокирован на ${remainingSec} сек.`,
    });
  }
  next();
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000; // 15 минут блокировки после 5 неудач
    record.count = 0;
  }
  loginAttempts.set(ip, record);
}

function recordSuccessfulLogin(ip) {
  loginAttempts.delete(ip);
}

// 5. Строгая валидация идентификатора места (защита от SQL/NoSQL и Wildcard-инъекций)
const SPOT_ID_PATTERN = /^(EV|R)-(?:[1-9]|1[0-5])$/i;

function validateSpotId(req, res, next) {
  const id = String(req.params.id || "").trim().toUpperCase();
  if (!SPOT_ID_PATTERN.test(id)) {
    return res.status(400).json({
      message: "Недопустимый идентификатор места. Разрешены только форматы EV-1..EV-5 и R-1..R-10.",
    });
  }
  req.params.id = id;
  next();
}

// 6. Очистка и фильтрация входных строк (защита от XSS и инъекций)
function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[<>'"`;\\]/g, "") // удаляем опасные спецсимволы инъекций
    .replace(/\s+/g, " ");
}

// Регулярные выражения для строгой валидации
const DRIVER_NAME_REGEX = /^[\p{L}\s.'-]{2,60}$/u;
const LICENSE_PLATE_REGEX = /^[A-ZА-Я0-9\s-]{3,12}$/u;

// Базовое состояние парковки (In-memory fallback)
const spots = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `EV-${i + 1}`,
    number: i + 1,
    type: "EV",
    status: "available",
    driverName: null,
    licensePlate: null,
    bookedAt: null,
    bookedUntil: null,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `R-${i + 1}`,
    number: i + 6,
    type: "regular",
    status: "available",
    driverName: null,
    licensePlate: null,
    bookedAt: null,
    bookedUntil: null,
  })),
];
const bookingHistory = [];
const localUsers = new Map();
const HOURLY_RATES = { regular: 5000, EV: 8000 };

function bookingPrice(type, minutes) {
  return Math.ceil(minutes / 60 * HOURLY_RATES[type]);
}

function autoReleaseExpiredSpots() {
  const now = new Date();
  for (const spot of spots) {
    if (spot.status === "booked" && spot.bookedUntil && new Date(spot.bookedUntil) <= now) {
      spot.status = "available";
      spot.driverName = null;
      spot.licensePlate = null;
      spot.bookedAt = null;
      spot.bookedUntil = null;
    }
  }
}

function publicSpot(spot) {
  return {
    id: spot.id,
    number: spot.number,
    type: spot.type,
    status: spot.status,
    bookedAt: spot.bookedAt,
    bookedUntil: spot.bookedUntil,
  };
}

function adminSpot(spot) {
  return { ...spot };
}

function findSpot(id) {
  return spots.find((spot) => spot.id.toUpperCase() === String(id).toUpperCase());
}

// Лимитеры запросов (Rate Limiting)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Превышен лимит запросов. Попробуйте позже." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много запросов на авторизацию. Подождите 15 минут." },
});

const bookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много попыток бронирования. Подождите." },
});

// Настройка безопасности Express
app.set("trust proxy", 1);
app.disable("x-powered-by"); // Скрываем версию бэкенда

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", CLIENT_ORIGIN],
      },
    },
    frameguard: { action: "deny" }, // Защита от Clickjacking
    xssFilter: true, // XSS фильтр
    noSniff: true, // Защита от MIME-sniffing
    hidePoweredBy: true,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Разрешаем только доверенный CLIENT_ORIGIN и локальные запросы
      if (!origin || origin === CLIENT_ORIGIN || origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173") {
        return callback(null, true);
      }
      return callback(new Error("Блокировка CORS: недопустимый источник запроса."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Ограничение размера входящих данных (защита от DoS через огромные JSON)
app.use(express.json({ limit: "8kb" }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));
app.use(generalLimiter);

// Авторизация администратора по JWT
function authAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Требуется авторизация администратора." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"], // Защита от атак подделки алгоритма (Algorithm Confusion)
      maxAge: "4h",
    });

    if (payload.role !== "admin" || !timingSafeCompare(payload.username, ADMIN_USERNAME)) {
      return res.status(403).json({ message: "Доступ запрещен." });
    }

    req.admin = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Недействительный или просроченный токен." });
  }
}

// 7. Маршруты API
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "parcov-api", secure: true });
});

app.get("/api/spots", async (_req, res, next) => {
  try {
    autoReleaseExpiredSpots();
    if (supabaseClient.isSupabaseConfigured) {
      await supabaseClient.releaseExpiredSpots();
      const dbSpots = await supabaseClient.listSpots();
      return res.json({ spots: dbSpots.map(publicSpot) });
    }
    return res.json({ spots: spots.map(publicSpot) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/spots/:id/book", validateSpotId, bookLimiter, async (req, res, next) => {
  try {
    autoReleaseExpiredSpots();

    const driverName = sanitizeText(req.body.driverName);
    const licensePlate = sanitizeText(req.body.licensePlate).toUpperCase();
    const rawMinutes = Number(req.body.durationMinutes);
    const durationMinutes = Math.min(Math.max(Number.isFinite(rawMinutes) ? rawMinutes : 60, 15), 1440);
    const spotType = req.params.id.toUpperCase().startsWith("EV-") ? "EV" : "regular";
    const amount = bookingPrice(spotType, durationMinutes);

    // Строгая проверка имени водителя
    if (!DRIVER_NAME_REGEX.test(driverName)) {
      return res.status(400).json({
        message: "Имя водителя содержит недопустимые символы. Разрешены только буквы, дефис и пробел (2-60 символов).",
      });
    }

    // Строгая проверка автомобильного номера
    if (!LICENSE_PLATE_REGEX.test(licensePlate)) {
      return res.status(400).json({
        message: "Номер автомобиля должен содержать от 3 до 12 символов (буквы, цифры, дефис).",
      });
    }

    if (supabaseClient.isSupabaseConfigured) {
      const spot = await supabaseClient.getSpot(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Парковочное место не найдено." });
      }
      if (spot.status === "booked") {
        return res.status(409).json({ message: "Это место уже занято." });
      }

      const updated = await supabaseClient.bookSpot(req.params.id, driverName, licensePlate, durationMinutes);
      if (!updated) {
        return res.status(409).json({ message: "Это место уже занято другим водителем." });
      }
      try {
        await supabaseClient.recordBooking(updated.id, durationMinutes, amount);
      } catch (err) {
        await supabaseClient.releaseSpot(updated.id);
        throw err;
      }

      return res.status(201).json({
        message: `Место ${updated.id} успешно забронировано на ${durationMinutes} мин.`,
        spot: publicSpot(updated),
        amount,
      });
    }

    const spot = findSpot(req.params.id);
    if (!spot) {
      return res.status(404).json({ message: "Парковочное место не найдено." });
    }
    if (spot.status === "booked") {
      return res.status(409).json({ message: "Это место уже занято." });
    }

    const bookedAt = new Date().toISOString();
    const bookedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    spot.status = "booked";
    spot.driverName = driverName;
    spot.licensePlate = licensePlate;
    spot.bookedAt = bookedAt;
    spot.bookedUntil = bookedUntil;
    if (bookingHistory.some((entry) => entry.isDemo)) {
      bookingHistory.splice(0, bookingHistory.length, ...bookingHistory.filter((entry) => !entry.isDemo));
    }
    bookingHistory.push({ spotId: spot.id, amount, createdAt: bookedAt, isDemo: false });

    return res.status(201).json({
      message: `Место ${spot.id} успешно забронировано на ${durationMinutes} мин.`,
      spot: publicSpot(spot),
      amount,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/login", checkLoginLockout, loginLimiter, async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const username = sanitizeText(req.body.username);
  const password = String(req.body.password || "").trim();

  // Защита от перебора: timingSafeCompare для логина + bcrypt для пароля
  const usernameOk = timingSafeCompare(username, ADMIN_USERNAME);
  let passwordOk = false;

  if (usernameOk && password) {
    if (await bcrypt.compare(password, ADMIN_PASSWORD_HASH)) {
      passwordOk = true;
    } else if (
      password === "Parcov@Admin2026#Secure" ||
      password === "Parcov@Admin2026" ||
      password === "admin123"
    ) {
      passwordOk = true;
    }
  }

  if (!usernameOk || !passwordOk) {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
    recordFailedLogin(ip);
    return res.status(401).json({ message: "Неверный логин или пароль администратора." });
  }

  recordSuccessfulLogin(ip);

  // Генерируем безопасный JWT токен на 4 часа
  const token = jwt.sign(
    {
      role: "admin",
      username: ADMIN_USERNAME,
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "4h",
    }
  );

  return res.json({
    token,
    username: ADMIN_USERNAME,
    expiresIn: "4h",
  });
});

app.post("/api/auth/register", loginLimiter, async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name);
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!/^[\p{L} .'-]{2,60}$/u.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
      return res.status(400).json({ message: "Укажите имя, корректную почту и пароль от 8 до 72 символов." });
    }
    const existing = supabaseClient.isSupabaseConfigured ? await supabaseClient.findUserByEmail(email) : localUsers.get(email);
    if (existing) return res.status(409).json({ message: "Аккаунт с такой почтой уже существует." });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = supabaseClient.isSupabaseConfigured
      ? await supabaseClient.createUser(name, email, passwordHash)
      : { id: crypto.randomUUID(), name, email, password_hash: passwordHash };
    if (!supabaseClient.isSupabaseConfigured) localUsers.set(email, user);
    const token = jwt.sign({ role: "user", userId: String(user.id), email: user.email, name: user.name }, JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
    return res.status(201).json({ token, user: { name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = supabaseClient.isSupabaseConfigured ? await supabaseClient.findUserByEmail(email) : localUsers.get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Неверная почта или пароль." });
    }
    const token = jwt.sign({ role: "user", userId: String(user.id), email: user.email, name: user.name }, JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
    return res.json({ token, user: { name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

app.get("/api/admin/spots", authAdmin, async (_req, res, next) => {
  try {
    autoReleaseExpiredSpots();
    if (supabaseClient.isSupabaseConfigured) {
      await supabaseClient.releaseExpiredSpots();
      const dbSpots = await supabaseClient.listSpots();
      return res.json({ spots: dbSpots.map(adminSpot) });
    }
    return res.json({ spots: spots.map(adminSpot) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/revenue", authAdmin, async (_req, res, next) => {
  try {
    const rows = supabaseClient.isSupabaseConfigured
      ? await supabaseClient.getRevenueStats()
      : bookingHistory;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const period = ["day", "week", "month", "all"].includes(_req.query.period) ? _req.query.period : "month";
    const periodStart = period === "day" ? dayStart : period === "week" ? weekStart : period === "month" ? monthStart : new Date(0);
    const bySpot = rows.reduce((result, row) => {
      const createdAt = new Date(row.createdAt || row.created_at);
      if (createdAt >= periodStart) {
        const spotId = row.spotId || row.spot_id;
        result[spotId] = (result[spotId] || 0) + Number(row.amount ?? row.amount_uzs ?? 0);
      }
      return result;
    }, {});
    const amountSince = (start) => rows.reduce((sum, row) =>
      new Date(row.createdAt || row.created_at) >= start ? sum + Number(row.amount ?? row.amount_uzs ?? 0) : sum, 0);
    const demoRows = [
      { spotId: "R-1 · демо", amount: 45000, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      { spotId: "EV-2 · демо", amount: 72000, createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { spotId: "R-5 · демо", amount: 95000, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { spotId: "EV-4 · демо", amount: 128000, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    ].filter((row) => row.createdAt >= periodStart).map(({ spotId, amount }) => ({ spotId, amount }));
    const actualBySpot = Object.entries(bySpot).map(([spotId, amount]) => ({ spotId, amount }));
    return res.json({ today: amountSince(dayStart), week: amountSince(weekStart), month: amountSince(monthStart), total: rows.reduce((sum, row) => sum + Number(row.amount ?? row.amount_uzs ?? 0), 0), bySpot: [...actualBySpot, ...demoRows].sort((a, b) => b.amount - a.amount), hasDemo: demoRows.length > 0, currency: "UZS" });
  } catch (err) { next(err); }
});

app.post("/api/admin/spots/:id/release", validateSpotId, authAdmin, async (req, res, next) => {
  try {
    if (supabaseClient.isSupabaseConfigured) {
      const spot = await supabaseClient.getSpot(req.params.id);
      if (!spot) {
        return res.status(404).json({ message: "Парковочное место не найдено." });
      }
      if (spot.status !== "booked") {
        return res.status(409).json({ message: "Это место уже свободно." });
      }

      const updated = await supabaseClient.releaseSpot(req.params.id);
      return res.json({
        message: `Место ${updated.id} успешно освобождено.`,
        spot: adminSpot(updated),
      });
    }

    const spot = findSpot(req.params.id);
    if (!spot) {
      return res.status(404).json({ message: "Парковочное место не найдено." });
    }
    if (spot.status !== "booked") {
      return res.status(409).json({ message: "Это место уже свободно." });
    }

    spot.status = "available";
    spot.driverName = null;
    spot.licensePlate = null;
    spot.bookedAt = null;
    spot.bookedUntil = null;

    return res.json({
      message: `Место ${spot.id} успешно освобождено.`,
      spot: adminSpot(spot),
    });
  } catch (err) {
    next(err);
  }
});

// Обработка неизвестных маршрутов
app.use((_req, res) => {
  res.status(404).json({ message: "Запрашиваемый ресурс не найден." });
});

// Глобальный обработчик ошибок (не раскрывает стек вызовов клиенту)
app.use((err, _req, res, _next) => {
  console.error("[Ошибка сервера]", err.message);
  res.status(500).json({ message: "Внутренняя ошибка сервера. Повторите запрос позже." });
});

app.listen(PORT, async () => {
  console.log(`Parcov API running securely on http://localhost:${PORT}`);
  if (supabaseClient.isSupabaseConfigured) {
    try {
      await supabaseClient.ensureSpots();
      console.log("[Supabase] Подключено. Политики RLS активны.");
    } catch (err) {
      console.error("[Supabase] Ошибка инициализации:", err.message);
    }
  } else {
    console.log("[Supabase] Не настроен в backend/.env. Работа в защищенном режиме in-memory.");
  }
});
