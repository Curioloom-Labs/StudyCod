import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ post: vi.fn(), clearCache: vi.fn(), selectStudent: vi.fn() }));
vi.mock("./client", () => ({ api: { post: session.post } }));
vi.mock("./profile", () => ({ clearGetMeCache: session.clearCache }));
vi.mock("../eduContext", () => ({ setActiveEduStudentId: session.selectStudent }));
import { login } from "./auth";

describe("regular login session replacement", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("discards the previous account's class and snapshot after successful login", async () => {
    const user = { id: 7, userMode: "EDUCATIONAL", studentId: 41, classId: 3 };
    session.post.mockResolvedValue({ data: { user } });
    expect(await login("learner", "password")).toBe(user);
    expect(session.selectStudent).toHaveBeenCalledWith(null);
    expect(session.clearCache).toHaveBeenCalledWith({ clearSnapshot: true });
  });
  it("keeps the current session if the login fails", async () => {
    session.post.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
    await expect(login("learner", "wrong")).rejects.toThrow("INVALID_CREDENTIALS");
    expect(session.selectStudent).not.toHaveBeenCalled();
    expect(session.clearCache).not.toHaveBeenCalled();
  });
});
