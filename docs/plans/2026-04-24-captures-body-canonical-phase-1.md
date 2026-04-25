# Phase 1 — Captures Body-Canonical Rewrite (Producer-Side)

> **Brief written from a Lo Studiolo (knowledge-desk) session on 2026-04-24.**
> This plan is for a future Claude Code session focused *only* on the quick-capture repo. Read it in full before touching code.

---

## Why this exists (one paragraph of context)

Lo Studiolo — the knowledge-desk project that ingests this app's Notion output — diagnosed on 2026-04-24 that **57% of Captures in the Notion workspace were body-less**. Their substance lived in the Notion `Notes` property, which the Lo Studiolo daemon never reads. An evidence review across five Notion databases (Creative Writing, Threads, Coding Projects, Book Highlights, Captures) confirmed **body is the richer surface everywhere substantive writing actually happens** — only this quick-capture app writes to `Notes`, and that was a legacy of phone ergonomics baked into a convention, not a truth about where substance naturally lives.

The decision: flip the contract. **Body becomes canonical. Notes becomes legacy/fallback.** This repo is where the flip happens on the producer side. Backfill of existing Captures + the daemon's consumer-side safety net + search ranking all live in the Lo Studiolo repo and are not this session's concern.

---

## Goal

Every quick-capture this app creates, from this PR forward, writes substance to the Notion page **body**, not the `Notes` property.

---

## The three code changes, in order

### 1. Substance writes → body blocks

Wherever the app currently writes a capture's long-form content to the `Notes` property on a new Notion page, change it to write to page body instead. Specifically:
- **Title** still goes to the page title (`Capture` title property)
- **Tags**, **Type**, and other property fields are unchanged
- **Long-form content** (the actual thought, dictation, text) goes into page body blocks
- **`Notes` property** is not set on new writes (do not pass it in the create-page payload)

Notion API: body blocks are passed as `children` in the `POST /v1/pages` request body. Typical shape is an array of `block` objects (paragraph, heading, etc.). For a single paragraph of content, a single `paragraph` block is sufficient.

### 2. Sonnet Lookup responses wrapped in callout fences

When a capture has `Type = Lookup` and Sonnet returns an AI-generated research response, append that response to the page body **wrapped in a callout fence**:

```
> [!info] This is LLM generated material
<Sonnet's response here, preserved verbatim>
> [!end info]
```

Implementation note: the fence lines are Notion **quote blocks** (each starts with `>`). So in the `children` array of the Notion API call, the wrapper emits three blocks:

1. Quote block containing text `[!info] This is LLM generated material`
2. Paragraph block(s) containing the Sonnet response
3. Quote block containing text `[!end info]`

Purpose: explicit provenance. Any human edits below the `[!end info]` line stay unmarked and unattributed to the LLM. Future reorganization scripts can regex for the fence markers to identify and operate on AI-authored sections.

### 3. Haiku tag-writes unchanged

Haiku writes only to property fields (Tags, Type, Date Captured, etc.) — never long-form content. **Do not wrap Haiku outputs with markers.** Do not change Haiku's write path. Haiku stays exactly as it is today.

---

## What is explicitly NOT this session's concern

All of the following live in the Lo Studiolo / knowledge-desk repo and are handled in separate phases. Do not attempt any of them from this repo:

- **Backfill of existing Captures and personal_growth rows** — Phase 2, handled by `scripts/backfill_captures_to_body.py` in knowledge-desk. Prepends titles, moves Notes content to body, leaves Notes populated as archive, grandfathers existing AI content in body (no retroactive markers).
- **Daemon read-path update** (Notes as synthetic block) — Phase 3, in the Go daemon at `knowledge-desk/daemon/`.
- **`chunks.origin` column** — schema migration in knowledge-desk.
- **Search ranking weight (body > notes)** — search layer in knowledge-desk.
- **Cowork / AI sweep stream** — separate producer system; its own adoption of the callout fence happens independently.

---

## One companion change required alongside Phase 1

The Lo Studiolo **System Reference** page in Notion (page ID `337a7b0df11b816a9f3ec7bb510683aa`) carries the declared schema contract for every Notion database. Its current Captures row says: *"Notes (text) — The substance of the capture. Put the actual content here."* That line is now wrong.

**Update the Captures row in the System Reference to:**

> **Notes (text)** — *Legacy.* Preserved on existing rows as archive; no new writes land here. See page body for substance.
> **Body (blocks)** — *Primary substance.* All substantive capture content lives here. AI-authored sections (e.g., Sonnet Lookup responses) are wrapped in `> [!info] This is LLM generated material` … `> [!end info]` callout fences. Daemon reads both body and Notes; body outranks Notes in semantic ranking.

Do this edit in the **same commit window** as the producer code change so the contract and the code move together. Use the Notion MCP `notion-update-page` tool — the page is not in a database, so `replace_content` with a new_str that preserves the rest of the page is the cleanest approach. Fetch the page first to see its existing structure.

---

## Testing approach

1. **Unit test the Notion write layer.** Mock the Notion API. Assert that on a standard capture:
   - The `children` array in the `POST /v1/pages` payload contains the captured content as body blocks
   - The `properties.Notes` field is not present (or is empty)
   - Title, Tags, Type are set on properties as before
