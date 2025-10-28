-- Add is_frozen column to workers table
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;

-- Create worker_removal_reviews table
CREATE TABLE IF NOT EXISTS worker_removal_reviews (
  id SERIAL PRIMARY KEY,
  removed_user INT4 REFERENCES workers(id),
  removed_by INT4 REFERENCES profiles(id),
  reason TEXT,
  warnings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_worker_removal_reviews_removed_user 
ON worker_removal_reviews(removed_user);

-- Enable RLS
ALTER TABLE worker_removal_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policy for HR and Superuser
CREATE POLICY "HR and Superuser can manage reviews"
ON worker_removal_reviews
FOR ALL
USING (
  auth.uid() IN (
    SELECT auth_uid FROM profiles p
    INNER JOIN roles r ON p.role_id = r.id
    WHERE r.name IN ('hr', 'superuser')
  )
);
