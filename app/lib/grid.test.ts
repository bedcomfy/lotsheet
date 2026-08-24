import { describe, expect, it } from "vitest";
import { exactFlagMatch } from "./grid";

describe("exactFlagMatch", () => {
  it("recognizes exact flag names and punctuation-insensitive aliases", () => {
    expect(exactFlagMatch("Engine")?.id).toBe("eng");
    expect(exactFlagMatch("C-24")?.id).toBe("inspection");
    expect(exactFlagMatch("c24")?.id).toBe("inspection");
  });

  it("prefers the object-code flag when an object code is entered", () => {
    expect(exactFlagMatch("6800")?.id).toBe("object:6800");
  });

  it("does not guess ordinary note text", () => {
    expect(exactFlagMatch("Door sticks after rain")).toBeNull();
  });
});
