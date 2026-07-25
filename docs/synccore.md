# SyncCore

SyncCore is the collaboration and recovery contract for the Lot Sheet. It keeps
the proven specialized operation log while making retries, reconnects, and
multi-device editing deterministic.

## Invariants

1. A client submits an edit, not a whole sheet.
2. Every submitted edit has a stable client-generated operation id.
3. Retrying the same operation id applies it at most once.
4. Operations are serialized under the existing database advisory lock.
5. Unrelated edits from different clients are preserved.
6. Edits to the same target use server operation order: the last accepted edit
   is visible.
7. Moving a bus removes its previous placements and writes its destination as
   one atomic operation.
8. Clearing the grid or lots is an explicit operation, never a stale snapshot.
9. The browser keeps unsent work in a durable local outbox.
10. A remote poll never replaces unsaved local work.

## Operation Envelope

```ts
interface LotSheetOpEnvelope {
  opId: string;
  baseRevision: number;
  op: LotSheetOp;
}
```

`opId` is the idempotency key. `baseRevision` records the client context for
diagnostics; the server still applies valid field operations to the latest
sheet under lock instead of rejecting unrelated stale-base edits.

Supported granular operations include:

- Set a header field or override bit
- Set or clear one grid cell
- Set one lot list
- Lock or unlock one cell
- Move one bus to a cell or lot
- Remove one bus everywhere
- Clear the grid while preserving locks
- Clear selected lots

`replace_sheet` remains only for explicit import/administrative replacement.
Ordinary editing and clearing do not use it.

## Durable Browser Outbox

Before the client sends a batch, it stores the exact snapshot and operation
envelopes in `localStorage` under `lotsheet:outbox:v1`.

- A refresh or app close restores the same batch.
- Retries reuse the same operation ids.
- The server reports duplicates without advancing the revision.
- The outbox is removed only after acknowledgement.
- The visible sheet keeps local work while the latest server baseline loads.
- `pagehide` and backgrounding use the same persisted batch with `keepalive`.

The UI shows `Offline - retrying` while a batch cannot be delivered.

## Catch-Up Paging

`GET /api/sheet/ops?since=<revision>&limit=500` returns:

- `ops`
- `revision` (latest server revision)
- `nextRevision` (last revision in this page)
- `hasMore`
- the current snapshot for recovery

The client advances only to the last operation it actually applied, requests
additional pages, and falls back to the current snapshot only if older
operations were compacted. This prevents the former 500-operation skip.

## Concurrent Editing

When two clients change different targets, both operations survive. When they
change the same target, later server order wins. If a user keeps typing while a
save is in flight, the acknowledged server result becomes the new baseline and
the newer local difference remains queued for the next batch.

The three-way merge is used only for this local-in-flight window and remote
catch-up. It compares:

- The last acknowledged server baseline
- The current local sheet
- The newest server sheet

Only fields changed locally relative to the baseline are overlaid.

## Audit And Actors

Operations retain actor, timestamp, revision, operation id, and operation
details. The current actor is a stable device label because the site does not
yet require user accounts. Future authentication can replace the actor source
without changing the operation contract.

## Verification

The automated suite covers:

- Duplicate retry idempotency
- Concurrent unrelated edits
- Last-writer behavior on the same target
- Atomic bus moves without duplicate placements
- Locked-grid clearing
- Durable outbox restoration with stable ids
- Paged catch-up without skipped revisions
- Legacy bare-operation compatibility

The production release is additionally probed through the real local API to
confirm duplicate delivery does not advance revision and stale-base unrelated
edits remain present.
