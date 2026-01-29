# Firestore Schema (My Butterfly Admin)

This document mirrors the mobile app schema exactly. Do not add or rename fields.

## Collections & Fields

### 1) `questionnaires/{questionnaireId}`
- `active`: boolean
- `title`: string
- `createdAt`: timestamp (serverTimestamp)
- `updatedAt`: timestamp (serverTimestamp)

Subcollection: `questionnaires/{questionnaireId}/questions/{questionId}`
- `active`: boolean
- `order`: number
- `type`: `"single_select" | "multi_select" | "text" | "range"`
- `key`: string (ex: `level`, `style`, `distance`, `priority`, `preferences`, `budget` or custom Vocabulary keys)
- `label`: string
- `helpText?`: string
- `options?`: array of
  - `{ value: string; label: string; order: number; active: boolean }`
- `validation?`: `{ required: boolean; min?: number; max?: number }`
- `createdAt`: timestamp (serverTimestamp)
- `updatedAt`: timestamp (serverTimestamp)

### 2) `products/{productId}`
- `active`: boolean
- `name`: string
- `brand?`: string
- `imageUrl?`: string (public URL for PrestaShop imports)
- `productUrl?`: string (public product page URL)
- `imageUrls?`: string[]
- `price`: number
- `currency`: `"EUR" | "RON"`
- `tags`: `{ level: string[]; style: string[]; distance: string[] }`
- `attributes`: `{ control?: number; spin?: number; speed?: number; weight?: number }`
- `source?`: `{ provider: "prestashop"; prestashopProductId: string; lastSyncAt?: timestamp }`
- `prestashop?`: `{ productId: number; imageId?: number }`
- `recommendationScenarios?`: array of
  - `{ active: boolean; order: number; conditions: { level?: string[]; style?: string[]; distance?: string[]; priority?: string[]; budgetMin?: number; budgetMax?: number }; explanationTemplate: string }`
- `createdAt`: timestamp (serverTimestamp)
- `updatedAt`: timestamp (serverTimestamp)

### 2.1) `questionnaireCompletions/{completionId}`
- `createdAt`: timestamp
- `questionnaireId`: string
- `questionnaireTitle`: string
- `user`: `{ uid?: string; isAnonymous: boolean; email?: string }`
- `contact`: `{ name: string; email: string; phone?: string }`
- `answers`: object
- `matchProductIds?`: string[]
- `specialistRequestId?`: string

### 3) `users/{uid}`
- `createdAt`: timestamp
- `lastSeenAt`: timestamp
- `platform?`: `"ios" | "android"`

Subcollection: `users/{uid}/specialistRequests/{requestId}`
- `createdAt`: timestamp
- `status`: `"new" | "in_progress" | "sent"`
- `questionnaireId`: string
- `answers`: object
- `note?`: string
- `contact?`: `{ name?: string; phone?: string; email?: string }`
- `matchProductIds?`: string[]
- `source?`: `"recommendation_test"`
- `reply?`: `{ message: string; recommendedProductIds?: string[]; sentAt?: timestamp }`

Subcollection: `users/{uid}/questionnaireAnalyticsDaily/{docId}`
- `docId`: `${YYYY-MM-DD}_${questionnaireId}`
- `day`: timestamp (start-of-day UTC)
- `questionnaireId`: string
- `starts`: number
- `completes`: number
- `answers?`:
  - `level?`: `{ [value: string]: number }`
  - `style?`: `{ [value: string]: number }`
  - `distance?`: `{ [value: string]: number }`
  - `priority?`: `{ [value: string]: number }`
  - `preferences?`: `{ [value: string]: number }`
  - `budgetBuckets?`: `{ [bucket: string]: number }` (bucketed by max/budget, step 100)

### Admin allowlist: `admins/{uid}`
- `active`: boolean
- `role`: `"admin" | "editor"`
- `createdAt`: timestamp
- `updatedAt`: timestamp

### Meta config: `meta/config`
- `updatedAt`: timestamp (serverTimestamp)
Used to signal content updates to the mobile app (cache invalidation).

## Suggested Indexes
- `questionnaireCompletions` ordered by `createdAt desc`
- `questionnaireCompletions` with `where("questionnaireId","==",...)` + `orderBy("createdAt","desc")`
- `collectionGroup("specialistRequests")` with `where("status","==","new")` + `orderBy("createdAt","desc")`
- `collectionGroup("specialistRequests")` with `orderBy("createdAt","desc")`
- `collectionGroup("questionnaireAnalyticsDaily")` with `where("questionnaireId","==",...)` + `orderBy("day","asc")` (and day range filters)
- `questionnaires` ordered by `updatedAt`
- `products` ordered by `updatedAt`

## Admin Read/Write Patterns (Cost-Aware)
- Lists use `getDocs` with pagination (`limit` + `startAfter`) and manual refresh. No realtime listeners for big lists.
- Search is applied on the current page when no index strategy is available.
- Rule editor resolves product details by ID only (chunked queries), not full collection loads.
- On any admin create/update/delete for:
  - `questionnaires`
  - `questionnaires/{id}/questions`
  - `products`
  the admin app updates `meta/config.updatedAt` with `serverTimestamp()` to allow cheap cache invalidation on mobile.

## PrestaShop Import (Admin)
- Imported products use Firestore doc IDs in the form `ps_{prestashopProductId}` to avoid collisions.
- On import, the admin app sets `source.provider = "prestashop"` and `source.prestashopProductId`.
- `imageUrl` is a public URL built from PrestaShop imageId and does not require API auth.
- Only base fields (name, price, currency, active, imageUrl/imageUrls) are auto-filled; tags/attributes remain manual.

## Tags (Admin UX)
- The admin no longer edits `tags.level/style/distance` directly in the product form.
- These tags are derived automatically from the product’s active `recommendationScenarios[].conditions` for display purposes.

## Security Rules Outline (High Level)
- Admins can read/write all admin-managed collections (`questionnaires`, `products`).
- Users can write only their own `users/{uid}/specialistRequests` subcollection.
- Users can read only their own `users/{uid}` document and subcollections.
- Admin allowlist (`admins/{uid}`) readable by admins only.

## Seed Instructions (Minimal)
1. Create your admin allowlist doc in `admins/{uid}` with `{ active: true, role: "admin", createdAt, updatedAt }`.
2. Create a `questionnaires/{id}` document with `active`, `title`, and timestamps.
3. Add at least one question in `questionnaires/{id}/questions/{questionId}` with `type`, `key`, `label`, `order`, `active`, and timestamps. Include `options` for select types.
4. Create a `products/{productId}` document with `active`, `name`, `price`, `currency`, `tags`, `attributes`, and timestamps.
5. Create a `recommendationRules/{ruleId}` document with `active`, `order`, `conditions`, `results.productIds`, `explanationTemplate`, and timestamps.
