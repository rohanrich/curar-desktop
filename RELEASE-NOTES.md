# 1.0.1 — 13 October 2026

Images, videos and PDFs stay in app previews with Back/Escape controls. Closing an attachment returns to the same screen. Call clinic displays the clinic phone number with Copy and Back actions. macOS disk images include Installer in their filenames. Selected chat files can be previewed before sending.

Patient medicine reminders use locally timed IST prescriptions while the app runs on an awake computer, and clinic alerts are deduplicated per device. Reading an alert elsewhere does not suppress delivery. Prescriptions refresh while online. Sleep, fully quitting, system permissions and Focus settings still affect delivery.

Separate Curar Doctor and Curar Patient desktop apps, connected to https://app.curar.in.

- Windows: x64 `.exe` installer.
- macOS: universal `.dmg` for Intel and Apple Silicon Macs.
- Linux: x64 `.AppImage` and Debian/Ubuntu `.deb` packages.
- Separate, persistent doctor and patient sign-ins, native file dialogs and PDFs saved under Downloads/Curar.
- WhatsApp contact handoff, report viewing, accessible keyboard controls and zoom.
- Optional desktop system notifications, with the selected three-strike medicine bell. Close the window to keep Curar running in the tray/menu bar; explicitly quitting stops desktop alerts. Internet, a running app and OS notification permissions are required. Sleeping computers cannot provide timely alerts.
- No patient records, credentials, Cloudflare keys or server secrets are included in this repository or the installers. The app needs an online connection; records remain in the existing clinic service.

The initial free installers have no paid publisher certificate or Apple notarization. macOS and Windows may show installation warnings. Verify the release checksums and install only from the clinic's download page. Future signed releases can be added with the clinic's developer certificates.

The launch checks open an anonymous login screen only. These builds have not been tested on every physical device or Linux distribution.
