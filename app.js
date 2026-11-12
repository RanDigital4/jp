import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase, ref, get, push, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// --- 1. Firebase कॉन्फ़िगरेशन ---
const firebaseConfig = {
  apiKey: "AIzaSyAz-TLmOhiy-_vHHmIjW8gyIOqTR_PT9o0",
  authDomain: "rnd2-70080.firebaseapp.com",
  databaseURL: "https://rnd2-70080-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rnd2-70080",
  storageBucket: "rnd2-70080.firebasestorage.app",
  messagingSenderId: "468625887938",
  appId: "1:468625887938:web:5cb4ddbcf31b6fc0a4615b",
  measurementId: "G-ELVJD5NQKB"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- 2. ग्लोबल वेरिएबल्स ---
const EXCLUSIVE_UID = "aBRccJ156ORXlTkBWbC2JZqwPJJ2"; 
const EXCLUSIVE_EMAIL = "jaiprakash9129000+1@gmail.com";
const ADMIN_EMAIL = "randigital4@gmail.com";
const MIN_WITHDRAWAL = 50; // न्यूनतम 50 USDT
const $ = id => document.getElementById(id);
let currentRole = null;

// नए डेटा पाथ (सिर्फ इस वेबसाइट के लिए)
const PORTAL_COMMISSION_PATH = `special_portal_commission/${EXCLUSIVE_UID}`;
const PORTAL_WITHDRAWAL_PATH = `special_portal_withdrawals/${EXCLUSIVE_UID}`;

// --- 3. लॉगिन लॉजिक ---
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); 
  $("loginMessage").style.color = ""; 
  $("loginMessage").textContent = "Verifying account…";
  
  try {
    const credential = await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    await credential.user.getIdToken(true);
    
    if (!authorized(credential.user)) {
      await signOut(auth);
      throw new Error("Access Denied: यह ईमेल/यूजर अधिकृत नहीं है।");
    }
    $("loginMessage").textContent = "";
  } catch (err) { 
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      $("loginMessage").textContent = "ईमेल या पासवर्ड गलत है।";
    } else {
      $("loginMessage").textContent = err.message || "Login failed."; 
    }
  }
});

$("forgotPasswordBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const msg = $("loginMessage");
  if (!email) { msg.textContent = "पहले अपना registered email लिखें।"; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    msg.style.color = "#31d69a";
    msg.textContent = "Password reset link आपके ईमेल पर भेज दिया गया है।";
  } catch (err) {
    msg.style.color = "#ff7474";
    msg.textContent = "Password reset email नहीं भेजा जा सका।";
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

function authorized(user) {
  return (user.email === EXCLUSIVE_EMAIL || user.email === ADMIN_EMAIL);
}

// --- 4. ऑथेंटिकेशन स्टेट चेंज ---
onAuthStateChanged(auth, async user => {
  $("connection").innerHTML = "<i></i> " + (user ? "Authenticated" : "Secure portal");
  if (!user) { 
    currentRole = null; 
    $("loginView").classList.remove("hidden"); 
    $("appView").classList.add("hidden"); 
    $("logoutBtn").classList.add("hidden"); 
    return; 
  }
  
  try {
    await user.getIdToken(true);
    if (!authorized(user)) { 
      await signOut(auth); 
      $("loginMessage").textContent = "Access Denied: आपका अकाउंट अधिकृत नहीं है।"; 
      return; 
    }
    
    currentRole = user.email === ADMIN_EMAIL ? "admin" : "user";
    $("loginView").classList.add("hidden"); 
    $("appView").classList.remove("hidden"); 
    $("logoutBtn").classList.remove("hidden");
    $("roleLabel").textContent = currentRole === "admin" ? "ADMIN CONTROL CENTER" : "EXCLUSIVE USER DASHBOARD";
    $("welcomeTitle").textContent = currentRole === "admin" ? "Admin dashboard" : "Welcome, Jai Prakash";
    $("welcomeSubtitle").textContent = currentRole === "admin" ? "Review requests and manually confirm USDT payments" : "Your eligible business overview";
    $("userNav").classList.toggle("hidden", currentRole !== "user");
    $("adminNav").classList.toggle("hidden", currentRole !== "admin");
    $("cutoffNotice").classList.toggle("hidden", currentRole === "admin");
    
    bindNavigation();
    await loadSummary();
    if (currentRole === "admin") await loadAdminRequests();
    else await loadUserWithdrawals();
    
  } catch (err) { 
    console.error(err); 
    await signOut(auth); 
  }
});

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => btn.onclick = async () => {
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active")); 
    btn.classList.add("active");
    ["overview","withdrawals"].forEach(p=>$ (p+"Panel").classList.toggle("hidden",p!==btn.dataset.panel));
    if (btn.dataset.panel==="withdrawals") currentRole==="admin" ? await loadAdminRequests() : await loadUserWithdrawals();
  });
}

