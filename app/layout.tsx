import "./globals.css";

export const metadata = {
  title: "PRO OPTIONS TERMINAL",
  description:
    "DerivaSense AI — Professional Multi-Index Options Market Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}