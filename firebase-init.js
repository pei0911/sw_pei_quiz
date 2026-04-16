window._firebaseReady = false;
window._db = null;
window._dbFns = null;

try {
  const [{ initializeApp }, { getFirestore, doc, setDoc, getDoc }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
  ]);

  const firebaseConfig = {
    apiKey: "AIzaSyBOjrYo1aLclJKJisTs3Q5JrGWsOIxqtRw",
    authDomain: "social-quiz-a9579.firebaseapp.com",
    projectId: "social-quiz-a9579",
    storageBucket: "social-quiz-a9579.firebasestorage.app",
    messagingSenderId: "405193951436",
    appId: "1:405193951436:web:b40ffa20681e5c7f9c5a69",
    measurementId: "G-ZC4GNQQQWN"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  window._db = db;
  window._dbFns = { doc, setDoc, getDoc };
  window._firebaseReady = true;
} catch (e) {
  console.warn('Firebase init failed, fallback to local mode:', e);
  window._firebaseReady = false;
} finally {
  document.dispatchEvent(new Event('firebaseReady'));
}