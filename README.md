# IRIS Official — Family Tournament Platform

منصة IRIS لإدارة مجتمع البطولة واللاعبين والفرق والمباريات والإحصائيات والطلبات والإعلانات.

## الهوية
- IRIS — Since 2024
- A Story That Never Ends.
- Memories have passed. Memories are still being made.
- It's not about the champion or the best player. It's about the family.

## Architecture
- Frontend: GitHub Pages (static HTML/CSS/JavaScript).
- Backend: Google Apps Script Web App.
- Database: private Google Sheets workbook.
- Admin UI: `admin.html`.
- Player UI: `index.html`.

## Current features
### Player portal
- Registration request and admin approval.
- Player login by player code or phone.
- Player overview and performance statistics.
- Match history, titles and team transfer history.
- Submit apologies, complaints, match reports, transfer requests and other requests.
- View admin announcements and replies.

### Admin control center
- Admin login with role-aware access.
- Dashboard counts.
- Review and approve/reject player registrations and assign teams.
- Browse players and activate/suspend player accounts.
- Create teams and activate/deactivate teams.
- Create matches, save scores and record goals, assists and cards.
- Transfer players and award titles.
- Review player requests and send replies.
- Publish announcements.
- Super-admin can create admin/reviewer accounts and suspend/reactivate them.
- Audit log for administrative actions.

## Database tabs
Settings, Admins, RegistrationRequests, Players, Teams, Matches, MatchEvents, PlayerStats, PlayerTitles, Transfers, PlayerRequests, Announcements, AuditLog, Sessions.

The Apps Script setup function creates missing tabs and appends missing columns without deleting existing data.

## Required configuration
1. Keep the Google Sheet private.
2. In Apps Script Script Properties set `IRIS_SPREADSHEET_ID` to the private workbook ID.
3. Run `setupIRIS()` once from the Apps Script editor and approve the requested permissions.
4. Deploy the Apps Script as a Web App, executing as the owner, with access set to Anyone. Keep the spreadsheet itself private.
5. Set the deployed Web App URL in `assets/js/config.js`.
6. After every backend code change, update the existing Web App deployment to a new version (Deploy → Manage deployments → Edit → New version → Deploy).
7. Enable GitHub Pages from the repository root (`main`, `/(root)`).

## First administrator
Create the first administrator in the `Admins` sheet with username, full_name, initial_password, role `super_admin`, and status `active`. The next API request provisions the password hash and clears the temporary password cell. Never commit credentials or share them in chat.

## Operational checks before public launch
- Verify `/health` returns success after deploying the latest Apps Script version.
- Test super-admin login at `/admin.html`.
- Create at least two teams before approving registrations.
- Test one registration from submission through approval and player login.
- Test a match, score, goal/assist/card event, player statistics, player request, admin reply and announcement.
- Confirm the Apps Script deployment URL and GitHub Pages URL are correct.
- Review access permissions and keep the spreadsheet private.

## Important limitations / data integrity notes
- Player appearance counts are calculated from completed matches for the player's current team; transfers do not yet preserve historical team membership for appearance calculations.
- Clean sheets are estimated for players whose current position is goalkeeper from their team's completed matches; a dedicated goalkeeper appearance/event model would be needed for exact historical attribution.
- This project has not been security-audited or load-tested. Do not treat it as production-certified until the end-to-end checks above and a security review are complete.
