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

// ── DOM refs ──────────────────────────────────
const authScreen      = document.getElementById("authScreen");
const appLayout       = document.getElementById("appLayout");
const logsPanel       = document.getElementById("logsPanel");
const userBadge       = document.getElementById("userBadge");
const authStateEl     = document.getElementById("authState");
const tabsEl          = document.getElementById("tabs");
const moduleContentEl = document.getElementById("moduleContent");
const logsEl          = document.getElementById("logs");

const loginForm    = document.getElementById("loginForm");
const signupForm   = document.getElementById("signupForm");
const logoutBtn    = document.getElementById("logoutBtn");
const loginBtn     = document.getElementById("loginBtn");
const signupBtn    = document.getElementById("signupBtn");
const loginError   = document.getElementById("loginError");
const signupError  = document.getElementById("signupError");

const showLoginBtn   = document.getElementById("showLoginBtn");
const showSignupBtn  = document.getElementById("showSignupBtn");
const switchToSignup = document.getElementById("switchToSignup");
const switchToLogin  = document.getElementById("switchToLogin");

let activeModule = "appointments";
let currentUserProfile = null;

// ── Utility helpers ───────────────────────────
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logsEl.textContent = `${line}\n${logsEl.textContent}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearError(el) {
  el.textContent = "";
  el.classList.add("hidden");
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.original = btn.textContent;
    btn.textContent = "Please wait…";
  } else {
    btn.textContent = btn.dataset.original || btn.textContent;
  }
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/wrong-password":         "Incorrect password. Please try again.",
    "auth/invalid-credential":     "Incorrect email or password.",
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/too-many-requests":      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Please check your connection."
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ── Auth tab toggle ───────────────────────────
function showAuthTab(tab) {
  if (tab === "login") {
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    showLoginBtn.classList.add("active");
    showSignupBtn.classList.remove("active");
    clearError(loginError);
  } else {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    showSignupBtn.classList.add("active");
    showLoginBtn.classList.remove("active");
    clearError(signupError);
  }
}

showLoginBtn.addEventListener("click", () => showAuthTab("login"));
showSignupBtn.addEventListener("click", () => showAuthTab("signup"));
switchToSignup.addEventListener("click", (e) => { e.preventDefault(); showAuthTab("signup"); });
switchToLogin.addEventListener("click",  (e) => { e.preventDefault(); showAuthTab("login"); });

// ── Show/hide auth screen vs. main app ────────
function showView(loggedIn) {
  if (loggedIn) {
    authScreen.classList.add("hidden");
    appLayout.classList.remove("hidden");
    logsPanel.classList.remove("hidden");
    userBadge.classList.remove("hidden");
  } else {
    authScreen.classList.remove("hidden");
    appLayout.classList.add("hidden");
    logsPanel.classList.add("hidden");
    userBadge.classList.add("hidden");
    showAuthTab("login");
  }
}

// ── Module definitions ────────────────────────
const modules = [
  { key: "appointments",  title: "Appointments",  roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "patients",      title: "Patients",      roles: ["DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "lab_tests",     title: "Lab Tests",     roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "prescriptions", title: "Prescriptions", roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] },
  { key: "payments",      title: "Payments",      roles: ["PATIENT", "STAFF", "ADMIN"] },
  { key: "profiles",      title: "Profile",       roles: ["PATIENT", "DOCTOR", "STAFF", "ADMIN", "NURSE"] }
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
      <label>Patient UID <small>(optional for patient role)</small></label>
      <input name="patientUid" placeholder="Patient UID" />
      <label>Doctor UID or ID *</label>
      <input name="doctorId" placeholder="Doctor UID or ID" required />
      <label>Description *</label>
      <textarea name="description" placeholder="Description" required></textarea>
      <label>Date *</label>
      <input name="date" type="date" required />
      <label>Time *</label>
      <input name="time" type="time" required />
      <label>Status</label>
      <select name="appointment_status"><option>PENDING</option><option>ACCEPTED</option><option>COMPLETED</option><option>REJECTED</option><option>CANCELLED</option><option>PAID</option></select>
    `,
    patients: `
      <label>Patient full name *</label>
      <input name="fullName" placeholder="Patient full name" required />
      <label>Email</label>
      <input name="email" type="email" placeholder="Patient email" />
      <label>Contact</label>
      <input name="contact" placeholder="Contact" />
      <label>Address</label>
      <textarea name="address" placeholder="Address"></textarea>
      <label>Medical history</label>
      <textarea name="medicalHistory" placeholder="Medical history"></textarea>
    `,
    lab_tests: `
      <label>Patient UID <small>(optional for patient role)</small></label>
      <input name="patientUid" placeholder="Patient UID" />
      <label>Lab test details *</label>
      <textarea name="details" placeholder="Lab test details" required></textarea>
      <label>Date *</label>
      <input name="date" type="date" required />
      <label>Status</label>
      <select name="test_status"><option>ACCEPTED</option><option>COMPLETED</option><option>CANCELLED</option><option>PAID</option></select>
      <label>Report URL <small>(optional)</small></label>
      <input name="reportUrl" placeholder="Report URL" />
    `,
    prescriptions: `
      <label>Patient UID *</label>
      <input name="patientUid" placeholder="Patient UID" required />
      <label>Appointment ID *</label>
      <input name="appointmentId" placeholder="Appointment ID" required />
      <label>Prescription *</label>
      <textarea name="prescription" placeholder="Prescription" required></textarea>
      <label>Status</label>
      <select name="prescription_status"><option>PENDING</option><option>SHIPPED</option><option>RECEIVED</option><option>COMPLETED</option></select>
      <label>Prescription location</label>
      <input name="prescription_location" placeholder="Prescription location" />
    `,
    payments: `
      <label>Patient UID <small>(optional for patient role)</small></label>
      <input name="patientUid" placeholder="Patient UID" />
      <label>Payment for</label>
      <select name="payment_for"><option>APPOINTMENT</option><option>LAB_TEST</option></select>
      <label>Amount *</label>
      <input name="paid_amount" type="number" min="0" placeholder="Amount (XAF)" required />
      <label>Provider</label>
      <select name="payment_provider"><option>MTN</option><option>ORANGE</option></select>
      <label>Invoice / Reference ID *</label>
      <input name="reference" placeholder="Invoice / Reference ID" required />
      <label>Customer phone *</label>
      <input name="phone" placeholder="e.g. 2376xxxxxxx" required />
    `,
    profiles: `
      <label>Full name *</label>
      <input name="fullName" placeholder="Full name" value="${escapeHtml(currentUserProfile?.fullName || "")}" required />
      <label>Contact</label>
      <input name="contact" placeholder="Contact" value="${escapeHtml(currentUserProfile?.contact || "")}" />
      <label>Address</label>
      <textarea name="address" placeholder="Address">${escapeHtml(currentUserProfile?.address || "")}</textarea>
      <label>Avatar URL</label>
      <input name="avatarUrl" placeholder="Avatar URL" value="${escapeHtml(currentUserProfile?.avatarUrl || "")}" />
    `
  };

  return `
    <form id="moduleForm" class="form-grid module-form" style="margin-bottom:1.2rem">
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
      <strong>${escapeHtml(String(item.fullName || item.description || item.details || item.prescription || item.payment_for || "Record"))}</strong>
      <p>ID: ${escapeHtml(item.id)}</p>
      <pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>
      <button data-id="${escapeHtml(item.id)}" data-module="${escapeHtml(moduleKey)}" class="mark-complete-btn">Mark Completed</button>
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
    moduleContentEl.innerHTML = `<p>Error loading module: ${escapeHtml(error.message)}</p>`;
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
    appointments:  { appointment_status: "COMPLETED" },
    lab_tests:     { test_status: "COMPLETED" },
    prescriptions: { prescription_status: "COMPLETED" },
    payments:      { payment_status: "COMPLETED" }
  };
  if (!fields[moduleKey]) return;
  await updateDoc(ref, { ...fields[moduleKey], updatedAt: serverTimestamp() });
  log(`${moduleKey}/${id}: marked completed`);
}

// ── Auth event listeners ──────────────────────
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  clearError(loginError);
  setLoading(loginBtn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    log(`Signed in: ${email}`);
  } catch (error) {
    showError(loginError, friendlyAuthError(error.code));
    log(`Sign-in failed: ${error.message}`);
  } finally {
    setLoading(loginBtn, false);
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fullName = document.getElementById("signupName").value.trim();
  const email    = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  clearError(signupError);
  setLoading(signupBtn, true);
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", userCred.user.uid), {
      uid: userCred.user.uid,
      fullName,
      email,
      role: "PATIENT",
      user_status: "ACTIVE",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    log(`User created: ${email}`);
  } catch (error) {
    showError(signupError, friendlyAuthError(error.code));
    log(`Sign-up failed: ${error.message}`);
  } finally {
    setLoading(signupBtn, false);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  log("Signed out");
});

// ── Auth state change ─────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUserProfile = null;
    showView(false);
    renderTabs();
    return;
  }

  const profileRef  = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    currentUserProfile = {
      uid:      user.uid,
      email:    user.email,
      fullName: user.email,
      role:     "PATIENT"
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
  showView(true);
  renderTabs();
  renderActiveModule();
});

log("App initialized.");
