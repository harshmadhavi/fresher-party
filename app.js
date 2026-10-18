/**
 * Ice Breaker 2026 Engine
 * Themed Dual-Scanner, Instant QR Generation, Direct Image WhatsApp Sharing,
 * Manual Cash Collection, Scan Result Popups, and Live Total Fees Calculation.
 */

const STORAGE_KEY = "fresher_party_db_2026";
const ADMIN_PIN = "admin123";
const TICKET_PRICE = 350;

// 1. FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyAfR6MRRe0OpkMxahAmH0falyK7fsph26A",
  authDomain: "fresher-party-2026-1.firebaseapp.com",
  projectId: "fresher-party-2026-1",
  storageBucket: "fresher-party-2026-1.firebasestorage.app",
  messagingSenderId: "906401382194",
  appId: "1:906401382194:web:b3bb86c8c767d284db612b",
  measurementId: "G-LYFHXCVKB2"
};

// 2. INITIALIZE FIREBASE & FIRESTORE VIA CDN
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let attendeesCache = []; // Real-time synchronized cache
let currentActiveScanner = null;
let currentScannerMode = null; // 'GATE' or 'FOOD'
let currentInspectingAttendee = null; // Active attendee in modal
let logoTapCount = 0;
let logoTapTimer = null;

// ================= REAL-TIME FIRESTORE LISTENER =================
db.collection("attendees").onSnapshot((snapshot) => {
  attendeesCache = [];
  snapshot.forEach((doc) => {
    attendeesCache.push({ id: doc.id, ...doc.data() });
  });
  renderAdminTable();
}, (error) => {
  console.error("Firestore sync error:", error);
});

function getDatabase() {
  return attendeesCache;
}

function generateTicketId(year) {
  const seq = String(attendeesCache.length + 1).padStart(4, "0");
  return `IB-2026-${year.toUpperCase()}-${seq}`;
}

async function createQrDataUrl(payloadText) {
  try {
    return await QRCode.toDataURL(payloadText, {
      width: 450,
      margin: 2,
      color: { dark: "#0c1e3d", light: "#ffffff" }
    });
  } catch (err) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payloadText)}`;
  }
}

// Convert Base64 DataURL to real File object for WhatsApp native image sharing
async function dataUrlToFile(dataUrl, fileName) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: "image/png" });
}

// ================= AUDIO TONES =================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAudio(type) {
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(170, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {
    console.warn("Audio Context issue:", e);
  }
}

// ================= NOTIFICATION TOAST =================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  const colors = {
    success: "bg-emerald-950/90 border-emerald-500/50 text-emerald-200",
    error: "bg-rose-950/90 border-rose-500/50 text-rose-200",
    warning: "bg-amber-950/90 border-amber-500/50 text-amber-200",
    info: "bg-[#0d1d36]/95 border-[#1e3a66] text-slate-200"
  };

  toast.className = `p-3 rounded-2xl border shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center justify-between pointer-events-auto transition-all duration-300 translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.remove("translate-y-2", "opacity-0"), 10);
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-x-full");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ================= SECRET 5-CLICK ADMIN TRIGGER =================
const logoTrigger = document.getElementById("secret-logo-trigger");
const exitBtn = document.getElementById("admin-exit-btn");

if (logoTrigger) {
  logoTrigger.addEventListener("click", () => {
    logoTapCount++;

    clearTimeout(logoTapTimer);
    logoTapTimer = setTimeout(() => {
      logoTapCount = 0;
    }, 2500);

    if (logoTapCount >= 5) {
      logoTapCount = 0;
      const inputPin = prompt("Enter Secret Admin PIN:");
      if (inputPin === ADMIN_PIN) {
        document.getElementById("view-register")?.classList.add("hidden");
        document.getElementById("view-student")?.classList.add("hidden");
        document.getElementById("view-admin")?.classList.remove("hidden");
        exitBtn?.classList.remove("hidden");
        showToast("Admin session unlocked!", "success");
        renderAdminTable();
        switchAdminTab("table");
      } else if (inputPin !== null) {
        showToast("Incorrect Admin PIN!", "error");
        playAudio("error");
      }
    }
  });
}

