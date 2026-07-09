import { NextResponse } from "next/server";
import { editableFlagRows, normalizeFlagConfig } from "../../../lib/grid";
import { getState, recordAuditEvent, setState } from "../../../lib/store";

export const dynamic = "force-dynamic";

const KEY = "flag_config";

export async function GET() {
  const { value, updatedAt } = await getState(KEY);
  const config = normalizeFlagConfig(value);
  return NextResponse.json({
    config,
    flags: editableFlagRows(config),
    updatedAt,
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const before = normalizeFlagConfig((await getState(KEY)).value);
  const config = normalizeFlagConfig(body?.config);
  const updatedAt = await setState(KEY, config);
  await recordAuditEvent("admin_flag_config_update", { before, after: config }, typeof body?.actor === "string" ? body.actor : "");
  return NextResponse.json({
    ok: true,
    config,
    flags: editableFlagRows(config),
    updatedAt,
  });
}
