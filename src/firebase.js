import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbOdDuC8QGwg2k-XGE-tlRJKJ3k4OETTI",
  authDomain: "chatapp-6d31e.firebaseapp.com",
  projectId: "chatapp-6d31e",
  storageBucket: "chatapp-6d31e.firebasestorage.app",
  messagingSenderId: "528963021995",
  appId: "1:528963021995:web:851e08122041df005c9bee"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services to use across your app
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); // For easy login
export const db = getFirestore(app); // Your cloud database