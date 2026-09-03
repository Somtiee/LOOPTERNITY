import path from "path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(__dirname);

// `@coinbase/cdp-sdk` (pulled in by rainbowkit's coinbase connector) lists
// `@x402/*` as OPTIONAL peers — they are legitimately absent from
// node_modules, but both bundlers still resolve their dynamic imports.
// Alias them to an empty module so the coinbase connector loads without
// the x402 payment features this app never uses.
const X402_MODULES = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/upto/client",
  "@x402/evm/exact/client",
  "@x402/svm/exact/client",
  "@x402/core",
  "@x402/evm/upto",
  "@x402/evm/exact",
  "@x402/svm/exact",
];
// Turbopack (Next 16 default) rejects absolute Windows paths in resolveAlias
// ("windows imports are not implemented yet"), so the stub is referenced as a
// root-relative specifier instead of path.join(...).
const x402Stub = "./src/web3/emptyModuleStub.js";

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
    "wagmi",
    "viem",
  ],
  turbopack: {
    resolveAlias: Object.fromEntries(
      X402_MODULES.map((m) => [m, x402Stub]),
    ),
  },
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
