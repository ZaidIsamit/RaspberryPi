// Crea las organizaciones, cuentas de prueba (2 roles) y un dispositivo por organización.
// Uso (desde la carpeta web, con .env.local completo):   npm install && npm run seed
// Es idempotente: si algo ya existe, lo reutiliza. Los tokens se imprimen SOLO si el dispositivo es nuevo.
import crypto from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth();
const db = getFirestore();

const ORGS = [
  { id: "campus-norte", nombre: "Campus Norte", dispositivo: { id: "sala-101", nombre: "Sala 101" } },
  { id: "campus-sur", nombre: "Campus Sur", dispositivo: { id: "sala-201", nombre: "Sala 201 (demo aislamiento)" } },
];
const USUARIOS = [
  { email: "admin@campus-norte.cl", password: "Admin.2026!", orgId: "campus-norte", role: "admin" },
  { email: "consulta@campus-norte.cl", password: "Consulta.2026!", orgId: "campus-norte", role: "viewer" },
  { email: "admin@campus-sur.cl", password: "Admin.2026!", orgId: "campus-sur", role: "admin" },
];
const CONFIG = {
  intervaloClimaSeg: 10, intervaloEnvioSeg: 60, sensorClimaActivo: true, sensorMovimientoActivo: true,
  umbralTempMax: 26, umbralTempMin: 16, umbralHumMax: 70, umbralOcupacion: 0.1, horaInicio: 8, horaFin: 22,
};

for (const org of ORGS) {
  await db.doc(`orgs/${org.id}`).set({ nombre: org.nombre }, { merge: true });
  const ref = db.doc(`orgs/${org.id}/devices/${org.dispositivo.id}`);
  if (!(await ref.get()).exists) {
    const secreto = crypto.randomBytes(24).toString("base64url");
    await ref.set({
      nombre: org.dispositivo.nombre,
      tokenHash: crypto.createHash("sha256").update(secreto).digest("hex"),
      config: CONFIG, ultimaConexion: null, ultimaLectura: null, salud: null,
      creado: FieldValue.serverTimestamp(),
    });
    console.log(`\nDispositivo ${org.id}/${org.dispositivo.id} creado. DEVICE_TOKEN (guárdalo):\n${org.id}.${org.dispositivo.id}.${secreto}\n`);
  } else {
    console.log(`Dispositivo ${org.id}/${org.dispositivo.id} ya existía (regenera su token desde la web si lo perdiste).`);
  }
}

for (const u of USUARIOS) {
  let user;
  try {
    user = await auth.getUserByEmail(u.email);
  } catch {
    user = await auth.createUser({ email: u.email, password: u.password, emailVerified: true });
  }
  await auth.setCustomUserClaims(user.uid, { orgId: u.orgId, role: u.role });
  console.log(`Usuario ${u.email} / ${u.password}  ->  org=${u.orgId} rol=${u.role}`);
}
console.log("\nListo.");
process.exit(0);
