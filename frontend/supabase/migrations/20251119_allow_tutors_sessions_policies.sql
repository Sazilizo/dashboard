-- Migration: allow tutors and head_tutors to view and manage sessions/participants/attendance
-- Purpose: tutors/head_tutors should be able to SELECT sessions and manage participants
-- Note: Run this migration in your Supabase SQL editor or via your migrations runner.

-- Allow tutors and head_tutors (and admin/superuser) to SELECT academic sessions
DROP POLICY IF EXISTS allow_tutors_select_academic_sessions ON public.academic_sessions;
CREATE POLICY allow_tutors_select_academic_sessions ON public.academic_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.auth_uid = auth.uid()
        AND (
          (r.name IS NOT NULL AND r.name IN ('tutor','head_tutor','admin','superuser'))
          OR p.school_id = public.academic_sessions.school_id
        )
    )
  );

-- Allow tutors/head_tutors to SELECT PE sessions as well (if you use pe_sessions)
DROP POLICY IF EXISTS allow_tutors_select_pe_sessions ON public.pe_sessions;
CREATE POLICY allow_tutors_select_pe_sessions ON public.pe_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.auth_uid = auth.uid()
        AND (
          (r.name IS NOT NULL AND r.name IN ('tutor','head_tutor','admin','superuser'))
          OR p.school_id = public.pe_sessions.school_id
        )
    )
  );

-- Allow tutors/head_tutors to manage academic_session_participants (view/insert/update/delete)
DROP POLICY IF EXISTS allow_tutors_manage_academic_session_participants ON public.academic_session_participants;
CREATE POLICY allow_tutors_manage_academic_session_participants ON public.academic_session_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
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

-- Same for PE session participants table
DROP POLICY IF EXISTS allow_tutors_manage_pe_session_participants ON public.pe_session_participants;
CREATE POLICY allow_tutors_manage_pe_session_participants ON public.pe_session_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
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

-- Allow tutors/head_tutors to INSERT attendance_records for students in their school
DROP POLICY IF EXISTS allow_tutors_insert_attendance_records ON public.attendance_records;
CREATE POLICY allow_tutors_insert_attendance_records ON public.attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.roles r ON r.id = p.role_id
      WHERE p.auth_uid = auth.uid()
        AND (
          (r.name IS NOT NULL AND r.name IN ('tutor','head_tutor','admin','superuser'))
          OR p.school_id = new.school_id
        )
    )
  );

-- Allow tutors/head_tutors to UPDATE attendance_records (e.g. set sign_out_time) for their school
DROP POLICY IF EXISTS allow_tutors_update_attendance_records ON public.attendance_records;
CREATE POLICY allow_tutors_update_attendance_records ON public.attendance_records
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          (p.roles->>'name') IN ('tutor','head_tutor','admin','superuser')
          OR p.school_id = public.attendance_records.school_id
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

-- Note: these policies grant reasonable access for tutor/head_tutor roles within their school.
-- If your `profiles.roles` structure differs, or `profiles.id` is not auth.uid(), adjust the checks accordingly.
