import type { Metadata } from "next";
import "./globals.css";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";

export const metadata: Metadata = {
  title: "Wine Lab · The Apartment Lab",
  description:
    "Gracie and Kyle’s private wine preference laboratory.",
  other: isGitHubPagesBuild
    ? undefined
    : {
        "codex-preview": "development",
      },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
