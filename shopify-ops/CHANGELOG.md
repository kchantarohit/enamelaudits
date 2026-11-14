# Shopify ops log

Every action taken against the store, newest first. Reads are listed so each finding can be traced.

## 2026-11-14 — read-only readiness check
Store `mu1vju-uy.myshopify.com`. **Writes: none.**

| Step | Call | Result |
| --- | --- | --- |
| 1 | get-shop-info | OK. Trial plan, THB, Thailand |
| 2 | search_products (first 50) | OK. 0 products |
| 3 | search_collections (first 50) | OK. 1 collection (frontpage), 0 products |
| 4 | list-orders (first 50) | OK. 0 orders |
| 5 | ShopifyQL `FROM sales ... SINCE -60d` | OK. 0 orders, ฿0 |
| 6 | GraphQL shop / locations / themes / pages / publications | 1st try rejected (deprecated `Shop.billingAddress`, `Publication.name`). Retried with `shopAddress`, `catalog.title`: OK |
| 7 | GraphQL deliveryProfiles / menus / discountNodes | OK. 1 domestic zone at ฿370, default menus, no discounts |
| 8 | GraphQL onlineStore.passwordProtection | OK. Password on |
| 9 | GraphQL shopifyPaymentsAccount | **Access denied** (missing `read_shopify_payments` scope). Payments not checked |

Findings: `2026-11-14-store-audit.md`
