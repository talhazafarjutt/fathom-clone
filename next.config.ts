import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the traced
  // dependencies, which is what the Docker runtime stage ships.
  output: "standalone",
};

export default nextConfig;
