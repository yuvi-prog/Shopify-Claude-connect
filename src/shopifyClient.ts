const API_VERSION = "2025-01";

function getShopDomain(): string {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shopDomain) {
    throw new Error("Missing SHOPIFY_SHOP_DOMAIN environment variable.");
  }
  return shopDomain.includes(".myshopify.com") ? shopDomain : `${shopDomain}.myshopify.com`;
}

// In-memory cache for the Client Credentials access token, since tokens
// obtained this way expire (Shopify currently issues them with a ~24h TTL).
// Refreshed automatically shortly before expiry rather than relying on a
// static token in an env var.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET environment variables."
    );
  }

  const domain = getShopDomain();
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Shopify token exchange error ${response.status} ${response.statusText}: ${body.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };

  // Refresh 5 minutes before actual expiry to avoid using a token that
  // expires mid-request.
  cachedToken = {
    value: json.access_token,
    expiresAt: now + (json.expires_in - 300) * 1000,
  };

  return cachedToken.value;
}

/**
 * Runs a GraphQL query/mutation against the Shopify Admin API.
 * Automatically fetches and caches an access token via the Client
 * Credentials grant, refreshing it before it expires.
 */
export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const domain = getShopDomain();
  const accessToken = await getAccessToken();

  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Shopify API error ${response.status} ${response.statusText}: ${body.slice(0, 1000)}`
    );
  }

  const json = (await response.json()) as { data?: T; errors?: unknown };

  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors).slice(0, 1000)}`);
  }

  return json.data as T;
}
