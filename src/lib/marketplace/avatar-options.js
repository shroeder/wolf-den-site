// Vanilla avatar identity options (DiceBear "avataaars" style). These are the FREE base-identity choices
// every member gets from day one — skin, hair, face, basic clothes. Flair (hats, graphic tees, auras,
// crowns…) is deliberately excluded here and reserved for future unlockable/purchasable cosmetics that
// layer ON TOP. Pure module (no server-only, no DiceBear import) so the picker + mappings can import it.

export const AVATAR_STYLE = "avataaars";

// Hairstyles only — hats/hijab/turban/winterHat* are held back as cosmetic unlocks. "bald" = no hair.
export const HAIR_TOPS = [
    "shortFlat", "shortRound", "shortWaved", "shortCurly", "theCaesar", "theCaesarAndSidePart", "sides",
    "shavedSides", "straight01", "straight02", "straightAndStrand", "bob", "bun", "curly", "curvy",
    "dreads", "dreads01", "dreads02", "frida", "fro", "froBand", "frizzle", "longButNotTooLong",
    "miaWallace", "shaggy", "shaggyMullet", "bigHair", "bald",
];
// Hats aren't offered in the base picker (they're headwear COSMETICS), but they're valid `top` values,
// so sanitize must allow them through when a native headwear cosmetic sets one.
export const HAT_TOPS = ["hat", "turban", "hijab", "winterHat1", "winterHat02", "winterHat03", "winterHat04"];
// Full clothing set incl. graphicShirt (a logo tee — pairs with clothingGraphic).
export const CLOTHINGS = ["shirtCrewNeck", "shirtScoopNeck", "shirtVNeck", "hoodie", "collarAndSweater", "blazerAndShirt", "blazerAndSweater", "overall", "graphicShirt"];
// Designs printed on a graphicShirt.
export const CLOTHING_GRAPHICS = ["bat", "bear", "cumbia", "deer", "diamond", "hola", "pizza", "resist", "skull", "skullOutline"];
export const EYES = ["default", "happy", "wink", "winkWacky", "surprised", "squint", "side", "hearts", "closed", "eyeRoll", "cry", "xDizzy"];
export const EYEBROWS = ["default", "defaultNatural", "raisedExcited", "raisedExcitedNatural", "flatNatural", "angry", "angryNatural", "sadConcerned", "sadConcernedNatural", "unibrowNatural", "upDown", "upDownNatural", "frownNatural"];
export const MOUTHS = ["smile", "default", "twinkle", "serious", "tongue", "eating", "grimace", "disbelief", "concerned", "sad", "screamOpen", "vomit"];
export const FACIAL_HAIR = ["none", "beardLight", "beardMedium", "beardMajestic", "moustacheFancy", "moustacheMagnum"];
export const ACCESSORIES = ["none", "round", "wayfarers", "sunglasses", "prescription01", "prescription02", "kurt", "eyepatch"];

// Colors (hex WITHOUT the leading '#', DiceBear's format).
export const SKIN_COLORS = ["ffdbb4", "edb98a", "fd9841", "f8d25c", "d08b5b", "ae5d29", "614335"];
export const HAIR_COLORS = ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370", "c93305", "e8e1e1", "ecdcbf", "f59797"];
export const FACIAL_HAIR_COLORS = ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370", "c93305", "e8e1e1", "ecdcbf", "f59797"];
export const CLOTHES_COLORS = ["262e33", "3c4f5c", "25557c", "5199e4", "65c9ff", "b1e2ff", "929598", "e6e6e6", "ffffff", "a7ffc4", "ffffb1", "ffafb9", "ff488e", "ff5c5c"];
export const BACKGROUND_COLORS = ["none", "65c9ff", "5199e4", "a7ffc4", "ffafb9", "ffffb1", "ff5c5c", "e6e6e6", "262e33"];

// The config we store on the member (mkt_buyer.avatar_config). One value per field.
export const DEFAULT_AVATAR = {
    skinColor: "edb98a",
    top: "shortFlat",
    hairColor: "4a312c",
    eyes: "default",
    eyebrows: "default",
    mouth: "smile",
    facialHair: "none",
    facialHairColor: "4a312c",
    accessories: "none",
    accessoriesColor: "262e33",
    clothing: "shirtCrewNeck",
    clothesColor: "5199e4",
    clothingGraphic: "skull",
    hatColor: "262e33",
    backgroundColor: "none",
};

// field -> its allowed value list, in stored order. Drives validation + the picker. `top` includes hats
// now (full customization). Colors reuse the clothes palette.
export const AVATAR_FIELDS = {
    skinColor: SKIN_COLORS,
    top: [...HAIR_TOPS, ...HAT_TOPS],
    hairColor: HAIR_COLORS,
    hatColor: CLOTHES_COLORS,
    eyes: EYES,
    eyebrows: EYEBROWS,
    mouth: MOUTHS,
    facialHair: FACIAL_HAIR,
    facialHairColor: FACIAL_HAIR_COLORS,
    accessories: ACCESSORIES,
    accessoriesColor: CLOTHES_COLORS,
    clothing: CLOTHINGS,
    clothesColor: CLOTHES_COLORS,
    clothingGraphic: CLOTHING_GRAPHICS,
    backgroundColor: BACKGROUND_COLORS,
};

const ALLOWED = Object.fromEntries(Object.entries(AVATAR_FIELDS).map(([k, v]) => [k, new Set(v)]));

// Keep only known fields with allowed values; fall back to the default for anything missing/invalid.
export function sanitizeAvatarConfig(config) {
    const src = config && typeof config === "object" ? config : {};
    const out = {};
    for (const key of Object.keys(AVATAR_FIELDS)) {
        const val = src[key];
        out[key] = ALLOWED[key].has(val) ? val : DEFAULT_AVATAR[key];
    }
    return out;
}

// Config -> query string for the render route (the URL fully determines the image, so it caches forever).
export function avatarConfigToQuery(config) {
    const clean = sanitizeAvatarConfig(config);
    const params = new URLSearchParams();
    for (const key of Object.keys(AVATAR_FIELDS)) params.set(key, clean[key]);
    return params.toString();
}

// The image URL for a stored config, or null when the member has no built avatar (use photo/initials).
export function avatarUrlFor(config) {
    if (!config || typeof config !== "object" || !Object.keys(config).length) return null;
    return `/api/marketplace/avatar?${avatarConfigToQuery(config)}`;
}

// The ONE shared default avatar shown for members who haven't built their own (instead of blank initials).
export const DEFAULT_AVATAR_URL = `/api/marketplace/avatar?${avatarConfigToQuery(DEFAULT_AVATAR)}`;

// "shortFlat" -> "Short Flat", "straight01" -> "Straight 01", "none" -> "None".
export function humanizeAvatarLabel(value) {
    if (value === "none") return "None";
    if (value === "bald") return "Bald / none";
    return String(value)
        .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
        .replace(/([0-9])([A-Za-z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase());
}
