import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/tangle/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  fixedExtension: false,
});
