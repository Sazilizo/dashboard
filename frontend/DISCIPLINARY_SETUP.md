# Disciplinary System Setup Guide

## Overview
The disciplinary system allows HR and superuser roles to issue warnings and dismissals to workers, with email notifications and database audit trail. The system supports file attachments as evidence and automatically freezes workers after the third warning.

## Features Implemented

### 1. Email Notifications
- HR/Superuser can send warning or dismissal notices
- Email includes:
  - Type (Warning/Dismissal)
  - Custom subject and message
  - CC and BCC recipients
  - Optional "BCC me" to copy sender
  - File attachments (evidence)

### 2. Database Audit Trail
- Table: `worker_removal_reviews`
- Columns:
  - `id` (int4, primary key)
  - `removed_user` (int4) → references workers.id
  - `removed_by` (int4) → references profiles.id
  - `reason` (text)
  - `warnings` (json) → structure:
    ```json
    {
      "warning_one": "message text",
      "warning_two": "message text", 
      "final_warning": "message text",
      "attachment_one": "url",
      "attachment_two": "url",
      "attachment_final": "url"
    }
    ```

### 3. Progressive Discipline
- First warning → fills `warning_one`
- Second warning → fills `warning_two`
- Third warning OR dismissal → fills `final_warning`
- Attachments stored alongside each warning

### 4. Auto-Freeze on Third Warning
- When `final_warning` is set, worker is automatically frozen
- Add `is_frozen` boolean column to `workers` table
- Frozen workers cannot be assigned to new tasks

## Setup Instructions

### Step 1: Update Database Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Add is_frozen column to workers table
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;

-- Ensure worker_removal_reviews table exists with correct structure
-- (You mentioned it already exists, but here's the complete schema)
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

-- RLS policies (adjust to your needs)
ALTER TABLE worker_removal_reviews ENABLE ROW LEVEL SECURITY;

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
```

### Step 2: Create Storage Bucket

In Supabase Dashboard → Storage:

1. Create a new bucket called `disciplinary-evidence`
2. Set it to **private** (not public)
3. Add RLS policy:

```sql
-- Allow HR/Superuser to upload
CREATE POLICY "HR and Superuser can upload evidence"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'disciplinary-evidence' AND
  auth.uid() IN (
    SELECT auth_uid FROM profiles p
    INNER JOIN roles r ON p.role_id = r.id
    WHERE r.name IN ('hr', 'superuser')
  )
);

-- Allow HR/Superuser to read
CREATE POLICY "HR and Superuser can read evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'disciplinary-evidence' AND
  auth.uid() IN (
    SELECT auth_uid FROM profiles p
    INNER JOIN roles r ON p.role_id = r.id
    WHERE r.name IN ('hr', 'superuser')
  )
);
```

### Step 3: Deploy Edge Function

```powershell
# Navigate to your project root
cd c:\Users\Private\Documents\dashboard\frontend

# Deploy the function
npx supabase functions deploy send-disciplinary

