// CAPA DE PRESENTACIÓN: SDK web de Firebase (solo Auth y lecturas en tiempo real; las
// Security Rules impiden que el navegador escriba o lea datos de otra organización).
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let cache = null;

export function fb() {
  if (!cache) {
    const app =
      getApps()[0] ||
      initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
    cache = { app, auth: getAuth(app), db: getFirestore(app) };
  }
  return cache;
}

/** Llama a la API propia enviando el ID token del usuario. */
export async function api(path, { method = "GET", body } = {}) {
  const token = await fb().auth.currentUser.getIdToken();
  const r = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}
