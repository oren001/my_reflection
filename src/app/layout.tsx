import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import Navigation from "./components/Navigation";
import ConsoleLogBridge from "./components/ConsoleLogBridge";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Voice Clone App",
  description: "A voice cloning and chat application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>
          <ConsoleLogBridge />
          <Navigation />
          <div className="container mx-auto px-4">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
