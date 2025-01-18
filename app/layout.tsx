import type { Metadata } from "next";
import { Geist,IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const ibmPlexSerif = IBM_Plex_Serif({
  variable:"--font-ibm-font-serif",
  subsets:["latin"],
  weight:['400',"700"]
})


export const metadata: Metadata = {
  title: "Horizon",
  description: "Horizon is modern banking platform for everyone.",
  icons:{
    icon:"/icons/logo.svg"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${ibmPlexSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
