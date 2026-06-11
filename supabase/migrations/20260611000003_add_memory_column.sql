-- Add memory column to profiles for storing user preferences from bot
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memory TEXT;