if (exitBtn) {
  exitBtn.addEventListener("click", () => {
    stopCamera();
    document.getElementById("view-admin")?.classList.add("hidden");
    document.getElementById("view-register")?.classList.remove("hidden");
    document.getElementById("view-student")?.classList.remove("hidden");
    exitBtn.classList.add("hidden");
    showToast("Exited Admin View", "info");
  });
}

// ================= ADMIN SUB-NAVIGATION =================
window.switchAdminTab = function (tab) {
  const tableSection = document.getElementById("admin-table-section");
  const gateSection = document.getElementById("admin-gate-section");
  const foodSection = document.getElementById("admin-food-section");

  const tableBtn = document.getElementById("admin-tab-table-btn");
  const gateBtn = document.getElementById("admin-tab-gate-btn");
  const foodBtn = document.getElementById("admin-tab-food-btn");

  stopCamera();

  tableSection?.classList.add("hidden");
  gateSection?.classList.add("hidden");
  foodSection?.classList.add("hidden");

  [tableBtn, gateBtn, foodBtn].forEach(btn => {
    if (btn) btn.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-white flex items-center justify-center gap-1 transition";
  });

  if (tab === "table") {
    tableSection?.classList.remove("hidden");
    if (tableBtn) tableBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-[#1b3b6f] text-white flex items-center justify-center gap-1 transition";
  } else if (tab === "gate") {
    gateSection?.classList.remove("hidden");
    if (gateBtn) gateBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-[#1b3b6f] text-white flex items-center justify-center gap-1 transition";
  } else if (tab === "food") {
    foodSection?.classList.remove("hidden");
    if (foodBtn) foodBtn.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-[#1b3b6f] text-white flex items-center justify-center gap-1 transition";
  }

  lucide.createIcons();
};

// ================= SENIOR REGISTRATION =================
const regForm = document.getElementById("registration-form");
const regScreenshot = document.getElementById("reg-screenshot");
const screenshotPreview = document.getElementById("screenshot-preview");
const previewContainer = document.getElementById("screenshot-preview-container");
let uploadedScreenshotBase64 = "";

if (regScreenshot) {
  regScreenshot.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedScreenshotBase64 = event.target.result;
      if (screenshotPreview) screenshotPreview.src = uploadedScreenshotBase64;
      previewContainer?.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}

if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("reg-name").value.trim();
    const year = document.getElementById("reg-year").value;
    const phone = document.getElementById("reg-phone").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();

    if (!/^\d{10}$/.test(phone)) {
      showToast("Please enter a 10-digit WhatsApp number", "error");
      return;
    }

    if (attendeesCache.some(a => a.phoneNumber === phone)) {
      showToast("This phone number is already registered!", "error");
      return;
    }

    const ticketId = generateTicketId(year);
    const qrCodeDataUrl = await createQrDataUrl(ticketId);

    const newAttendee = {
      ticketId: ticketId,
      fullName: name,
      academicYear: year,
      phoneNumber: phone,
      email: email,
      paymentScreenshotUrl: uploadedScreenshotBase64,
      paymentStatus: "PENDING",
      paymentMode: "ONLINE_UPI",
      feeAmount: TICKET_PRICE, // ₹350
      qrCodeDataUrl: qrCodeDataUrl,
      hasEntered: false,
      enteredAt: null,
      foodClaimed: false,
      foodClaimedAt: null,
      createdAt: new Date().toISOString()
    };

    try {
      await db.collection("attendees").add(newAttendee);
      playAudio("success");
      showToast(`Registration received, ${name}! QR created in admin.`, "success");

      const nameDisplay = document.getElementById("submitted-student-name");
      if (nameDisplay) nameDisplay.textContent = name;
      document.getElementById("submission-confirmation")?.classList.remove("hidden");
      regForm.classList.add("hidden");
    } catch (err) {
      console.error(err);
      showToast("Cloud connection error. Try again.", "error");
    }
  });
}

// ================= FIRST YEAR REGISTRATION =================
const fyForm = document.getElementById("fy-registration-form");

