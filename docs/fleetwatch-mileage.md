# Automatic Fleetwatch mileage

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

Only active fleet buses with valid positive mileage can change. Equal readings
produce no writes or duplicate history. Lower readings, increases over 50,000
miles, and buses edited during the download are skipped and listed on the page
for review. Import PDF remains available to admins for reviewing exceptions.
Mileage updates and history commit together; inspection schedules, completions,
statuses, PM notes, and flag notes are untouched. Starred report rows indicate an
older last-service reading, so their unknown reading date remains blank rather
than being represented as today's service.

On failure, saved mileage remains unchanged and the last successful check stays
visible. An open PM page refreshes stored results every 30 seconds while idle.
Tests use an in-memory database, never production or the local `.data` directory.
