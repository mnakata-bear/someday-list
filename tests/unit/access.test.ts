import { describe, expect, it } from "vitest";
import { ALLOWED_EMAILS, isAllowedAccount } from "../../src/core/access";

describe("isAllowedAccount", () => {
  it("許可メールかつ確認済みなら使える", () => {
    expect(ALLOWED_EMAILS).toContain("bears.sys.apps@gmail.com");
    expect(isAllowedAccount("bears.sys.apps@gmail.com", true)).toBe(true);
    expect(isAllowedAccount("Bears.Sys.Apps@gmail.com", true)).toBe(true);
  });
  it("未確認・許可外・空は使えない", () => {
    expect(isAllowedAccount("bears.sys.apps@gmail.com", false)).toBe(false);
    expect(isAllowedAccount("other@example.com", true)).toBe(false);
    expect(isAllowedAccount("bears.sys.apps@gmail.com.evil.com", true)).toBe(false);
    expect(isAllowedAccount("", true)).toBe(false);
    expect(isAllowedAccount(null, true)).toBe(false);
  });
});