if (fyForm) {
  fyForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("reg-name").value.trim();
    const phone = document.getElementById("reg-phone").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();

    if (!/^\d{10}$/.test(phone)) {
      showToast("Please enter a valid 10-digit WhatsApp number", "error");
      return;
    }

    if (attendeesCache.some(a => a.phoneNumber === phone)) {
      showToast("This phone number is already registered!", "error");
      return;
    }

    const ticketId = generateTicketId("FY");
    const qrCodeDataUrl = await createQrDataUrl(ticketId);

    const newAttendee = {
      ticketId: ticketId,
      fullName: name,
      academicYear: "FY",
      phoneNumber: phone,
      email: email,
      paymentScreenshotUrl: null,
      paymentStatus: "PENDING",
      paymentMode: "FREE_FY",
      feeAmount: 0,
      qrCodeDataUrl: qrCodeDataUrl,
      hasEntered: false,
      enteredAt: null,
      foodClaimed: false,
      foodClaimedAt: null,
      createdAt: new Date().toISOString()
    };

    try {
      await db.collection("attendees").add(newAttendee);
      playAudio("success");
      showToast(`Registration received, ${name}! QR created in admin.`, "success");

      const nameDisplay = document.getElementById("confirmed-student-name");
      const phoneDisplay = document.getElementById("confirmed-phone");
      if (nameDisplay) nameDisplay.textContent = name;
      if (phoneDisplay) phoneDisplay.textContent = phone;
      document.getElementById("submission-confirmation")?.classList.remove("hidden");
      fyForm.classList.add("hidden");
    } catch (err) {
      console.error(err);
      showToast("Cloud connection error. Try again.", "error");
    }
  });
}

// ================= MANUAL CASH ENTRY =================
window.openCashModal = function() {
  document.getElementById("cash-entry-modal")?.classList.remove("hidden");
  document.getElementById("cash-entry-modal")?.classList.add("flex");
};

window.closeCashModal = function() {
  document.getElementById("cash-entry-modal")?.classList.add("hidden");
  document.getElementById("cash-entry-modal")?.classList.remove("flex");
  document.getElementById("cash-entry-form")?.reset();
};

document.getElementById("cash-entry-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("cash-name").value.trim();
  const year = document.getElementById("cash-year").value;
  const phone = document.getElementById("cash-phone").value.trim();
  const email = document.getElementById("cash-email").value.trim().toLowerCase() || `${phone}@cash.local`;

  if (!/^\d{10}$/.test(phone)) {
    showToast("Please enter a valid 10-digit phone number", "error");
    return;
  }

  if (attendeesCache.some(a => a.phoneNumber === phone)) {
    showToast("This phone number is already registered!", "error");
    return;
  }

  const ticketId = generateTicketId(year);
  const qrCodeDataUrl = await createQrDataUrl(ticketId);

  const cashAttendee = {
    ticketId: ticketId,
    fullName: name,
    academicYear: year,
    phoneNumber: phone,
    email: email,
    paymentScreenshotUrl: null,
    paymentStatus: "APPROVED",
    paymentMode: "CASH_COLLECTED",
    feeAmount: year === "FY" ? 0 : TICKET_PRICE, // ₹350
    qrCodeDataUrl: qrCodeDataUrl,
    hasEntered: false,
    enteredAt: null,
    foodClaimed: false,
    foodClaimedAt: null,
    createdAt: new Date().toISOString()
  };

  try {
    const docRef = await db.collection("attendees").add(cashAttendee);
    playAudio("success");
    showToast(`Cash payment verified & pass created!`, "success");
    closeCashModal();
    inspectPass(docRef.id);
  } catch (err) {
    console.error(err);
    showToast("Cloud sync failed.", "error");
  }
});

// ================= DOUBLE-CONFIRMATION PARTICIPANT DELETION =================
window.deleteParticipant = async function(id) {
  const attendee = attendeesCache.find(a => a.id === id);
  if (!attendee) return;

  const firstConfirm = confirm(`[1/2] Are you sure you want to delete ${attendee.fullName} (${attendee.ticketId})?`);
  if (!firstConfirm) return;

  const secondConfirm = prompt(`[2/2] CRITICAL CONFIRMATION:\nType DELETE to completely remove ${attendee.fullName} from the cloud database:`);
  if (secondConfirm === "DELETE" || secondConfirm === "delete") {
    try {
      await db.collection("attendees").doc(id).delete();
      playAudio("error");
      showToast(`Participant ${attendee.fullName} deleted permanently.`, "info");
    } catch (err) {
      console.error(err);
      showToast("Delete failed.", "error");
    }
  } else {
    showToast("Deletion cancelled.", "warning");
  }
};

