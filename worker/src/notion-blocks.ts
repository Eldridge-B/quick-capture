// Notion-block construction helpers — pure functions with no Cloudflare
// runtime deps so they can be exercised by node:test fixtures without
// pulling in the worker entry module.

// Notion API limits (as of 2022-06-28).
export const NOTION_MAX_BLOCKS_PER_REQUEST = 100;
export const NOTION_MAX_RICH_TEXT_LENGTH = 2000;

// LLM-provenance fence markers. Producers (Quick Capture worker now;
// Cowork / AI sweep stream later) wrap AI-authored sections in these
// quote-block lines so consumers can regex-detect AI content distinct from
// human edits. Quote (not callout) blocks are used because quotes survive
// markdown export with the literal `> ...` prefix intact.
export const LLM_FENCE_OPEN = "[!info] This is LLM generated material";
export const LLM_FENCE_CLOSE = "[!end info]";

export type NotionBlock = { object: "block"; type: string; [key: string]: any };

// Notion paragraph blocks accept up to 2000 chars per rich_text element.
// Split on paragraph breaks first, then chunk long paragraphs.
// Use Array.from for codepoint-aware iteration so emoji or other surrogate-pair
// characters can't be split mid-codepoint at a chunk boundary.
export function textToParagraphBlocks(text: string): NotionBlock[] {
  if (!text) return [];
  const blocks: NotionBlock[] = [];
  for (const para of text.split(/\n\n+/)) {
    if (!para.trim()) continue;
    const codepoints = Array.from(para);
    for (let i = 0; i < codepoints.length; i += NOTION_MAX_RICH_TEXT_LENGTH) {
      const chunk = codepoints.slice(i, i + NOTION_MAX_RICH_TEXT_LENGTH).join("");
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: chunk } }],
        },
      });
    }
  }
  return blocks;
}

// Wrap LLM-generated content in fence quote blocks.
export function wrapInLLMFence(researchText: string): NotionBlock[] {
  return [
    {
      object: "block",
      type: "quote",
      quote: { rich_text: [{ type: "text", text: { content: LLM_FENCE_OPEN } }] },
    },
    ...textToParagraphBlocks(researchText),
    {
      object: "block",
      type: "quote",
      quote: { rich_text: [{ type: "text", text: { content: LLM_FENCE_CLOSE } }] },
    },
  ];
}
