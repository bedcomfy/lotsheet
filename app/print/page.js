// Server-rendered, static version of the lot sheet — no interactivity. Used as
// the source for the server-side PDF export (/api/pdf renders this page with a
// headless browser so printing is identical on every device). It reuses the
// same class names as the live sheet so it looks pixel-for-pixel the same.

import { getSheet, getFlags } from "../lib/store";
import {
  SLOTS,
  FRONT_COLUMNS,
  EAST_LOT_CELLS,
  COLUMN_COUNT,
  numberedCellId,
  frontCellId,
  row11CellId,
  flagDisplay,
  inspMilesDisplay,
  flagsFullDisplay,
  groupFlaggedBuses,
  cellLocationLabel,
  typeInfo,
} from "../lib/grid";
import { busTypes } from "../lib/buses";

export const dynamic = "force-dynamic";

const LOTS = [
  { key: "north", title: "NORTH LOT" },
  { key: "east", title: "EAST LOT" },
  { key: "fence", title: "FENCE" },
];

function getNum(s, id) {
  const v = s.cells ? s.cells[id] : null;
  if (!v) return "";
  return typeof v === "string" ? v : v.num || "";
}
function flagFor(flags, num) {
  return (num && flags[num]) || { flags: [], note: "", inspMiles: null };
}

