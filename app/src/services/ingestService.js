import {
  getKieConfig,
  validateKieConfig,
  buildKieUrl,
  buildKieHeaders,
  normalizeReading,
  buildKiePayload,
  callKie,
  parseKieResponse,
} from "./kieService.js";

import { runSql } from "../db.js";

export function newReqId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function ingestReading(inputBody) {
  const reqId = newReqId();
  const t0 = Date.now();

  const kieConfig = getKieConfig();

  if (!validateKieConfig(kieConfig)) {
    return {
      ok: false,
      reqId,
      status: 500,
      body: {
        ok: false,
        reqId,
        error: "Missing KIE_* env vars",
        got: {
          KIE_BASE_URL: kieConfig.baseUrl,
          KIE_CONTAINER_ID: kieConfig.containerId,
          KIE_USER: kieConfig.user ? "SET" : "NOT SET",
          KIE_PASS: kieConfig.pass ? "SET" : "NOT SET",
        },
      },
    };
  }

  const reading = normalizeReading(inputBody);
  const kieUrl = buildKieUrl(kieConfig.baseUrl, kieConfig.containerId);
  const headers = buildKieHeaders(kieConfig.user, kieConfig.pass);
  const payload = buildKiePayload(reading);

  try {
    const kieResult = await callKie({
      kieUrl,
      headers,
      payload,
      reqId,
    });

    console.log(`[${reqId}] KIE status: ${kieResult.status}`);
    console.log(`[${reqId}] KIE response headers:`, kieResult.responseHeaders);
    console.log(`[${reqId}] KIE response body (first 1200 chars):`);
    console.log(kieResult.text.slice(0, 1200));
    console.log(`[${reqId}] Total time: ${Date.now() - t0} ms`);

    if (kieResult.ok) {
      const parsed = parseKieResponse(kieResult.text, reading);
      await saveReading(reqId, parsed.reading);

      for (const alert of parsed.alerts) {
        await saveAlert(reqId, parsed.reading, alert);
      }

      console.log(
        `[${reqId}] Saved to DB: 1 reading, ${parsed.alerts.length} alerts`
      );
    }

    return {
      ok: kieResult.ok,
      reqId,
      status: kieResult.status,
      body: {
        ok: kieResult.ok,
        reqId,
        kieStatus: kieResult.status,
        kieUrl,
        request: {
          reading,
          payload,
        },
        kieResponse: kieResult.text,
      },
    };
  } catch (error) {
    console.error(`[${reqId}] Error calling KIE server:`, error);

    return {
      ok: false,
      reqId,
      status: 500,
      body: {
        ok: false,
        reqId,
        error: String(error),
        kieUrl,
        hint:
          "If ECONNREFUSED: jbpm server may still be starting. Check docker logs jbpm-server-full until it finishes boot.",
      },
    };
  }
}

async function saveReading(batchId, reading) {
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
    shift
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      batchId,
      reading.ts ?? null,
      reading.sensorId ?? null,
      reading.locationId ?? null,
      Number(reading.pm1 ?? 0),
      Number(reading.pm25 ?? 0),
      Number(reading.pm10 ?? 0),
      Number(reading.temperature ?? 0),
      Number(reading.humidity ?? 0),
      reading.hourOfDay ?? null,
      reading.dayOfWeek ?? null,
      reading.monthOfYear ?? null,
      reading.shift ?? null,
    ]
  );
}

async function saveAlert(batchId, reading, alert) {
  await runSql(
    `
    INSERT INTO alerts (batch_id, ts, location_id, type, severity, message)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      batchId,
      alert.ts ?? null,
      reading.locationId ?? null,
      alert.type ?? null,
      alert.severity ?? null,
      alert.message ?? null,
    ]
  );
}