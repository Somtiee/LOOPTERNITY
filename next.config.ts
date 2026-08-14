import path from "path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: [
    "pino-pretty",
    "lokijs",
    "encoding",
    "lightningcss",
    "lightningcss-win32-x64-msvc",
  ],
  transpilePackages: [
    "@rainbow-me/rainbowkit",
    "@inco/lightning-js",
    "wagmi",
    "viem",
  ],
  webpack: (config, { webpack }) => {
    config.context = projectRoot;
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.modules = [path.join(projectRoot, "node_modules")];
    config.resolve.symlinks = false;
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": path.join(
        __dirname,
        "src/web3/asyncStorageStub.js",
      ),
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      "@x402/evm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402(\/|$)/ }),
    );
    config.watchOptions = {
      ...config.watchOptions,
      followSymlinks: false,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/tmp-audio/**",
        "**/tmp-natives/**",
        "**/System Volume Information/**",
      ],
    };
    return config;
  },
};

export default nextConfig;
