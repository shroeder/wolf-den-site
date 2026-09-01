import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { withRequestLogging } from "@/lib/server-logger";
import { arenaNav } from "@/lib/marketplace/arena.js";
import { MINING_UNLOCKED, miningNav } from "@/lib/marketplace/mining.js";
import { DELVES_UNLOCKED, getDelveState } from "@/lib/marketplace/delves.js";
import { COOK_UNLOCKED } from "@/lib/marketplace/cooking.js";
import { getChests } from "@/lib/marketplace/chests.js";
import { getSpinState } from "@/lib/marketplace/spin.js";
import { getDailyQuests } from "@/lib/marketplace/quests.js";
import { getBossStrikesLeft } from "@/lib/marketplace/boss.js";
import { fishingUnlocked, sailingNeedsAttention, unusedCasts } from "@/lib/marketplace/sailing.js";
import { getFeatureClaimCounts } from "@/lib/marketplace/feature-dailies.js";
import { getTownTodo } from "@/lib/marketplace/town.js";
import { farmNav } from "@/lib/marketplace/farm.js";
import { dailyChipsReady } from "@/lib/marketplace/chips.js";

// ── THE WHOLE NAV BAR, IN ONE REQUEST ────────────────────────────────────────────────────────────────────────
// GameNav is mounted on every page under /marketplace, and it used to ask FOURTEEN separate endpoints what to
// draw — mining, arena, jeweller, casino, delves, cooking, chests, spin, boss/strikes, quests, sailing,
// feature-daily, town and farm. Every one of them re-authenticated the member, and every one of them re-ran on
// `pathname`, so walking Farm → Forge → Arena billed 42 function invocations for the menu alone.
//
// It cost more than the count suggests, because four of those fourteen were asking a question whose answer is
// `Boolean(buyerId)`:
//
//     jeweller   getJewellerState → owned items, sockets, gems, gold, equipped, enhancements → `unlocked: true`
//     casino     the entire floor: occupants, blackjack table, bingo hall, VIP standing, VIP shadows → `open: true`
//     cooking    the full kitchen → `unlocked: true`
//     arena      the board, every rival's kit, the standings, 70 members' powers → `unlocked: true`
//
// The arena one is the worst of them: 74 database round trips and a 215KB reply, of which the menu reads two
// numbers. That is why /api/marketplace/arena showed up near the top of the invocation list without anybody
// being in the arena, and the same reason the casino did the day it shipped.
//
// So the booleans are answered here from the predicates themselves — the exported ones, not copies of their
// logic — and only the entries that carry a real COUNT do any work.
async function safe(p, fallback) {
    try { return await p; } catch { return fallback; }
}

export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/hud", async () => {
        const buyer = await getAuthenticatedBuyer().catch(() => null);
        const id = buyer?.id || null;
        const noStore = (body) => {
            const res = NextResponse.json(body);
            res.headers.set("Cache-Control", "no-store");
            return res;
        };
        if (!id) {
            return noStore({
                signedIn: false, arena: { unlocked: false }, mine: { unlocked: false }, delves: { unlocked: false },
                jeweller: false, casino: false, kitchen: false, chests: 0, spins: 0, bossStrikes: 0, questsReady: 0,
                sailing: { attention: false, casts: 0, forgeable: 0, fishing: false }, featureClaims: {},
                townTodo: null, farm: { cropsReady: 0, petNudge: 0 },
            });
        }

        const [arena, mining, delves, chests, spin, quests, strikes, attention, casts, featureClaims, townTodo, farm, freeChips] =
            await Promise.all([
                safe(arenaNav(id), { unlocked: false, fightsLeft: 0 }),
                MINING_UNLOCKED(id) ? safe(miningNav(id), null) : null,
                DELVES_UNLOCKED(id) ? safe(getDelveState(id), null) : null,
                safe(getChests(id), []),
                safe(getSpinState(id), null),
                safe(getDailyQuests(id), []),
                safe(getBossStrikesLeft(id), 0),
                safe(sailingNeedsAttention(id), false),
                safe(unusedCasts(id), 0),
                safe(getFeatureClaimCounts(id), {}),
                safe(getTownTodo(id), null),
                safe(farmNav(id), null),
                // ── THE FREE CHIPS, AS ONE BOOLEAN ───────────────────────────────────────────────────
                // Luke: "casino should show a badge if you havent claimed your free chips."
                // dailyChipsReady is a single indexed read of one column on mkt_buyer — deliberately NOT
                // getCasinoState, which builds the whole floor. A nav badge that costs a feature build is
                // the exact thing check:chrome exists to catch, and this component is in the layout.
                safe(dailyChipsReady(id), false),
            ]);

        const chestList = Array.isArray(chests) ? chests : (chests?.chests || []);
        const questList = Array.isArray(quests) ? quests : (quests?.quests || []);
        return noStore({
            signedIn: true,
            // Four booleans that used to cost four full feature builds between them.
            jeweller: true,
            casino: true,
            // Unclaimed free chips today — drives the nav badge on /marketplace/casino.
            casinoChips: Boolean(freeChips),
            kitchen: COOK_UNLOCKED(id),
            arena: { unlocked: Boolean(arena?.unlocked), fightsLeft: Number(arena?.fightsLeft) || 0 },
            mine: {
                unlocked: Boolean(mining?.unlocked),
                trips: Number(mining?.trips) || 0,
                partsReady: Number(mining?.partsReady) || 0,
            },
            delves: {
                unlocked: Boolean(delves?.unlocked),
                runs: (delves?.dungeons || []).filter((d) => d.unlocked && !d.runToday).length,
            },
            chests: chestList.reduce((s, c) => s + (Number(c?.count) || 0), 0),
            spins: spin?.signedIn === false ? 0 : ((spin?.freeAvailable ? 1 : 0) + (Number(spin?.tokens) || 0)),
            bossStrikes: Number(strikes) || 0,
            questsReady: questList.filter((q) => q.done && !q.claimed).length,
            sailing: { attention: Boolean(attention), casts: Number(casts) || 0, forgeable: 0, fishing: fishingUnlocked(id) },
            featureClaims: featureClaims || {},
            townTodo: townTodo || null,
            farm: { cropsReady: Number(farm?.cropsReady) || 0, petNudge: Number(farm?.petNudge) || 0 },
        });
    });
}
