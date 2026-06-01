import { runSql, allSql } from "../db.js";
import fs from "fs";
import path from "path";

const FORBIDDEN_PATTERNS = [
  /System\s*\./i,
  /Runtime\s*\./i,
  /ProcessBuilder/i,
  /java\.io/i,
  /java\.nio/i,
  /File\s*\(/i,
  /Socket/i,
  /URL\s*\(/i,
  /ClassLoader/i,
  /reflect/i,
  /eval/i,
  /while\s*\(\s*true\s*\)/i,
];

function getCurrentDrlContext() {
  const filePath = path.resolve(
    process.cwd(),
    "rules",
    "current-pollution-rules.drl"
  );

  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf-8");
}

function stripCodeFences(text) {
  return String(text ?? "")
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function buildPrompt(userPrompt) {
  const currentDrl = getCurrentDrlContext();

  return `
You generate Drools DRL rules for an existing pollution monitoring project.

The exact package is:
package com.myspace.pollution.pollution_rules

Allowed imports only:
import com.myspace.pollution.pollution_rules.SensorReading
import com.myspace.pollution.pollution_rules.PollutionAggregate
import com.myspace.pollution.pollution_rules.Alert
import java.util.Date

Available facts:

SensorReading fields:
sensorId String
locationId String
pm1 Double
pm25 Double
pm10 Double
temperature Double
humidity Double
hourOfDay Integer
dayOfWeek Integer
monthOfYear Integer
shift String

PollutionAggregate fields:
locationId String
pollutant String
periodType String
hourOfDay Integer
dayOfWeek Integer
monthOfYear Integer
shift String
avgValue Double
minValue Double
maxValue Double
countUsed Integer

Alert fields:
type String
message String
severity String
locationId String
ts Date

Existing DRL rules in the project:
${currentDrl || "(No current DRL context file found.)"}

Strict generation rules:
- Output exactly one complete DRL rule.
- Do not output markdown.
- Do not use code fences.
- Do not explain.
- Do not output package/imports unless the user explicitly asks for a full DRL file.
- Do not duplicate existing rule names.
- Follow the style of the existing rules.
- Always create and insert an Alert.
- Always set type, severity, locationId, message, ts.
- Use new Date() for timestamp.
- Use severity LOW, MEDIUM, HIGH, or CRITICAL.
- If the user asks about raw/current/latest sensor values, use SensorReading only.
- If the user asks about average/min/max/count/hour/shift/day/aggregate/historical values, use PollutionAggregate only.
- Do not combine SensorReading and PollutionAggregate unless the user explicitly asks to compare current reading with aggregate.
- Do not invent conditions that the user did not request.
- Do not add hourOfDay/dayOfWeek/monthOfYear/shift filters unless the user explicitly asks for them.
- For aggregate rules, use countUsed >= 10 unless the user explicitly asks for another count.
- Use Java getter syntax in the then block, for example $a.getLocationId(), not $a.locationId.
- In the when block, use Drools field constraints, for example locationId == "room1".

User request:
${userPrompt}
`.trim();
}

async function callOllama(prompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:3b";

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.1,
        top_p: 0.9,
      },
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = JSON.parse(text);
  return data.response;
}

function extractRuleName(drl) {
  const match = String(drl ?? "").match(/rule\s+"([^"]+)"/i);
  return match ? match[1] : null;
}

function getExistingRuleNames() {
  const currentDrl = getCurrentDrlContext();

  const matches = [...currentDrl.matchAll(/rule\s+"([^"]+)"/gi)];

  return matches.map((m) => m[1]);
}

export function validateGeneratedDrl(drl, userPrompt = "") {
  const errors = [];
  const text = String(drl ?? "");
  const prompt = String(userPrompt ?? "");

  if (!text.trim()) errors.push("Generated DRL is empty.");
  if (!text.includes("rule ")) errors.push("Missing rule declaration.");
  if (!text.includes("when")) errors.push("Missing when block.");
  if (!text.includes("then")) errors.push("Missing then block.");
  if (!text.includes("end")) errors.push("Missing end keyword.");

  if (
    text.includes("package ") &&
    !text.includes("package com.myspace.pollution.pollution_rules")
  ) {
    errors.push(
      "Invalid package. Only com.myspace.pollution.pollution_rules is allowed."
    );
  }

  if (!text.includes("Alert")) {
    errors.push("Rule must create an Alert.");
  }

  if (!/insert\s*\(\s*alert\s*\)|insert\s*\(\s*a\s*\)/i.test(text)) {
    errors.push("Rule must insert the created Alert.");
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(`Forbidden Java/API usage detected: ${pattern}`);
    }
  }

  const allowedImports = [
    "import com.myspace.pollution.pollution_rules.SensorReading",
    "import com.myspace.pollution.pollution_rules.PollutionAggregate",
    "import com.myspace.pollution.pollution_rules.Alert",
    "import java.util.Date",
  ];

  const importLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("import "));

  for (const line of importLines) {
    if (!allowedImports.includes(line)) {
      errors.push(`Unsupported import: ${line}`);
    }
  }

  const newRuleName = extractRuleName(text);
  const existingRuleNames = getExistingRuleNames();

  if (newRuleName && existingRuleNames.includes(newRuleName)) {
    errors.push(`Duplicate rule name: ${newRuleName}`);
  }

  const promptMentionsHour =
    /hour|hourly|ώρα|ωρα|συγκεκριμένη ώρα|specific hour/i.test(prompt);

  const promptMentionsDay =
    /day|daily|ημέρα|ημερα|weekday|weekend|day of week/i.test(prompt);

  const promptMentionsMonth =
    /month|monthly|μήνας|μηνας/i.test(prompt);

  const promptMentionsShift =
    /shift|βάρδια|βαρδια|morning|afternoon|night/i.test(prompt);

  if (/hourOfDay\s*==\s*\d+/i.test(text) && !promptMentionsHour) {
    errors.push("Unexpected hourOfDay condition. User did not ask for an hour-specific rule.");
  }

  if (/dayOfWeek\s*==\s*\d+/i.test(text) && !promptMentionsDay) {
    errors.push("Unexpected dayOfWeek condition. User did not ask for a day-specific rule.");
  }

  if (/monthOfYear\s*==\s*\d+/i.test(text) && !promptMentionsMonth) {
    errors.push("Unexpected monthOfYear condition. User did not ask for a month-specific rule.");
  }

  if (/shift\s*==/i.test(text) && !promptMentionsShift) {
    errors.push("Unexpected shift condition. User did not ask for a shift-specific rule.");
  }

  const promptMentionsAggregate =
    /average|avg|min|max|count|aggregate|hourly|daily|shift|historical|μέσο|μεσο|aggregate/i.test(prompt);

  if (text.includes("PollutionAggregate") && !promptMentionsAggregate) {
    errors.push("Rule uses PollutionAggregate, but user did not ask for aggregate/average/min/max/count logic.");
  }

  if (text.includes("SensorReading") && promptMentionsAggregate && !/current|raw|latest|sensor/i.test(prompt)) {
    errors.push("Rule uses SensorReading although the request looks aggregate-based.");
  }

  return {
    ok: errors.length === 0,
    status: errors.length === 0 ? "VALID" : "INVALID",
    errors,
  };
}