2. **Unit test the Sonnet Lookup wrapping.** Given a fixture Sonnet response, assert the resulting body `children` array contains:
   - A quote block with text `[!info] This is LLM generated material`
   - One or more paragraph blocks with the response text
   - A quote block with text `[!end info]`
3. **End-to-end against a staging Notion page** (optional but recommended). Create a capture via the deployed worker against a scratch Notion database; read the resulting page back via Notion API; confirm body is populated and `Notes` is empty.

---

## Verification after deploy

1. Use the phone app to capture a new thought. Check the resulting Notion page:
   - Body: contains the captured content ✓
   - `Notes` property: empty ✓
2. Capture a thought with `Type = Lookup`. Check:
   - Body contains the original capture text *and* the AI response wrapped in `> [!info] …` / `> [!end info]` fences ✓
3. Trigger a Lo Studiolo sync (open any desk in the Tauri app). Check the Lo Studiolo `detail_records` table:
   - The new capture appears with a non-empty `content` field ✓
   - Chunks are generated in the `chunks` table for the new capture ✓

If any verification step fails, the problem is in the producer (this repo), not in the Lo Studiolo consumer.

---

## References

- **Full design doc** (authoritative): Notion page `34ca7b0df11b8105ab70eb4448c063d3` — *Lo Studiolo — Captures Input-Stream Design (2026-04-24)*
- **System Reference** (to update alongside this code change): Notion page `337a7b0df11b816a9f3ec7bb510683aa`
- **Knowledge-desk NEXT_STEPS §4**: `~/Documents/claude-project-folder/knowledge-desk/NEXT_STEPS.md`
- **Claude memory** (knowledge-desk context): `project_captures_contract_flip.md`, `project_quick_capture_location.md`

---

## Suggested session-start order

1. Read this brief end to end.
2. Fetch the Notion design doc (`34ca7b0df11b8105ab70eb4448c063d3`) for the broader context and evidence trail.
3. Orient in this repo: find the Notion write layer (likely in `worker/` or `services/`). Read the existing create-page code.
4. Implement the three changes above in order, with tests.
5. Update the System Reference page in Notion to the new Captures contract (see above).
6. Commit and push. This repo has a GitHub remote (unlike knowledge-desk, which is local-only).
7. Notify the Lo Studiolo side that Phase 1 is live — Phases 2 (backfill) and 3 (daemon + ranking) can then run without risk of mid-flight inconsistency.

---

## Addition (2026-04-24, post-write): in-recording Capture shortcut

Alongside the body-canonical changes, add this UX behavior to `app/index.tsx`:

**Today:** Tapping the mic starts dictation/recording. Tapping mic again stops and shows the transcription in the input box for review. Capture button is the separate, second tap.

**Add:** While dictation is active, the **Capture** button stays enabled. Tapping Capture mid-recording should:
1. Stop the active dictation/recording (call `stopVoiceActivity()`)
2. Await the resulting transcript
3. Append the transcript to `text` (same merge logic as `handleDictationToggle` — insert at cursor, with leading space if needed)
4. Immediately run `handleSave()` against the merged text

Effectively a one-tap "stop + transcribe + capture" path that skips the review step. The existing two-tap mic→edit→capture flow stays intact for users who want to review.

**Implementation notes:**
- In `handleSave()` (currently at `app/index.tsx:413`), at the top: if `dictatingRef.current || recordingRef.current`, first `await stopVoiceActivity()` and merge the returned transcript into `text` (or into a local `content` variable used for the rest of the save) before continuing.
- `canSave` (line 504) currently gates on `text.trim().length > 0 || attachments.length > 0`. Extend it to also allow saving when dictation/recording is active, since the transcript will materialize before the save runs.
- Be careful with the React state-update timing: `setText(...)` from `stopVoiceActivity` won't be visible synchronously inside `handleSave`. Compute the final `content` from the awaited transcript directly rather than relying on `text` state after `setText`.
- Haptic feedback on Capture-mid-recording should fire once at the moment of tap (not after transcription completes), so the user gets immediate confirmation the gesture was received.

**Plan deviation accepted at implementation time (2026-04-24, post-review):**
- The original brief said *"insert at cursor, with leading space if needed (same merge logic as `handleDictationToggle`)"*. Implementation diverges: `handleSave` **appends** the transcript to the end of `text`, not at cursor position. Reasoning — when the user taps Capture mid-recording they're committing the whole capture; cursor position is irrelevant because the input is about to be cleared by `resetForm()`. Cursor-respecting insert is preserved on the existing two-tap path (`handleDictationToggle`) for users who do want to review/edit before saving.
- A silent-failure guard was added: if the user taps Capture mid-recording and `stopVoiceActivity` returns no transcript (no speech detected, transcribe failure with no flash), `handleSave` surfaces a "Nothing captured — tap mic and try again" flash instead of silently returning after the haptic.

**Out of scope for this addition:** changing the mic-button behavior, changing the Capture button's appearance during recording (no special "stop & save" icon — same Capture button, just functional while recording).

---

*Written 2026-04-24 from the Lo Studiolo session. The knowledge-desk repo stays out of scope for the Phase 1 session; Phase 1 touches this repo plus the one System Reference page in Notion, and nothing else.*
