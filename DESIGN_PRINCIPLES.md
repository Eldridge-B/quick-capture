# Universal Design Principles for Web & Mobile Applications

> **Purpose:** Reusable design principles for any web or mobile project.
> These are not aesthetic preferences — they are behavioral patterns backed by
> user psychology. Apply them to a family genealogy site, a SaaS dashboard,
> a fitness app, or an e-commerce platform. The specifics change; the principles don't.
>
> **Usage:** Reference this document in any project's rules file. Implement
> the principles through project-specific features that match the product's
> domain and audience.
>
> **For AI agents:** This document is a persistent design constitution. When
> building any feature, check your work against the relevant principles below.
> If a proposed design conflicts with a principle, the principle wins. Use the
> Implementation Checklist at the end to audit screens before shipping.

---

## Principle 1: Sensory Feedback

**Every user action requires an immediate physical response.**

The user's brain needs confirmation that their intent was received before the
server responds. Uncertainty creates anxiety. Immediacy creates trust.

### Rules

- **Touch/click states:** All interactive elements respond within one frame
  (16ms). Use scale (97–98%), opacity shift, or background color change on
  press. Never rely solely on hover states — they don't exist on touch devices.
- **Optimistic UI:** When a user triggers a mutation (save, like, delete),
  update the local UI state instantly. Reconcile with the server response
  afterward. Roll back only on confirmed failure.
- **Skeleton screens:** During data fetching, render the structural layout of
  the incoming content (cards, text lines, image placeholders) rather than
  generic spinners. The user should see *where* content will appear before it
  arrives.
- **Shared element transitions:** When navigating between a summary view and a
  detail view (thumbnail → full photo, card → profile), animate the shared
  element between positions. This preserves spatial context and feels native.
  Use CSS `view-transition-api` or framework equivalents.
- **Loading indicators:** Use spinners only for indeterminate waits under 3
  seconds. For longer operations, use progress bars. For instant operations,
  use none — the state change is the feedback.

### Anti-patterns

- Buttons that do nothing visually on press
- Full-page loading spinners that destroy spatial context
- Modals that pop open without entrance animation
- Success toasts for routine operations (save confirmations on every keystroke)

---

## Principle 2: Progressive Revelation

**First visit: simple. Tenth visit: deep. Never show everything at once.**

Complexity overwhelms on first contact but rewards on return visits. The
interface should have layers that users discover through use, not through
tutorials or onboarding carousels.

### Rules

- **Information hierarchy:** Every view has a primary action and a primary
  piece of content. Everything else is secondary. If a user can't identify the
  primary element within 2 seconds, the view is too busy.
- **Feature discovery through use:** Don't show features the user hasn't
  needed yet. Introduce capabilities contextually — when the user's behavior
  suggests they're ready (e.g., show batch editing after they've edited three
  items individually).
- **Onboarding as drip, not dump:** If onboarding is needed, spread it across
  the first 3–5 sessions rather than front-loading. Day 1: core value. Day 3:
  secondary feature. Day 7: power-user capability.
- **Summary → detail → related:** Content views should follow this hierarchy.
  The summary is always visible. Detail is one tap away. Related content
  appears after engaging with detail.
- **Empty states as invitations:** A view with no content should never be a
  dead end. It should invite the user to create the first piece of content,
  with language that motivates ("Be the first to add...") rather than
  instructs ("No items found. Click Create to add one.").

### Anti-patterns

- Feature tours on first launch that explain 12 things at once
- Settings pages with 40+ options visible simultaneously
- Dashboards that show every metric to every user regardless of role
- "Coming soon" badges that create expectation without payoff

---

## Principle 3: Return Triggers

**The app must create reasons to come back that originate from the app,
not from the user's memory.**

If nothing changes between visits, there's no reason to return. The app
should surface new, relevant content through time-aware mechanisms.

### Rules

- **Time-based content surfacing:** Use calendar awareness to surface relevant
  content (anniversaries, milestones, seasonal relevance). Content that
  connects to "today" feels alive.