// ================= ADMIN TABLE & LIVE TOTAL FEES METRICS =================
function renderAdminTable() {
  const searchInput = document.getElementById("admin-search-input");
  const search = (searchInput?.value || "").toLowerCase();

  const total = attendeesCache.length;
  const pending = attendeesCache.filter(a => a.paymentStatus === "PENDING").length;
  const approved = attendeesCache.filter(a => a.paymentStatus === "APPROVED").length;
  const entered = attendeesCache.filter(a => a.hasEntered).length;

  const approvedList = attendeesCache.filter(a => a.paymentStatus === "APPROVED");
  
  let totalFees = 0;
  let upiFees = 0;
  let cashFees = 0;

  approvedList.forEach(a => {
    const fee = a.feeAmount !== undefined ? a.feeAmount : (a.academicYear === "FY" ? 0 : TICKET_PRICE);
    totalFees += fee;

    if (a.paymentMode === "CASH_COLLECTED") {
      cashFees += fee;
    } else if (a.paymentMode === "ONLINE_UPI") {
      upiFees += fee;
    }
  });

  if (document.getElementById("stat-fees")) document.getElementById("stat-fees").textContent = totalFees.toLocaleString("en-IN");
  if (document.getElementById("stat-upi-fees")) document.getElementById("stat-upi-fees").textContent = upiFees.toLocaleString("en-IN");
  if (document.getElementById("stat-cash-fees")) document.getElementById("stat-cash-fees").textContent = cashFees.toLocaleString("en-IN");

  if (document.getElementById("stat-total")) document.getElementById("stat-total").textContent = total;
  if (document.getElementById("stat-pending")) document.getElementById("stat-pending").textContent = pending;
  if (document.getElementById("stat-approved")) document.getElementById("stat-approved").textContent = approved;
  if (document.getElementById("stat-sent")) document.getElementById("stat-sent").textContent = approved;
  if (document.getElementById("stat-entered")) document.getElementById("stat-entered").textContent = entered;

  const filtered = attendeesCache.filter(a =>
    a.fullName.toLowerCase().includes(search) ||
    a.ticketId.toLowerCase().includes(search) ||
    a.phoneNumber.includes(search)
  );

  const tbody = document.getElementById("attendee-table-body");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500">No student records found in cloud.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const isApproved = a.paymentStatus === "APPROVED";
    const paymentLabel = a.paymentMode === "CASH_COLLECTED" 
      ? '<span class="text-amber-300 font-bold">💵 Cash (₹350)</span>' 
      : a.paymentScreenshotUrl 
        ? `<button onclick="viewScreenshot('${a.id}')" class="text-indigo-300 hover:underline">Slip Proof 🖼️</button>`
        : '<span class="text-slate-400">Free Pass (₹0)</span>';

    return `
      <tr class="hover:bg-[#12284c]/40 transition">
        <td class="p-3">
          <div class="font-bold text-white text-xs">${a.fullName}</div>
          <span class="text-amber-200 text-[10px] font-mono">${a.ticketId} • ${a.academicYear}</span>
        </td>
        <td class="p-3">
          <button onclick="inspectPass('${a.id}')" class="flex items-center gap-1.5 bg-[#081220] hover:bg-[#152a4e] p-1 rounded-xl border border-[#1b345b] group">
            <img src="${a.qrCodeDataUrl}" class="w-8 h-8 rounded-lg bg-white p-0.5 object-contain" alt="QR" />
            <span class="text-[10px] text-amber-200 group-hover:underline font-mono">View QR</span>
          </button>
        </td>
        <td class="p-3 text-[11px] font-mono">
          ${paymentLabel}
        </td>
        <td class="p-3">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}">
            ${isApproved ? 'PASS ACTIVE' : 'PENDING'}
          </span>
        </td>
        <td class="p-3 text-[10px]">
          <span class="${a.hasEntered ? 'text-emerald-400 font-bold' : 'text-slate-500'}">Gate: ${a.hasEntered ? 'IN' : 'NO'}</span><br/>
          <span class="${a.foodClaimed ? 'text-purple-400 font-bold' : 'text-slate-500'}">Food: ${a.foodClaimed ? 'CLAIMED' : 'NO'}</span>
        </td>
        <td class="p-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${!isApproved ? `
              <button onclick="approveAndOpenWhatsApp('${a.id}')" class="bg-[#1b3b6f] hover:bg-[#254e91] text-amber-200 border border-[#2d5596] font-bold text-[10px] px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow">
                <i data-lucide="send" class="w-3 h-3"></i> Approve & Send
              </button>
            ` : `
              <button onclick="inspectPass('${a.id}')" class="bg-[#081220] hover:bg-[#12284c] text-slate-200 border border-[#1b345b] text-[10px] px-2.5 py-1.5 rounded-xl flex items-center gap-1">
                <i data-lucide="qr-code" class="w-3 h-3"></i> View Pass
              </button>
            `}
            <button onclick="deleteParticipant('${a.id}')" class="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px] px-2 py-1.5 rounded-xl flex items-center gap-1" title="Delete Participant">
              <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  lucide.createIcons();
}

document.getElementById("admin-search-input")?.addEventListener("input", renderAdminTable);

// Approve in Cloud & Open WhatsApp with direct image link
window.approveAndOpenWhatsApp = async function (id) {
  const attendee = attendeesCache.find(a => a.id === id);
  if (!attendee) return;

  try {
    await db.collection("attendees").doc(id).update({ paymentStatus: "APPROVED" });
    playAudio("success");
    showToast(`Approved ${attendee.fullName}!`, "success");

    const cloudQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(attendee.ticketId)}`;

    const message = encodeURIComponent(
      `🎟️ *ICE BREAKER 2026 OFFICIAL EVENT PASS & FOOD VOUCHER*\n\n` +
      `Hello *${attendee.fullName}*! Your pass has been approved.\n\n` +
      `🎫 *Ticket ID:* ${attendee.ticketId}\n` +
      `🎓 *Batch:* ${attendee.academicYear} Student\n` +
      `📅 *Date:* 23 Oct, 2026 at 10:30 AM\n` +
      `📍 *Venue:* Seminar Hall\n` +
      `👔 *Dress Code:* Indo Western\n` +
      `✅ *Gate Pass:* Valid for 1 Main Entry\n` +
      `🍽 *Refreshment Coupon:* Included\n\n` +
      `🔗 *Your QR Pass Image:* ${cloudQrUrl}\n\n` +
      `_Show this QR code at the entrance gate to scan and enter!_`
    );

    window.open(`https://wa.me/91${attendee.phoneNumber}?text=${message}`, "_blank");
  } catch (err) {
    console.error(err);
    showToast("Update failed.", "error");
  }
};

