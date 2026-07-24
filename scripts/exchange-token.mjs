// One-off script: exchanges SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET for a
// real Admin API access token via Shopify's Client Credentials grant, and
// writes it into .env as SHOPIFY_ADMIN_ACCESS_TOKEN. Never prints the token.
import { readFileSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);
const envText = readFileSync(envPath, "utf8");

function getVar(name) {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

const shopDomain = getVar("SHOPIFY_SHOP_DOMAIN");
const clientId = getVar("SHOPIFY_CLIENT_ID");
const clientSecret = getVar("SHOPIFY_CLIENT_SECRET");

if (!shopDomain || !clientId || !clientSecret) {
  console.error("Missing SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET in .env");
  process.exit(1);
}

const domain = shopDomain.includes(".myshopify.com") ? shopDomain : `${shopDomain}.myshopify.com`;
const url = `https://${domain}/admin/oauth/access_token`;

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  }),
});

const body = await response.text();

if (!response.ok) {
  console.error(`Token exchange failed: ${response.status} ${response.statusText}`);
  console.error(body);
  process.exit(1);
}

const json = JSON.parse(body);
const accessToken = json.access_token;

if (!accessToken) {
  console.error("No access_token in response:", body);
  process.exit(1);
}

let newEnvText;
if (/^SHOPIFY_ADMIN_ACCESS_TOKEN=.*/m.test(envText)) {
  newEnvText = envText.replace(/^SHOPIFY_ADMIN_ACCESS_TOKEN=.*/m, `SHOPIFY_ADMIN_ACCESS_TOKEN=${accessToken}`);
} else {
  newEnvText = envText.trimEnd() + `\nSHOPIFY_ADMIN_ACCESS_TOKEN=${accessToken}\n`;
}

writeFileSync(envPath, newEnvText);

console.log("Success.");
console.log("Scope granted:", json.scope);
console.log(`Token prefix: ${accessToken.slice(0, 6)}... (${accessToken.length} chars) — written to .env`);