- **Digest over drip notifications:** A single well-composed periodic summary
  (weekly email, daily briefing) outperforms a stream of individual push
  notifications. Fewer, higher-signal touchpoints build habit without
  building resentment.
- **Other people's activity:** In collaborative products, surface what others
  have contributed since the user's last visit. "3 new photos added this
  week" is a reason to open the app. "Nothing new" is a reason not to.
- **Notification discipline:** Every notification type should pass this test:
  "Would the user thank me for interrupting them with this?" If not, it
  belongs in a digest or in-app indicator, not a push notification.
- **Ambient change:** The app should feel subtly different over time even
  without user action — seasonal presentation shifts, time-of-day awareness,
  or content rotation. This signals that the product is alive and tended.

### Anti-patterns

- Push notifications for every micro-event ("Karen liked your photo")
- Re-engagement emails that say "We miss you!" with no actual content
- Apps that look identical every time they're opened
- Notification settings that default to "everything on"

---

## Principle 4: Contribution Identity

**People contribute when they see their impact and feel ownership.**

Contribution without recognition feels like free labor. Every piece of
user-generated content should carry its author's identity, and every
contributor should be able to see their cumulative impact.

### Rules

- **Attribution on all user-generated content:** Every photo, post, edit, or
  contribution displays who created it and when. This is both recognition and
  accountability.
- **Personal impact visibility:** Show contributors their own stats — items
  added, edits made, content viewed. Visible only to the contributor, not to
  others (avoids competition dynamics in non-competitive contexts).
- **Edit history over silent overwrites:** When content is modified, preserve
  and display what changed and who changed it. "Updated by Karen — birth year
  changed from 1952 to 1953" builds trust. Silent overwrites erode it.
- **Invitation language in empty states:** "Know a story about this person?
  Add the first memory." is more effective than "No memories found. Create
  one." The first is an invitation to a shared project. The second is an
  instruction from a machine.
- **Low-friction first contribution:** The first action a new user takes
  should require minimal effort and produce visible results immediately.
  Uploading one photo is better than filling out a profile form. Reacting
  to existing content is better than creating new content.

### Anti-patterns

- Anonymous content in collaborative products
- Contribution metrics displayed as leaderboards (creates competition anxiety)
- Edit buttons that overwrite without history
- Onboarding flows that demand profile completion before allowing exploration

---

## Principle 5: Trust Architecture

**Users must feel safe before they'll share meaningful content.**

A single trust violation costs more than a hundred trust-building moments.
Trust is built through predictability, transparency, and visible boundaries.

### Rules

- **Privacy indicators:** Make the audience of every piece of content visible
  and persistent. "Only family can see this" or "Public" — stated explicitly,
  not buried in settings. Users who aren't sure who can see their content
  will stop sharing.
- **Predictable behavior:** The same action should always produce the same
  result. Never change visibility, permissions, or audience without explicit
  user consent. No "smart" defaults that guess what the user wants.
- **Graceful error recovery:** Never lose user input. If a form submission
  fails, preserve the draft. If an upload fails, allow retry without
  re-selecting the file. If a network request fails, cache the intent and
  retry automatically.
- **Transparent data flow:** Users should be able to understand, in plain
  language, where their data goes and who can access it. If the answer
  requires reading a privacy policy, you've failed.
- **Destructive action safeguards:** Delete, remove, and revoke actions
  require confirmation. Permanent deletions require a second, distinct
  confirmation (not just clicking the same button twice). Provide undo
  windows where possible.
- **Continuity of state:** User progress should never silently vanish. Form
  drafts survive network failures and accidental navigation. Session state
  persists across app restarts. Where feasible, sync state across devices so
  users can pick up where they left off.
- **Data sovereignty:** Users should be able to export their own data in a
  standard, portable format. The ability to leave — and take your content with
  you — is the strongest trust signal an app can send.

### Anti-patterns

- "Are you sure?" dialogs for non-destructive actions (creates dialog fatigue)
- Silent permission changes that affect content visibility
- Error pages that lose form state
- "Your data is safe" messaging without specifics
- Platforms that make data export difficult or impossible
- Apps that lose drafts, scroll position, or in-progress work on refresh

