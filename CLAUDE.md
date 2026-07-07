# TalentLens

A full-stack recruitment platform (React + Node.js/Express + PostgreSQL).

## Stack

- **Frontend**: React (Vite), located in `client/src/`
- **Backend**: Node.js + Express, located in `server/`
- **Database**: PostgreSQL, schema in `db/schema.sql`
- **Process manager**: PM2 (`ecosystem.config.js`)

## UI & Frontend Guidelines

These rules apply to all work in `client/src/`. Sourced from [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines).

### Interactions

- All interactive flows must be keyboard-operable following WAI-ARIA patterns
- Visible focus rings on all focusable elements; prefer `:focus-visible`
- Hit targets ≥44px on mobile; use padding to expand if needed
- Input `font-size` must be ≥16px on mobile to prevent iOS auto-zoom
- Never disable paste on inputs
- Loading buttons show a spinner while preserving the original label text
- Show loading indicators after a 150–300ms delay; keep them visible ≥300ms
- Persist state in the URL (filters, tabs, pagination) to enable sharing
- Optimistic UI updates with rollback on server error
- Use `touch-action: manipulation` on touch targets to prevent zoom
- Autofocus only on desktop single-input screens; avoid on mobile
- Announce async updates via `aria-live="polite"`
- Use `<a>` or React `<Link>` for navigation — not `div onClick`
- Confirmation dialogs required for destructive operations; offer undo where possible

### Animations

- Always respect `prefers-reduced-motion` with reduced or no-motion variants
- Prefer CSS transitions over JS animation libraries
- Only use `transform` and `opacity` for GPU-accelerated animation
- Never use `transition: all` — list properties explicitly
- Animate only when it clarifies cause/effect or adds intentional delight
- Animations must be interruptible

### Layout

- Test layouts on mobile, laptop, and ultra-wide (simulate with 50% zoom)
- Use flex/grid/intrinsic sizing — avoid manual pixel sizing where possible
- Respect safe areas using CSS environment variables on mobile

### Content & Typography

- Design all states: empty, sparse, dense, error, loading
- Skeleton loaders must mirror the shape of the final content exactly
- Use `font-variant-numeric: tabular-nums` for any numeric comparisons or tables
- Never rely on color alone for status — always pair with text or icon
- Use curly quotes (`"` `"`) not straight quotes in UI copy
- Use `…` (ellipsis character) not `...` (three periods)
- Use `scroll-margin-top` on anchored section headings

### Forms

- Enter key submits single-field forms
- Textarea: `⌘/⌃+Enter` submits; `Enter` inserts newline
- Every control must have an associated `<label>`
- Disable submit only after submission starts, not before
- Show validation errors adjacent to fields; focus the first error on submit
- Always set `autocomplete` and `name` attributes for autofill support
- Disable spellcheck on emails, codes, and usernames (`spellCheck={false}`)
- Use correct `type` and `inputmode` for mobile keyboards
- Warn before navigating away from forms with unsaved changes

### Accessibility

- Semantic HTML first; ARIA only when HTML is insufficient
- Hierarchical heading structure (`h1` → `h2` → `h3`)
- Include a skip link for keyboard users
- Icon-only buttons must have a descriptive `aria-label`
- Decorative icons use `aria-hidden="true"`
- Accessible names must be accurate — not just present

### Performance

- Virtualize long lists (candidates, jobs)
- Set explicit width/height on images to prevent layout shift (CLS)
- Lazy-load below-the-fold images
- Preconnect to CDN/asset domains
- Minimize re-renders — prefer uncontrolled inputs where possible

### Design

- Nested border-radius: child `border-radius` ≤ parent
- Interactive states (`:hover`, `:active`, `:focus`) must have visually distinct styles
- Charts and status colors must be color-blind friendly

### Copywriting

- Active voice in all UI text
- Title Case for headings and buttons; sentence case for body/labels
- Keep copy concise — minimize word count
- Action-oriented button labels (e.g. "Add Candidate" not "Submit")
- Error messages must guide the user toward a solution, not just state the problem
- Positive framing even in error states
- Numerals for counts (e.g. "3 candidates", not "three candidates")