window.inspectPass = function (id) {
  const attendee = attendeesCache.find(a => a.id === id);
  if (!attendee) return;

  currentInspectingAttendee = attendee;

  document.getElementById("inspect-student-name").textContent = attendee.fullName;
  document.getElementById("inspect-ticket-id").textContent = attendee.ticketId;
  document.getElementById("inspect-phone").textContent = attendee.phoneNumber;
  
  const qrImg = document.getElementById("inspect-qr-img");
  qrImg.src = attendee.qrCodeDataUrl;
  
  const qrLabel = document.getElementById("inspect-qr-label");
  if (qrLabel) qrLabel.textContent = `${attendee.ticketId} • ${attendee.academicYear}`;

  const downloadBtn = document.getElementById("inspect-download-btn");
  if (downloadBtn) {
    downloadBtn.href = attendee.qrCodeDataUrl;
    downloadBtn.download = `${attendee.ticketId}_Pass.png`;
  }

  const modal = document.getElementById("pass-inspect-modal");
  modal?.classList.remove("hidden");
  modal?.classList.add("flex");
};

// ================= NATIVE IMAGE SHARING ON WHATSAPP =================
window.sharePassOnWhatsApp = async function () {
  if (!currentInspectingAttendee) return;
  const a = currentInspectingAttendee;

  const cloudQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(a.ticketId)}`;

  const captionText = 
    `🎟️ *ICE BREAKER 2026 EVENT PASS*\n\n` +
    `👤 *Attendee:* ${a.fullName}\n` +
    `🎫 *Ticket ID:* ${a.ticketId} (${a.academicYear})\n` +
    `📅 *Date:* 23 Oct, 2026 at 10:30 AM\n` +
    `📍 *Venue:* Seminar Hall\n` +
    `👔 *Dress Code:* Indo Western\n` +
    `🍽 *Refreshment:* Included\n\n` +
    `🔗 *View / Save Pass:* ${cloudQrUrl}\n\n` +
    `_Show this QR code at the entrance gate & food counter!_`;

  try {
    // Attempt native file share on Android/iOS (attaches actual QR image)
    if (navigator.canShare && a.qrCodeDataUrl.startsWith("data:image")) {
      const qrFile = await dataUrlToFile(a.qrCodeDataUrl, `${a.ticketId}_pass.png`);
      
      if (navigator.canShare({ files: [qrFile] })) {
        await navigator.share({
          files: [qrFile],
          title: `Pass - ${a.fullName}`,
          text: captionText
        });
        return;
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return; // User closed share sheet
    console.warn("Native file share fallback:", err);
  }

  // Fallback: Opens WhatsApp chat with text and direct clickable image link
  const waUrl = `https://wa.me/91${a.phoneNumber}?text=${encodeURIComponent(captionText)}`;
  window.open(waUrl, "_blank");
};

