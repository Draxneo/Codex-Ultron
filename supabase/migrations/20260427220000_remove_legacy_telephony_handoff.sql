-- UltraOffice2.0 owns phone and SMS directly. Remove the old external app handoff switch
-- so live configuration cannot accidentally hide the in-app softphone/SMS surfaces again.
delete from public.company_settings
where key in ('telephony_handoff_enabled', 'telephony_handoff_url');
