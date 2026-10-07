# Automatic Fleetwatch mileage

> **Currently switched off.** Mileage is updated by uploading the Fleetwatch
> report on PM Mileage with **Import PDF** (Admin Tools). Nothing below runs
> until it is switched back on:
>
> 1. On Vercel, add the environment variable `FLEETWATCH_AUTO_SYNC` with the
>    value `on` for Production (and Preview if wanted) and redeploy. This
>    turns the endpoint back on, lets it through the site gate, and brings
>    back **Update mileage now** and the check status on PM Mileage.
> 2. Restore the `schedule` block in `.github/workflows/fleetwatch-mileage.yml`
>    (it is commented out) so the half-hourly run resumes.
>
> While off, `POST /api/pm-mileage/sync` answers 503 with a message, the site
> gate treats it like any other API path, and the page shows a "Mileage
> source" line pointing at Import PDF.

## Force Update (manual, available to everyone on the site)

The **Force Update** button next to Import PDF fetches the Vehicle List
Report (Detail) for division 0043:

```
https://pace.fleetwatch.com/Main_Reports/reports/Vehicle/Vehicle%20List%20Report/Report.php?Division=0043&Department=All&VehType=All&TotalBy=Division&Detail=Detail&Revenue=All&VehicleServiceStatus=All&reportFormat=pdf
```

That report has no date window, so it is always current, and it is the only
URL Force Update ever fetches (never the dated mileage or service reports of
the automatic update). `POST /api/pm-mileage/force-update` needs no Admin
Tools, only the site session and a same-site check; it downloads the report
on the server,
reads the vehicle and odometer columns from the report's own header
(`app/lib/vehicleListReport.ts`), and applies the readings through the same
lease, guards and mileage history as the scheduled update
(`syncFleetwatchVehicleList` in `app/lib/fleetwatchSync.ts`): equal readings
are unchanged, lower readings, increases over 50,000 miles and buses edited
during the update are skipped and listed on the page. A report without a
recognizable header is refused and nothing changes. Force Update does not
depend on the `FLEETWATCH_AUTO_SYNC` switch. The same PDF can also be
uploaded through Import PDF for review before applying. Odometers keep the
tenth of a mile the report prints (425,481.5); miles left inherits it, while
PM due marks stay whole miles.

PM Mileage fetches the division 0043 Vehicles Monthly Miles to Date PDF from
Fleetwatch. Each request ends at the current minute and starts exactly 24 hours
earlier, with both dates formatted in America/Chicago (including daylight saving
time). The report's title, date range, division, PDF signature, and size are
validated before any writes.

`.github/workflows/fleetwatch-mileage.yml` requests an update at minutes 7 and 37
of every hour. This runs independently of open browsers and does not require a
Vercel Pro plan or new credentials. GitHub may delay scheduled runs during high
load; the page shows the actual last successful check. A maintainer can also run
the workflow from GitHub Actions. Scheduled workflows run from the default branch;
GitHub can disable them after 60 days of inactivity in public repositories.

Anyone using the site can choose **Update mileage now**. That button and the
scheduler call the same endpoint, which accepts no caller-provided readings,
URLs, or date range. A database lease prevents simultaneous jobs across instances;
requests have a one-minute cooldown and interrupted jobs expire after three
minutes. Report download timeout is 45 seconds; function timeout is 120 seconds.

The update also downloads the **Vehicle Service Status Report** for the same
window. The newest transaction for each bus supplies **Last serviced / last
odometer reading time**, including seconds and older dates from the Vehicles Not
Serviced section. Times remain in the Chicago wall-clock form supplied by
Fleetwatch, which provides no UTC offset. They are separate from inspection and
transmission completion dates, and appear on both the page and printed sheet.

The service transaction odometer must match both the mileage report and the
saved mileage before its timestamp is accepted. A mismatch keeps the existing
timestamp for review/retry, and an older report never moves the timestamp back.
A newer service time can be saved even when the odometer hasn't changed, without
creating a duplicate odometer history entry. If only the service report fails,
mileage still updates and the page explains that previous service times were kept.

