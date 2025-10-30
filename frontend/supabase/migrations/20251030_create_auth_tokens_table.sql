-- Create auth_tokens table for backup authentication
-- This table stores temporary 6-digit codes that allow users to login without biometrics
-- Tokens expire after 60 minutes and can only be used once

CREATE TABLE IF NOT EXISTS auth_tokens (
  auth_uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_used ON auth_tokens(used);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);

-- Enable Row Level Security
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own tokens
CREATE POLICY "Users can view their own tokens"
  ON auth_tokens FOR SELECT
  USING (auth.uid() = auth_uid);

-- RLS Policy: Users can insert their own tokens
CREATE POLICY "Users can insert their own tokens"
  ON auth_tokens FOR INSERT
  WITH CHECK (auth.uid() = auth_uid);

-- RLS Policy: Users can update their own tokens
CREATE POLICY "Users can update their own tokens"
  ON auth_tokens FOR UPDATE
  USING (auth.uid() = auth_uid);

-- RLS Policy: Users can delete their own tokens
CREATE POLICY "Users can delete their own tokens"
  ON auth_tokens FOR DELETE
  USING (auth.uid() = auth_uid);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_auth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before update
CREATE TRIGGER auth_tokens_updated_at
  BEFORE UPDATE ON auth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_auth_tokens_updated_at();

-- Optional: Function to cleanup expired tokens (can be called manually or via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_tokens 
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE auth_tokens IS 'Stores one-time authentication tokens for backup login when webcam is unavailable (profiles/users only, not students)';
COMMENT ON COLUMN auth_tokens.auth_uid IS 'References auth.users.id - the authenticated user UUID';
COMMENT ON COLUMN auth_tokens.token IS '6-digit numeric code for backup authentication';
COMMENT ON COLUMN auth_tokens.expires_at IS 'Token expiration timestamp (60 minutes after creation)';
COMMENT ON COLUMN auth_tokens.used IS 'Flag indicating if token has been used (single-use only)';
