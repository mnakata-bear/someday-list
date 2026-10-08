// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SLUG_LEN, isSlug, slugFor } from "../../src/core/gate-slug";
// @ts-expect-error 型定義のない .mjs(CI で使う Node 版)
import { slugFor as slugForNode } from "../../scripts/slug.mjs";

// テスト用のダミー合言葉(本番の合言葉ではない)
const DUMMY = "dummy-pass-for-tests";

describe("合言葉 → slug", () => {
  it("SHA-256('someday-list:' + 合言葉) の16進の先頭24文字", async () => {
    const expected = createHash("sha256").update("someday-list:" + DUMMY).digest("hex").slice(0, 24);
    expect(await slugFor(DUMMY)).toBe(expected);
    expect(await slugFor(DUMMY)).toBe("4389e746c95aa80de54d56cb");
    expect(SLUG_LEN).toBe(24);
  });

  it("ブラウザ版(Web Crypto)と CI 用の Node 版が同じ結果", async () => {
    for (const p of [DUMMY, "ペンギン の 合言葉", "a", "  前後の空白  ", "ｶﾞ全角半角"]) {
      expect(await slugFor(p)).toBe(slugForNode(p));
    }
  });

  it("前後の空白は無視、大文字小文字は区別する", async () => {
    expect(await slugFor(`  ${DUMMY}\n`)).toBe(await slugFor(DUMMY));
    expect(await slugFor(DUMMY.toUpperCase())).not.toBe(await slugFor(DUMMY));
  });

  it("isSlug", async () => {
    expect(isSlug(await slugFor(DUMMY))).toBe(true);
    expect(isSlug("xyz")).toBe(false);
    expect(isSlug(null)).toBe(false);
    expect(isSlug("0123456789ABCDEF01234567")).toBe(false);
  });
});
