import type { Metadata } from "next";
import "./globals.css";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";

export const metadata: Metadata = {
  title: "The Apartment Lab",
  description:
    "Gracie and Kyle’s private laboratory for wine, pickles, recipes, and the household systems still to come.",
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
