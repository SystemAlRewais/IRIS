# IRIS Official — Tournament Platform

منصة IRIS الرسمية لإدارة البطولة واللاعبين والفرق والمباريات والأرشيف.

## الهوية
- IRIS — Since 2024
- A Story That Never Ends.
- Memories have passed. Memories are still being made.
- It's not about the champion or the best player. It's about the family.

## Architecture
- Frontend: GitHub Pages (HTML, CSS, JavaScript).
- Backend: Google Apps Script Web App.
- Database: private Google Sheets workbook.
- Optional player profile images: Google Drive, served through controlled links.
- All authorization and validation must happen in Apps Script. Hiding controls in the browser is not security.

## Player journey
1. Player submits full three-part name, phone number, preferred position, password, and optional profile photo.
2. Registration is stored as pending and does not create an active player account yet.
3. Admin reviews the request, approves/rejects it, assigns a team, and the backend generates a unique player code.
4. Player signs in and sees their profile, current team, appearances, goals, titles, trophies, match history, and transfer history.
5. Player can submit match apologies, complaints, match reports, and transfer requests. Admin replies and changes request status.

## Admin workspace
- Dashboard and system settings.
- Registration queue and player management.
- Teams and team assignment.
- Match schedule, match results, appearances, goals, and player statistics.
- Titles, awards, tournament seasons, and archive.
- Apologies, complaints, match reports, and transfer requests with admin replies.
- Player profile/photo management.
- Public announcements and visibility controls.
- Audit log for important administrative changes.

## Suggested Google Sheets tabs
- Settings
- Admins
- RegistrationRequests
- Players
- Teams
- Matches
- MatchEvents
- PlayerStats
- PlayerTitles
- Transfers
- PlayerRequests
- Announcements
- AuditLog
- Sessions

## Important data rules
- Use immutable IDs for players, teams, matches, requests, and events.
- Player code is generated only after admin approval and team assignment.
- Stats are derived from approved match events/results; admin corrections are logged.
- Team transfers create history records; never overwrite the player's past team history.
- Player-facing data is filtered server-side by authenticated player ID.
- Admin actions are validated server-side and recorded in AuditLog.
- Store password hashes and salts, never plaintext passwords.
- Never publish the private spreadsheet ID, admin credentials, or secret tokens in GitHub.

## Setup status
This repository is the initial project workspace. Apps Script deployment URL and Google Sheet ID will be configured after the backend and workbook are created.
