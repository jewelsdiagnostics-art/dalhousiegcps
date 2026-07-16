import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const tabsEl = document.getElementById("tabs");
const moduleContentEl = document.getElementById("moduleContent");
const logsEl = document.getElementById("logs");
const authStateEl = document.getElementById("authState");

const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");

let activeModule = "appointments";
let currentUserProfile = null;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logsEl.textContent = `${line}\n${logsEl.textContent}`;
}

const modules = [
  { key: "appointments", title: "Appointments", roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "patients", title: "Patients", roles: ["DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "lab_tests", title: "Lab Tests", roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "prescriptions", title: "Prescriptions", roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "payments", title: "Payments", roles: ["PATIENT", "STAFF", "ADMIN"] },
  { key: "profiles", title: "Profile", roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] }
];

function getAllowedModules() {
  if (!currentUserProfile) return [];
  return modules.filter((m) => m.roles.includes(currentUserProfile.role));
}

function renderTabs() {
  tabsEl.innerHTML = "";
  const allowed = getAllowedModules();
  if (!allowed.length) {
    moduleContentEl.innerHTML = "<p>Sign in to load modules.</p>";
    return;
  }

  if (!allowed.some((m) => m.key === activeModule)) {
    activeModule = allowed[0].key;
  }

  allowed.forEach((m) => {
    const button = document.createElement("button");
    button.textContent = m.title;
    if (m.key === activeModule) button.classList.add("active");
    button.addEventListener("click", () => {
      activeModule = m.key;
      renderTabs();
      renderActiveModule();
    });
    tabsEl.appendChild(button);
  });
}

function card(html) {
  return `<article class="card">${html}</article>`;
}

async function fetchCollection(moduleKey) {
  const q = query(collection(db, moduleKey), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function renderForm(moduleKey) {
  const sharedFields = {
    appointments: `
      <input name="patientUid" placeholder="Patient UID (optional for patient role)" />
      <input name="doctorId" placeholder="Doctor UID or ID" required />
      <textarea name="description" placeholder="Description" required></textarea>
      <input name="date" type="date" required />
      <input name="time" type="time" required />
      <select name="appointment_status"><option>PENDING</option><option>ACCEPTED</option><option>COMPLETED</option><option>REJECTED</option><option>CANCELLED</option><option>PAID</option></select>
    `,
    patients: `
      <input name="fullName" placeholder="Patient full name" required />
      <input name="email" type="email" placeholder="Patient email" />
      <input name="contact" placeholder="Contact" />
      <textarea name="address" placeholder="Address"></textarea>
      <textarea name="medicalHistory" placeholder="Medical history"></textarea>
    `,
    lab_tests: `
      <input name="patientUid" placeholder="Patient UID (optional for patient role)" />
      <textarea name="details" placeholder="Lab test details" required></textarea>
      <input name="date" type="date" required />
      <select name="test_status"><option>ACCEPTED</option><option>COMPLETED</option><option>CANCELLED</option><option>PAID</option></select>
      <input name="reportUrl" placeholder="Report URL (optional)" />
    `,
    prescriptions: `
      <input name="patientUid" placeholder="Patient UID" required />
      <input name="appointmentId" placeholder="Appointment ID" required />
      <textarea name="prescription" placeholder="Prescription" required></textarea>
      <select name="prescription_status"><option>PENDING</option><option>SHIPPED</option><option>RECEIVED</option><option>COMPLETED</option></select>
      <input name="prescription_location" placeholder="Prescription location" />
    `,
    payments: `
      <input name="patientUid" placeholder="Patient UID (optional for patient role)" />
      <select name="payment_for"><option>APPOINTMENT</option><option>LAB_TEST</option></select>
      <input name="paid_amount" type="number" min="0" placeholder="Amount" required />
      <select name="payment_provider"><option>MTN</option><option>ORANGE</option></select>
      <input name="reference" placeholder="Invoice / Reference ID" required />
      <input name="phone" placeholder="Customer phone (e.g. 2376xxxxxxx)" required />
    `,
    profiles: `
      <input name="fullName" placeholder="Full name" value="${currentUserProfile?.fullName || ""}" required />
      <input name="contact" placeholder="Contact" value="${currentUserProfile?.contact || ""}" />
      <textarea name="address" placeholder="Address">${currentUserProfile?.address || ""}</textarea>
      <input name="avatarUrl" placeholder="Avatar URL" value="${currentUserProfile?.avatarUrl || ""}" />
    `
  };

  return `
    <form id="moduleForm" class="form-grid">
      <h3>Create / Update ${moduleKey.replace("_", " ")}</h3>
      ${sharedFields[moduleKey] || ""}
      <button type="submit">Save</button>
    </form>
  `;
}

function renderList(items, moduleKey) {
  if (!items.length) return "<p>No records yet.</p>";

  return `<div class="list">${items
    .map((item) =>
      card(`
      <strong>${item.fullName || item.description || item.details || item.prescription || item.payment_for || "Record"}</strong>
      <p>ID: ${item.id}</p>
      <pre>${JSON.stringify(item, null, 2)}</pre>
      <button data-id="${item.id}" data-module="${moduleKey}" class="mark-complete-btn">Mark Completed</button>
    `)
    )
    .join("")}</div>`;
}

async function renderActiveModule() {
  if (!currentUserProfile) {
    moduleContentEl.innerHTML = "<p>Sign in to continue.</p>";
    return;
  }

  try {
    let records = [];
    if (activeModule === "profiles") {
      records = [currentUserProfile];
    } else if (currentUserProfile.role === "PATIENT") {
      const q = query(collection(db, activeModule), where("patientUid", "==", auth.currentUser.uid));
      const snap = await getDocs(q);
      records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      records = await fetchCollection(activeModule);
    }

    moduleContentEl.innerHTML = `${renderForm(activeModule)}${renderList(records, activeModule)}`;

    const form = document.getElementById("moduleForm");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveModuleRecord(activeModule, new FormData(form));
        await renderActiveModule();
      });
    }

    moduleContentEl.querySelectorAll(".mark-complete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await markCompleted(btn.dataset.module, btn.dataset.id);
        await renderActiveModule();
      });
    });
  } catch (error) {
    log(`Module render error: ${error.message}`);
    moduleContentEl.innerHTML = `<p>Error loading module: ${error.message}</p>`;
  }
}

