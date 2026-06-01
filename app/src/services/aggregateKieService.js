import {
  getKieConfig,
  validateKieConfig,
  buildKieUrl,
  buildKieHeaders,
  callKie,
  parseKieResponse,
} from "./kieService.js";

import { allSql, runSql } from "../db.js";

function newReqId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function toPollutionAggregate(row, periodType) {
  return {
    locationId: row.location_id,
    pollutant: row.pollutant,
    periodType,
    hourOfDay: row.hour_of_day ?? null,
    dayOfWeek: row.day_of_week ?? null,
    monthOfYear: row.month_of_year ?? null,
    shift: row.shift ?? null,
    avgValue: Number(row.avg_value ?? 0),
    minValue: Number(row.min_value ?? 0),
    maxValue: Number(row.max_value ?? 0),
    countUsed: Number(row.count_used ?? 0),
  };
}

function buildAggregateKiePayload(aggregates) {
  return {
    lookup: "defaultStatelessKieSession",
    commands: [
      ...aggregates.map((aggregate, index) => ({
        insert: {
          object: {
            "com.myspace.pollution.pollution_rules.PollutionAggregate": aggregate,
          },
          "out-identifier": `aggregate_${index}`,
          "return-object": true,
        },
      })),
      { "fire-all-rules": {} },
      { "get-objects": { "out-identifier": "allObjects" } },
    ],
  };
}

export async function runAggregateRules(limitInput = 100) {
  const reqId = newReqId();
  const kieConfig = getKieConfig();

  if (!validateKieConfig(kieConfig)) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        reqId,
        error: "Missing KIE_* env vars",
      },
    };
  }

  const limit = Math.min(Math.max(Number(limitInput ?? 100), 1), 500);

  const hourlyRows = await allSql(
    `SELECT * FROM hourly_aggregates ORDER BY id DESC LIMIT ?`,
    [limit]
  );

  const dailyRows = await allSql(
    `SELECT * FROM daily_aggregates ORDER BY id DESC LIMIT ?`,
    [limit]
  );

  const shiftRows = await allSql(
    `SELECT * FROM shift_aggregates ORDER BY id DESC LIMIT ?`,
    [limit]
  );

  const aggregates = [
    ...hourlyRows.map((row) => toPollutionAggregate(row, "hourly")),
    ...dailyRows.map((row) => toPollutionAggregate(row, "daily")),
    ...shiftRows.map((row) => toPollutionAggregate(row, "shift")),
  ];

  if (!aggregates.length) {
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        reqId,
        message: "No aggregates found",
        alertsSaved: 0,
      },
    };
  }

  const kieUrl = buildKieUrl(kieConfig.baseUrl, kieConfig.containerId);
  const headers = buildKieHeaders(kieConfig.user, kieConfig.pass);
  const payload = buildAggregateKiePayload(aggregates);

  const kieResult = await callKie({
    kieUrl,
    headers,
    payload,
    reqId,
  });

  if (!kieResult.ok) {
    return {
      ok: false,
      status: kieResult.status,
      body: {
        ok: false,
        reqId,
        kieStatus: kieResult.status,
        kieResponse: kieResult.text,
      },
    };
  }

  const parsed = parseKieResponse(kieResult.text, null);

  for (const alert of parsed.alerts) {
    await saveAggregateAlert(reqId, alert);
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      reqId,
      aggregatesSent: aggregates.length,
      alertsSaved: parsed.alerts.length,
      alerts: parsed.alerts,
    },
  };
}

async function saveAggregateAlert(batchId, alert) {
  await runSql(
    `
    INSERT INTO alerts (batch_id, ts, location_id, type, severity, message)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      batchId,
      alert.ts ?? null,
      alert.locationId ?? null,
      alert.type ?? null,
      alert.severity ?? null,
      alert.message ?? null,
    ]
  );
}