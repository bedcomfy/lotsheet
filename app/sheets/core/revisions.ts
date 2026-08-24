export const SHEET_REVISIONS = {
  lot: "7/15/26",
  turnover: "8/12/26",
  fuel: "8/12/26",
  def: "8/12/26",
  farebox: "8/20/26",
  "service-summary": "8/12/26",
  workorder: "7/7/26",
  "interior-cleaning": "8/20/26",
  "meter-readings": "8/20/26",
  "bus-errors": "8/20/26",
  "hybrid-daily": "8/24/26",
  "hybrid-weekly": "8/24/26",
} as const;

export type RevisionSheetId = keyof typeof SHEET_REVISIONS;