// Static type-code badges (server-only twin of components/TypeCodes).
function TypeCodes({ num, className = "" }) {
  const types = busTypes(num);
  if (!types.length) return null;
  return (
    <span className={`typecodes ${className}`}>
      {types.map((t, i) => {
        const ti = typeInfo(t);
        if (!ti) return null;
        return (
          <span key={t} className="typecodes__seg">
            {i > 0 && <span className="typecodes__sep">/</span>}
            <span className="badge" style={{ color: ti.color }}>
              {ti.code}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function CellView({ s, flags, id, slotLabel }) {
  if (slotLabel === "X") {
    return (
      <div className="cell cell--blocked">
        <span className="cell__x">X</span>
      </div>
    );
  }
  const num = id ? getNum(s, id) : "";
  const entry = num ? flagFor(flags, num) : null;
  const disp = entry ? flagDisplay(entry) : "";
  const miles = entry ? inspMilesDisplay(entry) : "";
  return (
    <div className={`cell ${num ? "cell--filled" : ""}`}>
      {slotLabel != null && <span className="cell__slot">{slotLabel}</span>}
      {num && <TypeCodes num={num} className="cell__types" />}
      <span className="cell__num">{num}</span>
      {(disp || miles) && (
        <span className="cell__meta">
          {disp && <span className="cell__flag">{disp}</span>}
          {miles && <span className="cell__insp">{miles}</span>}
        </span>
      )}
    </div>
  );
}

export default async function PrintPage({ searchParams }) {
  const maint = searchParams?.maint === "1";
  const fzDelta = parseInt(searchParams?.fz, 10);
  const fz = 2 + (Number.isFinite(fzDelta) ? Math.max(-4, Math.min(4, fzDelta)) : 0);

  const [{ sheet }, flags] = await Promise.all([getSheet(), getFlags()]);
  const s = sheet || {
    time: "",
    date: "",
    inShop: "",
    cells: {},
    lots: { north: [], east: [], fence: [] },
  };
  const lots = s.lots || { north: [], east: [], fence: [] };

  const flagSummary = groupFlaggedBuses(flags);
  const busLocations = {};
  for (const [id, v] of Object.entries(s.cells || {})) {
    const n = typeof v === "string" ? v : v && v.num;
    if (!n) continue;
    const loc = cellLocationLabel(id);
    if (loc) (busLocations[n] = busLocations[n] || []).push(loc);
  }
  const offPropertyCount = Object.values(flags).filter((e) =>
    (e.flags || []).includes("offprop")
  ).length;

  return (
    <div className="sheet-scroll" style={{ "--fz": `${fz}px` }}>
      <div className={`sheet ${maint ? "sheet--maint" : ""}`}>
        <div className="head">
          <div className="head__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Pace" />
          </div>
          <div className="head__box">
            <div className="head__field head__time">
              <label>TIME:</label>
              <input value={s.time || ""} readOnly />
            </div>
            <div className="head__title">LOT SHEET</div>
            <div className="head__field head__date">
              <label>DATE:</label>
              <input value={s.date || ""} readOnly />
            </div>
          </div>
        </div>

        <div className="counters">
          <div className="counter">
            <label># OF VEHICLES OFF PROPERTY:</label>
            <input className="counter__auto" value={offPropertyCount} readOnly />
          </div>
          <div className="counter">
            <label># OF VEHICLES IN SHOP:</label>
            <input value={s.inShop || ""} readOnly />
          </div>
        </div>

        <div className="frontrow">
          {Array.from({ length: COLUMN_COUNT }).map((_, c) => {
            if (c >= FRONT_COLUMNS) return <div key={`f${c}`} className="front front--empty" />;
            const id = frontCellId(c);
            const num = getNum(s, id);
            const entry = num ? flagFor(flags, num) : null;
            const disp = entry ? flagDisplay(entry) : "";
            const miles = entry ? inspMilesDisplay(entry) : "";
            return (
              <div key={`f${c}`} className={`front ${num ? "front--filled" : ""}`}>
                {num && <TypeCodes num={num} className="front__types" />}
                <span className="cell__num">{num}</span>
                {disp && <span className="front__flag">{disp}</span>}
                {miles && <span className="front__flag front__insp">{miles}</span>}
              </div>
            );
          })}
        </div>

        <div className="grid">
          {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
            <div key={`h${c}`} className="grid__header">
              ROW {c + 1}
            </div>
          ))}
          {SLOTS.map((band, b) =>
            band.map((slot, c) => {
              if (c === COLUMN_COUNT - 1) {
                return <CellView key={`b${b}c${c}`} s={s} flags={flags} id={row11CellId(b)} slotLabel={null} />;
              }
              if (slot === "X") {
                return <CellView key={`b${b}c${c}`} s={s} flags={flags} id={null} slotLabel="X" />;
              }
              return <CellView key={`b${b}c${c}`} s={s} flags={flags} id={numberedCellId(slot)} slotLabel={slot} />;
            })
          )}
        </div>

        <div className="eastlot-label">EAST LOT</div>
        <div className="eastlot">
          {Array.from({ length: EAST_LOT_CELLS }).map((_, i) => (
            <div key={`e${i}`} className="eastlot__cell" />
          ))}
        </div>
      </div>

      <div className="back-sheet">
        <div className="back__cols">
          {LOTS.map((lot) => {
            const list = lots[lot.key] || [];
            return (
              <div className="backlot" key={lot.key}>
                <div className="backlot__head">
                  {lot.title}
                  <span className="backlot__count"> ({list.length})</span>
                </div>
                <ol className="backlot__list">
                  {list.map((bus, i) => {
                    const fdisp = flagsFullDisplay(flagFor(flags, bus));
                    return (
                      <li key={i}>
                        <span className="backlot__bus">{bus}</span>
                        <TypeCodes num={bus} className="backlot__type" />
                        {fdisp && <span className="backlot__flag">{fdisp}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>

        {flagSummary.length > 0 && (
          <div className="flagsum">
            <div className="flagsum__title">BUSES WITH FLAGS</div>
            {flagSummary.map((g) => (
              <div className="flagsum__group" key={g.cat}>
                <div className="flagsum__cat">{g.label}</div>
                <ul className="flagsum__list">
                  {g.buses.map((bus) => (
                    <li key={bus}>
                      <span className="flagsum__bus">{bus}</span>
                      <TypeCodes num={bus} className="flagsum__type" />
                      {busLocations[bus] && (
                        <span className="flagsum__loc">{busLocations[bus].join(", ")}</span>
                      )}
                      <span className="flagsum__flags">{flagsFullDisplay(flagFor(flags, bus))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
