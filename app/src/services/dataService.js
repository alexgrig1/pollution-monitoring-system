import { allSql } from "../db.js";

function normalizeLimit(value, fallback = 100) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(limit, 1), 500);
}

export async function getReadings(limitInput) {
  const limit = normalizeLimit(limitInput);

  const readings = await allSql(
    `SELECT * FROM raw_readings ORDER BY id DESC LIMIT ?`,
    [limit]
  );

  return {
    ok: true,
    count: readings.length,
    readings,
  };
}

export async function getAlerts(limitInput) {
  const limit = normalizeLimit(limitInput);

  const alerts = await allSql(
    `SELECT * FROM alerts ORDER BY id DESC LIMIT ?`,
    [limit]
  );

  return {
    ok: true,
    count: alerts.length,
    alerts,
  };
}

export async function getHourlyAggregates(limitInput) {
  const limit = normalizeLimit(limitInput);

  const aggregates = await allSql(
    `SELECT * FROM hourly_aggregates ORDER BY calculated_at DESC, id DESC LIMIT ?`,
    [limit]
  );

  return {
    ok: true,
    count: aggregates.length,
    aggregates,
  };
}

export async function getDailyAggregates(limitInput) {
  const limit = normalizeLimit(limitInput);

  const aggregates = await allSql(
    `SELECT * FROM daily_aggregates ORDER BY calculated_at DESC, id DESC LIMIT ?`,
    [limit]
  );

  return {
    ok: true,
    count: aggregates.length,
    aggregates,
  };
}

export async function getShiftAggregates(limitInput) {
  const limit = normalizeLimit(limitInput);

  const aggregates = await allSql(
    `SELECT * FROM shift_aggregates ORDER BY calculated_at DESC, id DESC LIMIT ?`,
    [limit]
  );

  return {
    ok: true,
    count: aggregates.length,
    aggregates,
  };
}