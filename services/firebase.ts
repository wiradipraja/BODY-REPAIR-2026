import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, increment as firestoreIncrement } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA4z2XCxu3tNAL5IiNXfY7suu6tYszPAYQ",
  authDomain: "body-repair-system.firebaseapp.com",
  projectId: "body-repair-system",
  storageBucket: "body-repair-system.firebasestorage.app",
  messagingSenderId: "672061097149",
  appId: "1:672061097149:web:2998766b147a4c20a6a3d4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const increment = firestoreIncrement;

export const ADMIN_UID = "sa4QbuTtBSfmnNwDgefOtTaNYl83";
export const JOBS_COLLECTION = "shared-bengkel-jobs";
export const SETTINGS_COLLECTION = "bengkel-settings";
export const USERS_COLLECTION = "users";
export const SPAREPART_COLLECTION = "bengkel-spareparts-master";
export const SUPPLIERS_COLLECTION = "bengkel-suppliers";