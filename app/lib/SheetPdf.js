// The lot sheet rendered as a real PDF with @react-pdf/renderer (pure JS, no
// headless browser). Deterministic output → prints identically on every device.

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import {
  SLOTS,
  FRONT_COLUMNS,
  COLUMN_COUNT,
  EAST_LOT_CELLS,
  numberedCellId,
  frontCellId,
  row11CellId,
  flagDisplay,
  inspMilesDisplay,
  flagsFullDisplay,
  groupFlaggedBuses,
  cellLocationLabel,
  typeInfo,
} from "./grid";
import { busTypes } from "./buses";
import { LOGO_PNG_BASE64 } from "./logoData";

const INK = "#111111";
const RED = "#b91c1c";
const BLUE = "#1d4ed8";
const GREY = "#374151";

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

const styles = StyleSheet.create({
  page: { paddingVertical: 24, paddingHorizontal: 26, fontFamily: "Helvetica", color: INK },

  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  headLogo: { width: 50, alignItems: "center", justifyContent: "center" },
  headBox: { flex: 1, flexDirection: "row", borderWidth: 1, borderColor: INK },
  headField: { flex: 1, flexDirection: "row", alignItems: "center", padding: 5, borderRightWidth: 1, borderColor: INK },
  headFieldLast: { flex: 1, flexDirection: "row", alignItems: "center", padding: 5 },
  headTitle: { flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderColor: INK, padding: 5 },
  headLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  headVal: { fontSize: 10 },
  headTitleText: { fontSize: 12, fontFamily: "Helvetica-Bold" },

  counters: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  counter: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  frontRow: { flexDirection: "row" },
  front: { flex: 1, height: 22, alignItems: "center", justifyContent: "center" },
  frontNum: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  grid: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: INK },
  rowHeaderRow: { flexDirection: "row" },
  rowHeader: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: INK },
  rowHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  band: { flexDirection: "row" },
  cell: { flex: 1, height: 48, position: "relative", alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderBottomWidth: 1, borderColor: INK },
  slot: { position: "absolute", top: 2, left: 3, fontSize: 6, color: GREY },
  cellTypes: { position: "absolute", top: 1, right: 2, flexDirection: "row" },
  num: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  cellMeta: { position: "absolute", bottom: 1, left: 0, right: 0, alignItems: "center" },
  flag: { fontSize: 5.5, color: RED, textAlign: "center" },
  insp: { fontSize: 5.5, color: BLUE, textAlign: "center" },
  cellX: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  typeCode: { fontSize: 6, fontFamily: "Helvetica-Bold" },

  eastLabel: { textAlign: "center", fontSize: 9, marginTop: 10, marginBottom: 4 },
  eastlot: { flexDirection: "row", borderTopWidth: 1, borderLeftWidth: 1, borderColor: INK },
  eastCell: { flex: 1, height: 26, borderRightWidth: 1, borderBottomWidth: 1, borderColor: INK },

  backCols: { flexDirection: "row" },
  backlot: { flex: 1, borderWidth: 1, borderColor: INK, padding: 6, marginRight: 8, minHeight: 160 },
  backlotHead: { fontSize: 11, fontFamily: "Helvetica-Bold", borderBottomWidth: 1, borderColor: INK, paddingBottom: 3, marginBottom: 4 },
  backlotItem: { flexDirection: "row", marginBottom: 2 },
  backlotBus: { fontSize: 10 },
  backlotFlag: { fontSize: 8, color: RED, marginLeft: 5, flex: 1 },

  flagsum: { marginTop: 18 },
  flagsumTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center", borderBottomWidth: 1, borderColor: INK, paddingBottom: 4, marginBottom: 8 },
  flagsumGroup: { marginBottom: 8 },
  flagsumCat: { fontSize: 10, fontFamily: "Helvetica-Bold", borderBottomWidth: 1, borderColor: "#999999", paddingBottom: 2, marginBottom: 3 },
  flagsumItem: { flexDirection: "row", marginBottom: 2 },
  flagsumBus: { fontSize: 9, width: 52 },
  flagsumLoc: { fontSize: 9, color: GREY, width: 92 },
  flagsumFlags: { fontSize: 9, color: RED, flex: 1 },
});

function TypeCodesPdf({ num }) {
  const types = busTypes(num);
  if (!types.length) return null;
  return (
    <>
      {types.map((t, i) => {
        const ti = typeInfo(t);
        if (!ti) return null;
        return (
          <Text key={t} style={[styles.typeCode, { color: ti.color }]}>
            {i > 0 ? "/" : ""}
            {ti.code}
          </Text>
        );
      })}
    </>
  );
}

