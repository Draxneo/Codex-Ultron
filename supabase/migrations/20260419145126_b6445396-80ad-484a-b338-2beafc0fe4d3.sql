ALTER TABLE public.equipment_matchups
  ADD COLUMN IF NOT EXISTS monthly_payment_120 numeric;

UPDATE public.equipment_matchups
   SET monthly_payment_120 = round(total_price * 0.0125, 2)
 WHERE total_price IS NOT NULL
   AND monthly_payment_120 IS NULL;