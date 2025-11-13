# App Store & Play Store Submission Notes (draft)

Use these example notes when submitting to Apple App Store or Google Play. Edit to match your final privacy policy URL and contact information.

## Short explanation for reviewers

This app provides an offline-capable school management dashboard. To enable reliable attendance and sign-in even when networks are unreliable, we implement optional, device-local biometric sign-in. The biometric feature is entirely optional and requires explicit user consent. Biometric descriptors and profile images are stored locally on the device and are not uploaded to our servers unless the user explicitly opts to share them.

We also provide user controls to delete all locally stored biometric data and queued offline changes from Settings → Offline & Biometric Settings.

## Privacy policy
- URL: (replace with your hosted privacy policy)
- The privacy policy explicitly references local biometric storage, retention, and deletion mechanisms.

## Technical notes for reviewers
- Camera permission is requested only when the user chooses to enroll a face. We added a clear usage description in Info.plist (NSCameraUsageDescription) and request Camera permission at runtime on Android.
- Offline queued mutations use IndexedDB. Synced uploads are performed when connectivity is restored. Background sync is implemented via the page's background sync + a native skeleton (Android WorkManager skeleton present) — please test on-device.

## Contact
- privacy@example.com (replace with correct contact)
