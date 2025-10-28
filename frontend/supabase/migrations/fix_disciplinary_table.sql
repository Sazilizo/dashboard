-- Check if worker_removal_reviews table exists and what columns it has
-- You can run this first to see the structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'worker_removal_reviews';

-- Drop the existing table if it has wrong structure and recreate
DROP TABLE IF EXISTS worker_removal_reviews CASCADE;

-- Create worker_removal_reviews table with correct structure
CREATE TABLE worker_removal_reviews (
  id SERIAL PRIMARY KEY,
  removed_user INT4 REFERENCES workers(id),
  removed_by INT4 REFERENCES profiles(id),
  reason TEXT,
  warnings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_worker_removal_reviews_removed_user 
ON worker_removal_reviews(removed_user_id);

-- Add is_frozen column to workers table
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;

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
