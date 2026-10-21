import "./globals.css";

export const metadata = {
  title: "Smart Campus IoT",
  description: "Monitoreo ambiental y de ocupación de salas con Raspberry Pi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
