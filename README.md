# Shopify MCP Server

A remote MCP (Model Context Protocol) server that exposes Shopify store data
(products, orders, customers, inventory) as tools Claude can call. Runs as a
Streamable HTTP server (not stdio), so it can be added to Claude as a custom
connector via URL and shared by multiple coworkers.

## What it exposes

Read-only tools covering:

- **Products** — `list_products`, `get_product`
- **Inventory** — `list_inventory_levels` (by variant/location), `list_locations`
- **Orders** — `list_orders`, `get_order` (with line items), `list_unfulfilled_orders`
- **Customers** — `list_customers`, `get_customer`
- **Collections** — `list_collections`

All tools are read-only (GraphQL `query` operations against the Shopify
Admin API). No mutations (create/update/delete) are included.

## Project structure

```
shopify-mcp-server/
├── src/
│   ├── server.ts         # Express + Streamable HTTP MCP transport
│   ├── tools.ts           # MCP tool definitions (schemas + GraphQL queries)
│   └── shopifyClient.ts   # Shopify Admin GraphQL API client
├── package.json
├── tsconfig.json
├── railway.json
├── .env.example
└── README.md
```

## Creating the Shopify custom app & access token

1. In your Shopify admin, go to **Settings → Apps and sales channels → Develop apps**.
2. Click **Create an app**, give it a name (e.g. "Claude MCP Integration").
3. Under **Configuration → Admin API integration**, select these scopes (read-only):
   - `read_products`
   - `read_inventory`
   - `read_orders`
   - `read_customers`
   - `read_locations`
4. Click **Install app**, then go to **API credentials** and reveal the
   **Admin API access token**. This is shown only once — copy it somewhere
   safe (not into chat with anyone, including an AI assistant).

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and set SHOPIFY_SHOP_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN
npm run dev
```

The server listens on `http://localhost:3000/mcp` (Streamable HTTP endpoint)
and `http://localhost:3000/health` (health check).

For a production build locally:

```bash
npm run build
npm start
```

## Environment variables

| Variable                      | Required | Description                                                                 |
|--------------------------------|----------|-------------------------------------------------------------------------------|
| `SHOPIFY_SHOP_DOMAIN`          | Yes      | Your store's subdomain, e.g. `my-store` (or `my-store.myshopify.com`, either works) |
| `SHOPIFY_ADMIN_ACCESS_TOKEN`   | Yes      | The Admin API access token from your custom app. **Never commit this.**      |
| `PORT`                         | No       | Port to listen on. Railway sets this automatically. Defaults to 3000.        |

This is a single shared access token for the whole server — every coworker
who connects their own Claude account to this server's URL queries Shopify
under the same app credentials. There is no per-user auth.

## Deploying to Railway

1. Push this project to a GitHub repo.
2. In Railway, create a new project from that repo. Railway detects
   `railway.json` and uses Nixpacks to run `npm run build` then `npm start`.
3. In the Railway project's **Variables** tab, set:
   - `SHOPIFY_SHOP_DOMAIN`
   - `SHOPIFY_ADMIN_ACCESS_TOKEN`
   
   Do not set `PORT` — Railway injects it automatically.
4. Deploy. Railway gives you a public URL, e.g.
   `https://shopify-mcp-server-production.up.railway.app`.

## Connecting to Claude

In Claude go to **Settings → Connectors → Add custom connector** and enter:

```
https://<your-railway-domain>/mcp
```

Any coworker who adds that same URL as a custom connector gets access to the
same tools, backed by the same Shopify store via the shared app token
configured on the server.

## Notes on the Shopify API integration

- **Auth**: Every GraphQL request is sent with an `X-Shopify-Access-Token`
  header carrying the Admin API access token from your custom app.
- **API version**: Pinned to `2025-01` in `shopifyClient.ts`. Shopify
  versions are date-based (`YYYY-MM`) and each is supported for about a
  year — bump `API_VERSION` periodically to stay current.
- **Pagination**: Cursor-based, following Shopify's `edges`/`pageInfo`
  convention. Tools accept `first` (page size, up to 250, default 50) and
  `after` (cursor from the previous page's `pageInfo.endCursor`).
- **Query cost throttling**: Shopify's GraphQL API uses a cost-based rate
  limit rather than simple request counts. If a query is too expensive
  (e.g. very large `first` values combined with deeply nested fields), it
  can be throttled with a `MAX_COST_EXCEEDED` error — reduce `first` or
  request fewer nested fields if you hit this.
- **IDs**: Shopify GraphQL uses global IDs (GIDs) like
  `gid://shopify/Product/123456789`, not bare numeric IDs. `list_*` tools
  return the GID for each object, which can then be passed to the
  corresponding `get_*` tool.

## Adding write actions later

`tools.ts` is a flat list of `{ name, description, inputShape, handler }`
objects, each calling `shopifyGraphQL` in `shopifyClient.ts` with a query or
mutation string. To add a write action later (e.g. updating inventory or
fulfilling an order), write a GraphQL mutation string and register a new
tool the same way — `shopifyGraphQL` already supports mutations, it's just
not used for any yet.