window.closePassInspectModal = function () {
  const modal = document.getElementById("pass-inspect-modal");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
};

window.viewScreenshot = function (id) {
  const item = attendeesCache.find(a => a.id === id);
  if (item && item.paymentScreenshotUrl) {
    document.getElementById("modal-img-view").src = item.paymentScreenshotUrl;
    const modal = document.getElementById("image-modal");
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  } else {
    showToast("No screenshot uploaded", "warning");
  }
};

window.closeScreenshotModal = function () {
  const modal = document.getElementById("image-modal");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
};

// ================= DUAL SCANNERS =================
window.startCamera = function (mode) {
  stopCamera();
  currentScannerMode = mode;

  const elementId = mode === "GATE" ? "qr-reader-gate" : "qr-reader-food";
  const placeholderId = mode === "GATE" ? "scanner-placeholder-gate" : "scanner-placeholder-food";

  document.getElementById(placeholderId)?.classList.add("hidden");

  currentActiveScanner = new Html5Qrcode(elementId);
  const config = { fps: 15, qrbox: { width: 220, height: 220 } };

  currentActiveScanner
    .start({ facingMode: "environment" }, config, onQrScanned)
    .catch(() => {
      currentActiveScanner.start({ facingMode: "user" }, config, onQrScanned).catch(() => {
        showToast("Camera access failed.", "error");
        document.getElementById(placeholderId)?.classList.remove("hidden");
      });
    });
};

window.stopCamera = function () {
  if (currentActiveScanner) {
    currentActiveScanner.stop().then(() => {
      currentActiveScanner.clear();
      document.getElementById("scanner-placeholder-gate")?.classList.remove("hidden");
      document.getElementById("scanner-placeholder-food")?.classList.remove("hidden");
      currentActiveScanner = null;
    }).catch(e => console.error(e));
  }
};

let lastScanTime = 0;
function onQrScanned(decodedText) {
  const now = Date.now();
  if (now - lastScanTime < 2500) return;
  lastScanTime = now;
  processScanMode(decodedText.trim(), currentScannerMode);
}

window.handleManualVerify = function(mode) {
  const inputId = mode === "GATE" ? "manual-gate-input" : "manual-food-input";
  const val = document.getElementById(inputId)?.value.trim();
  if (val) processScanMode(val, mode);
};

