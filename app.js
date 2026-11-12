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
// यह आपके लिंक से लिया गया सही UID है (I = capital i)
const EXCLUSIVE_UID = "aBRccJ156ORXlTkBWbC2JZqwPJJ2"; // ध्यान दें: यहाँ L (small L) है
const EXCLUSIVE_EMAIL = "jaiprakash9129000+1@gmail.com";
const ADMIN_EMAIL = "randigital4@gmail.com";
const MIN_WITHDRAWAL = 50; // न्यूनतम 50 USDT
const $ = id => document.getElementById(id);
let currentRole = null;

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

// --- 5. डेटा लोड करने का स्मार्ट तरीका ---
async function loadSummary(){
  // सीधे users/UID से डेटा उठा रहे हैं
  const snap = await get(ref(db, `users/${EXCLUSIVE_UID}`));
  
  if (!snap.exists()) { 
    console.warn("यूजर का डेटा नहीं मिला। कृपया UID चेक करें (l और I का फर्क)।"); 
    return; 
  }
  
  const userData = snap.val();

  // 1. Available Balance
  const availableBal = Number(userData.availableReward || 0);
  
  // 2. टीम काउंट (directReferrals और downline दोनों को जोड़कर)
  let directCount = userData.directReferrals ? Object.keys(userData.directReferrals).length : 0;
  let downlineCount = userData.downline ? Object.keys(userData.downline).length : 0;
  let totalTeam = Number(userData.totalTeam || userData.totalTeamMembers || directCount + downlineCount);

  // 3. बिज़नेस (Total Business)
  let totalBiz = Number(userData.totalBusiness || 0); 

  // 4. कमीशन (commissionHistory से कैलकुलेट करना)
  let totalComm = 0;
  if (userData.commissionHistory) {
    Object.values(userData.commissionHistory).forEach(comm => {
      totalComm += Number(comm.amount || comm.commission || 0);
    });
  }

  // UI में डेटा भरें
  $("totalBusiness").textContent = usdt(totalBiz);
  $("totalCommission").textContent = usdt(totalComm); 
  $("availableBalance").textContent = usdt(availableBal);
  $("pendingAmount").textContent = usdt(userData.pendingWithdrawal || 0);
  $("totalWithdrawn").textContent = usdt(userData.totalWithdrawn || 0);
  $("teamCount").textContent = totalTeam.toLocaleString();
  $("withdrawAvailable").textContent = usdt(availableBal);

  // 5. लेवल वाइज बिजनेस और टीम (Level 1 to 5)
  $("levelCards").innerHTML = [1,2,3,4,5].map(n => {
    let lvlBusiness = 0;
    let lvlMembers = 0;
    
    // अगर डेटाबेस में levels का ऑब्जेक्ट है
    if (userData.levels && userData.levels[n]) {
      lvlBusiness = Number(userData.levels[n].business || 0);
      lvlMembers = Number(userData.levels[n].members || 0);
    } 
    // अगर level1Earnings जैसा फॉर्मेट है
    else if (userData[`level${n}Earnings`] !== undefined) {
      lvlBusiness = Number(userData[`level${n}Earnings`] || 0);
    }
    // अगर level1Team जैसा फॉर्मेट है
    else if (userData[`level${n}Team`] !== undefined) {
      lvlMembers = Number(userData[`level${n}Team`] || 0);
    }

    return `<article class="level-card"><span>LEVEL ${n}</span><strong>${usdt(lvlBusiness)}</strong><small>${Number(lvlMembers)} members</small></article>`;
  }).join("");
}

// --- 6. विड्रॉल लॉजिक (50 USDT लिमिट) ---
$("withdrawForm").addEventListener("submit", async e=>{
  e.preventDefault(); 
  const msg=$("withdrawMessage"); 
  msg.textContent="Submitting request…";
  const amount=Number($("withdrawAmount").value), wallet=$("walletAddress").value.trim();
  
  if (!Number.isFinite(amount)||amount<=0) {msg.textContent="Enter a valid amount.";return;}
  if (amount < MIN_WITHDRAWAL) {msg.textContent=`न्यूनतम विड्रॉल राशि ${MIN_WITHDRAWAL} USDT है।`;return;}
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {msg.textContent="Enter a valid BEP20 wallet address.";return;}
  if (!$("confirmWithdrawal").checked) {msg.textContent="Please confirm details.";return;}
  
  try {
    const user=auth.currentUser;
    if (!user || !authorized(user)) throw new Error("Access denied.");
    
    // बैलेंस दोबारा चेक करें
    const userSnap = await get(ref(db, `users/${EXCLUSIVE_UID}`));
    const available = Number(userSnap.val()?.availableReward || 0);
    
    if(amount > available) throw new Error("Requested amount is greater than the available balance.");
    
    // विड्रॉल रिक्वेस्ट 'withdrawals' फोल्डर में भेजें
    const reqRef=push(ref(db,`withdrawals/${EXCLUSIVE_UID}`));
    await set(reqRef,{
      requestId:reqRef.key, uid:EXCLUSIVE_UID, userName:"Jai Prakash", userEmail:EXCLUSIVE_EMAIL,
      amount, walletAddress:wallet, network:"BEP20", status:"PENDING", createdAt:serverTimestamp()
    });
    
    msg.style.color = "#31d69a";
    msg.textContent="Request submitted. Request ID: "+reqRef.key;
    $("withdrawForm").reset(); 
    await loadUserWithdrawals();
  } catch(err) {
    msg.style.color = "#ff7474";
    msg.textContent=err.message||"Could not submit request.";
  }
});

// --- 7. विड्रॉल हिस्ट्री ---
async function loadUserWithdrawals(){
  const snap=await get(ref(db,`withdrawals/${EXCLUSIVE_UID}`));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,false);
}

async function loadAdminRequests(){
  const snap=await get(ref(db,`withdrawals/${EXCLUSIVE_UID}`));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,true);
}

function tableHtml(rows,admin){
  return `<table class="data-table"><thead><tr><th>Request</th><th>Amount</th><th>Wallet</th><th>Status</th><th>TXID / Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.requestId||"—")}<small>${dateText(r.createdAt)}</small></td><td>${usdt(r.amount)}</td><td><span class="wallet">${esc(r.walletAddress||"")}</span><button class="copy-btn" data-copy="${esc(r.walletAddress||"")}">Copy</button></td><td><b class="status-${String(r.status||"").toLowerCase()}">${esc(r.status||"—")}</b></td><td>${admin&&r.status==="PENDING"?`<input class="txid-input" id="tx-${esc(r.requestId)}" placeholder="TXID"><button class="mini-btn paid-btn" data-paid="${esc(r.requestId)}">Mark Paid</button><input class="reason-input" id="reason-${esc(r.requestId)}" placeholder="Reject Reason"><button class="mini-btn reject-btn" data-reject="${esc(r.requestId)}">Reject</button>`:esc(r.txid||r.rejectionReason||"—")}</td></tr>`).join("")}</tbody></table>`;
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function dateText(ts){return ts?new Date(ts).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"Time pending";}

// --- 8. एडमिन एक्शन्स ---
document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){await navigator.clipboard.writeText(copy.dataset.copy);copy.textContent="Copied";return;}
  const paid=e.target.closest("[data-paid]");
  const reject=e.target.closest("[data-reject]");
  if(!paid&&!reject)return;
  if(currentRole!=="admin"||auth.currentUser?.email!==ADMIN_EMAIL)return;
  const id=(paid||reject).dataset.paid||(paid||reject).dataset.reject;
  const itemRef=ref(db,`withdrawals/${EXCLUSIVE_UID}/${id}`);
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
});
