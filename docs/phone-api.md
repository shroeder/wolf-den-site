# Wolf Den Phone App API

This doc defines the recommended API calls for the phone app.

## Authentication

All admin endpoints accept either header:

- `x-admin-key: <ADMIN_API_KEY>`
- `Authorization: Bearer <ADMIN_API_KEY>`

For native apps, prefer `Authorization: Bearer ...`.

## Base URL

- Production: `https://<your-domain>`

## Endpoints

### 1) List consignors

`GET /api/admin/consignors`

Response:

```json
{
  "consignors": [
    {
      "id": "uuid",
      "slug": "string",
      "displayName": "string",
      "email": "string"
    }
  ]
}
```

### 2) Get financial snapshot for a consignor

`GET /api/admin/consignors/{consignorId}/financials`

Purpose: one-call mobile summary for current owed + payout history.

Response:

```json
{
  "consignor": {
    "id": "uuid",
    "slug": "string",
    "displayName": "string",
    "email": "string",
    "payoutRate": 0.5,
    "active": true
  },
  "summary": {
    "totalRevenue": 1234.56,
    "estimatedPayoutGross": 617.28,
    "totalPaid": 300,
    "estimatedPayout": 317.28,
    "outstandingBalance": 317.28
  },
  "payouts": [
    {
      "id": "uuid",
      "amount": 50,
      "paidAt": "2026-05-18T01:02:03.000Z",
      "paymentMethod": "cash",
      "note": "partial payout",
      "receiptNumber": "WD-20260518-ABCDEF0123"
    }
  ],
  "totalPaid": 300,
  "receiptUrlTemplate": "/api/admin/consignors/{consignorId}/payouts/{payoutId}/receipt"
}
```

### 3) Create payout (manual payment event)

`POST /api/admin/consignors/{consignorId}/payouts`

Body:

```json
{
  "amount": 50.0,
  "paidAt": "2026-05-18T16:30:00.000Z",
  "paymentMethod": "venmo",
  "note": "May payout"
}
```

Response:

```json
{
  "success": true,
  "payout": {
    "id": "uuid",
    "amount": 50,
    "paidAt": "2026-05-18T16:30:00.000Z",
    "paymentMethod": "venmo",
    "note": "May payout",
    "receiptNumber": "WD-20260518-ABCDEF0123"
  }
}
```

### 4) Retrieve stored receipt for a payout

`GET /api/admin/consignors/{consignorId}/payouts/{payoutId}/receipt`

Response content type: `text/html` (branded receipt snapshot).

### 5) List RSVP-enabled events (for admin event management)

`GET /api/admin/events`

Response:

```json
{
  "events": [
    {
      "slug": "friday-night-magic",
      "title": "Friday Commander Night at The Wolf Den",
      "day": "Fridays",
      "time": "4:00 PM - 7:00 PM",
      "defaultCapacity": 16,
      "capacity": 16,
      "seatsTaken": 6,
      "seatsRemaining": 10,
      "isFull": false,
      "updatedAt": null
    }
  ]
}
```

### 6) List signups for one event

`GET /api/admin/events/{eventSlug}/signups`

Response:

```json
{
  "event": {
    "slug": "friday-night-magic",
    "title": "Friday Commander Night at The Wolf Den",
    "day": "Fridays",
    "time": "4:00 PM - 7:00 PM"
  },
  "signupStatus": {
    "enabled": true,
    "slug": "friday-night-magic",
    "capacity": 16,
    "seatsTaken": 6,
    "seatsRemaining": 10,
    "isFull": false
  },
  "signups": [
    {
      "id": "uuid",
      "slotNumber": 1,
      "name": "Jane Player",
      "email": "jane@example.com",
      "createdAt": "2026-05-23T12:34:56.000Z"
    }
  ]
}
```

### 7) Remove a player from an event

`DELETE /api/admin/events/{eventSlug}/signups/{signupId}`

Response:

```json
{
  "success": true,
  "removed": {
    "id": "uuid",
    "slotNumber": 1,
    "name": "Jane Player",
    "email": "jane@example.com",
    "createdAt": "2026-05-23T12:34:56.000Z"
  },
  "signupStatus": {
    "enabled": true,
    "slug": "friday-night-magic",
    "capacity": 16,
    "seatsTaken": 5,
    "seatsRemaining": 11,
    "isFull": false
  }
}
```

Common errors:

- `404 event_not_found`
- `404 signup_not_found`

### 8) Increase or set event capacity

`PATCH /api/admin/events/{eventSlug}`

Body:

```json
{
  "signupLimit": 24
}
```

Response:

```json
{
  "success": true,
  "settings": {
    "slug": "friday-night-magic",
    "signupLimit": 24,
    "updatedAt": "2026-05-23T12:45:00.000Z"
  },
  "signupStatus": {
    "enabled": true,
    "slug": "friday-night-magic",
    "capacity": 24,
    "seatsTaken": 5,
    "seatsRemaining": 19,
    "isFull": false
  }
}
```

