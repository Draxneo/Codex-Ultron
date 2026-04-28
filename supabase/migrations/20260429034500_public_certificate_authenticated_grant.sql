-- Staff may also open public certificate links while signed in.
GRANT EXECUTE ON FUNCTION public.get_public_certificate(text) TO authenticated;
