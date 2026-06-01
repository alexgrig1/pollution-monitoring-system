import { runSql } from "../db.js";

function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function getShift(hour) {
  if (hour >= 6 && hour < 14) return "morning";
  if (hour >= 14 && hour < 22) return "afternoon";
  return "night";
}

function dayNameBoost(day) {
  // Tuesday / Thursday higher, close to the paper observations
  if (day === 2) return 1.25;
  if (day === 4) return 1.35;
  return 1;
}

function buildReading(date, sensorId, locationId) {
  const hour = date.getHours();
  const day = date.getDay();
  const month = date.getMonth() + 1;
  const shift = getShift(hour);

  const isMorning = shift === "morning";
  const isAfternoon = shift === "afternoon";
  const isNight = shift === "night";
  const boost = dayNameBoost(day);

  let pm1;
  let pm25;
  let pm10;
  let temperature;
  let humidity;

  if (locationId === "room1") {
    pm1 = isMorning ? rand(25, 48) : rand(8, 24);
    pm25 = isMorning ? rand(48, 90) : rand(18, 50);
    pm10 = isMorning ? rand(45, 85) : rand(25, 65);
    temperature = isMorning ? rand(25, 32) : rand(20, 27);
    humidity = rand(38, 62);
  } else if (locationId === "room2") {
    pm1 = rand(8, 28);
    pm25 = rand(22, 58);
    pm10 = isAfternoon ? rand(78, 135) : rand(35, 82);
    temperature = rand(19, 27);
    humidity = isAfternoon ? rand(66, 88) : rand(45, 65);
  } else {
    pm1 = rand(5, 25);
    pm25 = rand(20, 75);
    pm10 = rand(50, 150);
    temperature = rand(18, 34);
    humidity = rand(35, 75);
  }

  if (isNight) {
    pm1 *= 0.55;
    pm25 *= 0.55;
    pm10 *= 0.6;
    temperature -= 3;
  }

  pm1 *= boost;
  pm25 *= boost;
  pm10 *= boost;

  // Critical event: Thursday afternoon
  if (day === 4 && isAfternoon && locationId === "room2") {
    pm25 = rand(76, 105);
    pm10 = rand(125, 180);
    humidity = rand(70, 90);
  }

  return {
    batchId: "demo-seed",
    ts: date.getTime(),
    insertedAt: date.toISOString(),
    sensorId,
    locationId,
    pm1: Math.round(pm1 * 10) / 10,
    pm25: Math.round(pm25 * 10) / 10,
    pm10: Math.round(pm10 * 10) / 10,
    temperature: Math.round(temperature * 10) / 10,
    humidity: Math.round(humidity * 10) / 10,
    hourOfDay: hour,
    dayOfWeek: day,
    monthOfYear: month,
    shift,
  };
}

export async function seedDemoData({ days = 7, intervalMinutes = 15, reset = true } = {}) {
  if (reset) {
    await runSql(`DELETE FROM raw_readings`);
    await runSql(`DELETE FROM alerts`);
    await runSql(`DELETE FROM hourly_aggregates`);
    await runSql(`DELETE FROM daily_aggregates`);
    await runSql(`DELETE FROM shift_aggregates`);
  }

  const sensors = [
    { sensorId: "S1", locationId: "room1" },
    { sensorId: "S2", locationId: "room2" },
    { sensorId: "S3", locationId: "outdoor_south" },
  ];

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - Number(days));
  start.setMinutes(0, 0, 0);

  let inserted = 0;

  for (
    let t = new Date(start);
    t <= now;
    t.setMinutes(t.getMinutes() + Number(intervalMinutes))
  ) {
    for (const sensor of sensors) {
      const r = buildReading(new Date(t), sensor.sensorId, sensor.locationId);

      await runSql(
        `
        INSERT INTO raw_readings (
          batch_id,
          ts,
          sensor_id,
          location_id,
          pm1,
          pm25,
          pm10,
          temperature,
          humidity,
          hour_of_day,
          day_of_week,
          month_of_year,
          shift,
          inserted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          r.batchId,
          r.ts,
          r.sensorId,
          r.locationId,
          r.pm1,
          r.pm25,
          r.pm10,
          r.temperature,
          r.humidity,
          r.hourOfDay,
          r.dayOfWeek,
          r.monthOfYear,
          r.shift,
          r.insertedAt,
        ]
      );

      inserted++;
    }
  }

  return {
    ok: true,
    inserted,
    days,
    intervalMinutes,
    reset,
  };
}