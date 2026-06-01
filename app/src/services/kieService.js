function safeHeadersForLog(headers) {
  const copy = { ...headers };
  if (copy.Authorization) copy.Authorization = "Basic ***";
  return copy;
}

export function getKieConfig() {
  return {
    baseUrl: process.env.KIE_BASE_URL,
    containerId: process.env.KIE_CONTAINER_ID,
    user: process.env.KIE_USER,
    pass: process.env.KIE_PASS,
  };
}

export function validateKieConfig(config) {
  const { baseUrl, containerId, user, pass } = config;
  return Boolean(baseUrl && containerId && user && pass);
}

export function buildKieUrl(baseUrl, containerId) {
  return `${baseUrl}/server/containers/instances/${containerId}`;
}

export function buildKieHeaders(user, pass) {
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-KIE-ContentType": "JSON",
  };
}

export function normalizeReading(body = {}) {
  const now = new Date();

  return {
    sensorId: body.sensorId ?? "S1",
    locationId: body.locationId ?? "room1",
    ts: body.ts ? new Date(body.ts).getTime() : now.getTime(),
    pm1: Number(body.pm1 ?? 0),
    pm25: Number(body.pm25 ?? 0),
    pm10: Number(body.pm10 ?? 0),

    temperature: Number(body.temperature ?? 0),
    humidity: Number(body.humidity ?? 0),

    hourOfDay: now.getHours(),
    dayOfWeek: now.getDay(),
    monthOfYear: now.getMonth() + 1,
    shift: getShift(now),
  };
}

function getShift(date) {
  const h = date.getHours();

  if (h >= 6 && h < 14) return "morning";
  if (h >= 14 && h < 22) return "afternoon";
  return "night";
}

export function buildKiePayload(reading) {
  const kieReading = {
    sensorId: reading.sensorId,
    locationId: reading.locationId,

    pm1: reading.pm1,
    pm25: reading.pm25,
    pm10: reading.pm10,

    temperature: reading.temperature,
    humidity: reading.humidity,

    hourOfDay: reading.hourOfDay,
    dayOfWeek: reading.dayOfWeek,
    monthOfYear: reading.monthOfYear,
    shift: reading.shift,
  };

  return {
    lookup: "defaultStatelessKieSession",
    commands: [
      {
        insert: {
          object: {
            "com.myspace.pollution.pollution_rules.SensorReading": kieReading,
          },
          "out-identifier": "sr",
          "return-object": true,
        },
      },
      { "fire-all-rules": {} },
      { "get-objects": { "out-identifier": "allObjects" } },
    ],
  };
}

export async function callKie({ kieUrl, headers, payload, reqId }) {
  console.log(`[${reqId}] KIE URL: ${kieUrl}`);
  console.log(`[${reqId}] Headers:`, safeHeadersForLog(headers));
  console.log(`[${reqId}] Payload:`, JSON.stringify(payload, null, 2));

  const response = await fetch(kieUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text,
    responseHeaders: Object.fromEntries(response.headers),
  };
}

export function parseKieResponse(text, fallbackReading) {
  const parsed = JSON.parse(text);
  const results = parsed?.result?.["execution-results"]?.results || [];
  const allObjects = results.find((x) => x.key === "allObjects")?.value || [];

  let reading = fallbackReading;
  const alerts = [];

  for (const obj of allObjects) {
    const returnedReading =
      obj["com.myspace.pollution.pollution_rules.SensorReading"];
    const returnedAlert =
      obj["com.myspace.pollution.pollution_rules.Alert"];

    if (returnedReading) reading = returnedReading;
    if (returnedAlert) alerts.push(returnedAlert);
  }

  return {
    reading,
    alerts,
    raw: parsed,
  };
}