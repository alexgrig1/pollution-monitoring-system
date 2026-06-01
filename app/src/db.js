import sqlite3 from "sqlite3";
import path from "path";

sqlite3.verbose();

export const dbPath = path.resolve(process.cwd(), "data", "pollution.db");

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("SQLite connection error:", err.message);
  } else {
    console.log("SQLite connected at:", dbPath);
  }
});

export function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS raw_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        ts TEXT,
        sensor_id TEXT,
        location_id TEXT,
        pm1 REAL,
        pm25 REAL,
        pm10 REAL,
        temperature REAL,
        humidity REAL,
        hour_of_day INTEGER,
        day_of_week INTEGER,
        month_of_year INTEGER,
        shift TEXT,
        inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS discarded_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        ts TEXT,
        sensor_id TEXT,
        location_id TEXT,
        pm25 REAL,
        reason TEXT,
        inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS minute_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        ts TEXT,
        location_id TEXT,
        pm25_avg REAL,
        pm25_min REAL,
        pm25_max REAL,
        count_used INTEGER,
        count_discarded INTEGER,
        inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        ts TEXT,
        location_id TEXT,
        type TEXT,
        severity TEXT,
        message TEXT,
        inserted_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS hourly_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id TEXT,
        pollutant TEXT,
        hour_of_day INTEGER,
        day_of_week INTEGER,
        month_of_year INTEGER,
        avg_value REAL,
        min_value REAL,
        max_value REAL,
        count_used INTEGER,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS daily_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id TEXT,
        pollutant TEXT,
        day_of_week INTEGER,
        month_of_year INTEGER,
        avg_value REAL,
        min_value REAL,
        max_value REAL,
        count_used INTEGER,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS shift_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id TEXT,
        pollutant TEXT,
        shift TEXT,
        day_of_week INTEGER,
        month_of_year INTEGER,
        avg_value REAL,
        min_value REAL,
        max_value REAL,
        count_used INTEGER,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS generated_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_prompt TEXT,
        generated_drl TEXT,
        validation_status TEXT,
        validation_errors TEXT,
        status TEXT DEFAULT 'DRAFT',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("SQLite schema initialized.");
  });
}

export function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({
        lastID: this.lastID,
        changes: this.changes,
      });
    });
  });
}

export function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}