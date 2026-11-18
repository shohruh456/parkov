import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

const TOKEN_KEY = "parcov_admin_token";
const USER_TOKEN_KEY = "parcov_user_token";
const USER_PROFILE_KEY = "parcov_user_profile";

const DURATION_PRESETS = [
  { label: "30 мин", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "2 часа", minutes: 120 },
  { label: "4 часа", minutes: 240 },
  { label: "8 часов", minutes: 480 },
  { label: "24 часа", minutes: 1440 },
];

function BoltIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

function CarIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h10v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M4 16l1.5-5.2A2 2 0 0 1 7.4 9.5h9.2a2 2 0 0 1 1.9 1.3L20 16M4 16h16M7 12h.01M17 12h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ShieldCheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SearchIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function formatClockTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeRemaining(bookedUntil, nowTimestamp) {
  if (!bookedUntil) return null;
  const diff = new Date(bookedUntil).getTime() - nowTimestamp;
  if (diff <= 0) {
    return { expired: true, text: "Время истекло", totalMinutes: 0 };
  }
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return { expired: false, text: `${hours} ч ${minutes} мин`, totalMinutes };
  }
  return { expired: false, text: `${minutes} мин`, totalMinutes };
}

export default function App() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [parkingEvent, setParkingEvent] = useState(null);
  const previousSpotStatuses = useRef(null);
  const [now, setNow] = useState(Date.now());

  // Search & Filter
  const [filterType, setFilterType] = useState("all"); // 'all' | 'free' | 'EV' | 'regular' | 'booked'
  const [searchQuery, setSearchQuery] = useState("");

  // Booking Modal
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [driverName, setDriverName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [customDuration, setCustomDuration] = useState("");
  const [booking, setBooking] = useState(false);

  // Admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [releasingId, setReleasingId] = useState("");
  const [revenue, setRevenue] = useState(null);
  const [revenuePeriod, setRevenuePeriod] = useState("month");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [userProfile, setUserProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || "null"); } catch { return null; }
  });

  const isAdmin = Boolean(token);

  // Ticker for smooth countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const loadSpots = useCallback(async () => {
    try {
      const endpoint = token ? "/admin/spots" : "/spots";
      const { data } = await api.get(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const nextSpots = data.spots || [];
      const previous = previousSpotStatuses.current;
      if (previous) {
        const changedSpot = nextSpots.find((spot) => previous[spot.id] && previous[spot.id] !== spot.status);
        if (changedSpot) {
          setParkingEvent({
            id: changedSpot.id,
            status: changedSpot.status,
            message: changedSpot.status === "booked"
              ? `Появилась бронь: место ${changedSpot.id} занято.`
              : `Место ${changedSpot.id} освободилось. Бронь завершена или автомобиль уехал.`,
          });
        }
      }
      previousSpotStatuses.current = Object.fromEntries(nextSpots.map((spot) => [spot.id, spot.status]));
      setSpots(nextSpots);
      setError("");
    } catch (err) {
      if (err.response?.status === 401 && token) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        return;
      }
      setError(err.response?.data?.message || "Не удалось загрузить данные парковки.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSpots();
    const interval = setInterval(loadSpots, 4000);
    return () => clearInterval(interval);
  }, [loadSpots]);

  useEffect(() => {
    if (!isAdmin) { setRevenue(null); return undefined; }
    let active = true;
    const loadRevenue = async () => {
      try {
        const { data } = await api.get("/admin/revenue", { params: { period: revenuePeriod }, headers: { Authorization: `Bearer ${token}` } });
        if (active) setRevenue(data);
      } catch { /* Revenue panel can retry on next refresh. */ }
    };
    loadRevenue();
    const timer = setInterval(loadRevenue, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [isAdmin, token, revenuePeriod]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!parkingEvent) return undefined;
    const timer = setTimeout(() => setParkingEvent(null), 6000);
    return () => clearTimeout(timer);
  }, [parkingEvent]);

  const stats = useMemo(() => {
    const ev = spots.filter((s) => s.type === "EV");
    const regular = spots.filter((s) => s.type === "regular");
    const booked = spots.filter((s) => s.status === "booked").length;
    return {
      total: spots.length,
      available: spots.length - booked,
      booked,
      evFree: ev.filter((s) => s.status === "available").length,
      regularFree: regular.filter((s) => s.status === "available").length,
    };
  }, [spots]);

  const filteredSpots = useMemo(() => {
    return spots.filter((spot) => {
      // Type filter
      if (filterType === "free" && spot.status !== "available") return false;
      if (filterType === "booked" && spot.status !== "booked") return false;
      if (filterType === "EV" && spot.type !== "EV") return false;
      if (filterType === "regular" && spot.type !== "regular") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = spot.id.toLowerCase().includes(q);
        const matchesPlate = (spot.licensePlate || "").toLowerCase().includes(q);
        const matchesDriver = (spot.driverName || "").toLowerCase().includes(q);
        return matchesId || matchesPlate || matchesDriver;
      }
      return true;
    });
  }, [spots, filterType, searchQuery]);

  const evSpots = useMemo(() => filteredSpots.filter((s) => s.type === "EV"), [filteredSpots]);
  const regularSpots = useMemo(() => filteredSpots.filter((s) => s.type === "regular"), [filteredSpots]);

  async function submitBooking(event) {
    event.preventDefault();
    if (!selectedSpot) return;
    setBooking(true);
    setError("");

    const chosenDuration = customDuration ? Number(customDuration) : durationMinutes;

    try {
      const { data } = await api.post(`/spots/${selectedSpot.id}/book`, {
        driverName,
        licensePlate,
        durationMinutes: chosenDuration,
      });
      if (previousSpotStatuses.current) previousSpotStatuses.current[selectedSpot.id] = "booked";
      setNotice(`Место ${selectedSpot.id} забронировано на ${chosenDuration} мин. К оплате: ${money(data.amount)}.`);
      setSelectedSpot(null);
      setDriverName("");
      setLicensePlate("");
      setCustomDuration("");
      await loadSpots();
    } catch (err) {
      setError(err.response?.data?.message || "Ошибка бронирования.");
    } finally {
      setBooking(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    setError("");
    try {
      const { data } = await api.post("/admin/login", {
        username: username.trim(),
        password: password.trim(),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword("");
      setLoginError("");
      setAdminOpen(false);
      setNotice("Сессия администратора успешно активирована.");
      await loadSpots();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.message === "Network Error"
          ? "Сервер недоступен. Проверьте подключение к бэкенду."
          : "Неверный логин или пароль.");
      setLoginError(msg);
    } finally {
      setLoginBusy(false);
    }
  }

  async function submitUserAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const { data } = await api.post(`/auth/${authMode === "signup" ? "register" : "login"}`, {
        ...(authMode === "signup" ? { name: authName.trim() } : {}),
        email: authEmail.trim(),
        password: authPassword,
      });
      localStorage.setItem(USER_TOKEN_KEY, data.token);
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data.user));
      setUserProfile(data.user);
      setAuthPassword("");
      setAuthOpen(false);
      setNotice(authMode === "signup" ? "Аккаунт создан. Добро пожаловать!" : "Вы вошли в аккаунт.");
    } catch (err) {
      setAuthError(err.response?.data?.message || "Не удалось выполнить вход. Проверьте соединение и данные.");
    } finally { setAuthBusy(false); }
  }

  function logoutUser() {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_PROFILE_KEY);
    setUserProfile(null);
    setNotice("Вы вышли из аккаунта.");
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAdminOpen(false);
    setNotice("Вы вышли из режима администратора.");
  }

  async function releaseSpot(id) {
    setReleasingId(id);
    setError("");
    try {
      const { data } = await api.post(
        `/admin/spots/${id}/release`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (previousSpotStatuses.current) previousSpotStatuses.current[id] = "available";
      setNotice(data.message || `Место ${id} освобождено.`);
      await loadSpots();
    } catch (err) {
      setError(err.response?.data?.message || "Не удалось освободить место.");
    } finally {
      setReleasingId("");
    }
  }

  const calculatedEndTime = useMemo(() => {
    const mins = customDuration ? Number(customDuration) : durationMinutes;
    if (!mins || mins <= 0) return null;
    const end = new Date(Date.now() + mins * 60000);
    return end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [durationMinutes, customDuration]);
  const bookingPrice = selectedSpot
    ? Math.ceil(((customDuration ? Number(customDuration) : durationMinutes) / 60) * (selectedSpot.type === "EV" ? 8000 : 5000))
    : 0;
  const money = (amount) => `${Number(amount || 0).toLocaleString("ru-RU")} сум`;

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),rgba(2,6,23,0.98))] pb-20">
      {/* Decorative ambient gradients */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/3 -right-20 -z-10 h-80 w-80 rounded-full bg-sky-500/10 blur-[100px]" />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation / Header */}
        <header className="glass-panel mb-8 rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/25 ring-1 ring-white/20">
                <CarIcon className="h-8 w-8 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">
                    PARCOV • Smart Parking
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
                    Live
                  </span>
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">
                  Умная парковка
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  15 парковочных мест: 5 скоростных станций EV и 10 стандартных мест с контролем времени бронирования.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {userProfile ? (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-950/30 px-4 py-2.5">
                  <span className="max-w-36 truncate text-xs font-semibold text-sky-200">{userProfile.name}</span>
                  <button type="button" onClick={logoutUser} className="rounded-lg bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-rose-500/20 hover:text-rose-200">Выйти</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setAuthMode("login"); setAuthOpen(true); setAuthError(""); }} className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-950/30 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-400/60 hover:bg-sky-900/40">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-400/15 text-xs text-sky-300">{authEmail ? authEmail[0].toUpperCase() : "↗"}</span>Войти / Регистрация
                </button>
              )}
              {isAdmin ? (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <ShieldCheckIcon className="h-4 w-4 text-emerald-400" />
                    <span>Администратор</span>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-lg bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-rose-500/20 hover:text-rose-200"
                  >
                    Выйти
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdminOpen(true)}
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-800 hover:text-white hover:shadow-emerald-500/10 active:scale-95"
                >
                  <ShieldCheckIcon className="h-4 w-4 text-slate-400 transition-colors group-hover:text-emerald-400" />
                  <span>Вход администратора</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <div><h2 className="text-sm font-bold text-white">Тарифы парковки</h2><p className="mt-1 text-xs text-slate-400">Цена рассчитывается по времени бронирования, неполный час округляется вверх</p></div>
          <div className="flex gap-3 text-sm font-semibold"><span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-200">Обычное место · 5 000 сум/час</span><span className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sky-200">EV · 8 000 сум/час</span></div>
        </section>

        {/* Global Notifications */}
        {(error || notice) && (
          <div className="mb-6 space-y-2">
            {error && (
              <div className="flex items-center justify-between rounded-2xl border border-rose-500/40 bg-rose-950/70 p-4 text-sm font-medium text-rose-200 shadow-lg shadow-rose-950/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">!</span>
                  <span>{error}</span>
                </div>
                <button type="button" onClick={() => setError("")} className="text-rose-300 hover:text-white">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {notice && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-950/70 p-4 text-sm font-medium text-emerald-200 shadow-lg shadow-emerald-950/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>
                  <span>{notice}</span>
                </div>
                <button type="button" onClick={() => setNotice("")} className="text-emerald-300 hover:text-white">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {parkingEvent && (
          <div role="status" className={`mb-6 flex items-center justify-between rounded-2xl border p-4 text-sm font-semibold shadow-lg ${parkingEvent.status === "booked" ? "border-rose-500/40 bg-rose-950/70 text-rose-200" : "border-emerald-500/40 bg-emerald-950/70 text-emerald-200"}`}>
            <span>{parkingEvent.message}</span>
            <button type="button" onClick={() => setParkingEvent(null)} className="ml-4 opacity-80 hover:opacity-100" aria-label="Закрыть уведомление"><CloseIcon className="h-4 w-4" /></button>
          </div>
        )}

        {/* Stat Cards */}
        {isAdmin && <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Свободно мест"
            value={stats.available}
            total={stats.total}
            tone="emerald"
            badge="Готовы к въезду"
          />
          <StatCard
            label="Занято мест"
            value={stats.booked}
            total={stats.total}
            tone="rose"
            badge="Активные брони"
          />
          <StatCard
            label="EV Зарядка (свободно)"
            value={stats.evFree}
            total={5}
            tone="sky"
            badge="Type 2 • 22 кВт"
          />
          <StatCard
            label="Обычные (свободно)"
            value={stats.regularFree}
            total={10}
            tone="amber"
            badge="Стандартные места"
          />
        </section>}

        {isAdmin && (
          <section className="glass-panel mb-8 rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-white">Выручка от бронирований</h2><p className="text-xs text-slate-400">Начислено по созданным броням · суммы в сумах</p></div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">{revenue ? "Обновляется" : "Загрузка…"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Сегодня", revenue?.today], ["7 дней", revenue?.week], ["Этот месяц", revenue?.month], ["За всё время", revenue?.total]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-white">{money(value)}</p></div>)}
            </div>
            <div className="mt-6 border-t border-slate-800 pt-5">
              {revenue?.hasDemo && <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">Столбцы с пометкой «демо» — примеры. Они не входят в суммы выручки выше.</p>}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Выручка по парковочным местам</h3><p className="text-xs text-slate-400">Начисления за выбранный период</p></div><select aria-label="Период графика выручки" value={revenuePeriod} onChange={(e) => setRevenuePeriod(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"><option value="day">Сегодня</option><option value="week">7 дней</option><option value="month">Этот месяц</option><option value="all">Всё время</option></select></div>
              {revenue?.bySpot?.length ? <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex h-56 min-w-max items-end gap-3 border-b border-slate-700 px-2 sm:min-w-0 sm:gap-4">{revenue.bySpot.map(({ spotId, amount }) => { const maxAmount = Math.max(...revenue.bySpot.map((item) => item.amount)); const height = Math.max(8, amount / maxAmount * 100); return <div key={spotId} className="flex h-full min-w-16 flex-1 flex-col items-center justify-end gap-2"><span className="whitespace-nowrap text-[10px] font-semibold text-slate-300 sm:text-xs">{money(amount)}</span><div className="w-full max-w-20 rounded-t-lg bg-gradient-to-t from-emerald-600 to-teal-300 shadow-lg shadow-emerald-500/10" style={{ height: `${height}%` }} title={`${spotId}: ${money(amount)}`} /><span className="translate-y-6 text-[10px] font-semibold text-slate-400 sm:text-xs">{spotId}</span></div>; })}</div><div className="h-7" /></div> : <p className="rounded-xl bg-slate-950/50 p-5 text-center text-sm text-slate-400">За этот период бронирований пока нет</p>}
            </div>
          </section>
        )}

        {/* Filter and Search Bar */}
        <div className="glass-panel mb-8 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              active={filterType === "all"}
              onClick={() => setFilterType("all")}
              label="Все места"
              count={spots.length}
            />
            <FilterPill
              active={filterType === "free"}
              onClick={() => setFilterType("free")}
              label="Свободные"
              count={stats.available}
              tone="emerald"
            />
            <FilterPill
              active={filterType === "booked"}
              onClick={() => setFilterType("booked")}
              label="Занятые"
              count={stats.booked}
              tone="rose"
            />
            <FilterPill
              active={filterType === "EV"}
              onClick={() => setFilterType("EV")}
              label="⚡ EV Зарядка"
              count={5}
              tone="sky"
            />
            <FilterPill
              active={filterType === "regular"}
              onClick={() => setFilterType("regular")}
              label="🚗 Обычные"
              count={10}
              tone="amber"
            />
          </div>

          <div className="relative min-w-[240px]">
            <SearchIcon className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск места (напр. EV-1, R-4)..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2 pr-4 pl-10 text-sm text-white placeholder-slate-500 outline-none ring-emerald-500/30 transition focus:border-emerald-500/60 focus:ring-2"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Parking Lot Sections */}
        {loading ? (
          <div className="glass-panel flex flex-col items-center justify-center rounded-3xl py-20 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-400" />
            <p className="mt-4 text-sm font-medium text-slate-400">Загрузка схемы парковки…</p>
          </div>
        ) : (
          <div className="space-y-8">
            {evSpots.length > 0 && (
              <LotSection
                title="Зона быстрой зарядки (Electric Vehicles)"
                subtitle="5 специализированных мест со станциями зарядки Type-2 (22 кВт)"
                icon={<BoltIcon className="h-6 w-6 text-sky-400" />}
                badge="EV Fast Charging"
                badgeColor="border-sky-500/30 bg-sky-950/50 text-sky-300"
                spots={evSpots}
                isAdmin={isAdmin}
                now={now}
                onSelect={setSelectedSpot}
                onRelease={releaseSpot}
                releasingId={releasingId}
              />
            )}

            {regularSpots.length > 0 && (
              <LotSection
                title="Стандартная зона парковки"
                subtitle="10 просторных стандартных парковочных мест"
                icon={<CarIcon className="h-6 w-6 text-emerald-400" />}
                badge="Standard Bays"
                badgeColor="border-emerald-500/30 bg-emerald-950/50 text-emerald-300"
                spots={regularSpots}
                isAdmin={isAdmin}
                now={now}
                onSelect={setSelectedSpot}
                onRelease={releaseSpot}
                releasingId={releasingId}
              />
            )}

            {filteredSpots.length === 0 && (
              <div className="glass-panel rounded-3xl p-12 text-center">
                <CarIcon className="mx-auto h-12 w-12 text-slate-600" />
                <h3 className="mt-4 text-base font-semibold text-white">Парковочные места не найдены</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Попробуйте изменить параметры поиска или сбросить фильтры.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFilterType("all");
                    setSearchQuery("");
                  }}
                  className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Сбросить фильтры
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer info & legend */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-6 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-5">
            <Legend color="bg-emerald-400 shadow-emerald-500/50 shadow-sm" label="Свободно (кликните для брони)" />
            <Legend color="bg-rose-500 shadow-rose-500/50 shadow-sm" label="Занято (идёт отсчет времени)" />
            <Legend color="bg-sky-400" label="EV Станция" />
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>Синхронизация в реальном времени (каждые 4 сек)</span>
          </div>
        </div>
      </div>

      {/* Booking Modal with Duration Selector */}
      {selectedSpot && (
        <Modal title={`Бронирование места ${selectedSpot.id}`} onClose={() => setSelectedSpot(null)}>
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold text-white shadow-md ${
                  selectedSpot.type === "EV"
                    ? "bg-gradient-to-br from-sky-500 to-blue-600"
                    : "bg-gradient-to-br from-emerald-500 to-teal-600"
                }`}
              >
                {selectedSpot.id}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {selectedSpot.type === "EV" ? "Место с электрозарядкой" : "Стандартное место"}
                </p>
                <p className="text-xs text-slate-400">
                  {selectedSpot.type === "EV" ? "Разъем Type-2 • До 22 кВт/ч" : "Сектор паркинга A"}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Свободно
            </span>
          </div>

          <form className="space-y-4" onSubmit={submitBooking}>
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200">
              Тариф: {selectedSpot.type === "EV" ? "8 000" : "5 000"} сум/час · оплата на месте
              <div className="mt-1 text-sm font-bold text-white">К оплате: {money(bookingPrice)}</div>
            </div>
            {/* Duration Selector */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Время бронирования
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_PRESETS.map((preset) => {
                  const active = !customDuration && durationMinutes === preset.minutes;
                  return (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => {
                        setDurationMinutes(preset.minutes);
                        setCustomDuration("");
                      }}
                      className={`rounded-xl border py-2.5 text-xs font-bold transition-all duration-200 ${
                        active
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md shadow-emerald-500/10"
                          : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Duration Input */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min="15"
                  max="1440"
                  step="15"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="Своё время (в минутах)..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-1"
                />
              </div>

              {/* End time summary preview */}
              {calculatedEndTime && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ClockIcon className="h-3.5 w-3.5" />
                    Забронировано до:
                  </span>
                  <span className="font-bold text-white">{calculatedEndTime}</span>
                </div>
              )}
            </div>

            {/* Driver Name */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Имя водителя
              </label>
              <input
                required
                minLength={2}
                maxLength={80}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-emerald-500/40 transition focus:border-emerald-500/80 focus:ring-2"
                placeholder="Иван Иванов"
              />
            </div>

            {/* License Plate */}
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                Номер автомобиля
              </label>
              <div className="relative">
                <input
                  required
                  minLength={3}
                  maxLength={12}
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-sm tracking-widest text-white uppercase placeholder-slate-500 outline-none ring-emerald-500/40 transition focus:border-emerald-500/80 focus:ring-2"
                  placeholder="A 777 AA 77"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setSelectedSpot(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={booking}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {booking ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    Бронирование…
                  </>
                ) : (
                  "Подтвердить бронь"
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {authOpen && (
        <Modal title="Ваш PARCOV" onClose={() => { setAuthOpen(false); setAuthError(""); }}>
          <div className="relative mb-5 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/70 via-slate-950 to-sky-950/50 p-5">
            <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-emerald-400/15 blur-3xl" />
            <div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"><CarIcon className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Умная парковка</p><h4 className="mt-0.5 text-lg font-bold text-white">Бронируйте быстрее</h4></div></div>
            <p className="relative mt-3 text-sm leading-relaxed text-slate-300">Создайте аккаунт или войдите, чтобы начать пользоваться PARCOV.</p>
          </div>
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {[['login', 'Вход'], ['signup', 'Регистрация']].map(([mode, label]) => <button key={mode} type="button" onClick={() => { setAuthMode(mode); setAuthError(""); }} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${authMode === mode ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-white"}`}>{label}</button>)}
          </div>
          {authError && <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-3 text-sm text-rose-200">{authError}</div>}
          <form className="space-y-4" onSubmit={submitUserAuth}>
            {authMode === "signup" && <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Ваше имя</label><input required minLength={2} maxLength={60} autoComplete="name" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Например, Алиса" className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15" /></div>}
            <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Электронная почта</label><input required type="email" autoComplete="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="name@example.com" className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15" /></div>
            <div><label className="mb-1.5 block text-xs font-semibold text-slate-300">Пароль</label><input required type="password" minLength={8} maxLength={72} autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Минимум 8 символов" className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15" /><p className="mt-1.5 text-[11px] text-slate-500">Используйте не менее 8 символов.</p></div>
            <button type="submit" disabled={authBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{authBusy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />Подождите…</> : authMode === "signup" ? "Создать аккаунт" : "Войти в аккаунт"}</button>
            <p className="text-center text-xs text-slate-500">Продолжая, вы соглашаетесь с правилами использования сервиса.</p>
          </form>
        </Modal>
      )}

      {/* Admin Login Modal */}
      {adminOpen && !isAdmin && (
        <Modal
          title="Вход для администратора"
          onClose={() => {
            setAdminOpen(false);
            setLoginError("");
          }}
        >
          <p className="mb-4 text-xs text-slate-400">
            Вход в защищенную панель управления. Позволяет просматривать данные водителей и принудительно освобождать места.
          </p>

          {loginError && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/70 p-3 text-xs text-rose-200">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">!</span>
              <span>{loginError}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={submitLogin}>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Логин</label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Имя администратора"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-emerald-500/40 transition focus:border-emerald-500/80 focus:ring-2"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Пароль</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs text-slate-400 hover:text-emerald-400"
                >
                  {showPassword ? "Скрыть" : "Показать"}
                </button>
              </div>
              <input
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-emerald-500/40 transition focus:border-emerald-500/80 focus:ring-2"
              />
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-3 text-xs text-amber-200/90">
              <div className="flex items-start gap-2.5">
                <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  Защищенная зона. После 5 неверных попыток доступ с вашего IP-адреса будет временно заблокирован.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setAdminOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loginBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {loginBusy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    Вход…
                  </>
                ) : (
                  "Войти в систему"
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ label, value, total, tone, badge }) {
  const tones = {
    emerald: {
      border: "border-emerald-500/30 hover:border-emerald-500/60",
      text: "text-emerald-400",
      badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
      glow: "shadow-emerald-500/10",
      bar: "bg-emerald-400",
    },
    rose: {
      border: "border-rose-500/30 hover:border-rose-500/60",
      text: "text-rose-400",
      badge: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
      glow: "shadow-rose-500/10",
      bar: "bg-rose-500",
    },
    sky: {
      border: "border-sky-500/30 hover:border-sky-500/60",
      text: "text-sky-400",
      badge: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
      glow: "shadow-sky-500/10",
      bar: "bg-sky-400",
    },
    amber: {
      border: "border-amber-500/30 hover:border-amber-500/60",
      text: "text-amber-400",
      badge: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
      glow: "shadow-amber-500/10",
      bar: "bg-amber-400",
    },
  };

  const current = tones[tone];
  const percent = total ? Math.min(Math.round((value / total) * 100), 100) : 0;

  return (
    <div
      className={`glass-panel group relative overflow-hidden rounded-3xl p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 ${current.border} ${current.glow}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${current.badge}`}>
          {badge}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className={`text-3xl font-black sm:text-4xl ${current.text}`}>{value}</p>
        {total && <span className="text-xs text-slate-500">из {total}</span>}
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${current.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count, tone = "default" }) {
  const activeClass = {
    default: "bg-white text-slate-950 font-bold shadow-md",
    emerald: "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20",
    rose: "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/20",
    sky: "bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20",
    amber: "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-all duration-200 active:scale-95 ${
        active
          ? activeClass
          : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
      }`}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] ${
            active ? "bg-black/20 font-bold" : "bg-slate-800 text-slate-400"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function LotSection({ title, subtitle, icon, badge, badgeColor, spots, isAdmin, now, onSelect, onRelease, releasingId }) {
  return (
    <section className="glass-panel parking-bay-lines relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 ring-1 ring-white/10">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white sm:text-xl">{title}</h2>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:self-auto ${badgeColor}`}>
          {badge}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {spots.map((spot) => {
          const available = spot.status === "available";
          const remaining = getTimeRemaining(spot.bookedUntil, now);

          return (
            <article
              key={spot.id}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 ${
                available
                  ? "border-emerald-500/30 bg-gradient-to-b from-emerald-950/30 to-slate-950/80 hover:border-emerald-400/80 hover:shadow-xl hover:shadow-emerald-500/10"
                  : "border-rose-500/40 bg-gradient-to-b from-rose-950/30 to-slate-950/90 hover:border-rose-400/80 hover:shadow-xl hover:shadow-rose-500/10"
              }`}
            >
              {/* Top Row: Spot ID & Icon */}
              <button
                type="button"
                disabled={!available}
                onClick={() => available && onSelect(spot)}
                className="w-full text-left disabled:cursor-default"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl font-black text-sm shadow-inner ${
                        available
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                          : "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
                      }`}
                    >
                      {spot.id}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">№{spot.number}</span>
                  </div>

                  {spot.type === "EV" ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40">
                      <BoltIcon className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                      <CarIcon className="h-4 w-4" />
                    </span>
                  )}
                </div>

                {/* Status Indicator */}
                <div className="mt-4 flex items-center justify-between">
                  {available ? (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-xs font-bold text-emerald-400">Свободно</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span className="text-xs font-bold text-rose-400">Занято</span>
                    </div>
                  )}

                  {available && (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 opacity-0 transition-opacity group-hover:opacity-100">
                      Занять →
                    </span>
                  )}
                </div>

                {/* Time Countdown Pill (if booked) */}
                {!available && spot.bookedUntil && remaining && (
                  <div
                    className={`mt-3 flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
                      remaining.expired
                        ? "border-amber-500/40 bg-amber-950/40 text-amber-300 animate-pulse"
                        : "border-rose-500/30 bg-rose-950/40 text-rose-200"
                    }`}
                  >
                    <ClockIcon className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <span className="truncate">
                      {remaining.expired ? "Истекло" : `Осталось: ${remaining.text}`}
                    </span>
                  </div>
                )}

                {/* Admin Extra Details */}
                {isAdmin && !available && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-300">
                    {spot.driverName && (
                      <p className="truncate font-medium text-white">👤 {spot.driverName}</p>
                    )}
                    {spot.licensePlate && (
                      <div className="inline-block rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-emerald-300">
                        {spot.licensePlate}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500">
                      <p>С: {formatClockTime(spot.bookedAt)}</p>
                      {spot.bookedUntil && <p>До: {formatClockTime(spot.bookedUntil)}</p>}
                    </div>
                  </div>
                )}
              </button>

              {/* Admin Action: Release Spot */}
              {isAdmin && !available && (
                <button
                  type="button"
                  onClick={() => onRelease(spot.id)}
                  disabled={releasingId === spot.id}
                  className="mt-3 w-full rounded-xl border border-rose-500/30 bg-rose-500/10 py-1.5 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
                >
                  {releasingId === spot.id ? "Освобождение…" : "Освободить место"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl ring-1 ring-white/10 sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
