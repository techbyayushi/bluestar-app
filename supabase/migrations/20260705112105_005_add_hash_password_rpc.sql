/*
# Add hash_password RPC function

Adds a SECURITY DEFINER function to hash passwords using bcrypt (pgcrypto).
This allows the client to hash passwords server-side without exposing the
raw crypt() function. Used for password changes and user creation.
*/

DROP FUNCTION IF EXISTS hash_password(TEXT);
CREATE OR REPLACE FUNCTION hash_password(p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN crypt(p_password, gen_salt('bf'));
END;
$$;

GRANT EXECUTE ON FUNCTION hash_password(TEXT) TO anon, authenticated;