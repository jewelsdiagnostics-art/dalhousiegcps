# Firestore Migration Map (from hospital_ms.sql)

## SQL to Firestore Collections

- `users` -> `users/{uid}`
- `appointments` -> `appointments/{docId}`
- `lab_tests` -> `lab_tests/{docId}`
- `prescriptions` -> `prescriptions/{docId}`
- `payments` -> `payments/{docId}`

## Suggested Composite Indexes

1. `appointments`: `patientUid` Asc + `createdAt` Desc
2. `lab_tests`: `patientUid` Asc + `createdAt` Desc
3. `prescriptions`: `patientUid` Asc + `createdAt` Desc
4. `payments`: `patientUid` Asc + `createdAt` Desc

## Import Command

```bash
cd monica_github
npm install
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccount.json
npm run seed:sql
```
