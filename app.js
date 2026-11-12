import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

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
const OLD_BUSINESS = 1480; // 12 नवंबर से पहले का पुराना बिजनेस (1500 - 20)
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
    await autoSyncCommission(); // पहले कमीशन को सिंक करें
    await loadSummary();        // फिर डेटा लोड करें
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

// --- 5. ऑटो-सिंक कमीशन (सिर्फ नए 20 USDT का 10% सेव करेगा) ---
async function autoSyncCommission(){
  // 1. असली डेटा से teamBusiness उठाएं
  const userSnap = await get(ref(db, `users/${EXCLUSIVE_UID}`));
  if (!userSnap.exists()) return;
  
  const currentTeamBusiness = Number(userSnap.val().teamBusiness || 0);
  
  // 2. अब तक का सेव किया हुआ कमीशन और पुराना बिजनेस चेक करें
  const commSnap = await get(ref(db, PORTAL_COMMISSION_PATH));
  let savedCommission = 0;
  let lastTeamBusiness = 0;
  
  if (commSnap.exists()) {
    savedCommission = Number(commSnap.val().totalCommission || 0);
    lastTeamBusiness = Number(commSnap.val().lastTeamBusiness || 0);
  }

  // 3. अगर पहली बार चल रहा है (lastTeamBusiness 0 है)
  if (lastTeamBusiness === 0) {
    // पुराना बिजनेस 1480 है, तो नया बिजनेस = currentTeamBusiness - 1480
    let newBusiness = currentTeamBusiness - OLD_BUSINESS;
    if (newBusiness < 0) newBusiness = 0;
    
    // अगर नया बिजनेस 20 है, तो कमीशन 2 होगा
    const newCommission = newBusiness * 0.10;
    
    await set(ref(db, PORTAL_COMMISSION_PATH), {
      totalCommission: newCommission,
      lastTeamBusiness: currentTeamBusiness, 
      lastUpdated: serverTimestamp()
    });
    console.log(`पहली बार सेटअप: पुराना बिजनेस ${OLD_BUSINESS}, नया बिजनेस ${newBusiness}, कमीशन ${newCommission}`);
  } 
  // 4. अगर बाद में teamBusiness बढ़ा है
  else if (currentTeamBusiness > lastTeamBusiness) {
    const businessGrowth = currentTeamBusiness - lastTeamBusiness;
    const newCommission = businessGrowth * 0.10;
    
    await set(ref(db, PORTAL_COMMISSION_PATH), {
      totalCommission: savedCommission + newCommission,
      lastTeamBusiness: currentTeamBusiness,
      lastUpdated: serverTimestamp()
    });
    console.log(`नया बिजनेस जोड़ा गया: ${businessGrowth}, नया कमीशन जोड़ा गया: ${newCommission}`);
  }
}

// --- 6. डेटा लोड करने का तरीका ---
async function loadSummary(){
  // टीम बिजनेस और रेफरल
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

  // टोटल कमीशन
  const commSnap = await get(ref(db, PORTAL_COMMISSION_PATH));
  let totalComm = 0;
  if (commSnap.exists()) {
    totalComm = Number(commSnap.val().totalCommission || 0);
  }

  // पेंडिंग और टोटल विड्रॉल
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
      if (wd.status === "PENDING" || wd.status === "PAID") {
        totalCommissionLeft -= Number(wd.amount);
      }
    });
  }

  if (totalCommissionLeft < 0) totalCommissionLeft = 0;

  // UI में डेटा भरें
  $("totalBusiness").textContent = usdt(totalTeamBiz); 
  $("totalCommission").textContent = usdt(totalCommissionLeft); 
  $("availableBalance").textContent = usdt(totalCommissionLeft); 
  $("pendingAmount").textContent = usdt(pendingWithdrawal);
  $("totalWithdrawn").textContent = usdt(totalWithdrawn);
  $("teamCount").textContent = totalTeamMembers.toLocaleString();
  $("withdrawAvailable").textContent = usdt(totalCommissionLeft);

  // लेवल कार्ड्स
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

// --- 7. विड्रॉल लॉजिक (50 USDT लिमिट) ---
$("withdrawForm").addEventListener("submit", async e=>{
  e.preventDefault(); 
  const msg=$("withdrawMessage"); 
  msg.textContent="Submitting request…";
  const amount=Number($("withdrawAmount").value), wallet=$("walletAddress").value.trim();
  
  if (!Number.isFinite(amount)||amount<=0) {msg.textContent="Enter a valid amount.";return;}
  
  const commSnap = await get(ref(db, PORTAL_COMMISSION_PATH));
  let totalComm = 0;
  if (commSnap.exists()) {
    totalComm = Number(commSnap.val().totalCommission || 0);
  }

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
    
    const reqRef=push(ref(db, PORTAL_WITHDRAWAL_PATH));
    await set(reqRef,{
      requestId:reqRef.key, uid:EXCLUSIVE_UID, userName:"Jai Prakash", userEmail:EXCLUSIVE_EMAIL,
      amount, walletAddress:wallet, network:"BEP20", status:"PENDING", createdAt:serverTimestamp()
    });
    
    msg.style.color = "#31d69a";
    msg.textContent="Request submitted. Request ID: "+reqRef.key;
    $("withdrawForm").reset(); 
    await loadUserWithdrawals();
    await loadSummary(); 
    
  } catch(err) {
    msg.style.color = "#ff7474";
    msg.textContent=err.message||"Could not submit request.";
  }
});

// --- 8. विड्रॉल हिस्ट्री ---
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

// --- 9. एडमिन एक्शन्स ---
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
