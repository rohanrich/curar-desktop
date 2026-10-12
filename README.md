# Curar desktop

This repository contains the desktop launcher only. Clinic server code, patient data and credentials are not part of it. The apps use the online clinic at https://app.curar.in and share its responsive interface.

## Free online builds

The manually dispatched GitHub Actions workflow uses standard Windows, macOS and Ubuntu hosted runners in a public repository. It tests the launcher, launches each role against the anonymous production login screen, builds installers, records SHA-256 hashes and publishes a release after all three jobs succeed. No Cloudflare, Firebase, Resend or patient credentials are needed.

Build tools run on GitHub, not on the clinic's computer. Paid runners, billing, paid signing and notarization are not enabled.

## Local development

Node 24 is required. Run `npm ci`, `npm test`, `node scripts/prepare-role.cjs doctor` (or `patient`), then `npm run smoke` or `npm run build`. Packaging targets are defined by `scripts/prepare-role.cjs`. Increment the version for a new immutable release.

## Desktop behaviour

Doctor and patient editions use separate operating system data directories and persistent Chromium sessions. Login remains in the existing clinic auth service; sign out this device or all devices from the app.

Downloads save to Downloads/Curar. External HTTPS, mail and WhatsApp links open through the operating system. Remote content has sandboxing, context isolation, Node disabled, no unrestricted IPC or filesystem bridge and no embedded WebView privileges. Only the trusted clinic main frame can use the small notification/WhatsApp bridge.

Enable desktop notifications in the app and allow the app in OS settings. Optional background tray/menu-bar operation checks new notifications every 15 seconds. The app must remain running and the computer awake and online. This is native desktop notification polling, not browser Web Push. Medicines use the clinic's selected three-strike bell. Notification clicks open the relevant conversation/report/medication section.

The free macOS build uses an ad-hoc signature required for Apple Silicon, not a verified Apple publisher certificate or notarization. The Windows build has no publisher certificate. OS installation warnings are expected; see RELEASE-NOTES.md.
