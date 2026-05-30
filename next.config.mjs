/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Phase 6: uploaded CSVs run through Next.js server actions, which
    // default to a 1 MB body limit. Our demo CSV is ~5 MB and real LMS
    // exports may be larger — bump to 20 MB. Mirrored in MAX_BYTES inside
    // `src/server/actions/upload.ts`.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
