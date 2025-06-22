import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar"; // <--- Import Navbar component

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Electricity Bill Calculator",
  description: "Calculate and track your electricity and water bills",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${inter.className} bg-slate-100 text-slate-900 min-h-screen flex flex-col`}>
        <AuthProvider>
          <Navbar /> {/* <--- Use the Navbar component here */}
          <main className="container mx-auto p-4 mt-6 flex-grow print:mt-0 print:p-0">
            {children}
          </main>
          <footer className="text-center p-4 mt-auto bg-slate-200 text-slate-600 text-sm print:hidden">
            © {new Date().getFullYear()} Electricity Bill Calculator App
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
