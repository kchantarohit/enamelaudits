# Shopify ops log

Every action taken against the store, newest first. Reads are listed so each finding can be traced.

## 2026-11-14 — publish refund / shipping / terms: blocked by permissions
Owner said "use the defaults". **Writes to the store: none.** Shopify refused all three updates.

- Filled the drafts with the suggested defaults. Blanks that had no default were filled with neutral wording that's true either way: a link to `/pages/contact` instead of email or LINE, "tracked courier services" instead of a named courier, tracking sent by email, no VAT wording, operator not named. Checked that no `[[...]]` was left.
- Moved the finished Markdown to `policies/` and built HTML bodies in `policies/html/` with `tools/md2policy.py`.
- Before writing: checked the store's policies. Only PRIVACY_POLICY exists, so nothing would have been overwritten.
- `shopPolicyUpdate` ×3 (REFUND_POLICY, SHIPPING_POLICY, TERMS_OF_SERVICE): **Access denied**. The connector lacks the `write_legal_policies` scope. Read back afterwards: still only PRIVACY_POLICY, unchanged.
- Workaround: pages to copy from in `policies/copy-paste/`, for the owner to paste in Shopify admin → Settings → Policies.
- Contact information is still a draft (`policies/drafts/contact-information.md`); every line in it needs the owner's business details.

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
