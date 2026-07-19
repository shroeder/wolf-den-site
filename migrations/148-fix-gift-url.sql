-- Gift pop-ups' "Open it →" button pointed at /marketplace/equipment, which is not a real route (the
-- chest opener + gear live on /marketplace/inventory) — so tapping it 404'd. Code now records the right
-- URL; this repairs any un-shown gifts already sitting in the queue.
UPDATE mkt_pending_gift
   SET url = '/marketplace/inventory'
 WHERE url = '/marketplace/equipment';
