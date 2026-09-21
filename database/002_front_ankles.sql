BEGIN;
-- Upgrade the original six-slot schema in place. Existing slots, accepted bids,
-- reservations and refund obligations retain their permanent IDs and state.
ALTER TABLE auction_slots DROP CONSTRAINT IF EXISTS auction_slots_id_check;
ALTER TABLE auction_slots ADD CONSTRAINT auction_slots_id_check CHECK (
  id IN ('left-quad','right-quad','left-hamstring','right-hamstring',
         'left-calf','right-calf','left-ankle','right-ankle')
);
INSERT INTO auction_slots (id) VALUES ('left-ankle'),('right-ankle')
  ON CONFLICT DO NOTHING;
COMMIT;
