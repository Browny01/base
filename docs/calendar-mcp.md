# Calendar MCP tools

Base's authenticated MCP endpoint exposes dedicated Calendar tools. Calendar events are intentionally excluded from generic collection mutations so every agent-created change follows the same validation rules as the Calendar page.

## `get_calendar_events`

With no arguments, this returns stored event and recurrence-series records sorted by start date. To retrieve dated occurrences, provide both ends of a visible range:

```json
{
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "limit": 100
}
```

Ranges may span at most 370 days. Daily, weekly, and monthly recurrences use the same expansion rules as the Calendar page, including skipping months that do not contain a monthly series' selected day.

## `create_calendar_event`

Required fields are `title`, `startDate`, `endDate`, and `allDay`. Dates use `YYYY-MM-DD` in the device's local wall clock. Timed events also require `startTime` and `endTime` in 24-hour `HH:MM` format.

```json
{
  "title": "Quarterly planning",
  "startDate": "2026-08-12",
  "endDate": "2026-08-12",
  "allDay": false,
  "startTime": "09:30",
  "endTime": "11:00",
  "category": "work",
  "color": "indigo",
  "location": "Studio",
  "notes": "Bring the operating plan.",
  "repeat": "none"
}
```

`category` defaults to `work`, `color` defaults to the category colour, and `repeat` defaults to `none`.

Accepted categories are `work`, `personal`, `money`, `health`, and `other`. Accepted recurrence values are `none`, `daily`, `weekly`, and `monthly`.

## `update_calendar_event`

Pass the stored event `id` and a shallow patch containing only fields that should change:

```json
{
  "id": "event-id-from-create",
  "patch": {
    "startTime": "10:00",
    "endTime": "11:30",
    "location": "Video call"
  }
}
```

Updating a recurring event changes the entire series. Base preserves its original `id` and `createdAt` and refreshes `updatedAt`.

## `delete_calendar_event`

```json
{
  "id": "event-id-from-create"
}
```

Deleting a recurring event deletes the entire series. Recurrence exceptions and single-occurrence edits are not supported.

## Validation and write isolation

- Titles cannot be empty.
- End dates must be on or after start dates.
- Single-day timed events must end after they start.
- All-day records do not retain start or end times.
- Unknown fields, invalid categories, colours, recurrence values, dates, and times are rejected.
- Create, update, and delete operations replace only `calendarEvents` plus Base's normal document update timestamp. Other collections are preserved.

All four tools use the existing MCP bearer authentication. Keep that token in the calling agent or scheduler's secret store.