function usdt(v){return Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})+" USDT";}

// --- 5. डेटा लोड करने का सही तरीका (नए डेटा पाथ के साथ) ---
async function loadSummary(){
  // पुराने डेटा से सिर्फ टीम बिजनेस और रेफरल उठाएं
  const snap = await get(ref(db, `users/${EXCLUSIVE_UID}`));
  let totalTeamBiz = 0;
  let totalTeamMembers = 0;

  if (snap.exists()) {
    const userData = snap.val();
    totalTeamBiz = Number(userData.teamBusiness || 0);
    totalTeamMembers = Number(userData.totalReferrals || 0);
    if (totalTeamMembers === 0 && userData.directReferrals) {
      totalTeamMembers = Object.keys(userData.directReferrals).length;
    }
  }

  // नए डेटा से टोटल कमीशन उठाएं (अगर नहीं है तो 0)
  const commSnap = await get(ref(db, PORTAL_COMMISSION_PATH));
  let totalComm = 0;
  if (commSnap.exists()) {
    totalComm = Number(commSnap.val().totalCommission || 0);
  }

  // पेंडिंग और टोटल विड्रॉल (नए पाथ से)
  let pendingWithdrawal = 0;
  let totalWithdrawn = 0;
  let totalCommissionLeft = totalComm;

  const wdSnap = await get(ref(db, PORTAL_WITHDRAWAL_PATH));
  if (wdSnap.exists()) {
    const withdrawals = Object.values(wdSnap.val());
    withdrawals.forEach(wd => {
      if (wd.status === "PENDING") {
        pendingWithdrawal += Number(wd.amount);
      } else if (wd.status === "PAID") {
        totalWithdrawn += Number(wd.amount);
      }
      // PAID और PENDING दोनों को कमीशन से माइनस करें
      if (wd.status === "PENDING" || wd.status === "PAID") {
        totalCommissionLeft -= Number(wd.amount);
      }
    });
  }

  // अगर कमीशन लेफ्ट 0 से कम हो जाए तो उसे 0 कर दें
  if (totalCommissionLeft < 0) totalCommissionLeft = 0;

  // UI में डेटा भरें
  $("totalBusiness").textContent = usdt(totalTeamBiz); 
  $("totalCommission").textContent = usdt(totalCommissionLeft); // बचा हुआ कमीशन
  $("availableBalance").textContent = usdt(totalCommissionLeft); // विड्रॉल के लिए उपलब्ध
  $("pendingAmount").textContent = usdt(pendingWithdrawal);
  $("totalWithdrawn").textContent = usdt(totalWithdrawn);
  $("teamCount").textContent = totalTeamMembers.toLocaleString();
  $("withdrawAvailable").textContent = usdt(totalCommissionLeft);

  // लेवल कार्ड्स (सिर्फ बिजनेस और टीम)
  $("levelCards").innerHTML = `
    <div style="grid-column: 1 / -1; padding: 20px; background: #101f31; border: 1px solid #22354d; border-radius: 13px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span style="color: #8da2bb;">कुल टीम बिजनेस:</span>
        <strong style="color: #edf4ff;">${usdt(totalTeamBiz)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span style="color: #31d69a;">टोटल कमीशन (10%):</span>
        <strong style="color: #31d69a;">${usdt(totalComm)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid #22354d; padding-top: 10px;">
        <span style="color: #8da2bb;">विड्रॉल के बाद बचा कमीशन:</span>
        <strong style="color: #31d69a;">${usdt(totalCommissionLeft)}</strong>
      </div>
    </div>
  `;
}