Only active fleet buses with valid positive mileage can change. Equal readings
produce no writes or duplicate history. Lower readings, increases over 50,000
miles, and buses edited during the download are skipped and listed on the page
for review. Import PDF remains available to admins for reviewing exceptions.
Mileage, service timestamps, and mileage history commit together; inspection schedules, completions,
statuses, PM notes, and flag notes are untouched. Starred report rows indicate an
older last-service reading, so their unknown reading date remains blank rather
than being represented as today's service.

On failure, saved mileage remains unchanged and the last successful check stays
visible. An open PM page refreshes stored results every 30 seconds while idle.
Tests use an in-memory database, never production or the local `.data` directory.

## The shop's tracker workbook (Copy odometers)

The shop keeps its own "PNW DAILY P.M. TRACKER" workbook and only its
Current Odometer column needs new numbers, so nothing is uploaded or
rewritten. **Copy odometers** on PM Mileage opens a dialog: paste the
sheet's Bus # column (first bus down), and the odometers come back in the
same order, one line per pasted line (blank where a bus has no reading or a
line is not a bus number), to paste over the Current Odometer column
(`odometerLinesFor` in `app/lib/pmTracker.ts`). Numbers are plain with one
decimal (424880.7). The dialog also offers every bus and odometer as two
tab-separated columns for a lookup tab, and a link to
`GET /api/pm-mileage/tracker`, which builds a fresh workbook with both
sheets ("PNW DAILY P,M. TRACKER" and "T,H,D P.M."), live miles-until
formulas and the `0.0` number format (`buildTrackerWorkbook`).

## Importing the shop's tracker (schedule only)

Import PDF accepts the tracker workbook (.xlsx) too. `parseTrackerWorkbook`
in `app/lib/pmTracker.ts` reads the live sheets (header row with Bus # /
Vehicle Number, Inspection Due and Next Insp Type or PM Schedule, and a
miles column that is a formula; pasted fleet-system reports are static and
skipped). The inspection sheet gives each bus its next inspection type
(`PM-A 15000 MILES` → A-15 by the mark, so typos in the letter do not
matter) and due mark; the T,H,D sheet's TRANS, HUB and DIFFERENTIAL rows
give the trans, front hub and differential fluid PM marks, one PM each
(`FLUID_KINDS`, `FLUID_FIELDS` in `app/lib/pmMileage.ts`).
The rows become schedule-only readings (`scheduleOnly: true`, odometer
null): the review shows the odometer already on file, and
`applyPmReadings` writes only the PM marks, leaving the odometer, its date,
its source and the mileage history untouched. The response also lists
active PM-fleet buses the tracker leaves out (`missingFromTracker`).

When a tracker import moves a bus's inspection or fluid PM due mark forward,
`applyPmReadings` records the PM it replaced in `pm_inspections` with
`actor = "Master upload"` (`MASTER_UPLOAD_ACTOR`), before/after states for
undo, and the odometer on file. The Completed tab shows such entries as
"Auto-completed by master upload"; everything else is "Completed manually".
Completing a PM on the site no longer asks for an odometer: `completePm`
uses the reading on file (or the due mark when there is none) and the PM is
recorded at its due mark.

## The committed master schedule

`app/lib/masterSchedule.data.ts` is a generated snapshot of the shop's
master tracker: one row per bus with the next inspection type and due mark
and the trans, hub and diff PM marks (`MASTER_SCHEDULE_ROWS`), stamped with
`MASTER_SCHEDULE_ID`. `applyMasterScheduleOnce` in `app/lib/masterSchedule.ts`
runs those rows through `trackerScheduleReadings` → `reviewReadings` →
`applyPmReadings`, exactly like an Import PDF with the workbook attached,
and stores the outcome under the `pm_master_schedule` app-state key (claimed
first with `claimState` so concurrent server starts do not both apply it).
The root `instrumentation.ts` calls it on every Node server start and logs
`[master-schedule] …`; a snapshot with the same id is skipped, a failed or
abandoned run is retried, and tests (in-memory database) skip it. To ship a
new master: regenerate the data file with `parseTrackerWorkbook`, bump the
id, deploy.
