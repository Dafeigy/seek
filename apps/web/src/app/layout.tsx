import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Seek",
  description: "面向技术团队的协作知识库",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