// --- 6. विड्रॉल लॉजिक (50 USDT लिमिट और नए डेटा पाथ के साथ) ---
$("withdrawForm").addEventListener("submit", async e=>{
  e.preventDefault(); 
  const msg=$("withdrawMessage"); 
  msg.textContent="Submitting request…";
  const amount=Number($("withdrawAmount").value), wallet=$("walletAddress").value.trim();
  
  if (!Number.isFinite(amount)||amount<=0) {msg.textContent="Enter a valid amount.";return;}
  
  // 1. टोटल कमीशन चेक करें
  const commSnap = await get(ref(db, PORTAL_COMMISSION_PATH));
  let totalComm = 0;
  if (commSnap.exists()) {
    totalComm = Number(commSnap.val().totalCommission || 0);
  }

  // पेंडिंग और पेड विड्रॉल को कमीशन से माइनस करें
  let totalCommissionLeft = totalComm;
  const wdSnap = await get(ref(db, PORTAL_WITHDRAWAL_PATH));
  if (wdSnap.exists()) {
    const withdrawals = Object.values(wdSnap.val());
    withdrawals.forEach(wd => {
      if (wd.status === "PENDING" || wd.status === "PAID") {
        totalCommissionLeft -= Number(wd.amount);
      }
    });
  }

  if (totalCommissionLeft < MIN_WITHDRAWAL) {
    msg.textContent = `आपका कुल उपलब्ध कमीशन ${usdt(totalCommissionLeft)} है, जो न्यूनतम विड्रॉल राशि ${MIN_WITHDRAWAL} USDT से कम है।`;
    return;
  }

  if (amount > totalCommissionLeft) {
    msg.textContent = `आप अधिकतम ${usdt(totalCommissionLeft)} विड्रॉल कर सकते हैं।`;
    return;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {msg.textContent="Enter a valid BEP20 wallet address.";return;}
  if (!$("confirmWithdrawal").checked) {msg.textContent="Please confirm details.";return;}
  
  try {
    const user=auth.currentUser;
    if (!user || !authorized(user)) throw new Error("Access denied.");
    
    // 2. नए पाथ पर विड्रॉल रिक्वेस्ट भेजें
    const reqRef=push(ref(db, PORTAL_WITHDRAWAL_PATH));
    await set(reqRef,{
      requestId:reqRef.key, uid:EXCLUSIVE_UID, userName:"Jai Prakash", userEmail:EXCLUSIVE_EMAIL,
      amount, walletAddress:wallet, network:"BEP20", status:"PENDING", createdAt:serverTimestamp()
    });
    
    msg.style.color = "#31d69a";
    msg.textContent="Request submitted. Request ID: "+reqRef.key;
    $("withdrawForm").reset(); 
    await loadUserWithdrawals();
    await loadSummary(); // डेटा रिफ्रेश करें
    
  } catch(err) {
    msg.style.color = "#ff7474";
    msg.textContent=err.message||"Could not submit request.";
  }
});

// --- 7. विड्रॉल हिस्ट्री (नए पाथ से) ---
async function loadUserWithdrawals(){
  const snap=await get(ref(db, PORTAL_WITHDRAWAL_PATH));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,false);
}

async function loadAdminRequests(){
  const snap=await get(ref(db, PORTAL_WITHDRAWAL_PATH));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,true);
}

