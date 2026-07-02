import "server-only";

import { put } from "@vercel/blob";

// Vendor logos are uploaded during the public application and editable from the portal. Kept small
// and raster-only (no SVG — it can carry scripts and we display these inline).

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
]);

export async function uploadVendorLogo(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
        throw new Error("No image file was provided.");
    }

    const type = (file.type || "").toLowerCase();
    const ext = ALLOWED_TYPES.get(type);
    if (!ext) {
        throw new Error("Logo must be a PNG, JPG, or WEBP image.");
    }
    if (file.size > MAX_BYTES) {
        throw new Error("Logo must be under 8 MB.");
    }

    const blob = await put(`marketplace/logos/logo.${ext}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: type,
    });

    return blob.url;
}
