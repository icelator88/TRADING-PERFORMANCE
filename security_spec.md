# Firestore Security Specification (`DiarioTrade`)

## 1. Data Invariants
1. Every `UserProfile` at `/users/{userId}` can only be read, created, updated, or deleted by the authenticated non-anonymous user whose `request.auth.uid == userId`. Collection listing on `/users` is strictly denied to prevent PII enumeration.
2. Every `UserSettings` at `/users/{userId}/settings/{settingId}` and every `Trade` at `/users/{userId}/trades/{tradeId}` cannot exist without an existing parent `/users/{userId}` document (Master Gate) and must satisfy `ownerId == request.auth.uid == userId`.
3. `id`, `ownerId`, and `createdAt` are immutable once created. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. `setup` and `strategy` are strictly constrained to the 5 whitelisted mechanical strategies (`S1`, `SSA`, `MUT`, `SBIL DOMINANCE REALE`, `SBIL INTRADOMINANCE`).
5. Every string field enforces strict `.size()` bounds; `extraColumns` map is capped at `<= 20` keys; no ghost fields are accepted (`hasOnly`).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read/write to `/users/{userId}/trades/{tradeId}` or `/users/{userId}/settings/{settingId}`.
2. Anonymous session (`sign_in_provider: 'anonymous'`) attempting create/update on `/users/{userId}`, `/users/{userId}/settings/{settingId}`, or `/users/{userId}/trades/{tradeId}`.
3. Cross-tenant `get` or `list` attempt by user B against `/users/{userA}/trades` or `/users/{userA}/settings`.
4. Cross-tenant `create` where user B writes into `/users/{userB}/trades/{id}` or `/users/{userB}/settings/{id}` with `ownerId: userA`.
5. Orphaned write creating `/users/{uid}/trades/{id}` or `/users/{uid}/settings/{id}` before `/users/{uid}` exists.
6. Ghost field injection ("Shadow Update") adding `isAdmin: true` or `role: "admin"` on create or update.
7. Immutable field tampering modifying `createdAt`, `ownerId`, or `id` during `update`.
8. Client-spoofed `createdAt` or `updatedAt` timestamp not equal to `request.time`.
9. Oversized document ID (`> 128` chars or invalid characters like `../../admin`).
10. Invalid strategy injection (`setup: "S6"` or `"Russell 2000"`) bypassing the 5-strategy whitelist.
11. Unbounded `notes` payload (`> 2000` characters) or invalid `language`/`activeTab` enum value on `UserSettings`.
12. `extraColumns` map injection with `> 20` entries or wrong type on numeric fields (`netR: "hack"`).
