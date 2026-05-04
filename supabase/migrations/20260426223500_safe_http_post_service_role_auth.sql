-- Let trusted database triggers call protected Edge Functions. This is needed
-- now that send-sms rejects anonymous callers. We attach an internal shared
-- secret when present, while still sending the usual Supabase Authorization
-- header for functions with JWT verification enabled.

CREATE OR REPLACE FUNCTION public.safe_http_post(
  p_url text,
  p_body jsonb,
  p_source text,
  p_timeout_ms integer DEFAULT 30000,
  p_extra_headers jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _auth_key text;
  _auth_key_name text := 'SUPABASE_SERVICE_ROLE_KEY';
  _internal_secret text;
  _request_id bigint;
  _headers jsonb;
BEGIN
  SELECT decrypted_secret INTO _internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_FUNCTION_SECRET'
  LIMIT 1;

  SELECT decrypted_secret INTO _auth_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF _auth_key IS NULL THEN
    _auth_key_name := 'SUPABASE_ANON_KEY';
    SELECT decrypted_secret INTO _auth_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_ANON_KEY'
    LIMIT 1;
  END IF;

  IF _auth_key IS NULL THEN
    PERFORM public.log_system_error(
      'trigger', p_source,
      'SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY missing from vault',
      'critical', NULL,
      jsonb_build_object('url', p_url, 'body', p_body)
    );
    RETURN NULL;
  END IF;

  _headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || _auth_key,
    'x-source-function', p_source
  ) || COALESCE(p_extra_headers, '{}'::jsonb);

  IF _internal_secret IS NOT NULL THEN
    _headers := _headers || jsonb_build_object('x-internal-function-secret', _internal_secret);
  END IF;

  BEGIN
    SELECT net.http_post(
      url := p_url,
      headers := _headers,
      body := p_body,
      timeout_milliseconds := p_timeout_ms
    ) INTO _request_id;
    RETURN _request_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_system_error(
      'trigger', p_source,
      SQLERRM, 'error', SQLSTATE,
      jsonb_build_object(
        'url', p_url,
        'body', p_body,
        'sqlstate', SQLSTATE,
        'auth_key_name', _auth_key_name
      )
    );
    RETURN NULL;
  END;
END;
$$;
