# UltraOffice2.0 Decommission Checklist

UltraOffice2.0 is the active source of truth.

## Moved into this repo

- IVR main greeting audio
- IVR holiday voicemail audio
- IVR hold music
- Service after-hours audio
- Service voicemail audio
- Sales after-hours audio
- Sales voicemail audio
- Social preview image now uses `public/og-logo.png`

## Live source of truth

- App URL: `https://codex-ultron.onrender.com`
- Supabase project: `tqkqqjvddfrcxrxfvzvz`
- IVR audio base URL: `https://codex-ultron.onrender.com/ivr-greetings`

## Removed/retired

- Old staging import script that targeted the Lovable Supabase project
- Lovable component tagger dependency
- Native app live URL pointing at the Lovable-hosted app
- Electron live URL pointing at the Lovable-hosted app
- Ultraphone handoff default pointing at the Lovable-hosted app
- Supabase CLI project id pointing at the Lovable project

## Still needs a proper replacement

- Old AI edge functions have been moved off hardcoded Lovable AI URLs in source. The new Supabase project still needs an `OPENAI_API_KEY` secret before relying on AI drafting, document extraction, or vision extraction in production.
- We have copied the IVR audio files we found from the current database. To prove every historical file is copied, we need an admin/service inventory of the old Lovable Supabase storage buckets.
