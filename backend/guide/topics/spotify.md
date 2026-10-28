---
id: spotify
title: Spotify
summary: Create a Spotify app, connect Aether, and control playback with chat.
tags: [spotify, music, playback, integration, premium]
related: [tools-and-approvals, troubleshooting, privacy-and-local-first]
order: 90
---
# Spotify

Aether can search Spotify, start playback, queue tracks, change shuffle and repeat, adjust Spotify volume, transfer playback between devices, and like songs. Playback control requires **Spotify Premium**.

## Connect Aether to Spotify

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app. Any name and description are fine.
2. In the app settings, add this exact redirect URI:

   `http://127.0.0.1:8888/callback`

3. Copy the app’s **Client ID**. Aether uses Authorization Code with PKCE, so no client secret is needed or stored.
4. In Aether, open Settings → **Integrations**.
5. Paste the Client ID and click **Connect**.
6. Your browser opens the Spotify sign-in page. Approve the requested permissions.
7. Return to Aether. The status should change to **Connected as …**.

The Client ID is stored in Aether’s config. Access and refresh tokens stay in the local app-data folder and are never sent to the chat model.

## Use it

Examples:

- “Play some lo-fi study music.”
- “Queue the next track by Bonobo.”
- “Skip this song.”
- “Turn shuffle on.”
- “Set Spotify volume to 40%.”
- “What devices are available?”
- “Move playback to my desktop speakers.”
- “Like this song.”
- “Show my liked songs.”

The assistant uses Spotify’s search and playback APIs. It reports what the API returned; it does not claim a track is playing if the command failed.

## Devices

Spotify playback needs an active device. If Aether says no device is available:

1. Open Spotify on your phone or computer.
2. Start any track once.
3. Ask Aether to list devices, then transfer playback to the device you want.

## Disconnect or reconnect

In Settings → Integrations:

- **Disconnect** removes the stored tokens.
- **Reconnect** signs in again without changing the Client ID.
- If you paste a new Client ID, connect again to authorize the new app.

If connection fails, confirm the redirect URI matches exactly, including `http://` and port `8888`. Also confirm the app is not in development-mode user restrictions that exclude your account.

## Limits

- Premium is required for transport controls. Search and some read-only calls may work without it, but playback control will not.
- Spotify’s API controls the Spotify app, not arbitrary local audio. Use the **Media** tools for other players.
- A track may be unavailable in your region or account; Aether reports the API error.