function tableHtml(rows,admin){
  return `<table class="data-table"><thead><tr><th>Request</th><th>Amount</th><th>Wallet</th><th>Status</th><th>TXID / Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.requestId||"—")}<small>${dateText(r.createdAt)}</small></td><td>${usdt(r.amount)}</td><td><span class="wallet">${esc(r.walletAddress||"")}</span><button class="copy-btn" data-copy="${esc(r.walletAddress||"")}">Copy</button></td><td><b class="status-${String(r.status||"").toLowerCase()}">${esc(r.status||"—")}</b></td><td>${admin&&r.status==="PENDING"?`<input class="txid-input" id="tx-${esc(r.requestId)}" placeholder="TXID"><button class="mini-btn paid-btn" data-paid="${esc(r.requestId)}">Mark Paid</button><input class="reason-input" id="reason-${esc(r.requestId)}" placeholder="Reject Reason"><button class="mini-btn reject-btn" data-reject="${esc(r.requestId)}">Reject</button>`:esc(r.txid||r.rejectionReason||"—")}</td></tr>`).join("")}</tbody></table>`;
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function dateText(ts){return ts?new Date(ts).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"Time pending";}

// --- 8. एडमिन एक्शन्स (नए पाथ पर) ---
document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){await navigator.clipboard.writeText(copy.dataset.copy);copy.textContent="Copied";return;}
  const paid=e.target.closest("[data-paid]");
  const reject=e.target.closest("[data-reject]");
  if(!paid&&!reject)return;
  if(currentRole!=="admin"||auth.currentUser?.email!==ADMIN_EMAIL)return;
  const id=(paid||reject).dataset.paid||(paid||reject).dataset.reject;
  const itemRef=ref(db,`${PORTAL_WITHDRAWAL_PATH}/${id}`);
  const snap=await get(itemRef); if(!snap.exists()||snap.val().status!=="PENDING"){alert("यह रिक्वेस्ट पहले ही प्रोसेस हो चुकी है।");return;}
  
  if(paid){
    const txid=$("tx-"+id).value.trim();
    if(txid.length<10){alert("Paid करने से पहले TXID डालें।");return;}
    if(!confirm("क्या आपने USDT भेज दिया है?"))return;
    await update(itemRef,{status:"PAID",txid,processedAt:Date.now(),processedBy:auth.currentUser.uid});
  }else{
    const reason=$("reason-"+id).value.trim();
    if(!reason){alert("Reject करने का कारण लिखें।");return;}
    if(!confirm("क्या आप Reject करना चाहते हैं?"))return;
    await update(itemRef,{status:"REJECTED",rejectionReason:reason,processedAt:Date.now(),processedBy:auth.currentUser.uid});
  }
  await loadAdminRequests();
  await loadSummary();
});

// --- 9. कमीशन सेव करने का लॉजिक (जब भी नया बिजनेस आए) ---
// चूँकि आपने कहा है कि जब भी नीचे कोई आईडी लगे तो टोटल कमीशन अपडेट हो जाए,
// हम एक फंक्शन बनाते हैं जो इसे हैंडल करेगा। (आप इसे किसी बटन या ट्रिगर से कॉल कर सकते हैं)
async function updateSpecialCommission(newBusinessAmount) {
  const newCommission = newBusinessAmount * 0.10; // 10%
  const commRef = ref(db, PORTAL_COMMISSION_PATH);
  const snap = await get(commRef);
  let currentComm = 0;
  if (snap.exists()) {
    currentComm = Number(snap.val().totalCommission || 0);
  }
  await set(commRef, { totalCommission: currentComm + newCommission });
  await loadSummary();
}

// उदाहरण: अगर आपको मैन्युअली कमीशन जोड़ना है, तो आप कंसोल में यह चला सकते हैं:
// updateSpecialCommission(100); // 100 USDT के बिजनेस पर 10 USDT कमीशन जुड़ जाएगा।
