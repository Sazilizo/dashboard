-- Migration: allow head tutors to view worker-tutors and head coaches to view worker-coaches
-- Purpose: permit `head_tutor` to SELECT `workers` rows where worker role is 'tutor'
-- and permit `head_coach` to SELECT `workers` rows where worker role is 'coach'.
-- Scoped to same `school_id` unless the requesting user is admin/superuser.

DROP POLICY IF EXISTS allow_heads_select_workers_by_role ON public.workers;
CREATE POLICY allow_heads_select_workers_by_role ON public.workers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          -- admins and superusers can see all workers
          (p.roles->>'name') IN ('admin','superuser')
          -- head_tutor may see worker rows where worker role is 'tutor' within same school
          OR (
            (p.roles->>'name') = 'head_tutor'
            AND (public.workers.roles->>'name') = 'tutor'
            AND p.school_id = public.workers.school_id
          )
          -- head_coach may see worker rows where worker role is 'coach' within same school
          OR (
            (p.roles->>'name') = 'head_coach'
            AND (public.workers.roles->>'name') = 'coach'
            AND p.school_id = public.workers.school_id
          )
        )
    )
  );

-- Notes:
-- - If your `workers.roles` or `profiles.roles` JSON structure differs (arrays, nested objects), update the JSON path checks accordingly.
-- - If you want these head roles to see workers across schools, remove the `p.school_id = public.workers.school_id` checks.