function showScanPopup(htmlContent, borderColor = "border-[#1b3b6f]") {
  const modal = document.getElementById("scan-popup-modal");
  const body = document.getElementById("scan-popup-body");
  if (!modal || !body) return;

  body.className = `bg-[#0c1c34] border-2 ${borderColor} rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl modal-enter`;
  body.innerHTML = `
    ${htmlContent}
    <button onclick="closeScanPopup()" class="w-full bg-[#1b3b6f] hover:bg-[#254e91] text-white font-bold text-xs py-3 rounded-xl transition">
      Close & Continue Scanning
    </button>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  lucide.createIcons();
}

window.closeScanPopup = function() {
  const modal = document.getElementById("scan-popup-modal");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
};

async function processScanMode(ticketPayload, mode) {
  const attendee = attendeesCache.find(a => 
    a.ticketId.toUpperCase() === ticketPayload.toUpperCase() ||
    ticketPayload.toUpperCase().includes(a.ticketId.toUpperCase())
  );

  if (!attendee) {
    playAudio("error");
    showScanPopup(`
      <div class="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl font-bold border border-rose-500/30">
        ✕
      </div>
      <div>
        <h3 class="text-lg font-black text-rose-400">Invalid QR Pass</h3>
        <p class="text-xs text-slate-300 mt-1">Ticket ID "${ticketPayload}" was not found.</p>
      </div>
    `, "border-rose-500/60");
    return;
  }

  if (attendee.paymentStatus !== "APPROVED") {
    playAudio("error");
    showScanPopup(`
      <div class="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold border border-amber-500/30">
        !
      </div>
      <div>
        <h3 class="text-lg font-black text-amber-300">Pass Awaiting Approval</h3>
        <p class="text-xs text-slate-300 mt-1">${attendee.fullName}'s registration has not been verified yet.</p>
      </div>
      <div class="p-3 bg-[#081220] rounded-xl text-left text-xs font-mono border border-[#1b345b]">
        <div>Ticket: ${attendee.ticketId}</div>
        <div>Batch: ${attendee.academicYear}</div>
      </div>
    `, "border-amber-500/60");
    return;
  }

  if (mode === "GATE") {
    if (attendee.hasEntered) {
      playAudio("error");
      const timeStr = new Date(attendee.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      showScanPopup(`
        <div class="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold border border-amber-500/30">
          ⚠️
        </div>
        <div>
          <h3 class="text-lg font-black text-amber-300">Already Inside Gate</h3>
          <p class="text-xs text-slate-300 mt-1">${attendee.fullName} already checked in at <strong>${timeStr}</strong></p>
        </div>
        <div class="p-3 bg-[#081220] rounded-xl text-left text-xs font-mono border border-[#1b345b] space-y-1">
          <div><span class="text-slate-500">Ticket:</span> ${attendee.ticketId}</div>
          <div><span class="text-slate-500">Batch:</span> ${attendee.academicYear}</div>
        </div>
      `, "border-amber-500/60");
    } else {
      await db.collection("attendees").doc(attendee.id).update({
        hasEntered: true,
        enteredAt: new Date().toISOString()
      });
      playAudio("success");

      showScanPopup(`
        <div class="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold border border-emerald-500/30">
          ✓
        </div>
        <div>
          <h3 class="text-lg font-black text-emerald-300">Gate Entry Verified!</h3>
          <p class="text-xs text-slate-300 mt-1">Welcome to Ice Breaker 2026, <strong class="text-white">${attendee.fullName}</strong></p>
        </div>
        <div class="p-3 bg-[#081220] rounded-xl text-left text-xs font-mono border border-[#1b345b] space-y-1">
          <div><span class="text-slate-500">Ticket:</span> <span class="text-amber-300 font-bold">${attendee.ticketId}</span></div>
          <div><span class="text-slate-500">Batch:</span> ${attendee.academicYear}</div>
          <div><span class="text-slate-500">Refreshment:</span> <span class="text-purple-300 font-bold">Ready for Food Counter</span></div>
        </div>
      `, "border-emerald-500/60");
    }
  } else if (mode === "FOOD") {
    if (!attendee.hasEntered) {
      playAudio("error");
      showScanPopup(`
        <div class="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-2xl font-bold border border-rose-500/30">
          🚫
        </div>
        <div>
          <h3 class="text-lg font-black text-rose-400">Gate Check-in Missing!</h3>
          <p class="text-xs text-slate-300 mt-1">${attendee.fullName} must enter the main gate before claiming refreshments.</p>
        </div>
        <div class="p-3 bg-rose-950/40 rounded-xl text-xs text-rose-300 border border-rose-900/60">
          Rule: Student must scan at entrance gate first.
        </div>
      `, "border-rose-500/60");
    } else if (attendee.foodClaimed) {
      playAudio("error");
      const timeStr = new Date(attendee.foodClaimedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      showScanPopup(`
        <div class="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl font-bold border border-amber-500/30">
          🍽️
        </div>
        <div>
          <h3 class="text-lg font-black text-amber-300">Food Voucher Already Redeemed!</h3>
          <p class="text-xs text-slate-300 mt-1">${attendee.fullName} claimed refreshments at <strong>${timeStr}</strong></p>
        </div>
      `, "border-amber-500/60");
    } else {
      await db.collection("attendees").doc(attendee.id).update({
        foodClaimed: true,
        foodClaimedAt: new Date().toISOString()
      });
      playAudio("success");

      showScanPopup(`
        <div class="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto text-2xl font-bold border border-purple-500/30">
          🍽️
        </div>
        <div>
          <h3 class="text-lg font-black text-purple-300">Refreshment Voucher Redeemed!</h3>
          <p class="text-xs text-slate-300 mt-1">Hand over packet to <strong class="text-white">${attendee.fullName}</strong></p>
        </div>
        <div class="p-3 bg-[#081220] rounded-xl text-left text-xs font-mono border border-[#1b345b] space-y-1">
          <div><span class="text-slate-500">Ticket:</span> ${attendee.ticketId}</div>
          <div><span class="text-slate-500">Batch:</span> ${attendee.academicYear}</div>
          <div><span class="text-slate-500">Status:</span> <span class="text-emerald-400 font-bold">Meal Stamped ✓</span></div>
        </div>
      `, "border-purple-500/60");
    }
  }
}

// ================= EXCEL EXPORT & MOCK DATA =================
document.getElementById("admin-export-btn")?.addEventListener("click", () => {
  if (attendeesCache.length === 0) return showToast("No attendee data to export!", "warning");

  const exportData = attendeesCache.map(a => ({
    "Ticket ID": a.ticketId,
    "Full Name": a.fullName,
    "Batch": a.academicYear,
    "WhatsApp": a.phoneNumber,
    "Email": a.email,
    "Fee Paid (INR)": a.feeAmount !== undefined ? a.feeAmount : (a.academicYear === "FY" ? 0 : TICKET_PRICE),
    "Payment Mode": a.paymentMode || "ONLINE_UPI",
    "Pass Status": a.paymentStatus,
    "Gate Entry": a.hasEntered ? "YES" : "NO",
    "Gate Time": a.enteredAt || "-",
    "Food Claimed": a.foodClaimed ? "YES" : "NO",
    "Food Time": a.foodClaimedAt || "-",
    "Registration Date": new Date(a.createdAt).toLocaleString()
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ice_Breaker_Attendees");
  XLSX.writeFile(wb, `Ice_Breaker_Attendees_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast("Excel spreadsheet downloaded!", "success");
});

