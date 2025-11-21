-- Migration: tighten/repair RLS for academic_session_participants
-- This migration updates the policy to resolve a user's role via profiles.role_id
-- joined to the roles table (if present), and falls back to matching school_id.
-- Run this in your Supabase SQL editor to apply the fix.

-- Drop the old policy if present and recreate with role_id-aware checks
DROP POLICY IF EXISTS allow_tutors_manage_academic_session_participants ON public.academic_session_participants;
CREATE POLICY allow_tutors_manage_academic_session_participants ON public.academic_session_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.auth_uid = auth.uid()
        AND (
          (r.name IS NOT NULL AND r.name IN ('tutor','head_tutor','admin','superuser'))
          OR p.school_id = public.academic_session_participants.school_id
        )
    )
  )
  WITH CHECK (
    (
      (
        (SELECT r.name
         FROM public.profiles p
         LEFT JOIN public.roles r ON r.id = p.role_id
         WHERE p.auth_uid = auth.uid()
         LIMIT 1
        ) IN ('tutor','head_tutor','admin','superuser')
      )
      OR
      (
        (SELECT p.school_id FROM public.profiles p WHERE p.auth_uid = auth.uid() LIMIT 1) = new.school_id
      )
    );

-- If you also use PE session participants, update that policy similarly
DROP POLICY IF EXISTS allow_tutors_manage_pe_session_participants ON public.pe_session_participants;
CREATE POLICY allow_tutors_manage_pe_session_participants ON public.pe_session_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.auth_uid = auth.uid()
        AND (
          (r.name IS NOT NULL AND r.name IN ('tutor','head_tutor','admin','superuser'))
          OR p.school_id = public.pe_session_participants.school_id
        )
    )
  )
  WITH CHECK (
    (
      (
        (SELECT r.name
         FROM public.profiles p
         LEFT JOIN public.roles r ON r.id = p.role_id
         WHERE p.auth_uid = auth.uid()
         LIMIT 1
        ) IN ('tutor','head_tutor','admin','superuser')
      )
      OR
      (
        (SELECT p.school_id FROM public.profiles p WHERE p.auth_uid = auth.uid() LIMIT 1) = new.school_id
      )
    );

-- Note: these policies assume your `profiles` table uses `role_id` to reference `roles.id`.
-- If your project stores role names directly on profiles (e.g. profiles.roles JSON), adjust accordingly.
