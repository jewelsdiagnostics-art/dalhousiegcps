# Monica GitHub Web App

Hospital management SPA built with plain HTML, modern browser JavaScript, Firebase Auth, Firestore, and Netlify Functions.

## What This Project Uses

- Static front end served from the repo root
- Firebase Authentication for sign-in and sign-up
- Firestore for application data
- Netlify Functions for payment gateway calls
- Firebase Hosting as an optional static hosting target

## Recommended Deployment Setup

Use this split:

- **GitHub** for source control
- **Netlify** for hosting the app and running `netlify/functions`
- **Firebase** for Auth, Firestore, and Firestore rules

This is the cleanest fit for the current code because `scripts/app.js` already calls `/.netlify/functions/initiate-payment`.

## Firebase Hosting Setup

Firebase Hosting can serve the static app, but it will not run the Netlify Functions in this repo. If you want Firebase Hosting only, you would need to move the payment endpoints to Firebase Cloud Functions or another backend.

This repository now includes:

- [firebase.json](./firebase.json)
- [firestore.rules](./firestore.rules)

That hosting config is SPA-friendly and rewrites all routes to `index.html`.

## Netlify Deployment Checklist

1. Push this repo to GitHub.
2. Create a new Netlify site from that GitHub repository.
3. Set the publish directory to the repo root: `.`.
4. Keep the functions directory as `netlify/functions`.
5. Add these environment variables in Netlify:
   - `PAYUNIT_API_KEY`
   - `PAYUNIT_API_USER`
   - `PAYUNIT_BASE_URL` if your gateway URL differs from the default
   - `PAYMENT_RETURN_URL`
   - `PAYMENT_NOTIFY_URL`
6. Deploy.

## Firebase Setup Checklist

1. Create a Firebase project.
2. Enable **Email/Password** authentication.
3. Create a Firestore database.
4. Copy [scripts/firebase-config.example.js](./scripts/firebase-config.example.js) to [scripts/firebase-config.js](./scripts/firebase-config.js).
5. Fill in the Firebase Web App values in `scripts/firebase-config.js`.
6. Deploy [firestore.rules](./firestore.rules) to Firestore.
7. Seed the database only if you need the SQL import.

## Important Production Notes

- The sign-up form currently lets a user choose a role. For production, do not let end users self-assign elevated roles like `DOCTOR`, `STAFF`, `NURSE`, or `ADMIN`.
- The current security rules only allow new accounts to be created as `PATIENT` records.
- The webhook handler is still a stub and should be extended with signature verification before production use.

## SQL to Firestore Migration

If you need to import existing SQL data:

```bash
npm install
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccount.json
npm run seed:sql
```

Migration docs:

- [docs/firestore-migration.md](./docs/firestore-migration.md)

## Local Run

This project is a static app, so a simple static server is enough for local testing:

```bash
npm install
npm run serve
```

## Files To Configure

- [scripts/firebase-config.js](./scripts/firebase-config.js)
- Netlify environment variables
- Firebase Firestore rules
- Payment webhook verification
