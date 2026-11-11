import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { ref, get, push, set, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const EXCLUSIVE_UID = "aBRccJ156ORXITkBWbC2JZqwPJJ2"; // यह डेटाबेस पाथ के लिए जरूरी है
const EXCLUSIVE_EMAIL = "jaiprakash9129000+1@gmail.com";
const ADMIN_EMAIL = "randigital4@gmail.com";
const $ = id => document.getElementById(id);
let currentRole = null;

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); 
  $("loginMessage").style.color = ""; 
  $("loginMessage").textContent = "Verifying account…";
  
  try {
    const credential = await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    await credential.user.getIdToken(true);
    
    if (!authorized(credential.user)) {
      await signOut(auth);
      throw new Error("Access Denied: यह ईमेल/यूजर इस पोर्टल के लिए अधिकृत नहीं है।");
    }
    $("loginMessage").textContent = "";
  } catch (err) { 
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      $("loginMessage").textContent = "ईमेल या पासवर्ड गलत है।";
    } else if (err.code === "auth/too-many-requests") {
      $("loginMessage").textContent = "बहुत अधिक प्रयास हुए हैं। कृपया कुछ देर बाद प्रयास करें।";
    } else {
      $("loginMessage").textContent = err.message || "Login failed."; 
    }
  }
});

$("forgotPasswordBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const msg = $("loginMessage");
  if (!email) {
    msg.textContent = "पहले अपना registered email लिखें, फिर Forgot password दबाएँ।";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    msg.style.color = "#31d69a";
    msg.textContent = "यदि यह Firebase में registered email है, तो password reset link उस email पर भेज दिया गया है। Inbox और Spam देखें।";
  } catch (err) {
    msg.style.color = "#ff7474";
    msg.textContent = err.code === "auth/invalid-email"
      ? "ईमेल का format सही नहीं है।"
      : "Password reset email नहीं भेजा जा सका। Firebase settings जाँचें।";
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

// यहाँ हमने UID की सख्त जाँच हटा दी है ताकि सिर्फ ईमेल से लॉगिन हो सके
function authorized(user) {
  return (
    user.email === EXCLUSIVE_EMAIL ||
    user.email === ADMIN_EMAIL
  );
}

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
    ["overview","team","business","commissions","withdrawals","audit"].forEach(p=>$ (p+"Panel").classList.toggle("hidden",p!==btn.dataset.panel));
    if (btn.dataset.panel==="withdrawals") currentRole==="admin" ? await loadAdminRequests() : await loadUserWithdrawals();
  });
}

function usdt(v){return Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})+" USDT";}

async function loadSummary(){
  const snap = await get(ref(db, `portal/profiles/${EXCLUSIVE_UID}/summary`));
  if (!snap.exists()) { 
    console.warn("Portal summary is not populated yet."); 
    return; 
  }
  const s=snap.val();
  $("totalBusiness").textContent=usdt(s.totalEligibleBusiness);
  $("totalCommission").textContent=usdt(s.totalCommissionEarned);
  $("availableBalance").textContent=usdt(s.availableBalance);
  $("pendingAmount").textContent=usdt(s.pendingWithdrawal);
  $("totalWithdrawn").textContent=usdt(s.totalWithdrawn);
  $("teamCount").textContent=Number(s.totalTeamMembers||0).toLocaleString();
  $("withdrawAvailable").textContent=usdt(s.availableBalance);
  $("levelCards").innerHTML=[1,2,3,4,5].map(n=>`<article class="level-card"><span>LEVEL ${n}</span><strong>${usdt(s.levels?.[n]?.business||0)}</strong><small>${Number(s.levels?.[n]?.members||0)} members</small></article>`).join("");
}

