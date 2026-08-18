import { notFound } from "next/navigation";

import KitchenLab from "@/components/KitchenLab";
import { getKitchenState, cookingSprites } from "@/lib/marketplace/cooking.js";
import { BAITS, RECIPES } from "@/lib/marketplace/cooking.js";
import { CONSUMABLES, DISH_PET_XP } from "@/lib/marketplace/consumables.js";
import { getFarm } from "@/lib/marketplace/farm.js";

// ── DEV ONLY ─────────────────────────────────────────────────────────────────────────────────────────────────
// Same contract as the Arena and Boards labs: an allow-list on NODE_ENV, so this 404s in production and in any
// build that is not a real dev server.
//
// It exists to answer one question — "what does it look like when you craft bait, and what does it look like
// when you use it" — without writing a single row. Bait shipped days ago and nobody in the Den holds any yet,
// so there is no live account to shoot: the craft reveal only appears if you actually cook (which spends real
// ingredients on a real member) and the picker only appears if you already have bait in the pantry.
//
// So this READS a real kitchen (getKitchenState is a pure read) and mounts the REAL CookingClient and the REAL
// FishingScene against it. Nothing here is a mock-up of the screens; they are the screens.
export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen Lab", robots: { index: false, follow: false } };

// A member who knows a bait recipe, so the recipe list has one to open. Read-only — nothing is written to them.
const LAB_BUYER = "eaf1da90-eefc-4852-af7b-c988430cb77e"; // Sunflower Jinxx

export default async function KitchenLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    const [state, sprites] = await Promise.all([
        getKitchenState(LAB_BUYER).catch(() => null),
        cookingSprites().catch(() => ({})),
    ]);
    if (!state) notFound();
    // ── THE FIXTURE ──────────────────────────────────────────────────────────────────────────────────────
    // The read above is a real, untouched kitchen — which means it knows almost no recipes and has an empty
    // pantry, so nothing is cookable and there is nothing to look at. A lab exists to make the thing happen on
    // demand, so the BAIT recipes are marked known and their shopping lists stocked. Only these flags are
    // invented; every name, tier, sprite, ingredient and reward below them is the real recipe book.
    const recipes = (state.recipes || []).map((r) => (r.kind !== "bait" ? r : {
        ...r,
        known: true,
        timesCooked: r.timesCooked || 3,
        need: (r.need || []).map((n) => ({ ...n, held: Math.max(n.held || 0, n.qty), enough: true })),
        canCook: true,
    }));
    const kitchen = { ...state, recipes, found: recipes.filter((r) => r.known).length };
    // The bait catalogue + its real art, so the fishing picker below shows the same rows the sea would.
    const baits = Object.entries(BAITS).map(([id, b]) => ({
        id, name: b.name, rarity: b.rarity, tilt: b.tilt, blurb: b.blurb, sprite: sprites[id] || null,
    }));

    // ── A BAG WITH DISHES IN IT ──────────────────────────────────────────────────────────────────────────
    // Nobody has cooked since dishes became food, so no real stash has any. These are the REAL dish
    // consumables (name, tier and pet XP all read from the catalogue, not typed here) with a count on them,
    // which is the only invented part.
    const dishIds = RECIPES.filter((r) => r.kind === "dish").map((r) => r.id);
    const held = [
        ...dishIds.filter((id) => DISH_PET_XP[CONSUMABLES[id]?.tier] >= 60).slice(0, 3),
        ...dishIds.filter((id) => DISH_PET_XP[CONSUMABLES[id]?.tier] < 60).slice(0, 3),
    ].map((id, i) => ({ id, count: [4, 2, 1, 6, 3, 2][i] ?? 1 }));

    // The FARM, for the one screen that lets you pick WHICH pet eats. Read for real, then given the same
    // dishes — through the same shape getFarm builds, so the list being looked at is the real list.
    const farm = await getFarm(LAB_BUYER, LAB_BUYER).catch(() => null);
    const farmFixture = farm ? {
        ...farm,
        treats: [
            ...held.map(({ id, count }) => ({
                id, name: CONSUMABLES[id].name, emoji: CONSUMABLES[id].emoji,
                xp: CONSUMABLES[id].effect.amount, count, kind: "dish",
            })),
            ...(farm.treats || []).filter((t) => t.kind !== "dish"),
        ],
    } : null;

    const stash = held.map(({ id, count }) => ({
        id, name: CONSUMABLES[id].name, emoji: CONSUMABLES[id].emoji, kind: CONSUMABLES[id].kind,
        desc: CONSUMABLES[id].desc, count, target: null, feedable: CONSUMABLES[id].effect?.type === "pet_xp",
    }));

    return <KitchenLab kitchen={kitchen} baits={baits} sprites={sprites} farm={farmFixture} stash={stash} />;
}
