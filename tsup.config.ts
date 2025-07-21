import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "worker-backend": "src/worker-backend.ts",
    "worker-proxy": "src/worker-proxy.ts",
    r3f: "src/r3f/index.ts",
    three: "src/three/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  treeshake: true,
  clean: true,
  minify: false,
  sourcemap: true,
  target: "es2022",
  external: ["three", "@react-three/fiber", "react"],
});
