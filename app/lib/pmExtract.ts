// Server-only: read odometer readings out of a mileage report PDF with Claude.
// The PDF goes to the model as a document block (text or scanned pages both
// work) and the answer comes back as JSON matching READINGS_SCHEMA. Nothing is
// written here — the route returns the readings for the crew to review first.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const PM_EXTRACT_MODEL = process.env.PM_EXTRACT_MODEL || "claude-opus-5-5";

export function pmExtractConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const extractedSchema = z.object({
  readings: z.array(
    z.object({
      bus: z.string(),
      odometer: z.number(),
      readAt: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  reportDate: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ExtractedReadings = z.infer<typeof extractedSchema>;

// JSON Schema handed to the API so the reply is exactly this shape.
const READINGS_SCHEMA = {
  type: "object",
  properties: {
    readings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bus: { type: "string", description: "Vehicle / bus number exactly as printed" },
          odometer: { type: "number", description: "Odometer or mileage reading in miles" },
          readAt: { type: ["string", "null"], description: "Date of the reading if printed, else null" },
          note: { type: ["string", "null"], description: "Anything odd about this row, else null" },
        },
        required: ["bus", "odometer", "readAt", "note"],
        additionalProperties: false,
      },
    },
    reportDate: { type: ["string", "null"], description: "The report's own date if printed" },
    notes: { type: ["string", "null"], description: "Anything the reviewer should know, else null" },
  },
  required: ["readings", "reportDate", "notes"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `You are reading a bus fleet mileage report for a maintenance garage.
List every vehicle (bus) and its current odometer reading in miles.
- Use the vehicle number exactly as printed (bus numbers here are usually 4 digits starting with 2 or 6, plus a few named vehicles).
- odometer is the vehicle's current mileage. If a row shows several mileage columns, pick the current/ending odometer, not a trip or delta.
- Include a readAt date when the row or the report header gives one; otherwise null.
- Do not invent rows. Skip totals, subtotals, and rows with no vehicle number.
- If the document is not a mileage report, return an empty readings list and say why in notes.`;

export async function extractOdometerReadings(pdf: Buffer, fileName = "report.pdf"): Promise<ExtractedReadings> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: PM_EXTRACT_MODEL,
    max_tokens: 16000,
    system: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
            title: fileName,
          },
          { type: "text", text: "Extract the odometer readings from this report." },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: READINGS_SCHEMA } },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this document.");
  }
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The model's reply was not valid JSON.");
  }
  const result = extractedSchema.safeParse(parsed);
  if (!result.success) throw new Error("The model's reply did not match the expected shape.");
  return result.data;
}
