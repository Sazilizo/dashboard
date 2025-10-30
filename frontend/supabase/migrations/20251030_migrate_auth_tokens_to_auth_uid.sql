-- Migrate auth_tokens table from user_id to auth_uid
-- This updates the existing table to use auth.users(id) instead of profiles.id

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Users can view their own tokens" ON auth_tokens;
DROP POLICY IF EXISTS "Users can insert their own tokens" ON auth_tokens;
DROP POLICY IF EXISTS "Users can update their own tokens" ON auth_tokens;
DROP POLICY IF EXISTS "Users can delete their own tokens" ON auth_tokens;

-- Drop existing foreign key constraint if it exists
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_user_id_fkey;

-- Rename user_id column to auth_uid
ALTER TABLE auth_tokens RENAME COLUMN user_id TO auth_uid;

-- Add foreign key constraint to auth.users
ALTER TABLE auth_tokens 
  ADD CONSTRAINT auth_tokens_auth_uid_fkey 
  FOREIGN KEY (auth_uid) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Recreate RLS policies with auth_uid
CREATE POLICY "Users can view their own tokens"
  ON auth_tokens FOR SELECT
  USING (auth.uid() = auth_uid);

CREATE POLICY "Users can insert their own tokens"
  ON auth_tokens FOR INSERT
  WITH CHECK (auth.uid() = auth_uid);

CREATE POLICY "Users can update their own tokens"
  ON auth_tokens FOR UPDATE
  USING (auth.uid() = auth_uid);

CREATE POLICY "Users can delete their own tokens"
  ON auth_tokens FOR DELETE
  USING (auth.uid() = auth_uid);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_used ON auth_tokens(used);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);

-- Create or replace the auto-update trigger function
CREATE OR REPLACE FUNCTION update_auth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auth_tokens_updated_at ON auth_tokens;

-- Recreate the trigger
CREATE TRIGGER auth_tokens_updated_at
  BEFORE UPDATE ON auth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_auth_tokens_updated_at();

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_tokens 
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Update table comments
COMMENT ON TABLE auth_tokens IS 'Stores one-time authentication tokens for backup login when webcam is unavailable (profiles/users only, not students)';
COMMENT ON COLUMN auth_tokens.auth_uid IS 'References auth.users.id - the authenticated user UUID';
COMMENT ON COLUMN auth_tokens.token IS '6-digit numeric code for backup authentication';
COMMENT ON COLUMN auth_tokens.expires_at IS 'Token expiration timestamp (60 minutes after creation)';
COMMENT ON COLUMN auth_tokens.used IS 'Flag indicating if token has been used (single-use only)';