Validation and constraints:

- `signupLimit` must be an integer between 1 and 64.
- Capacity cannot be set below current signups.
- If lower than current signups, response is `409 signup_limit_below_current_signups`.

## Phone Agent Event Admin Playbook

Use these steps in your phone app agent when handling event admin requests.

1. Load event dashboard:
   - Call `GET /api/admin/events`
   - Show each event: capacity, seats taken, seats remaining, full/not full.

2. View and manage one event roster:
   - Call `GET /api/admin/events/{eventSlug}/signups`
   - Render signups list with `id`, `slotNumber`, `name`, `email`.

3. Remove a player:
   - Call `DELETE /api/admin/events/{eventSlug}/signups/{signupId}`
   - On success, refresh event signups.

4. Increase capacity:
   - Call `PATCH /api/admin/events/{eventSlug}` with `{ "signupLimit": <newInt> }`.
   - Use response `signupStatus` as source of truth for updated availability.

5. Error handling:
   - `401 unauthorized`: show re-auth prompt.
   - `404 event_not_found` or `404 signup_not_found`: refresh data and notify user.
   - `409 signup_limit_below_current_signups`: suggest removing signups first or choosing a higher limit.
   - `500`: retry once, then surface request ID from response if present.

## Copy-Paste Prompt For Phone App Agent

Use the prompt below with the phone app agent.

```text
Build an Event Management screen for the Wolf Den phone app using the existing admin API.

Goal:
- Let staff view RSVP-enabled events.
- Let staff open an event roster.
- Let staff remove a player from the roster.
- Let staff increase or change event capacity.
- Use the API as the source of truth after each mutation.

Auth:
- Send either:
  - Authorization: Bearer <ADMIN_API_KEY>
  - or x-admin-key: <ADMIN_API_KEY>
- Prefer Authorization bearer token for the mobile app.

Base URL:
- Production base URL is the site domain.

Endpoints to use:
1. GET /api/admin/events
   - Returns RSVP-enabled events with slug, title, day, time, capacity, seatsTaken, seatsRemaining, isFull.

2. GET /api/admin/events/{eventSlug}/signups
   - Returns event metadata, signupStatus, and signups array.
   - Each signup includes id, slotNumber, name, email, createdAt.

3. DELETE /api/admin/events/{eventSlug}/signups/{signupId}
   - Removes one player from the roster.
   - Response includes updated signupStatus.

4. PATCH /api/admin/events/{eventSlug}
   - Body: { "signupLimit": number }
   - Updates capacity.
   - Cannot set below current signup count.

Required screen structure:

Screen 1: Events List
- Title: Event Management
- Fetch GET /api/admin/events on load.
- Show one card or row per event.
- Each event row must display:
  - title
  - day and time
  - capacity
  - seats taken
  - seats remaining
  - full/open status
- Tapping an event opens Event Detail.
- Pull to refresh should re-fetch the list.

Screen 2: Event Detail
- Fetch GET /api/admin/events/{eventSlug}/signups on load.
- Show event title, day, time.
- Show summary stats:
  - capacity
  - seats taken
  - seats remaining
  - full/open status
- Show a capacity editor:
  - numeric input
  - save button
  - on save, call PATCH /api/admin/events/{eventSlug} with { signupLimit }
  - after success, update UI from response.signupStatus
- Show roster list sorted by slotNumber.
- Each roster row shows:
  - slot number
  - player name
  - email
  - signup timestamp if useful in compact secondary text
- Each roster row needs a remove action with confirmation.
- On confirm, call DELETE /api/admin/events/{eventSlug}/signups/{signupId}.
- After removal, refresh roster or update local state from returned signupStatus and remove the deleted signup row.

Behavior requirements:
- Always treat server response as canonical.
- Disable save/remove controls while request is in flight.
- Show inline loading states, not just blank screens.
- Show empty state if an event has zero signups.
- If PATCH returns 409 signup_limit_below_current_signups, show a clear message like:
  - "Capacity cannot be lower than the current number of signed-up players."
- If auth fails with 401, redirect to app auth handling.
- If event or signup is missing with 404, refresh and notify the user.
- For 500 responses, show a retry action and include requestId if provided.

Implementation notes:
- Keep the UI simple and fast for in-store use.
- Optimize for one-handed use on a phone.
- Put the roster and capacity controls on the same event detail screen.
- Use destructive styling for remove actions.
- Confirm before deleting a signup.
- Do not hardcode capacities; always read from API.
- Do not hardcode event names; always render server data.

Deliverables:
- Event list screen
- Event detail/roster screen
- API client methods for the four endpoints above
- Loading, error, empty, and success states
- Brief summary of files created/changed
```

## Suggested Phone App Flow

1. Fetch consignors list.
2. Choose consignor and call financials endpoint.
3. Show current owed and payout history.
4. When payout is made in person, call create payout endpoint.
5. Offer "View Receipt" by opening payout receipt endpoint.