---

## Principle 6: Rhythm & Cadence

**The app should have a heartbeat — a predictable cycle users internalize.**

Unpredictable apps get checked compulsively or abandoned. Rhythmic apps
become habits. The product should have a natural pulse that users can feel.

### Rules

- **Consistent digest timing:** If you send periodic updates, send them at
  the same day and time every cycle. Tuesday 8am every week. First of the
  month. The predictability itself becomes the habit trigger.
- **Content weight variation:** In feeds and streams, alternate between heavy
  content (photos, long text) and light content (quotes, quick updates,
  micro-interactions). This creates reading rhythm and prevents fatigue.
- **Seasonal or contextual awareness:** Subtle presentation shifts tied to
  calendar, time of day, or user context signal that the product is alive.
  A warmer palette in winter. A "Good morning" vs "Good evening" greeting.
  Not theme overhauls — accents.
- **Activity batching:** Group notifications and updates into natural
  intervals rather than real-time streams. "3 updates since your last visit"
  respects attention better than 3 separate interruptions.
- **Cooldown periods:** For features that prompt user action (reminders, asks,
  re-engagement), enforce minimum intervals between prompts. Never ask the
  same thing twice in the same week. 30-day cooldown on declined prompts.

### Anti-patterns

- Real-time notification streams for non-urgent events
- Feeds with uniform content density (all text or all photos)
- "Check back later!" with no indication of when "later" is
- Daily emails that could be weekly summaries

---

## Principle 7: Depth Paths

**Finishing one piece of content should naturally lead to the next.**

The user should never reach a dead end. Every view should offer a natural
next step that deepens engagement without forcing a decision.

### Rules

- **Related content at the end of every view:** After reading a story, show
  "More from this author" or "Related stories." After viewing a photo, show
  "Other photos from this time/place." Remove the decision cost of "what
  next?"
- **Cross-type linking:** Connect different content types. A photo links to
  the people in it. A person links to their stories. A story links to the
  places mentioned. The content graph should be navigable, not siloed.
- **"See all" as escape hatch:** Curated suggestions are the primary path.
  "See all X" links are the escape hatch for users who want to browse rather
  than follow suggestions.
- **Content clustering:** Group content by meaningful dimensions (theme, time
  period, person, place) rather than only reverse-chronological. "Photos
  from Denmark, 2022" is more navigable than "Page 3 of all photos."
- **Graceful dead ends:** When there truly is no related content, acknowledge
  it and redirect. "This is the only photo of Erik. Know where more might
  be? Help us find them." turns a dead end into a contribution invitation
  (Principle 4).

### Anti-patterns

- Detail views with only a "Back" button
- Chronological-only feeds with no thematic grouping
- Search results pages with no "related" or "you might also like"
- Content types that exist in isolation from each other

---

## Principle 8: Microcopy & Voice

**The interface speaks in one consistent voice — warm, clear, and human.**

Every string the user reads — button labels, error messages, empty states,
tooltips, loading text — is part of a single voice. When that voice is
inconsistent or robotic, the product feels assembled by committee. When it's
consistent and human, the product feels crafted by someone who cares.

### Rules

- **Outcome labels over mechanism labels:** Buttons describe what happens, not
  what the system does. "Share with family" not "Submit." "Keep exploring" not
  "Cancel." "Save for later" not "Add to queue."
- **Errors explain and guide:** Every error message answers two questions: what
  happened, and what the user can do. "We couldn't save your changes — check
  your connection and try again" not "Error 500" or "Save failed."
- **Empty states invite:** A view with no content should motivate, not report.
  "No photos yet — be the first to share one" not "0 results." The empty state
  is a contribution opportunity (see Principle 4).
- **Contextual loading language:** When the app can describe what it's doing,
  it should. "Finding your family..." not "Loading..." — "Uploading photo..."
  not "Please wait." Generic language is a missed connection.
