-- Remove the temporary shipping-rate diagnostic table (088). The EasyPost issue is resolved; no
-- diagnostic scaffolding should linger.
DROP TABLE IF EXISTS shop_shipping_debug;
