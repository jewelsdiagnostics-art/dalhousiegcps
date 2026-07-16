import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_PATH = path.resolve(ROOT, "..", "hospital_ms.sql");
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!SERVICE_ACCOUNT_PATH) {
  throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service-account JSON path.");
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const sql = fs.readFileSync(SQL_PATH, "utf8");

const tableToCollection = {
  users: "users",
  appointments: "appointments",
  lab_tests: "lab_tests",
  prescriptions: "prescriptions",
  payments: "payments"
};

for (const [table, collectionName] of Object.entries(tableToCollection)) {
  const rows = parseInsertTable(sql, table);
  if (!rows.length) {
    console.log(`No rows found for ${table}`);
    continue;
  }

  const chunks = chunk(rows, 400);
  for (const subRows of chunks) {
    const batch = db.batch();
    subRows.forEach((row) => {
      const normalized = normalizeRow(table, row);
      const docId = normalized.uid || String(normalized.id || normalized.user_id || "");
      const ref = docId ? db.collection(collectionName).doc(docId) : db.collection(collectionName).doc();
      batch.set(ref, {
        ...normalized,
        importedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
  }

  console.log(`Imported ${rows.length} rows into ${collectionName}`);
}

console.log("SQL import complete.");

function parseInsertTable(sqlText, tableName) {
  const re = new RegExp(`INSERT INTO \\`${tableName}\\` \\(([^)]+)\\) VALUES\\s*([\\s\\S]*?);`, "g");
  const matches = [...sqlText.matchAll(re)];
  const rows = [];

  for (const match of matches) {
    const columns = match[1].split(",").map((c) => c.replace(/`/g, "").trim());
    const tuples = splitTuples(match[2]);

    for (const tuple of tuples) {
      const values = splitValues(tuple);
      const row = {};
      columns.forEach((col, idx) => {
        row[col] = coerce(values[idx]);
      });
      rows.push(row);
    }
  }

  return rows;
}

function splitTuples(input) {
  const tuples = [];
  let depth = 0;
  let inString = false;
  let start = -1;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const prev = input[i - 1];

    if (ch === "'" && prev !== "\\") inString = !inString;
    if (inString) continue;

    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push(input.slice(start, i));
        start = -1;
      }
    }
  }

  return tuples;
}

function splitValues(tuple) {
  const out = [];
  let inString = false;
  let current = "";

  for (let i = 0; i < tuple.length; i += 1) {
    const ch = tuple[i];
    const prev = tuple[i - 1];

    if (ch === "'" && prev !== "\\") {
      inString = !inString;
      current += ch;
      continue;
    }

    if (ch === "," && !inString) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

function coerce(raw = "") {
  if (raw === "NULL") return null;
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replace(/\\'/g, "'");
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeRow(table, row) {
  if (table === "users") {
    return {
      uid: String(row.user_id),
      id: row.user_id,
      fullName: row.full_name,
      email: row.email,
      username: row.username,
      contact: row.contact,
      address: row.address,
      role: row.user_type,
      user_status: row.user_status,
      legacyPasswordHash: row.password
    };
  }

  if (table === "appointments") {
    return {
      id: row.appointment_id,
      patientUid: String(row.patient_id),
      doctorId: String(row.doctor_id),
      description: row.description,
      date: row.date,
      time: row.time,
      appointment_status: row.appointment_status,
      comments: row.comments
    };
  }

  if (table === "lab_tests") {
    return {
      id: row.test_id,
      patientUid: String(row.patient_id),
      details: row.details,
      date: row.date,
      test_status: row.test_status
    };
  }

  if (table === "prescriptions") {
    return {
      id: row.prescription_id,
      doctorUid: String(row.doctor_id),
      patientUid: String(row.patient_id),
      appointmentId: String(row.appointment_id),
      prescription: row.prescription,
      prescription_status: row.prescription_status,
      prescription_location: row.prescription_location
    };
  }

  if (table === "payments") {
    return {
      id: row.payment_id,
      patientUid: String(row.patient_id),
      payment_for: row.payment_for,
      paid_amount: Number(row.paid_amount),
      gatewayRef: row.stripe_customer_id,
      payment_date: row.payment_date,
      payment_status: "COMPLETED"
    };
  }

  return row;
}
