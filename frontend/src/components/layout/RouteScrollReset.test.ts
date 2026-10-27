import { describe, expect, it } from "vitest";
import { scrollPageKey } from "./RouteScrollReset";

describe("scroll page identity", () => {
  it("distinguishes legacy root screens while ignoring filters and preview parameters", () => {
    expect(scrollPageKey("/", "?app=profile&tab=account")).toBe("/?app=profile");
    expect(scrollPageKey("/", "?preview=true")).toBe("/?app=home");
    expect(scrollPageKey("/", "?app=profile&preview=true")).toBe(scrollPageKey("/", "?app=profile&tab=security"));
  });

  it("treats query and fragment changes on a route as the same page", () => {
    expect(scrollPageKey("/edu/lessons/102", "?tab=theory")).toBe(scrollPageKey("/edu/lessons/102", "?tab=practice"));
    expect(scrollPageKey("/edu/tasks/501", "")).not.toBe(scrollPageKey("/edu/lessons/102", ""));
  });
});
