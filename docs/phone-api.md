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

## Suggested Phone App Flow

1. Fetch consignors list.
2. Choose consignor and call financials endpoint.
3. Show current owed and payout history.
4. When payout is made in person, call create payout endpoint.
5. Offer "View Receipt" by opening payout receipt endpoint.
