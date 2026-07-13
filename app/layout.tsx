import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "化安智控 | 化工过程安全与清洁生产智能辅助系统",
  description: "化学品查询、设备巡检、事故应急、清洁生产评价与反应釜 PID 控制仿真。",
  manifest: "/manifest.webmanifest",
  themeColor: "#09234a",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
