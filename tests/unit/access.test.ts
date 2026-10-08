import { describe, expect, it } from "vitest";
import { ALLOWED_EMAILS, isAllowedAccount } from "../../src/core/access";

describe("isAllowedAccount", () => {
  it("許可メールかつ確認済みなら使える", () => {
    expect(ALLOWED_EMAILS).toContain("naka.mutora3@gmail.com");
    expect(isAllowedAccount("naka.mutora7@gmail.com", true)).toBe(true);
    expect(isAllowedAccount("naka.mutora3@gmail.com", true)).toBe(true);
    expect(isAllowedAccount("Naka.Mutora3@gmail.com", true)).toBe(true);
  });
  it("未確認・許可外・空は使えない", () => {
    expect(isAllowedAccount("naka.mutora3@gmail.com", false)).toBe(false);
    expect(isAllowedAccount("other@example.com", true)).toBe(false);
    expect(isAllowedAccount("naka.mutora3@gmail.com.evil.com", true)).toBe(false);
    expect(isAllowedAccount("", true)).toBe(false);
    expect(isAllowedAccount(null, true)).toBe(false);
  });
});
