import fs from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const [rawKey, inline] = value.slice(2).split("=");
  const next = inline ?? process.argv[index + 1];
  args.set(rawKey, next);
  if (inline === undefined) index += 1;
}

const id = String(args.get("id") || "").trim().toLowerCase();
const size = String(args.get("size") || "letter").trim().toLowerCase();
if (!/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error("Usage: npm run sheet:new -- --id inspection --size legal");
  process.exit(1);
}
if (!["letter", "legal", "letter-landscape", "legal-landscape"].includes(size)) {
  console.error("Size must be letter, legal, letter-landscape, or legal-landscape.");
  process.exit(1);
}

const pascal = id
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");
const title = id
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");
const profile = {
  letter: "LETTER_PORTRAIT",
  legal: "LEGAL_PORTRAIT",
  "letter-landscape": "LETTER_LANDSCAPE",
  "legal-landscape": "LEGAL_LANDSCAPE",
}[size];
const root = path.join(process.cwd(), "app", "sheets", id);

const files = {
  "schema.ts": `import { z } from "zod";

export const ${pascal}Schema = z.object({
  version: z.literal(1),
  date: z.string(),
});

export type ${pascal}Data = z.infer<typeof ${pascal}Schema>;

export function createBlank${pascal}(): ${pascal}Data {
  return { version: 1, date: "" };
}
`,
  [`${pascal}Paper.tsx`]: `import { PaperPage } from "../core";
import { ${profile} } from "../core/profiles";
import type { ${pascal}Data } from "./schema";

export function ${pascal}Paper({ data }: { data: ${pascal}Data }) {
  return (
    <PaperPage profile={${profile}} sheetId="${id}" pageNumber={1}>
      <h1>${title}</h1>
      <p>{data.date}</p>
    </PaperPage>
  );
}
`,
  [`${pascal}Editor.tsx`]: `"use client";

import type { ${pascal}Data } from "./schema";

export function ${pascal}Editor({
  value,
  onChange,
}: {
  value: ${pascal}Data;
  onChange: (next: ${pascal}Data) => void;
}) {
  return (
    <label>
      Date
      <input value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} />
    </label>
  );
}
`,
  "fixtures.ts": `import { createBlank${pascal}, type ${pascal}Data } from "./schema";

export const ${id.replaceAll("-", "_")}Fixtures: Record<"blank" | "typical" | "stress", ${pascal}Data> = {
  blank: createBlank${pascal}(),
  typical: { version: 1, date: "01/01/2027" },
  stress: { version: 1, date: "12/31/2099" },
};
`,
  "definition.ts": `import { ${profile} } from "../core/profiles";
import type { SheetDefinition } from "../core/types";
import { ${pascal}Editor } from "./${pascal}Editor";
import { ${pascal}Paper } from "./${pascal}Paper";
import { createBlank${pascal}, ${pascal}Schema, type ${pascal}Data } from "./schema";

export const ${id.replaceAll("-", "_")}Definition: SheetDefinition<${pascal}Data> = {
  id: "${id}",
  title: "${title}",
  path: "/${id}",
  stateKey: "${id}",
  dataVersion: 1,
  renderVersion: 1,
  paper: ${profile},
  expectedPages: { min: 1, max: 1 },
  variants: ["current", "blank"],
  createBlank: createBlank${pascal},
  validate: (value) => ${pascal}Schema.parse(value),
  Paper: ${pascal}Paper,
  Editor: ${pascal}Editor,
};
`,
  [`${pascal}Paper.stories.tsx`]: `import type { Meta, StoryObj } from "@storybook/react";
import { PaperViewport } from "../core";
import { ${profile} } from "../core/profiles";
import { ${pascal}Paper } from "./${pascal}Paper";
import { ${id.replaceAll("-", "_")}Fixtures } from "./fixtures";

const meta = {
  title: "Sheets/${title}",
  component: ${pascal}Paper,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ${pascal}Paper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blank: Story = { args: { data: ${id.replaceAll("-", "_")}Fixtures.blank } };
export const Typical: Story = { args: { data: ${id.replaceAll("-", "_")}Fixtures.typical } };
export const Stress: Story = { args: { data: ${id.replaceAll("-", "_")}Fixtures.stress } };
export const PhoneFit: Story = {
  render: () => (
    <PaperViewport profile={${profile}} fitOnMobile>
      <${pascal}Paper data={${id.replaceAll("-", "_")}Fixtures.typical} />
    </PaperViewport>
  ),
};
`,
  [`${id}.test.ts`]: `import { describe, expect, it } from "vitest";
import { ${id.replaceAll("-", "_")}Fixtures } from "./fixtures";
import { ${pascal}Schema } from "./schema";

describe("${title} sheet", () => {
  it.each(Object.entries(${id.replaceAll("-", "_")}Fixtures))("validates the %s fixture", (_name, fixture) => {
    expect(${pascal}Schema.parse(fixture)).toEqual(fixture);
  });
});
`,
};

await fs.mkdir(root, { recursive: false });
for (const [name, source] of Object.entries(files)) {
  await fs.writeFile(path.join(root, name), source, "utf8");
}

console.log(`Created SheetKit scaffold at ${path.relative(process.cwd(), root)}`);
console.log("Register its definition in app/sheets/registry.ts after the paper and fixtures are approved.");