function CellPdf({ s, flags, id, slotLabel, maint }) {
  if (slotLabel === "X") {
    return (
      <View style={styles.cell}>
        <Text style={styles.cellX}>X</Text>
      </View>
    );
  }
  const num = id ? getNum(s, id) : "";
  const entry = num ? flagFor(flags, num) : null;
  const disp = maint && entry ? flagDisplay(entry) : "";
  const miles = maint && entry ? inspMilesDisplay(entry) : "";
  return (
    <View style={styles.cell}>
      {slotLabel != null ? <Text style={styles.slot}>{String(slotLabel)}</Text> : null}
      {maint && num ? (
        <View style={styles.cellTypes}>
          <TypeCodesPdf num={num} />
        </View>
      ) : null}
      <Text style={styles.num}>{num}</Text>
      {disp || miles ? (
        <View style={styles.cellMeta}>
          {disp ? <Text style={styles.flag}>{disp}</Text> : null}
          {miles ? <Text style={styles.insp}>{miles}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function buildSheetPdf({ sheet, flags, maint }) {
  const f = flags || {};
  const s = sheet || {
    time: "",
    date: "",
    inShop: "",
    cells: {},
    lots: { north: [], east: [], fence: [] },
  };
  const lots = s.lots || { north: [], east: [], fence: [] };

  const flagSummary = groupFlaggedBuses(f);
  const busLocations = {};
  for (const [id, v] of Object.entries(s.cells || {})) {
    const n = typeof v === "string" ? v : v && v.num;
    if (!n) continue;
    const loc = cellLocationLabel(id);
    if (loc) (busLocations[n] = busLocations[n] || []).push(loc);
  }
  const offPropertyCount = Object.values(f).filter((e) => (e.flags || []).includes("offprop")).length;

  return (
    <Document title="Lot Sheet">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.head}>
          <View style={styles.headLogo}>
            <Image src={`data:image/png;base64,${LOGO_PNG_BASE64}`} style={{ width: 46, height: 46 }} />
          </View>
          <View style={styles.headBox}>
            <View style={styles.headField}>
              <Text style={styles.headLabel}>TIME: </Text>
              <Text style={styles.headVal}>{s.time || ""}</Text>
            </View>
            <View style={styles.headTitle}>
              <Text style={styles.headTitleText}>LOT SHEET</Text>
            </View>
            <View style={styles.headFieldLast}>
              <Text style={styles.headLabel}>DATE: </Text>
              <Text style={styles.headVal}>{s.date || ""}</Text>
            </View>
          </View>
        </View>

        <View style={styles.counters}>
          <Text style={styles.counter}># OF VEHICLES OFF PROPERTY: {offPropertyCount}</Text>
          <Text style={styles.counter}># OF VEHICLES IN SHOP: {s.inShop || ""}</Text>
        </View>

        <View style={styles.frontRow}>
          {Array.from({ length: COLUMN_COUNT }).map((_, c) => {
            if (c >= FRONT_COLUMNS) return <View key={c} style={styles.front} />;
            const num = getNum(s, frontCellId(c));
            return (
              <View key={c} style={styles.front}>
                {maint && num ? <TypeCodesPdf num={num} /> : null}
                <Text style={styles.frontNum}>{num}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.grid}>
          <View style={styles.rowHeaderRow}>
            {Array.from({ length: COLUMN_COUNT }).map((_, c) => (
              <View key={c} style={styles.rowHeader}>
                <Text style={styles.rowHeaderText}>ROW {c + 1}</Text>
              </View>
            ))}
          </View>
          {SLOTS.map((band, b) => (
            <View key={b} style={styles.band}>
              {band.map((slot, c) => {
                if (c === COLUMN_COUNT - 1) {
                  return <CellPdf key={c} s={s} flags={f} id={row11CellId(b)} slotLabel={null} maint={maint} />;
                }
                if (slot === "X") {
                  return <CellPdf key={c} s={s} flags={f} id={null} slotLabel="X" maint={maint} />;
                }
                return <CellPdf key={c} s={s} flags={f} id={numberedCellId(slot)} slotLabel={slot} maint={maint} />;
              })}
            </View>
          ))}
        </View>

        <Text style={styles.eastLabel}>EAST LOT</Text>
        <View style={styles.eastlot}>
          {Array.from({ length: EAST_LOT_CELLS }).map((_, i) => (
            <View key={i} style={styles.eastCell} />
          ))}
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.backCols}>
          {LOTS.map((lot) => {
            const list = lots[lot.key] || [];
            return (
              <View key={lot.key} style={styles.backlot}>
                <Text style={styles.backlotHead}>
                  {lot.title} ({list.length})
                </Text>
                {list.map((bus, i) => {
                  const fdisp = flagsFullDisplay(flagFor(f, bus));
                  return (
                    <View key={i} style={styles.backlotItem}>
                      <Text style={styles.backlotBus}>
                        {i + 1}. {bus}
                      </Text>
                      {fdisp ? <Text style={styles.backlotFlag}>{fdisp}</Text> : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>

        {flagSummary.length > 0 ? (
          <View style={styles.flagsum}>
            <Text style={styles.flagsumTitle}>BUSES WITH FLAGS</Text>
            {flagSummary.map((g) => (
              <View key={g.cat} style={styles.flagsumGroup} wrap={false}>
                <Text style={styles.flagsumCat}>{g.label}</Text>
                {g.buses.map((bus) => (
                  <View key={bus} style={styles.flagsumItem}>
                    <Text style={styles.flagsumBus}>{bus}</Text>
                    {busLocations[bus] ? (
                      <Text style={styles.flagsumLoc}>{busLocations[bus].join(", ")}</Text>
                    ) : (
                      <Text style={styles.flagsumLoc}> </Text>
                    )}
                    <Text style={styles.flagsumFlags}>{flagsFullDisplay(flagFor(f, bus))}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