$("withdrawForm").addEventListener("submit", async e=>{
  e.preventDefault(); 
  const msg=$("withdrawMessage"); 
  msg.textContent="Submitting request…";
  const amount=Number($("withdrawAmount").value), wallet=$("walletAddress").value.trim();
  if (!Number.isFinite(amount)||amount<=0) {msg.textContent="Enter a valid amount.";return;}
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {msg.textContent="Enter a valid BEP20 wallet address.";return;}
  if (!$("confirmWithdrawal").checked) {msg.textContent="Please confirm the withdrawal details.";return;}
  try {
    const user=auth.currentUser;
    if (!user || !authorized(user)) throw new Error("Access denied.");
    const summarySnap=await get(ref(db,`portal/profiles/${EXCLUSIVE_UID}/summary`));
    const available=Number(summarySnap.val()?.availableBalance||0);
    if(amount>available) throw new Error("Requested amount is greater than the displayed available balance.");
    const reqRef=push(ref(db,`portal/withdrawals/${EXCLUSIVE_UID}`));
    await set(reqRef,{requestId:reqRef.key,uid:user.uid,userName:"Jai Prakash",userEmail:EXCLUSIVE_EMAIL,amount,walletAddress:wallet,network:"BEP20",status:"PENDING",createdAt:serverTimestamp()});
    msg.textContent="Request submitted. Request ID: "+reqRef.key;
    $("withdrawForm").reset(); await loadUserWithdrawals();
  } catch(err) {msg.textContent=err.message||"Could not submit request.";}
});

async function loadUserWithdrawals(){
  const snap=await get(ref(db,`portal/withdrawals/${EXCLUSIVE_UID}`));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,false);
}

async function loadAdminRequests(){
  const snap=await get(ref(db,`portal/withdrawals/${EXCLUSIVE_UID}`));
  if(!snap.exists()){$("withdrawalHistory").innerHTML='<p class="empty-state">अभी कोई विड्रॉल रिक्वेस्ट नहीं है।</p>';return;}
  const rows=Object.values(snap.val()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $("withdrawalHistory").innerHTML=tableHtml(rows,true);
}

function tableHtml(rows,admin){
  return `<table class="data-table"><thead><tr><th>Request</th><th>Amount</th><th>Wallet</th><th>Status</th><th>TXID / Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.requestId||"—")}<small>${dateText(r.createdAt)}</small></td><td>${usdt(r.amount)}</td><td><span class="wallet">${esc(r.walletAddress||"")}</span><button class="copy-btn" data-copy="${esc(r.walletAddress||"")}">Copy</button></td><td><b class="status-${String(r.status||"").toLowerCase()}">${esc(r.status||"—")}</b></td><td>${admin&&r.status==="PENDING"?`<input class="txid-input" id="tx-${esc(r.requestId)}" placeholder="Blockchain TXID"><button class="mini-btn paid-btn" data-paid="${esc(r.requestId)}">Mark Paid</button><input class="reason-input" id="reason-${esc(r.requestId)}" placeholder="Rejection reason"><button class="mini-btn reject-btn" data-reject="${esc(r.requestId)}">Reject</button>`:esc(r.txid||r.rejectionReason||"—")}</td></tr>`).join("")}</tbody></table>`;
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function dateText(ts){return ts?new Date(ts).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}):"Time pending";}

document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){await navigator.clipboard.writeText(copy.dataset.copy);copy.textContent="Copied";return;}
  const paid=e.target.closest("[data-paid]");
  const reject=e.target.closest("[data-reject]");
  if(!paid&&!reject)return;
  if(currentRole!=="admin"||auth.currentUser?.email!==ADMIN_EMAIL)return;
  const id=(paid||reject).dataset.paid||(paid||reject).dataset.reject;
  const itemRef=ref(db,`portal/withdrawals/${EXCLUSIVE_UID}/${id}`);
  const snap=await get(itemRef); if(!snap.exists()||snap.val().status!=="PENDING"){alert("यह रिक्वेस्ट पहले ही प्रोसेस हो चुकी है।");return;}
  if(paid){
    const txid=$("tx-"+id).value.trim();
    if(txid.length<10){alert("Paid करने से पहले blockchain TXID डालें।");return;}
    if(!confirm("क्या आपने BEP20 नेटवर्क पर USDT भेज दिया है और TXID सत्यापित है?"))return;
    await update(itemRef,{status:"PAID",txid,processedAt:Date.now(),processedBy:auth.currentUser.uid});
  }else{
    const reason=$("reason-"+id).value.trim();
    if(!reason){alert("Reject करने का कारण लिखें।");return;}
    if(!confirm("क्या आप इस विड्रॉल रिक्वेस्ट को Reject करना चाहते हैं?"))return;
    await update(itemRef,{status:"REJECTED",rejectionReason:reason,processedAt:Date.now(),processedBy:auth.currentUser.uid});
  }
  await loadAdminRequests();
});
