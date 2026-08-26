import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridDailyPaper } from "./HybridDailyPaper";
import { hybridDailySchema } from "./schema";

describe("HybridDailyPaper blank printing", () => {
  it("keeps the roster while clearing the date", () => {
    const html = renderToStaticMarkup(
      createElement(HybridDailyPaper, {
        data: hybridDailySchema.parse({ date: "08/25/2026" }),
        busNumbers: ["25538", "25539"],
        blank: true,
        dateOverride: "08/25/2026",
      }),
    );

    expect(html).toContain("25538");
    expect(html).toContain("25539");
    expect(html).not.toContain("08/25/2026");
    expect(html).not.toContain("TUESDAY");
  });
});
