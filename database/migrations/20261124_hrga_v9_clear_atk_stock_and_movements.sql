-- Clear existing ATK stock movements and reset actual/opening stock to 0
-- while keeping all Material Management master items intact.
BEGIN;

DELETE FROM public.stationery_movements;

UPDATE public.stationery_items
SET
  opening_stock = 0,
  current_stock = 0,
  updated_at = now();

COMMIT;