document.getElementById("admin-seed-btn")?.addEventListener("click", async () => {
  const isFYPortal = !!document.getElementById("view-student");
  const demoPhone = isFYPortal ? "9820998877" : "9820112233";
  const demoName = isFYPortal ? "Neha Sharma" : "Rahul Sharma";
  const demoYear = isFYPortal ? "FY" : "SY";

  if (!attendeesCache.some(x => x.phoneNumber === demoPhone)) {
    const ticketId = generateTicketId(demoYear);
    const qrCode = await createQrDataUrl(ticketId);
    await db.collection("attendees").add({
      ticketId: ticketId,
      fullName: demoName,
      academicYear: demoYear,
      phoneNumber: demoPhone,
      email: `${demoName.toLowerCase().replace(" ", "")}@gmail.com`,
      paymentScreenshotUrl: isFYPortal ? null : "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400",
      paymentStatus: "PENDING",
      paymentMode: isFYPortal ? "FREE_FY" : "ONLINE_UPI",
      feeAmount: isFYPortal ? 0 : TICKET_PRICE,
      qrCodeDataUrl: qrCode,
      hasEntered: false,
      enteredAt: null,
      foodClaimed: false,
      foodClaimedAt: null,
      createdAt: new Date().toISOString()
    });
    showToast(`Added sample registration for ${demoName} to Cloud!`, "success");
  } else {
    showToast(`Sample record for ${demoName} already exists.`, "info");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
});
