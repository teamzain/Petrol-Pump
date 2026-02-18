-- 069_add_notes_to_card_payments.sql
-- Add a notes column to the card_payments table to allow users to enter notes when marking as received.

ALTER TABLE public.card_payments ADD COLUMN IF NOT EXISTS notes TEXT;
