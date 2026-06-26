// react-pdf print template for the Fuel / DEF sheet — a deterministic, pure-JS
// PDF (no headless browser). It reads the SAME live data as the screen (lane
// membership, per-bus gals/serv entries, universal flags) and the SAME
// structural layout (../fuelLayout), so changing buses/flags always flows into
// the printout and the screen + print stay in lockstep.

import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { buildLaneColumns, COL_HEADERS, printDate } from "../fuelLayout";
import { fuelIndicator, fuelFlagSections } from "../grid";
import type { FlagMap } from "../types";

interface FuelEntry {
  gals?: string;
  serv?: string;
}
interface FuelData {
  date?: string;
  ns?: string;
  start?: string;
  end?: string;
  entries?: Record<string, FuelEntry>;
}

export interface FuelPdfProps {
  title: string;
  showShiftFields: boolean;
  data: FuelData;
  lane: string[];
  flags: FlagMap;
  fontPx: number;
  showFlags: boolean;
}

const INK = "#000";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 32, paddingHorizontal: 40, fontFamily: "Helvetica" },
  table: { height: "100%", flexDirection: "column", borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: INK },
  cell: {
    borderRightWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: INK,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 1,
  },
  hdrRow: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: INK, minHeight: 22, alignItems: "center" },
  hdrInner: { flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 4 },
  colHdrRow: { flexDirection: "row", height: 16, backgroundColor: "#eaeaea" },
  dataRow: { flexDirection: "row", flexGrow: 1, flexBasis: 0 },
  sumHead: { alignItems: "center", marginBottom: 10 },
  sumSections: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  sumSection: { width: "48%", marginBottom: 10 },
  sumRow: { flexDirection: "row", marginBottom: 2 },
});

function FuelDocument({ title, showShiftFields, data, lane, flags, fontPx, showFlags }: FuelPdfProps) {
  const { columns, rows, total } = buildLaneColumns(lane);
  const entries = data.entries || {};
  const fs = Math.max(7, Math.min(12, Math.round(fontPx * 0.7)));
  const sections = showFlags ? fuelFlagSections(flags) : [];

  // The 3 cells for one column-group at a given row (BUS, GALS, SERV).
  function group(g: number, r: number) {
    // "Total: N" sits in the last group's last row (matching the paper).
    if (g === 3 && r === rows - 1) {
      return [
        <View key={`${g}b`} style={[s.cell, { width: "10%" }]}>
          <Text style={{ fontSize: fs }}> </Text>
        </View>,
        <View key={`${g}t`} style={[s.cell, { width: "15%", alignItems: "flex-start", paddingLeft: 3 }]}>
          <Text style={{ fontSize: fs, fontFamily: "Helvetica-Bold" }}>Total: {total}</Text>
        </View>,
      ];
    }
    const bus = columns[g][r];
    const e = (bus && entries[bus]) || {};
    const ind = bus && showFlags ? fuelIndicator(flags[bus]) : "";
    return [
      <View key={`${g}b`} style={[s.cell, { width: "10%", position: "relative" }]}>
        {ind ? (
          <Text style={{ position: "absolute", left: 2, fontSize: fs + 2, fontFamily: "Times-Bold" }}>{ind}</Text>
        ) : null}
        <Text style={{ fontSize: fs }}>{bus || " "}</Text>
      </View>,
      <View key={`${g}g`} style={[s.cell, { width: "7.5%" }]}>
        <Text style={{ fontSize: fs }}>{e.gals || " "}</Text>
      </View>,
      <View key={`${g}s`} style={[s.cell, { width: "7.5%" }]}>
        <Text style={{ fontSize: fs }}>{e.serv || " "}</Text>
      </View>,
    ];
  }

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.table}>
          {/* Header row (title + date / shift fields) */}
          <View style={s.hdrRow}>
            {showShiftFields ? (
              <View style={s.hdrInner}>
                <Text style={{ fontSize: fs + 1, fontFamily: "Helvetica-Bold" }}>{title}</Text>
                <Text style={{ fontSize: fs, marginLeft: 12 }}>DATE: {printDate()}</Text>
                <Text style={{ fontSize: fs, marginLeft: 12, letterSpacing: 2 }}>N / S</Text>
                <Text style={{ fontSize: fs, marginLeft: 12 }}>START: __________</Text>
                <Text style={{ fontSize: fs, marginLeft: 12 }}>END: __________</Text>
              </View>
            ) : (
              <>
                <View style={{ width: "50%", paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: fs + 1, fontFamily: "Helvetica-Bold" }}>{title}</Text>
                </View>
                <View style={{ width: "50%", paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: fs }}>DATE: {printDate()}</Text>
                </View>
              </>
            )}
          </View>
          {/* Column headers */}
          <View style={s.colHdrRow}>
            {COL_HEADERS.map((c, i) => (
              <View key={i} style={[s.cell, { width: i % 3 === 0 ? "10%" : "7.5%" }]}>
                <Text style={{ fontSize: fs, fontFamily: "Helvetica-Bold" }}>{c}</Text>
              </View>
            ))}
          </View>
          {/* Data rows */}
          {Array.from({ length: rows }).map((_, r) => (
            <View key={r} style={s.dataRow}>
              {[0, 1, 2, 3].map((g) => group(g, r))}
            </View>
          ))}
        </View>
      </Page>

      {showFlags && sections.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.sumHead}>
            <Text style={{ fontSize: fs + 4, fontFamily: "Helvetica-Bold", letterSpacing: 1 }}>SERVICE LANE</Text>
            <Text style={{ fontSize: fs }}>{printDate()}</Text>
          </View>
          <View style={s.sumSections}>
            {sections.map((sec) => (
              <View key={sec.id} style={s.sumSection}>
                <Text
                  style={{ fontSize: fs + 1, fontFamily: "Helvetica-Bold", marginBottom: 3, borderBottomWidth: 0.6, borderColor: INK }}
                >
                  {sec.label}
                </Text>
                {sec.rows.map((row) => (
                  <View key={row.bus} style={s.sumRow}>
                    <Text style={{ fontSize: fs, fontFamily: "Helvetica-Bold", width: 36 }}>{row.bus}</Text>
                    <Text style={{ fontSize: fs, flex: 1 }}>
                      {row.items.map((it) => `${it.label}${it.detail ? ` (${it.detail})` : ""}`).join(", ")}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Page>
      )}
    </Document>
  );
}

export function buildFuelDoc(props: FuelPdfProps) {
  return <FuelDocument {...props} />;
}
