import { NextResponse } from "next/server";
import { editableBusModelRows, editableBusTypeRows, normalizeBusTypeConfig } from "../../../lib/grid";
import { getState, recordAuditEvent, setState } from "../../../lib/store";

export const dynamic = "force-dynamic";

const KEY = "bus_type_config";

export async function GET() {
  const { value, updatedAt } = await getState(KEY);
  const config = normalizeBusTypeConfig(value);
  return NextResponse.json({
    config,
    types: editableBusTypeRows(config),
    models: editableBusModelRows(config),
    updatedAt,
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const before = normalizeBusTypeConfig((await getState(KEY)).value);
  const config = normalizeBusTypeConfig(body?.config);
  const updatedAt = await setState(KEY, config);
  await recordAuditEvent(
    "admin_bus_type_config_update",
    { before, after: config },
    typeof body?.actor === "string" ? body.actor : ""
  );
  return NextResponse.json({
    ok: true,
    config,
    types: editableBusTypeRows(config),
    models: editableBusModelRows(config),
    updatedAt,
  });
}
