<!-- Aether copies every `##` section below into a note called "What's New" in the
     notes vault. Author this file newest-first: add one `##` section at the top
     per release and leave the published ones alone, since Aether matches a
     section by its heading and never rewrites one the note already has. Rename
     the top heading to the version number when the release is tagged.

     Screenshots live in `backend/guide/whats-new/`, are named
     `whats-new-*.png`, and are referenced from here as `assets/<file name>`:
     Aether copies them into the vault's `assets/` folder, which is the only
     place the note editor can render an image from. While a section is still
     "Unreleased" it is safe to edit — no shipped note has it yet. A machine
     that already synced that section keeps its old copy, since sections are
     only ever added; delete its "What's New" note to re-sync from scratch. -->

## 1.1.0 — 22 November 2026

### One bar for everything (Alt+Space)
- Ask a question, do maths, convert currencies or convert units without leaving the bar: `54% of 200`, `$100 in INR`, `5 ft in cm` and even `1 feet in inch` all answer as you type.
- Units cover length, mass, volume, area, speed, temperature, time and data, with the short forms you would actually type (`ft`, `in`, `cm`, `mm`, `kg`, `lb`, `km/h`, `°C`).
- Separators are forgiving: `in`, `to`, `as`, `into`, `=`, `->`, `→` and `>` all work, and `5ft in cm` needs no spaces.
- **Enter copies the answer** to the clipboard, whether it is a calculation, a conversion or Aether's reply. `Tab` asks Aether instead when the local answer is not enough.
- The bar follows the island: Settings → Appearance → Surface (opacity, grain, pop) restyles it, with a live preview while you drag.
- Type `/` to list every command, filtered as you type.

![The input bar answers "5 feet in cm" as you type](assets/whats-new-1.1-bar.png)

![Currency conversion without leaving the bar](assets/whats-new-1.1-currency.png)

![A slash lists the commands and filters them as you type](assets/whats-new-1.1-commands.png)

### Screenshots on a prompt
- A camera button in the input bar (or **Ctrl+S**) takes a screenshot of the screen under your cursor, hides Aether's own overlay first so it is never in the shot, and attaches it to your next prompt.

![A screenshot attached to the prompt, then answered](assets/whats-new-1.1-screenshot.png)

### Shortcuts
- The universal input bar defaults to **Alt + Space** now; the Voice Assistant keeps **Ctrl + Space**. Both are still changeable in Settings → Hotkeys.
- A shortcut Aether owns is swallowed system-wide, so Alt + Space no longer opens the focused window's menu and Ctrl + Space no longer types a space into it.
- Settings → Hotkeys can record combinations Windows keeps for itself: Alt + Space is read from the global hook and dropped straight into the field.
- Right-clicking the island or Settings no longer opens the webview's Back / Refresh / Save as / Print / Inspect menu.

### Sessions
- Pin a session from the session menu: a pinned session is never dropped by the 15-minute inactivity timeout, and Quick Chat and the input bar open on it.

### Context radial wheel
- The wheel is drawn against the monitor the overlay is growing into rather than the overlay's initial strip, so it appears under the cursor on the first frame instead of flashing in the top-left corner.

### Media tools
- Compression quality is now honest and monotone: 100 means the encoder's maximum quality, and the slider no longer copies the file at the top end.
- MP4 compression and Convert to MP4 use the hardware encoder at a high-quality setting, so clips keep their detail instead of being crushed.

## 1.0.3 — 16 November 2026

### Desktop widgets
- Fixed pinned widgets painting a solid theme-coloured square behind their rounded cards. A widget stays a normal top-level window and the desktop owns it, so the card is transparent again while staying clickable.
- Pin and unpin still switch between the desktop layer and always-on-top without a restart.

### Settings
- The close (X) button stays fixed at the top-right while the section content scrolls.
- The sidebar footer shows the actual installed version instead of a hardcoded one.

## 1.0.2 — 15 November 2026

### Desktop media widget
- Pinned-to-desktop media widgets now receive clicks: play/pause, previous/next and pin/remove respond while the widget sits on the desktop.

### Widgets
- A widget's theme and surface overrides are remembered per kind, so removing one and adding it again returns with the same look.

### Calculator
- History survives tab switches, collapsing and reopening the island instead of resetting.

### Island pill
- New CPU, GPU and RAM readouts, each switchable on its own, plus a show/hide toggle for the clock.
- If every readout and the clock are switched off, the clock comes back on its own so the pill is never empty.
- Fixed the stats colliding with the clock; the pill lays out on a centred row whenever readouts are shown.
- Settings → Appearance → Pill indicators is one collapsed group with a show-all tick and a row per readout.

## 1.0.1 — 6 November 2026

### Media player fix
- Play and pause target the media session the widget is showing. Windows can report no "current" session while a paused player is still listed, and controls previously applied to nothing.
- Every media widget sends an explicit play or pause instead of a toggle, so a stale UI state cannot flip the player the wrong way.

## 1.0.0 — 5 November 2026

- First public release. Aether is a local-first Windows AI desktop assistant: a small top-anchored island with voice control, Region to Ask, file tools, a radial wheel for quick file actions and optional component packs for local models and speech. No account and no bundled cloud service.
