const API_VERSION = "2025-01";

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
}

function getCredentials(): ShopifyCredentials {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shopDomain || !accessToken) {
    throw new Error(
      "Missing SHOPIFY_SHOP_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN environment variables."
    );
  }
  return { shopDomain, accessToken };
}

/**
 * Runs a GraphQL query/mutation against the Shopify Admin API.
 * `shopDomain` should be the bare myshopify.com subdomain, e.g. "my-store" or "my-store.myshopify.com".
 */
export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const { shopDomain, accessToken } = getCredentials();
  const domain = shopDomain.includes(".myshopify.com")
    ? shopDomain
    : `${shopDomain}.myshopify.com`;

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
