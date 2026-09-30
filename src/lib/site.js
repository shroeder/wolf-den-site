export const SITE_URL = "https://www.wolfdengamingmn.com";
export const SITE_HOSTNAME = "www.wolfdengamingmn.com";

// The shop's street address, for anything that TELLS SOMEONE WHERE TO GO. The pickup emails had their own
// copy of it and said 302 instead of 300 — a wrong building number in the one message whose whole job is
// getting a customer to the counter. The JSON-LD blocks and the footer still carry their own literal; this
// is the constant to reach for rather than typing a sixth one. See [[reuse-the-rule-never-restate-it]].
export const STORE_NAME = "The Wolf Den";
export const STORE_ADDRESS = "300 1st St S, Montgomery, MN 56069";

// The shop's phone, in the two shapes anything ever needs: one to READ and one to DIAL.
//
// ⚠️ SAME LESSON AS THE ADDRESS DIRECTLY ABOVE, AND IT HAD ALREADY HAPPENED AGAIN. The number was written out
// five separate times — /about, /sell-cards, the LocalBusiness JSON-LD in layout.js, and twice as default
// props on ShopProductBuy — so changing it meant finding all five and getting all five right. The address
// comment above exists because a copy of it said 302 instead of 300 in the one email whose whole job was
// getting somebody to the counter; a wrong phone number is the same failure with a shorter fuse.
export const STORE_PHONE = "(701) 409-0782";
export const STORE_PHONE_TEL = "+17014090782";
