import "server-only";

import { getInventoryCounts, listConsignorCatalog, searchSalesForVariations } from "@/lib/consignment/square";

const sortByName = (left, right) => left.name.localeCompare(right.name);

export async function getConsignorInventory(consignor) {
    const catalog = await listConsignorCatalog(consignor.square_category_id);
    const counts = await getInventoryCounts(catalog.map((item) => item.id));

    return catalog
        .map((item) => ({
            name: item.name,
            price: item.price,
            quantity: counts.get(item.id) || 0,
        }))
        .sort(sortByName);
}

export async function getConsignorSales(consignor) {
    const catalog = await listConsignorCatalog(consignor.square_category_id);
    const variationLookup = new Map(catalog.map((item) => [item.id, item]));

    return searchSalesForVariations(variationLookup);
}