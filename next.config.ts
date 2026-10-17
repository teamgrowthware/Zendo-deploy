import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node:sqlite", "pg", "ioredis", "graphql", "@grpc/grpc-js", "@grpc/proto-loader", "ws"],
  // The dev server is opened at 127.0.0.1. Next only allows localhost unless this is set.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async redirects() {
    return [{ source: "/watch", destination: "/whitepaper", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/ZendoCoin-Polygon_Mainnet.zip", destination: "/api/download?file=ZendoCoin-Polygon_Mainnet.zip" },
      { source: "/ZendoL-1_App.zip", destination: "/api/download?file=ZendoL-1_App.zip" },
      { source: "/ZendoDeployL1.zip", destination: "/api/download?file=ZendoDeployL1.zip" },
      { source: "/ZendoL-1Ready.zip", destination: "/api/download?file=ZendoL-1_App.zip" },
      { source: "/zendo-history/:pass/zendo-history.json", destination: "/api/wallet/history?format=json&pass=:pass" },
      { source: "/zendo-history/:pass/zendo-history.csv", destination: "/api/wallet/history?format=csv&pass=:pass" },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/app/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=30, stale-while-revalidate=120" }],
      },
      {
        source: "/:path(launchpad|explorer|faq|about|zcoin|learn|whitepaper|download)",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=30, stale-while-revalidate=120" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
