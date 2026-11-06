import { describe, expect, it } from "vitest";
import { initialState, tabOf } from "../app/app.ts";

describe("mobile-dev shell", () => {
  it("names the editor an address selects", () => {
    expect(tabOf("/")).toBe("board");
    expect(tabOf("/interface")).toBe("interface");
    expect(tabOf("/interface/")).toBe("interface");
    expect(tabOf("/anything-else")).toBe("board");
  });

  it("starts on a blank board, in the dark, at the root it is served from", () => {
    const s = initialState("/pavlus/mobile");
    expect(s.root).toBe("/pavlus/mobile");
    expect(s.tab).toBe("board");
    expect(s.look.mode).toBe("dark");
    expect(s.flowStudio.projectName).toBe("My board");
  });
});
