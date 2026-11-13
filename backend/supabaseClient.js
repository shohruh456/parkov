const { createClient } = require("@supabase/supabase-js");

const url = (process.env.SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const isSupabaseConfigured = Boolean(
  url &&
  serviceRoleKey &&
  !url.includes("YOUR_PROJECT") &&
  !serviceRoleKey.includes("your-service-role-key")
);

const supabase = isSupabaseConfigured
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function assertSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env"
    );
  }
}

// Защита от SQL/Wildcard-инъекций: строгая валидация ID формата EV-1..EV-5, R-1..R-10
const SPOT_ID_PATTERN = /^(EV|R)-(?:[1-9]|1[0-5])$/i;

function cleanSpotId(id) {
  const clean = String(id || "").trim().toUpperCase();
  if (!SPOT_ID_PATTERN.test(clean)) {
    throw new Error("Invalid spot ID format. Spot ID must match EV-1..EV-5 or R-1..R-10");
  }
  return clean;
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    status: row.status,
    driverName: row.driver_name,
    licensePlate: row.license_plate,
    bookedAt: row.booked_at,
    bookedUntil: row.booked_until,
  };
}

async function listSpots() {
  assertSupabase();
  const { data, error } = await supabase
    .from("spots")
    .select("id, number, type, status, driver_name, license_plate, booked_at, booked_until")
    .order("number", { ascending: true });

  if (error) throw error;
  return (data || []).map(fromRow);
}

async function getSpot(id) {
  assertSupabase();
  const cleanId = cleanSpotId(id);
  const { data, error } = await supabase
    .from("spots")
    .select("id, number, type, status, driver_name, license_plate, booked_at, booked_until")
    .eq("id", cleanId)
    .maybeSingle();

  if (error) throw error;
  return fromRow(data);
}

async function bookSpot(id, driverName, licensePlate, durationMinutes = 60) {
  assertSupabase();
  const cleanId = cleanSpotId(id);
  const safeMinutes = Math.min(Math.max(Number(durationMinutes) || 60, 15), 1440);
  const bookedAt = new Date().toISOString();
  const bookedUntil = new Date(Date.now() + safeMinutes * 60 * 1000).toISOString();

  // Параметризованный запрос без ilike и спецсимволов
  const { data, error } = await supabase
    .from("spots")
    .update({
      status: "booked",
      driver_name: driverName,
      license_plate: licensePlate,
      booked_at: bookedAt,
      booked_until: bookedUntil,
    })
    .eq("id", cleanId)
    .eq("status", "available")
    .select("id, number, type, status, driver_name, license_plate, booked_at, booked_until")
    .maybeSingle();

  if (error) throw error;
  return fromRow(data);
}

async function releaseSpot(id) {
  assertSupabase();
  const cleanId = cleanSpotId(id);

  const { data, error } = await supabase
    .from("spots")
    .update({
      status: "available",
      driver_name: null,
      license_plate: null,
      booked_at: null,
      booked_until: null,
    })
    .eq("id", cleanId)
    .eq("status", "booked")
    .select("id, number, type, status, driver_name, license_plate, booked_at, booked_until")
    .maybeSingle();

  if (error) throw error;
  return fromRow(data);
}

async function releaseExpiredSpots() {
  if (!isSupabaseConfigured) return;
  try {
    const now = new Date().toISOString();
    await supabase
      .from("spots")
      .update({
        status: "available",
        driver_name: null,
        license_plate: null,
        booked_at: null,
        booked_until: null,
      })
      .eq("status", "booked")
      .lte("booked_until", now);
  } catch (err) {
    console.error("Failed to release expired spots:", err.message);
  }
}

async function ensureSpots() {
  assertSupabase();
  const { count, error } = await supabase
    .from("spots")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  if (count && count > 0) return;

  const seed = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `EV-${i + 1}`,
      number: i + 1,
      type: "EV",
      status: "available",
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `R-${i + 1}`,
      number: i + 6,
      type: "regular",
      status: "available",
    })),
  ];

  const { error: insertError } = await supabase.from("spots").insert(seed);
  if (insertError) throw insertError;
}

module.exports = {
  isSupabaseConfigured,
  supabase,
  cleanSpotId,
  listSpots,
  getSpot,
  bookSpot,
  releaseSpot,
  releaseExpiredSpots,
  ensureSpots,
};