export async function generateRuleFromPrompt(userPrompt) {
  const prompt = buildPrompt(userPrompt);
  const raw = await callOllama(prompt);
  const generatedDrl = stripCodeFences(raw);
  const validation = validateGeneratedDrl(generatedDrl, userPrompt);

  const saved = await runSql(
    `
    INSERT INTO generated_rules (
      user_prompt,
      generated_drl,
      validation_status,
      validation_errors,
      status
    )
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      userPrompt,
      generatedDrl,
      validation.status,
      JSON.stringify(validation.errors),
      "DRAFT",
    ]
  );

  return {
    ok: validation.ok,
    id: saved.lastID,
    userPrompt,
    generatedDrl,
    validation,
  };
}

export async function getGeneratedRules(limitInput = 20) {
  const limit = Math.min(Math.max(Number(limitInput ?? 20), 1), 100);

  const rules = await allSql(
    `
    SELECT *
    FROM generated_rules
    ORDER BY id DESC
    LIMIT ?
    `,
    [limit]
  );

  return {
    ok: true,
    count: rules.length,
    rules,
  };
}

export async function getGeneratedRuleById(id) {
  const rows = await allSql(
    `
    SELECT *
    FROM generated_rules
    WHERE id = ?
    LIMIT 1
    `,
    [id]
  );

  if (!rows.length) {
    return {
      ok: false,
      error: "Rule not found",
    };
  }

  return {
    ok: true,
    rule: rows[0],
  };
}

export async function updateGeneratedRuleStatus(id, status) {
  const allowed = ["DRAFT", "APPROVED", "REJECTED", "DEPLOYED"];

  if (!allowed.includes(status)) {
    return {
      ok: false,
      error: `Invalid status. Allowed: ${allowed.join(", ")}`,
    };
  }

  await runSql(
    `
    UPDATE generated_rules
    SET status = ?
    WHERE id = ?
    `,
    [status, id]
  );

  return {
    ok: true,
    id,
    status,
  };
}