# Set environment variables in Supabase Dashboard → Edge Functions → send-disciplinary → Settings
```

Required environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (from Settings → API)
- `RESEND_API_KEY` - Your Resend API key (get from https://resend.com)
- `DISCIPLINARY_FROM_EMAIL` - Sender email (e.g., `hr@yourdomain.com`)

### Step 4: Update WorkerProfile.js

**Add these imports at the top:**

```javascript
import UploadFileHelper from "../profiles/UploadHelper";
```

**Add these state variables after line 29:**

```javascript
const [attachmentFile, setAttachmentFile] = useState(null);
const [uploading, setUploading] = useState(false);
```

**Replace the `handleSendDisciplinary` function (around line 145) with:**

```javascript
async function handleSendDisciplinary(e) {
  e?.preventDefault?.();
  setSendResult(null);

  if (!isOnline) {
    setSendResult({ ok: false, message: "You're offline. Connect to the internet to send emails." });
    return;
  }
  if (!toEmail || !disciplinarySubject || !disciplinaryMessage) {
    setSendResult({ ok: false, message: "Please fill To, Subject and Message." });
    return;
  }

  setSending(true);
  let attachmentUrl = null;

  try {
    // Upload attachment if provided
    if (attachmentFile) {
      setUploading(true);
      try {
        attachmentUrl = await UploadFileHelper(
          attachmentFile, 
          "disciplinary-evidence", 
          Number(id) || worker?.id
        );
        console.log("[Disciplinary] Uploaded attachment:", attachmentUrl);
      } catch (uploadErr) {
        console.error("[Disciplinary] Upload failed:", uploadErr);
        setSendResult({ ok: false, message: "File upload failed: " + uploadErr.message });
        setSending(false);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const payload = {
      to: toEmail,
      subject: disciplinarySubject,
      message: disciplinaryMessage,
      type: disciplinaryType,
      cc: ccEmails,
      bcc: bccEmails,
      includeMe,
      hrEmail: user?.email || user?.user_metadata?.email || null,
      workerName: worker?.profile?.name || worker?.username || worker?.full_name || null,
      workerId: Number(id) || worker?.id || null,
      removedBy: user?.profile?.id || null,
      reason: disciplinaryMessage,
      attachmentUrl,
    };

    const { data, error } = await api.functions.invoke("send-disciplinary", {
      body: payload,
    });

    if (error) throw error;
    setSendResult({ 
      ok: true, 
      message: data?.status === "simulated" 
        ? "Simulated send (no API key configured)." 
        : "Email sent successfully." 
    });
    
    // Reset form
    setDisciplinarySubject("");
    setDisciplinaryMessage("");
    setCcEmails("");
    setBccEmails("");
    setAttachmentFile(null);
    setShowDisciplinary(false);
  } catch (err) {
    console.error("Disciplinary send failed", err);
    setSendResult({ ok: false, message: err?.message || "Failed to send email" });
  } finally {
    setSending(false);
  }
}
```

**Add file upload field in the modal form (after the Message textarea, around line 292):**

```javascript
<div className="form-row">
  <label>Attachment (evidence)</label>
  <input
    type="file"
    accept="image/*,application/pdf,.doc,.docx"
    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
    disabled={sending || uploading}
  />
  {attachmentFile && (
    <small style={{ display: 'block', marginTop: 4, color: '#666' }}>
      {attachmentFile.name}
    </small>
  )}
</div>
```

**Update the Send button to show upload state (around line 305):**

```javascript
<button type="submit" className="btn btn-primary" disabled={sending || uploading || !isOnline}>
  {uploading ? 'Uploading…' : sending ? 'Sending…' : 'Send'}
</button>
```

### Step 5: Update Edge Function to Handle Attachments and Freeze

The edge function at `supabase/functions/send-disciplinary/index.ts` already has most of the logic. Add this enhancement to store attachments in warnings and trigger freeze:

**Update the DB recording section (around line 110) to:**

```typescript
// Record to DB (worker_removal_reviews)
try {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  if (workerId) {
    // Get existing
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("worker_removal_reviews")
      .select("id, warnings")
      .eq("removed_user", workerId)
      .maybeSingle();

    const defaultWarnings = { 
      warning_one: "", 
      warning_two: "", 
      final_warning: "",
      attachment_one: "",
      attachment_two: "",
      attachment_final: ""
    } as Record<string, string>;
    
    const warnings = (existing?.warnings && typeof existing.warnings === "object") 
      ? { ...defaultWarnings, ...existing.warnings } 
      : defaultWarnings;

    const msgForRecord = reason || subject || "";
    let shouldFreeze = false;

    if ((type || "").toLowerCase() === "dismissal") {
      warnings.final_warning = warnings.final_warning || msgForRecord;
      if (attachmentUrl) warnings.attachment_final = attachmentUrl;
      shouldFreeze = true;
    } else {
      if (!warnings.warning_one) {
        warnings.warning_one = msgForRecord;
        if (attachmentUrl) warnings.attachment_one = attachmentUrl;
      } else if (!warnings.warning_two) {
        warnings.warning_two = msgForRecord;
        if (attachmentUrl) warnings.attachment_two = attachmentUrl;
      } else if (!warnings.final_warning) {
        warnings.final_warning = msgForRecord;
        if (attachmentUrl) warnings.attachment_final = attachmentUrl;
        shouldFreeze = true; // Third warning
      }
    }

    const payload = {
      removed_user: workerId,
      removed_by: removedBy ?? null,
      reason: msgForRecord,
      warnings,
    };

    if (existing?.id) {
      await supabaseAdmin
        .from("worker_removal_reviews")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("worker_removal_reviews")
        .insert(payload);
    }

    // Freeze worker if final warning issued
    if (shouldFreeze) {
      await supabaseAdmin
        .from("workers")
        .update({ is_frozen: true })
        .eq("id", workerId);
      console.log(`[send-disciplinary] Worker ${workerId} has been frozen`);
    }
  }
} catch (dbErr) {
  console.warn("[send-disciplinary] DB record failed:", dbErr);
  // Continue returning email result anyway
}
```

**Add to the interface at the top:**

```typescript
interface DisciplinaryPayload {
  to: string;
  subject: string;
  message: string;
  type?: "warning" | "dismissal" | string;
  cc?: string | string[];
  bcc?: string | string[];
  includeMe?: boolean;
  hrEmail?: string;
  workerName?: string;
  workerId?: number;
  removedBy?: number;
  reason?: string;
  attachmentUrl?: string; // Add this line
}
```

**Extract attachmentUrl from body (around line 30):**

```typescript
const { to, subject, message, type, cc, bcc, includeMe, hrEmail, workerName, workerId, removedBy, reason, attachmentUrl } = body || {};
```

### Step 6: Display Freeze Status Badge

Add this to WorkerProfile.js in the profile details card (around line 235):

```javascript
<Card className="profile-details-count-card">
  <div className="info-count-card">
    <div className="info-count-details">
      <p className="info-count-label">Role</p>
      <p className="info-count-number">
        {worker?.roles?.name || "—"}
      </p>
    </div>
    {worker?.is_frozen && (
      <div className="info-count-details" style={{ marginTop: 8 }}>
        <p className="info-count-label">Status</p>
        <p className="info-count-number" style={{ color: 'red', fontWeight: 'bold' }}>
          🔒 FROZEN
        </p>
      </div>
    )}
  </div>
</Card>
```

## Testing Checklist

- [ ] HR/Superuser can see "Disciplinary Notice" button on worker profiles
- [ ] Other roles cannot see the button
- [ ] Modal opens with all form fields
- [ ] File upload accepts images and PDFs
- [ ] File uploads to `disciplinary-evidence` bucket
- [ ] Email sends successfully (check Resend dashboard)
- [ ] Record created in `worker_removal_reviews` table
- [ ] `warnings` JSON populated correctly
- [ ] Attachment URL stored in warnings JSON
- [ ] Worker frozen after third warning (`is_frozen = true`)
- [ ] Frozen badge displays on profile
- [ ] Offline mode disables send button

## Troubleshooting

### Email not sending
- Check RESEND_API_KEY is set in Edge Function environment
- Verify DISCIPLINARY_FROM_EMAIL is a verified domain in Resend
- Check Resend dashboard logs for errors

### File upload fails
- Verify `disciplinary-evidence` bucket exists
- Check RLS policies allow current user to upload
- Ensure UploadFileHelper is imported correctly

### Worker not freezing
- Check `is_frozen` column exists on `workers` table
- Verify Edge Function has SERVICE_ROLE_KEY (not anon key)
- Check Supabase logs for Edge Function errors

### Database record not created
- Verify `worker_removal_reviews` table exists
- Check RLS policies
- Look for errors in Edge Function logs

## Future Enhancements

- [ ] Display warning history on worker profile
- [ ] Allow unfreezing workers (HR only)
- [ ] Add appeal/notes system
- [ ] Email templates for different warning types
- [ ] Notification to worker when frozen
- [ ] Audit log of who viewed frozen worker profiles

