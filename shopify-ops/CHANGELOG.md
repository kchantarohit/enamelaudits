# Shopify ops log

Every action taken against the store, newest first. Reads are listed so each finding can be traced.

## 2026-11-14 — bilingual policy drafts (not published)
**Writes to the store: none.** Drafts in `policies/drafts/` (refund, shipping, terms of service, contact info), Thai + English. They have `[[...]]` blanks that the owner needs to fill in. Publish only after approval, with `shopPolicyUpdate`.

## 2026-11-14 — shipping rates renamed to Thai
Approved by the owner. **Writes: 1 mutation** (`deliveryProfileUpdate`, `userErrors: []`).

| Rate | Before | After |
| --- | --- | --- |
| `DeliveryMethodDefinition/991658442883` | Standard | จัดส่งมาตรฐาน (฿50, orders ฿0–฿999.99) |
| `DeliveryMethodDefinition/991681970307` | Free Shipping | จัดส่งฟรี (฿0, orders ฿1,000+) |

- Verified by reading it back: names changed, prices and order-value ranges unchanged.
- Undo: rename back to `Standard` / `Free Shipping`.

## 2026-11-14 — domestic shipping: ฿50, free from ฿1,000
Approved by the owner. **Writes: 1 mutation.** Backup: `backups/2026-11-14-delivery-profile-before.json`

| | Before | After |
| --- | --- | --- |
| Standard (`DeliveryMethodDefinition/991658442883`) | ฿370 on every order | ฿50, orders ฿0–฿999.99 |
| Free Shipping (`DeliveryMethodDefinition/991681970307`) | did not exist | ฿0, orders ฿1,000+ |

- Mutation: `deliveryProfileUpdate` on `DeliveryProfile/120157831299` (โปรไฟล์ทั่วไป), zone Domestic (all of Thailand). `userErrors: []`.
- Verified by reading the profile back: both rates active, ranges don't overlap, so checkout shows one option.
- Undo: delete `991681970307`, set Standard back to ฿370 and remove its price conditions.

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
