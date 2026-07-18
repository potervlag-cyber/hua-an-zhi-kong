import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "hua-an-zhi-kong-app.potervlag.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "化安智控 | 化工过程安全与清洁生产智能辅助系统";
  const description = "内置1500种化学品、30类设备203条巡检知识和40类事故应急流程。";

  return {
    metadataBase: baseUrl,
    title,
    description,
    manifest: "/manifest.webmanifest",
    themeColor: "#09234a",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website", url: baseUrl, images: [{ url: new URL("/og.png", baseUrl), width: 1672, height: 941, alt: "化安智控 0.2.0 安全数据概览" }] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", baseUrl)] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
