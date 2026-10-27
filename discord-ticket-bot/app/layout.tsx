import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Windy",
  description: "Windy Discord ticket system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#0b0b0f", color: "#f5f5f7", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
