import { IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// next/font descarga las fuentes al compilar y las sirve desde Vercel (sin llamadas a Google en el navegador)
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--fuente", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--fuente-mono", display: "swap" });

export const metadata = {
  title: "Smart Campus IoT",
  description: "Monitoreo ambiental y de ocupación de salas con Raspberry Pi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
