import "server-only";

import { broadcastWebPush } from "@/lib/push/web-push.js";
import { broadcastBuyerPushAll, sendAdminPush } from "@/lib/push/send.js";
import { getSetting } from "@/lib/settings.js";

// ── ONE ANNOUNCEMENT, EVERY SCREEN IT COULD LAND ON ──────────────────────────────────────────────────────────
// There are THREE push surfaces and the game only ever knew about two of them:
//
//   1. mkt_web_push   — members' browsers. Works, 34 subscriptions, always has.
//   2. mkt_push_token — the MEMBER marketplace app. Zero rows. Nobody has ever registered one.
//   3. app_device     — the owner/employee phone app, keyed by `channel`. One live `full` device with a good
//                       FCM token, heartbeating daily. THIS IS THE OWNER'S PHONE.
//
// Every "tell everyone" call in the game — the raid rally, the raid result, the boss, a sailing launch — sent
// to (1) and (2). Not one of them sent to (3). So the answer to "why don't raids notify me on my phone" was
// never a bug in the sending code or a stale token or a notification preference: the owner's device lives in a
// table nothing in the game reads, and it has been shouting into an empty one instead.
//
// Rather than adding a third call at each of the six call sites and waiting for the seventh to forget it, all
// of them come through here.
//
// ── WHY THE PHONE GETS NO ROUTE ──────────────────────────────────────────────────────────────────────────────
// sendAdminPush's `route` is an in-app nav destination in the ledger app ("shopOrders", "storeCredit"), and
// PushManager.resolveRoute passes anything it does not recognise straight through to the nav layer. Handing it
// "town" would ask the app to navigate somewhere it has no screen for. The notification is the point — tapping
// it opens the app, and the deep link rides along in `data.url` for a client that later wants to use it.
//
// ── AND WHY IT IS NOW OFF BY DEFAULT ─────────────────────────────────────────────────────────────────────────
// Sending here was a fix for "raids never notify my phone", and it was the wrong table that was the problem —
// but it was not the whole diagnosis. The owner also holds a MEMBER account with two live `mkt_web_push`
// browser subscriptions, so every one of these announcements was already reaching him the same way it reaches
// everyone else. Routing it to `app_device` as well did not add a notification, it added a SECOND copy of one
// he already had — landing in the ledger app, which is where an order, a customer message and a vendor
// application land. Six to eight game pushes a day into the surface reserved for business alerts is how a
// business alert stops being read.
//
// So the owner's phone is opt-IN, via the `push.owner_game` setting rather than a deploy, and the game does not
// ask for it. This does not touch business push at all: orders, messages, vendor applications and buy orders
// call sendAdminPush directly and never came through here.
const OWNER_GAME_SETTING = "push.owner_game";

export async function broadcastToEveryone({
    kind = null,        // web-push notify_prefs channel ("raid", "boss", …) — absent pref means ON
    title,
    body,
    url = "/",          // where a browser should land
    route = null,       // in-app route for the MEMBER app only
    tag = null,
    data = {},
    admin = null,       // null = consult the setting (default OFF); true/false forces it either way
}) {
    // Only the setting can turn the ledger app back on for game traffic, and only when the caller hasn't
    // already decided. A failed read means off — silence is the safe side of this particular switch.
    const wantOwner = admin === null
        ? String(await getSetting(OWNER_GAME_SETTING, "off").catch(() => "off")) === "on"
        : admin === true;
    // Awaited together, and awaited AT ALL: on Vercel the handler's response freezes the instance, so a
    // fire-and-forget push is killed mid-flight and nobody hears anything. This bit the raids once already.
    const [web, app, owner] = await Promise.all([
        broadcastWebPush({ kind, title, body, url, tag, data }).catch(() => ({ sent: 0 })),
        broadcastBuyerPushAll({ title, body, route, data }).catch(() => ({ sent: 0 })),
        wantOwner
            ? sendAdminPush({ title, body, route: null, data: { ...data, url }, channels: ["full"] }).catch(() => ({ sent: 0 }))
            : Promise.resolve({ sent: 0, skipped: "owner_game_off" }),
    ]);
    return {
        web: Number(web?.sent) || 0,
        app: Number(app?.sent) || 0,
        owner: Number(owner?.sent) || 0,
        sent: (Number(web?.sent) || 0) + (Number(app?.sent) || 0) + (Number(owner?.sent) || 0),
    };
}