- **No system speak:** Avoid technical language, codes, or jargon in
  user-facing text. "Something went wrong" over "Unhandled exception." "We
  couldn't find that page" over "404 Not Found." The user doesn't need to know
  what broke — they need to know what to do next.
- **Confirmation acknowledges:** Success messages are warm and specific.
  "Photo shared with the family" not "Upload successful." "Changes saved" not
  "Operation completed."
- **Consistent tone across states:** The voice in a success message, an error
  message, and a loading screen should feel like the same person wrote them.
  Define a tone (e.g., "friendly expert," "warm neighbor," "calm guide") and
  audit all strings against it.

### Anti-patterns

- Button labels that use developer vocabulary ("Submit," "Execute," "Process")
- Error messages with status codes or stack traces visible to users
- Inconsistent voice — playful in onboarding, robotic in error states
- Loading states that say "Loading..." when context is available
- Empty states that say "No data" or "0 items" with no call to action
- Confirmation modals that say "Are you sure?" for every action regardless of severity

---

## Principle 9: Psychological Intent

**Design for the user's mental state, not just their task.**

Users are not sitting at a desk in a quiet room giving your app their full
attention. They are on a bus, interrupted mid-thought, glancing at their
phone between conversations. The interface must respect the cognitive
budget they actually have — not the one you wish they had.

### Rules

- **Assume high distraction:** Design every screen as if the user will be
  interrupted halfway through using it. State should be preserved. Progress
  should not be lost. Re-entry should be instant — the user picks up where
  they left off, not at the beginning.
- **One primary action per view:** Every screen has exactly one thing the
  user is most likely trying to do. That action should be the most visually
  prominent element. Secondary actions exist but don't compete. If you can't
  identify the primary action, the screen is trying to do too much.
- **Reduce decisions, not options:** The goal is not to remove features but
  to remove the *effort* of choosing. Smart defaults, contextual suggestions,
  and progressive revelation (Principle 2) reduce decision fatigue without
  reducing capability.
- **Flow preservation:** Background operations should stay in the background.
  Saves, syncs, and uploads should not require the user to stop what they're
  doing. Never show a success modal for a routine operation — the absence of
  an error *is* the confirmation.
- **Emotional continuity:** The interface should maintain a consistent
  emotional register. A jarring shift from warmth to clinical detachment
  (e.g., friendly onboarding → robotic error page) breaks the user's
  sense of safety. Every state — loading, error, empty, success — should
  feel like the same product.
- **Predictable spatial memory:** Elements should not move between visits.
  The navigation is always in the same place. The primary action is always
  in the same zone. Users build spatial memory of your interface — rearranging
  it forces them to re-learn, spending cognitive budget on navigation instead
  of content.

### Anti-patterns

- Screens with multiple competing calls-to-action of equal visual weight
- Success modals that require dismissal before the user can continue
- Layouts that rearrange based on content length or data availability
- Features that demand full attention in contexts where the user has partial attention
- Onboarding that asks 5 questions before showing any value
- Designs that test well in a usability lab but fail on a crowded train

---

## Implementation Checklist

When starting a new project, audit against each principle:

| # | Principle | Key Question |
|---|-----------|-------------|
| 1 | Sensory Feedback | Does every tap/click produce an immediate visual response? |
| 2 | Progressive Revelation | Can a new user understand the app in 30 seconds? |
| 3 | Return Triggers | What brings users back tomorrow without them deciding to? |
| 4 | Contribution Identity | Do contributors see their name and their impact? |
| 5 | Trust Architecture | Would a cautious user feel safe sharing personal content? Can they export their data and resume where they left off? |
| 6 | Rhythm & Cadence | Does the app have a predictable pulse the user can feel? |
| 7 | Depth Paths | Can a user explore for 10 minutes without hitting a dead end? |
| 8 | Microcopy & Voice | Does every string in the UI sound like the same warm, clear human wrote it? |
| 9 | Psychological Intent | Does this screen respect a distracted user's cognitive budget? |

---

*This document is project-agnostic. For project-specific implementations of
these principles, see the project's own rules file.*
