import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// Public Firebase web configuration. Security is enforced by Auth claims and Database Rules.
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
export const auth = getAuth(app);
export const db = getDatabase(app);
