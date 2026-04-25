import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LLM_FENCE_CLOSE,
  LLM_FENCE_OPEN,
  NOTION_MAX_RICH_TEXT_LENGTH,
  textToParagraphBlocks,
  wrapInLLMFence,
} from "../src/notion-blocks";

test("textToParagraphBlocks: empty input returns no blocks", () => {
  assert.deepEqual(textToParagraphBlocks(""), []);
});

test("textToParagraphBlocks: single paragraph yields one block with content", () => {
  const blocks = textToParagraphBlocks("hello world");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].paragraph.rich_text[0].text.content, "hello world");
});

test("textToParagraphBlocks: paragraph breaks split into separate blocks", () => {
  const blocks = textToParagraphBlocks("first\n\nsecond\n\nthird");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].paragraph.rich_text[0].text.content, "first");
  assert.equal(blocks[1].paragraph.rich_text[0].text.content, "second");
  assert.equal(blocks[2].paragraph.rich_text[0].text.content, "third");
});

test("textToParagraphBlocks: long paragraph chunks at 2000 chars", () => {
  const longPara = "a".repeat(NOTION_MAX_RICH_TEXT_LENGTH * 2 + 50);
  const blocks = textToParagraphBlocks(longPara);
  assert.equal(blocks.length, 3);
  assert.equal(
    blocks[0].paragraph.rich_text[0].text.content.length,
    NOTION_MAX_RICH_TEXT_LENGTH
  );
  assert.equal(
    blocks[1].paragraph.rich_text[0].text.content.length,
    NOTION_MAX_RICH_TEXT_LENGTH
  );
  assert.equal(blocks[2].paragraph.rich_text[0].text.content.length, 50);
});

test("textToParagraphBlocks: codepoint-safe chunking (no split surrogate pairs)", () => {
  // 4-byte emoji (rocket) sits at the chunk boundary.
  const filler = "a".repeat(NOTION_MAX_RICH_TEXT_LENGTH - 1);
  const para = filler + "🚀" + "b".repeat(10);
  const blocks = textToParagraphBlocks(para);
  // Codepoint-aware chunking should keep the emoji intact in one chunk,
  // not split its surrogate pair across chunks.
  for (const block of blocks) {
    const content: string = block.paragraph.rich_text[0].text.content;
    // No lone surrogates: every high surrogate should be followed by a low surrogate.
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        // High surrogate — next code unit must be a low surrogate.
        const next = content.charCodeAt(i + 1);
        assert.ok(
          next >= 0xdc00 && next <= 0xdfff,
          `lone high surrogate at index ${i} in chunk: ${content.slice(Math.max(0, i - 5), i + 5)}`
        );
        i++;
      }
    }
  }
});

test("textToParagraphBlocks: blank-only paragraphs are dropped", () => {
  const blocks = textToParagraphBlocks("real\n\n   \n\nalso real");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].paragraph.rich_text[0].text.content, "real");
  assert.equal(blocks[1].paragraph.rich_text[0].text.content, "also real");
});

test("wrapInLLMFence: emits open quote, paragraphs, close quote", () => {
  const blocks = wrapInLLMFence("a research finding\n\nwith two paragraphs");
  assert.equal(blocks.length, 4);

  assert.equal(blocks[0].type, "quote");
  assert.equal(blocks[0].quote.rich_text[0].text.content, LLM_FENCE_OPEN);

  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[1].paragraph.rich_text[0].text.content, "a research finding");

  assert.equal(blocks[2].type, "paragraph");
  assert.equal(blocks[2].paragraph.rich_text[0].text.content, "with two paragraphs");

  assert.equal(blocks[3].type, "quote");
  assert.equal(blocks[3].quote.rich_text[0].text.content, LLM_FENCE_CLOSE);
});

test("wrapInLLMFence: empty research still emits both fence markers", () => {
  const blocks = wrapInLLMFence("");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].quote.rich_text[0].text.content, LLM_FENCE_OPEN);
  assert.equal(blocks[1].quote.rich_text[0].text.content, LLM_FENCE_CLOSE);
});

test("LLM fence markers are stable string constants (consumer contract)", () => {
  // These strings are read by downstream tooling (Lo Studiolo daemon, future
  // search/UI surfaces). Changing them is a breaking contract change.
  assert.equal(LLM_FENCE_OPEN, "[!info] This is LLM generated material");
  assert.equal(LLM_FENCE_CLOSE, "[!end info]");
});
