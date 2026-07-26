import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = isGitHubPagesBuild
  ? {
      output: "export",
      images: {
        unoptimized: true,
      },
      typescript: {
        tsconfigPath: "tsconfig.pages.json",
      },
      trailingSlash: true,
    }
  : {};

export default nextConfig;
