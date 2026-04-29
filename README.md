# VolleyballRotation (VolleyRef)

A WeChat Mini Program for collaborative volleyball officiating, covering room creation, live match control, substitutions, between-set setup, and post-match review.

Current home build label: `V1.5.7 | VolleyballRotation@163.com`

## What the app supports

- 6-digit referee room ID + 6-digit password create/join flow
- Team setup (match format, team names, team colors, optional captain setup, 6+2 roster)
- Live scoring with auto/manual rotation, timeout management, side switching, and undo
- In-match substitution panel with validation rules and records
- In-page **Edit Players** mode for correcting lineup input mistakes (not counted as substitutions)
- In-page **Between Sets** mode (including deciding-set controls)
- Captain confirmation modal before start and in re-confirm scenarios when captain setup is enabled
- Guide page with anchored quick-start sections
- Result page with:
  - set summaries,
  - score progress track,
  - per-set match record timeline,
  - full result-page image export from a 2D canvas,
  - score-sheet image export from a 2D canvas
- Light/Dark theme support
- Multi-referee collaboration with operator/observer takeover

## Active pages

Only these pages are in the active route list:

- `pages/home/home`
- `pages/guide/guide`
- `pages/join-match/join-match`
- `pages/create-room/create-room`
- `pages/match/match`
- `pages/result/result`

## High-level runtime flow

1. `home`
- Enter **Create Match** or **Join Match**.
- Shows a quick resume card when cached room credentials are still valid.
- Opens `guide` from the version/meta entry.

2. `guide`
- Provides a short, section-based onboarding for room setup, collaboration, substitutions, libero use, and result handling.

3. `create-room`
- Configure match format and both teams.
- Validate lineup input and optional captain setup.
- Save room and enter `match`.

4. `match`
- Pre-start state requires on-court captain confirmation when captain setup is enabled.
- Start match and run normal live officiating.
- Optional mode switch to:
  - `edit_players` (input correction mode),
  - `between_sets` (set transition mode).

5. `result`
- Shows final match data and per-set details.
- Exports the result page image and score sheet image from local canvas rendering.

## Collaboration model (A/B referees)

Room collaboration is driven by fields under `collaboration`, mainly:

- `ownerClientId`
- `operatorClientId`
- participant presence map

Rules:

- The client matching `operatorClientId` is the active operator (A role).
- Other clients are observers (B role).
- Observers can tap **Takeover** to become operator.
- UI and actionable controls are role-aware.

## Match flow modes in `pages/match/match`

`matchFlowMode` values:

- `normal`
- `edit_players`
- `between_sets`

The page keeps all three modes in one unified runtime instead of navigating to a separate lineup page.

## Sharing and quick resume

Sharing is enabled on core pages (`home`, `join-match`, `create-room`, `match`, `result`):

- With valid room payload, share path targets `join-match` and can auto-fill/auto-join.
- Without valid room payload, share path falls back to `home`.
- Share image is fixed at: `/assets/share/share-card.jpg`.

Home quick resume uses locally cached last room credentials:

- verifies password,
- checks room status,
- then jumps to `match` or `result`.

## Room lifecycle and retention

Defined in `miniprogram/utils/room-service.ts` and mirrored in `cloudfunctions/roomApi/index.js`:

- Base room TTL: `6h`
- Extra TTL after match has started (one-time extension): `+3h`
- Result keep time after match completion: `24h`
- Participant TTL: `40s`
- Room lock TTL: `3h`

Cloud cleanup additionally archives expired rooms in `rooms_expired_archive` and keeps archive records for an extra `3 days` before deletion.

## Tech stack

- Frontend: WeChat Mini Program (`TypeScript`, `WXML`, `LESS`)
- Backend: WeChat CloudBase
  - Cloud Function: `cloudfunctions/roomApi`
  - Collections: `rooms`, `room_locks`, `rooms_expired_archive`

Main cloud actions:

- `getRoom`
- `upsertRoom`
- `createRoom`
- `cleanupExpiredRooms`
- `isRoomIdBlocked`
- `reserveRoomId`
- `hasRoomLock`
- `releaseRoomId`
- `verifyRoomPassword`
- `heartbeatRoom`
- `leaveRoom`

## Development

1. Install dependencies:

```bash
npm install
```

2. Open the project in WeChat DevTools and bind the correct CloudBase environment.

3. Deploy cloud function:
- `cloudfunctions/roomApi`

4. Ensure required collections exist:
- `rooms`
- `room_locks`
- `rooms_expired_archive`

5. Type-check before release:

```bash
npx tsc -p tsconfig.json --noEmit
```

## Notes

- This project currently keeps most match orchestration inside `pages/match/match.ts`.