async function initiatePayment(formPayload) {
  const response = await fetch("/.netlify/functions/initiate-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: formPayload.payment_provider,
      amount: Number(formPayload.paid_amount),
      phone: formPayload.phone,
      reference: formPayload.reference,
      payerName: currentUserProfile?.fullName || "Patient"
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Payment request failed");
  }

  return data;
}

async function saveModuleRecord(moduleKey, formData) {
  if (!auth.currentUser) return;

  const payload = Object.fromEntries(formData.entries());
  payload.updatedAt = serverTimestamp();

  if (moduleKey === "profiles") {
    await updateDoc(doc(db, "users", auth.currentUser.uid), payload);
    currentUserProfile = { ...currentUserProfile, ...payload };
    log("Profile updated");
    return;
  }

  payload.createdAt = serverTimestamp();
  payload.createdBy = auth.currentUser.uid;
  payload.patientUid = currentUserProfile.role === "PATIENT" ? auth.currentUser.uid : payload.patientUid || null;

  if (moduleKey === "appointments") {
    payload.patientUid = payload.patientUid || auth.currentUser.uid;
  }

  if (moduleKey === "prescriptions") {
    payload.doctorUid = currentUserProfile.role === "DOCTOR" ? auth.currentUser.uid : payload.doctorUid || null;
  }

  if (moduleKey === "payments") {
    const paymentResult = await initiatePayment(payload);
    payload.payment_status = paymentResult.status || "PENDING";
    payload.gateway = paymentResult.gateway;
    payload.gatewayRef = paymentResult.gatewayRef;
  }

  await addDoc(collection(db, moduleKey), payload);
  log(`${moduleKey}: record saved`);
}

async function markCompleted(moduleKey, id) {
  const ref = doc(db, moduleKey, id);
  const fields = {
    appointments: { appointment_status: "COMPLETED" },
    lab_tests: { test_status: "COMPLETED" },
    prescriptions: { prescription_status: "COMPLETED" },
    payments: { payment_status: "COMPLETED" }
  };

  if (!fields[moduleKey]) return;
  await updateDoc(ref, { ...fields[moduleKey], updatedAt: serverTimestamp() });
  log(`${moduleKey}/${id}: marked completed`);
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const role = document.getElementById("signupRole").value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCred.user.uid), {
      uid: userCred.user.uid,
      fullName,
      email,
      role,
      user_status: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    log(`User created: ${email} (${role})`);
  } catch (error) {
    log(`Sign-up failed: ${error.message}`);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    log(`Signed in: ${email}`);
  } catch (error) {
    log(`Sign-in failed: ${error.message}`);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  log("Signed out");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUserProfile = null;
    authStateEl.textContent = "Not signed in";
    renderTabs();
    renderActiveModule();
    return;
  }

  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    currentUserProfile = {
      uid: user.uid,
      email: user.email,
      fullName: user.email,
      role: "PATIENT"
    };
    await setDoc(profileRef, {
      ...currentUserProfile,
      user_status: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    currentUserProfile = profileSnap.data();
  }

  authStateEl.textContent = `${currentUserProfile.fullName} (${currentUserProfile.role})`;
  renderTabs();
  renderActiveModule();
});

log("App initialized. Add scripts/firebase-config.js values before use.");
