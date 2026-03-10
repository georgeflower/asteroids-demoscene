import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn (class name utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters falsy values", () => {
    const condition = false;
    expect(cn("foo", condition && "bar", undefined, null, "baz")).toBe("foo baz");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});
