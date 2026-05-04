alter table public.ivr_config
  add column if not exists overflow_offer_voicemail_choice boolean not null default false;
