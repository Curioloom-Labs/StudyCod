# Contest air-alert safety mode

The contest safety toggle uses the public [Tryvoha.online API](https://tryvoha.online/api). It requires no registration, form, or API key. The backend reads the region catalog from `/api/v1/regions` and active alerts from `/api/v1/alerts`; only locations in the provider catalog are offered to participants. The service requires visible attribution, which is shown in the safety dialog.

No provider secret or environment variable is needed. The backend applies the schema migration on startup by default. To apply it manually from `backend`, run:

```powershell
npm run db:migrate
```

Organizers can then enable **Air-alert safety mode** when creating a contest or in contest settings. Participants who have joined are asked to select an available city, district, or oblast on the contest page before opening tasks. The selection is an administrative-area UID; the app does not collect GPS coordinates.

During an active air-raid alert for the selected area, a participant can confirm they are already safe and continue, or take a pause of up to 10 minutes. The statement, editor, run/check actions, and judge results are blocked during the pause. On resume, the server adds the elapsed pause duration to that participant's personal contest deadline and excludes later submissions from the official score.

Organizers can also choose a reference city and a response for a red-level alert in contest settings:

- **Like yellow** shows the same safety prompt to participants and offers each person their own pause of up to 10 minutes.
- **Lock everyone until the level changes** hides tasks and blocks editing and submissions for all participants while the reference city reports red. The global contest deadline is extended by the red-only interval. A red-to-yellow change ends the global lock immediately and starts the normal participant prompts; each participant's yellow pause is compensated individually.
- A red-to-yellow transition remains visible as a new alert even if the provider has not reported an all-clear.

The **Manual participant lock** control in contest settings lets an organizer pause participant access at any time. The global contest deadline is extended for the duration of this lock as well. Organizers can restore access from the same control. Participants receive a non-blocking notification when an alert clears.

The backend caches region data for an hour and active-alert data for 30 seconds. A provider outage or invalid response locks access until the status can be checked again. Tryvoha.online is an informational service based on open sources, not an official warning channel; its data may be delayed or inaccurate and it offers no availability guarantees. Participants must continue following official local alerts and guidance.
