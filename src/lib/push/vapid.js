// VAPID keypair for browser Web Push. The PUBLIC key is safe to ship to the client — it's the
// applicationServerKey the browser needs to create a push subscription. The matching PRIVATE key lives
// ONLY in the VAPID_PRIVATE_KEY env var (Vercel); it is never imported here. Generated 2026-07-16.
//
// To rotate: run `node -e "console.log(require('web-push').generateVAPIDKeys())"`, replace this public
// key, and set the new private key in VAPID_PRIVATE_KEY. (Rotating invalidates existing subscriptions.)
// Rotated 2026-07-25 to a fresh pair whose matching private key is being set in VAPID_PRIVATE_KEY so the
// browser nudges (sailing "land ho"/idle reminders, DMs, friend reqs, badges) can finally go live.
export const VAPID_PUBLIC_KEY = "BKpsnDNXZxcZEwKWkv0XCpLjcPkMeObSSpkBMqA6mkHjIGrgM9pWXQ-zqJ5UVvzoQl2lqwn7t8FbLghA9hsr0xE";
