# Upload face-api model files to Supabase (gzipped)

This script gzips model files from `public/models/` and uploads them into a Supabase Storage bucket with recommended headers (Cache-Control, Content-Encoding).

Prerequisites
- Node 18+ (or Node with global fetch available). If your Node doesn't have global fetch, install `node-fetch` and update the script to import it.
- A Supabase project and a Storage bucket (for example: `public`).
- A service role key or service API key with permission to PUT objects to Storage. Keep this key secret.

Environment variables
- `SUPABASE_URL` - e.g. https://xyzcompany.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `SUPABASE_KEY` - service role key for uploads
- `SUPABASE_BUCKET` - (optional) target bucket, default `public`
- `PREFIX` - (optional) remote prefix for files, default `models/v1/`

Usage

From the project root:

```bash
# Windows PowerShell example
$env:SUPABASE_URL = 'https://<project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-key>'
$env:SUPABASE_BUCKET = 'public'
node ./scripts/upload-models.js
```

What this does
- Walks `public/models/`, gzips each file using best compression, and uploads it to the bucket at `${PREFIX}<relative-path>`.
- Sets `Content-Encoding: gzip` and `Cache-Control: public, max-age=31536000, immutable` so browsers will cache aggressively.
- Prints the public base URL you can use in `REACT_APP_MODELS_URL` (e.g. `https://.../storage/v1/object/public/<bucket>/models/v1/`).

Notes & Security
- Use the service role key only in CI or a secure environment. Do not embed it into client-side code or expose it to end users.
- Uploaded objects are written to the bucket path provided. If your bucket is public, the objects will be downloadable by the browser.

Client integration
- Set `REACT_APP_MODELS_URL` to the public base URL from the script output (ensure it ends with a trailing slash). Example:

```
REACT_APP_MODELS_URL=https://<project>.supabase.co/storage/v1/object/public/<bucket>/models/v1/
```

- `src/utils/FaceApiLoader.js` will probe this URL and lazy-load the models. If the server serves gzipped files with `Content-Encoding: gzip`, browsers will transparently decompress them.

Manifest and integrity
- The script now generates `models-manifest.json` (uploaded to the same prefix). It includes SHA256 checksums for each file and sizes. The client `FaceApiLoader` will attempt to fetch and verify this manifest before caching model files. If a checksum mismatch is detected the client will abort the load and log an error.

Advanced: checksum verification
- For higher supply-chain safety, you can sign the manifest and verify signatures on the client. The current manifest provides a basic integrity check.
