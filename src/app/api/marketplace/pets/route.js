import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { petsState, equipPet, unequipPet, buyPet, sharePet, acceptShare, declineShare } from "@/lib/marketplace/pets.js";
import { settlePetIncome, petIncomeRate } from "@/lib/marketplace/pet-income.js";
import { db } from "@/lib/db";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map the `stat_*` art keys (mkt_town_art) to the PET_STAT_META / earning stat keys the pets screen renders.
const STAT_ART_MAP = { stat_xp: "xp_gain", stat_gold: "gold_find", stat_fortune: "fortune", stat_might: "might", stat_critchance: "crit_chance", stat_critpower: "crit_power", stat_ferocity: "ferocity", stat_seedluck: "seedLuck", stat_growspeed: "growSpeed", stat_petbond: "petXp", stat_tickets: "tix" };
async function statSprites() {
    const rows = await db.query(`SELECT art_key, url FROM mkt_town_art WHERE art_key LIKE 'stat_%'`).catch(() => []);
    const map = {};
    for (const r of rows) { const k = STAT_ART_MAP[r.art_key]; if (k && r.url) { map[k] = r.url; if (k === "xp_gain") map.xp = r.url; if (k === "gold_find") map.gold = r.url; } }
    return map;
}

// GET — the member's pet state (owned ids, equipped, level, gold, passive total).
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/pets", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            // Lightweight read for the global level-up watcher: just levels + sprites, no income settlement
            // (so it doesn't consume the "your pets earned X since last visit" banner on the pets page).
            const peek = new URL(request.url).searchParams.get("peek") === "1";
            if (peek) {
                const state = await petsState(buyer?.id || null, { sync: true });
                return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
            }
            // Settle passive pet income BEFORE reading state so the gold/xp shown is already up to date.
            const incomeEarned = buyer?.id ? await settlePetIncome(buyer.id).catch(() => ({ xp: 0, gold: 0 })) : { xp: 0, gold: 0 };
            const state = await petsState(buyer?.id || null, { sync: true });
            const income = buyer?.id ? await petIncomeRate(buyer.id).catch(() => null) : null;
            const sprites = await statSprites().catch(() => ({}));
            return NextResponse.json({ ...state, income, incomeEarned, statSprites: sprites }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pets.state.failure" });
        }
    });
}

// POST { action: "equip" | "unequip" | "buy", petId } — equip/unequip a pet, or buy a shop pet.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/marketplace/pets", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
            const b = await request.json().catch(() => ({}));
            let res;
            if (b?.action === "unequip") res = await unequipPet(buyer.id);
            else if (b?.action === "buy") res = await buyPet(buyer.id, String(b?.petId || ""));
            else if (b?.action === "share") res = await sharePet(buyer.id, String(b?.petId || ""), String(b?.toAlias || ""));
            else if (b?.action === "accept") res = await acceptShare(String(b?.shareId || ""), buyer.id);
            else if (b?.action === "decline") res = await declineShare(String(b?.shareId || ""), buyer.id);
            else if (b?.action === "enshrine") {
                // Permanent, and the server is the only thing that checks it: level 6, owned, not already
                // enshrined, and a stone actually in hand. See pet-ascension.js — every one of those is a
                // guard rather than a UI state, because the UI is not where the rules live.
                const { enshrinePet } = await import("@/lib/marketplace/pet-ascension.js");
                res = await enshrinePet(buyer.id, String(b?.petId || ""), String(b?.stone || ""));
            }
            else res = await equipPet(buyer.id, String(b?.petId || ""));
            if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return internalError(error, { event: "marketplace.pets.action.failure" });
        }
    });
}
