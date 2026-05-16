# StreetPass — Proximity Cart Exchange

## Vision

When two Frogmarks users are physically near each other, their devices silently exchange a tiny payload. Later, when they open the app, they find a cart waiting — left by someone they passed.

This is the emotional core of the feature: **ambient creative encounters**. No feeds, no follows, no likes. Just: you were near this person, and now you have a piece of what they made.

---

## Why This Is Different Now

Nintendo 3DS StreetPass worked because:
- Dedicated hardware with ultra-low-power standby
- OS designed around passive discovery
- No privacy/tracking concerns at the time

Modern phones are harder:
- iOS/Android aggressively kill background processes
- Battery and privacy protections limit passive scanning
- Users are much more sensitive to proximity tracking

But the idea is still fully viable. The key insight: **you don't need always-on**. Even occasional syncing when the app is open creates the magic.

---

## Technical Architecture

### Approach 1 — Bluetooth Low Energy (BLE)

Most viable for true passive discovery.

**Each device advertises a small beacon:**
```json
{
  "service": "frogmarks-streetpass",
  "userId": "hashed-id",
  "cartridgeHash": "sha256-of-latest-cart"
}
```

**On encounter:**
1. Device A detects Device B's BLE advertisement
2. A brief GATT connection exchanges the StreetPass payload
3. Both devices store the encounter locally
4. Actual cart assets sync later from cloud (or P2P if still nearby)

**Platform support:**
- Android: BLE background advertising possible (with permissions)
- iOS: Background BLE advertising heavily restricted; works reliably when app is in foreground or recently backgrounded

### Approach 2 — Google Nearby / Apple Multipeer Connectivity

Better for larger payloads, real-time sessions, local canvas sharing.

Less suited for passive "you passed someone" encounters.  
More suited for "join a nearby session" or "share this cart right now."

### Approach 3 — Server-Assisted (Fallback)

If BLE is too restricted:
- App periodically checks in with server
- Server records rough location (opt-in, coarse, e.g. city-level)
- Matches users who checked in nearby within a time window
- Delivers pending carts on next app open

This loses the true local-first nature but is much simpler to ship.

---

## Payload Exchange

Keep the BLE payload tiny (fits in a single advertisement or brief GATT read):

```json
{
  "userId": "...",
  "displayName": "szain",
  "avatarHash": "...",
  "cartId": "uuid",
  "cartTitle": "Midnight Garden",
  "cartThumbnailHash": "...",
  "timestamp": 1747180800
}
```

Full cart assets (thumbnail PNG, payload files) sync separately — either from the other user's cloud storage, or via a short-lived P2P transfer if they're still nearby.

---

## Privacy Design

This is the most important non-technical consideration.

**Requirements:**
- Opt-in explicitly — never on by default
- No persistent location data stored
- Hashed user IDs in BLE broadcasts (not cleartext)
- User controls what cart gets broadcast
- "Ghost mode" — receive encounters but don't broadcast
- Clear in-app indicator when broadcasting is active
- Encounters are stored locally only; never uploaded to a feed

**Framing matters:**
The feature should feel like a toy, not surveillance.  
"You crossed paths with a creator" ≠ "We tracked your location."

---

## UX Flow

### Sending
1. User opts in to StreetPass in settings
2. Selects a cart to "carry" (default: most recent export)
3. App advertises in background when open (foreground on iOS)

### Receiving
1. App detects nearby Frogmarks user
2. Silent local record of the encounter
3. On next app open: "You received a cart from [name]" notification in FrogPlayer inbox
4. Cart appears in collection — tap to load in FrogPlayer

### The Inbox
A small inbox section in FrogPlayer shows:
```
Recent Encounters
─────────────────
🐸 szain        "Midnight Garden"    2 days ago
🐸 creator42    "Neon Forest"        1 week ago
```

---

## Relationship to FrogPlayer

StreetPass is the supply chain for FrogPlayer's collection.

Without StreetPass:
- Users manually download/share `.frogcart` files
- FrogPlayer is still useful, just manual

With StreetPass:
- Carts appear in FrogPlayer automatically from encounters
- Collection grows passively
- The bedroom shelf fills up over time

The bedroom metaphor supports this perfectly:  
your shelf fills with carts from people you've crossed paths with.

---

## Phased Rollout

| Phase | What ships |
|-------|-----------|
| 1 | Manual `.frogcart` drag & drop in FrogPlayer |
| 2 | Direct share — "Send cart" to nearby device via Nearby/Multipeer |
| 3 | Passive BLE encounter detection + local inbox |
| 4 | Background sync, ghost mode, encounter history |
