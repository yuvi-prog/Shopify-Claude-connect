import { z } from "zod";
import { shopifyGraphQL } from "./shopifyClient.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const pageArgs = {
  first: z
    .number()
    .int()
    .min(1)
    .max(250)
    .default(50)
    .describe("Number of records to return (1-250). Defaults to 50."),
  after: z
    .string()
    .optional()
    .describe(
      "Cursor to resume from (the endCursor of a previous response's pageInfo), for fetching the next page."
    ),
};

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export interface ToolDef {
  name: string;
  description: string;
  inputShape: z.ZodRawShape;
  handler: (args: any) => Promise<ReturnType<typeof textResult>>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const tools: ToolDef[] = [
  // -------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------
  {
    name: "list_products",
    description:
      "List products in the Shopify store catalog. Supports free-text search (title, SKU, vendor, tag) and cursor pagination. Use this to browse or search the product catalog.",
    inputShape: {
      ...pageArgs,
      query: z
        .string()
        .optional()
        .describe(
          "Shopify search query syntax, e.g. 'title:*shirt*' or 'sku:ABC123' or 'vendor:Acme'."
        ),
    },
    handler: async ({ first, after, query }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            edges {
              cursor
              node {
                id
                title
                handle
                vendor
                productType
                status
                totalInventory
                variants(first: 10) {
                  edges { node { id sku price inventoryQuantity } }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after, query }
      );
      return textResult(data);
    },
  },
  {
    name: "get_product",
    description:
      "Get full details for a single product by its Shopify GID (e.g. gid://shopify/Product/123), including all variants, options, and images.",
    inputShape: {
      id: z.string().describe("The product's Shopify GID."),
    },
    handler: async ({ id }) => {
      const data = await shopifyGraphQL(
        `query($id: ID!) {
          product(id: $id) {
            id title handle vendor productType status descriptionHtml
            totalInventory
            options { name values }
            variants(first: 100) {
              edges { node { id title sku price compareAtPrice inventoryQuantity } }
            }
            images(first: 20) { edges { node { url altText } } }
          }
        }`,
        { id }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------
  {
    name: "list_inventory_levels",
    description:
      "Get current inventory levels for a product's variants across locations. Use this to answer 'how much stock do we have' questions. Requires a product GID.",
    inputShape: {
      productId: z.string().describe("The product's Shopify GID."),
    },
    handler: async ({ productId }) => {
      const data = await shopifyGraphQL(
        `query($id: ID!) {
          product(id: $id) {
            title
            variants(first: 100) {
              edges {
                node {
                  id sku title
                  inventoryItem {
                    inventoryLevels(first: 20) {
                      edges {
                        node {
                          location { id name }
                          quantities(names: ["available", "on_hand", "committed"]) {
                            name quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { id: productId }
      );
      return textResult(data);
    },
  },
  {
    name: "list_locations",
    description:
      "List all inventory locations (warehouses/stores) configured in Shopify.",
    inputShape: {},
    handler: async () => {
      const data = await shopifyGraphQL(
        `query {
          locations(first: 50) {
            edges { node { id name isActive address { formatted } } }
          }
        }`
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------
  {
    name: "list_orders",
    description:
      "List orders, optionally filtered by customer, date range, or fulfillment/financial status. Use this to answer questions about sales activity or order volume.",
    inputShape: {
      ...pageArgs,
      query: z
        .string()
        .optional()
        .describe(
          "Shopify search query syntax, e.g. 'created_at:>=2025-01-01' or 'email:foo@bar.com' or 'financial_status:paid' or 'fulfillment_status:unfulfilled'."
        ),
    },
    handler: async ({ first, after, query }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String, $query: String) {
          orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
            edges {
              cursor
              node {
                id name createdAt displayFinancialStatus displayFulfillmentStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                customer { id displayName email }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after, query }
      );
      return textResult(data);
    },
  },
  {
    name: "get_order",
    description:
      "Get full details of a single order by its Shopify GID, including all line items, shipping, and fulfillment status.",
    inputShape: {
      id: z.string().describe("The order's Shopify GID."),
    },
    handler: async ({ id }) => {
      const data = await shopifyGraphQL(
        `query($id: ID!) {
          order(id: $id) {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { id displayName email }
            shippingAddress { address1 city province country zip }
            lineItems(first: 100) {
              edges { node { id title sku quantity variant { id } originalUnitPriceSet { shopMoney { amount currencyCode } } } }
            }
            fulfillments { id status trackingInfo { number url } }
          }
        }`,
        { id }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------
  {
    name: "list_customers",
    description:
      "List customers, optionally filtered by free-text search (name, email, phone).",
    inputShape: {
      ...pageArgs,
      query: z
        .string()
        .optional()
        .describe("Shopify search query syntax, e.g. 'email:foo@bar.com'."),
    },
    handler: async ({ first, after, query }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String, $query: String) {
          customers(first: $first, after: $after, query: $query) {
            edges {
              cursor
              node {
                id displayName email phone numberOfOrders
                amountSpent { amount currencyCode }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after, query }
      );
      return textResult(data);
    },
  },
  {
    name: "get_customer",
    description:
      "Get full details for a single customer by Shopify GID, including order history summary and addresses.",
    inputShape: {
      id: z.string().describe("The customer's Shopify GID."),
    },
    handler: async ({ id }) => {
      const data = await shopifyGraphQL(
        `query($id: ID!) {
          customer(id: $id) {
            id displayName email phone numberOfOrders
            amountSpent { amount currencyCode }
            defaultAddress { address1 city province country zip }
            orders(first: 10, sortKey: CREATED_AT, reverse: true) {
              edges { node { id name createdAt displayFinancialStatus } }
            }
          }
        }`,
        { id }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------
  {
    name: "list_collections",
    description:
      "List product collections (categories/curated groupings) in the store.",
    inputShape: {
      ...pageArgs,
    },
    handler: async ({ first, after }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String) {
          collections(first: $first, after: $after) {
            edges { cursor node { id title handle productsCount { count } } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Fulfillments / shipping
  // -------------------------------------------------------------------
  {
    name: "list_unfulfilled_orders",
    description:
      "List orders that are not yet fulfilled or are partially fulfilled. Use this to answer 'what's waiting to ship' questions.",
    inputShape: {
      ...pageArgs,
    },
    handler: async ({ first, after }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String) {
          orders(first: $first, after: $after, query: "fulfillment_status:unfulfilled OR fulfillment_status:partial", sortKey: CREATED_AT) {
            edges {
              cursor
              node {
                id name createdAt displayFulfillmentStatus
                customer { displayName email }
                lineItems(first: 20) { edges { node { title sku quantity } } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Discounts
  // -------------------------------------------------------------------
  {
    name: "list_discounts",
    description:
      "List active and scheduled discounts (both discount codes and automatic discounts) configured in the store, including status and validity dates.",
    inputShape: {
      ...pageArgs,
    },
    handler: async ({ first, after }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String) {
          discountNodes(first: $first, after: $after) {
            edges {
              cursor
              node {
                id
                discount {
                  __typename
                  ... on DiscountCodeBasic {
                    title status startsAt endsAt
                    codes(first: 5) { edges { node { code } } }
                  }
                  ... on DiscountAutomaticBasic {
                    title status startsAt endsAt
                  }
                  ... on DiscountCodeBxgy {
                    title status startsAt endsAt
                    codes(first: 5) { edges { node { code } } }
                  }
                  ... on DiscountAutomaticBxgy {
                    title status startsAt endsAt
                  }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after }
      );
      return textResult(data);
    },
  },

  // -------------------------------------------------------------------
  // Gift cards
  // -------------------------------------------------------------------
  {
    name: "list_gift_cards",
    description:
      "List gift cards issued by the store, including current balance, initial value, and the customer they're assigned to (if any). Use this to check gift card balances or outstanding liability.",
    inputShape: {
      ...pageArgs,
      query: z
        .string()
        .optional()
        .describe("Shopify search query syntax, e.g. 'enabled:true' or 'last_characters:AB12'."),
    },
    handler: async ({ first, after, query }) => {
      const data = await shopifyGraphQL(
        `query($first: Int!, $after: String, $query: String) {
          giftCards(first: $first, after: $after, query: $query) {
            edges {
              cursor
              node {
                id
                maskedCode
                balance { amount currencyCode }
                initialValue { amount currencyCode }
                enabled
                createdAt
                expiresOn
                customer { id displayName email }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first, after, query }
      );
      return textResult(data);
    },
  },
];
