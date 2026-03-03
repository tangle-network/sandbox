import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const specUrl =
  process.env.SANDBOX_API_OPENAPI_URL ||
  "https://api.sandbox.tangle.network/openapi.json";

const response = await fetch(specUrl, {
  headers: {
    "User-Agent": "tangle-sandbox-sdk-openapi-sync"
  }
});

if (!response.ok) {
  throw new Error(`Failed to download OpenAPI spec from ${specUrl}: ${response.status}`);
}

const openapi = await response.json();
const outDir = resolve("openapi");
const outPath = resolve(outDir, "sandbox-api.openapi.json");
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(openapi, null, 2)}\n`, "utf8");

console.log(`Wrote ${outPath}`);
