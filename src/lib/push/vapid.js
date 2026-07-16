// VAPID keypair for browser Web Push. The PUBLIC key is safe to ship to the client — it's the
// applicationServerKey the browser needs to create a push subscription. The matching PRIVATE key lives
// ONLY in the VAPID_PRIVATE_KEY env var (Vercel); it is never imported here. Generated 2026-07-16.
//
// To rotate: run `node -e "console.log(require('web-push').generateVAPIDKeys())"`, replace this public
// key, and set the new private key in VAPID_PRIVATE_KEY. (Rotating invalidates existing subscriptions.)
export const VAPID_PUBLIC_KEY = "BNJ2KXZv5qPLWT3-FI5EfaTP924-Pm3zK7tr21ocR2NRU-CIqTYDCMjrscfXlwWAJt63_ANW5i9wPAmlh7WNdGE";
