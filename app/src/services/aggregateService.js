import { runSql, allSql } from "../db.js";

const POLLUTANTS = ["pm1", "pm25", "pm10", "temperature", "humidity"];

export async function calculateAggregates() {
  await clearAggregates();

  for (const pollutant of POLLUTANTS) {
    await calculateHourlyAggregates(pollutant);
    await calculateDailyAggregates(pollutant);
    await calculateShiftAggregates(pollutant);
  }

  return {
    ok: true,
    message: "Aggregates calculated",
    pollutants: POLLUTANTS,
  };
}

async function clearAggregates() {
  await runSql(`DELETE FROM hourly_aggregates`);
  await runSql(`DELETE FROM daily_aggregates`);
  await runSql(`DELETE FROM shift_aggregates`);
}

async function calculateHourlyAggregates(pollutant) {
  const rows = await allSql(`
    SELECT
      location_id,
      hour_of_day,
      day_of_week,
      month_of_year,
      AVG(${pollutant}) AS avg_value,
      MIN(${pollutant}) AS min_value,
      MAX(${pollutant}) AS max_value,
      COUNT(*) AS count_used
    FROM raw_readings
    WHERE ${pollutant} IS NOT NULL
    GROUP BY location_id, hour_of_day, day_of_week, month_of_year
  `);

  for (const row of rows) {
    await runSql(
      `
      INSERT INTO hourly_aggregates (
        location_id,
        pollutant,
        hour_of_day,
        day_of_week,
        month_of_year,
        avg_value,
        min_value,
        max_value,
        count_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.location_id,
        pollutant,
        row.hour_of_day,
        row.day_of_week,
        row.month_of_year,
        row.avg_value,
        row.min_value,
        row.max_value,
        row.count_used,
      ]
    );
  }
}

async function calculateDailyAggregates(pollutant) {
  const rows = await allSql(`
    SELECT
      location_id,
      day_of_week,
      month_of_year,
      AVG(${pollutant}) AS avg_value,
      MIN(${pollutant}) AS min_value,
      MAX(${pollutant}) AS max_value,
      COUNT(*) AS count_used
    FROM raw_readings
    WHERE ${pollutant} IS NOT NULL
    GROUP BY location_id, day_of_week, month_of_year
  `);

  for (const row of rows) {
    await runSql(
      `
      INSERT INTO daily_aggregates (
        location_id,
        pollutant,
        day_of_week,
        month_of_year,
        avg_value,
        min_value,
        max_value,
        count_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.location_id,
        pollutant,
        row.day_of_week,
        row.month_of_year,
        row.avg_value,
        row.min_value,
        row.max_value,
        row.count_used,
      ]
    );
  }
}

async function calculateShiftAggregates(pollutant) {
  const rows = await allSql(`
    SELECT
      location_id,
      shift,
      day_of_week,
      month_of_year,
      AVG(${pollutant}) AS avg_value,
      MIN(${pollutant}) AS min_value,
      MAX(${pollutant}) AS max_value,
      COUNT(*) AS count_used
    FROM raw_readings
    WHERE ${pollutant} IS NOT NULL
    GROUP BY location_id, shift, day_of_week, month_of_year
  `);

  for (const row of rows) {
    await runSql(
      `
      INSERT INTO shift_aggregates (
        location_id,
        pollutant,
        shift,
        day_of_week,
        month_of_year,
        avg_value,
        min_value,
        max_value,
        count_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.location_id,
        pollutant,
        row.shift,
        row.day_of_week,
        row.month_of_year,
        row.avg_value,
        row.min_value,
        row.max_value,
        row.count_used,
      ]
    );
  }
}