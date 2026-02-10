# Project Insights & Developer Notes

This document captures key learnings, troubleshooting tips, and architectural decisions made during the core setup of the AI Merch Store frontend.

## 1. Hydration & Environment Issues
### Problem: React Hydration Mismatch
**Symptom:** "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties."
**Specific Case:** The `<body>` tag occasionally receives an `antigravity-scroll-lock` class from the environment or browser extensions, causing a mismatch with the React client state.
**Solution:**
We use `suppressHydrationWarning` on the `<body>` tag in `src/app/layout.tsx`:
```tsx
<body className="..." style={{...}} suppressHydrationWarning>
```
*Note: This is a safe suppression for attributes that are known to differ (like extension-injected classes) and does not disable hydration checks for the entire tree.*

## 2. Bento Grid System (Tailwind v4)
### Implementation Pattern
The `grid-cols-1 md:grid-cols-3` pattern in `src/app/page.tsx` is robust but relies on manual `col-span` management.
- **Hero Tile:** `col-span-2` (Key visual anchor)
- **Status/Debug/Product:** `col-span-1` (Modular widgets)
**Tip:** For future grid expansions, consider creating a `<BentoGrid>` wrapper component that handles the responsive logic centrally to avoid repetition.

### CSS Variables
We use CSS variables for theming (e.g., `--color-primary`, `--font-heading`) defined in `globals.css` under the `@theme` directive.
**Valid Usage:**
```css
/* Correct */
color: var(--color-primary);
/* Incorrect (unless mapped in tailwind.config) */
text-primary (requires configuration)
```
Ensure new components use these variables or standard Tailwind classes to maintain consistency.

## 3. Verification Workflow
### Comprehensive Testing
A single "page load" test is insufficient. Always verify:
1.  **Rendering:** Does the root `layout.tsx` wrap correctly? (Check headers/footers)
2.  **Route Navigation:** Can you move between `/` and `/shop` without full reloads?
3.  **Error Overlays:** Check the bottom-left corner for Next.js error indicators (e.g., "1 Issue").

### Automated Checks
The project includes browser-based verification scripts (via the agent). Run these before major merges to catch visual regressions or runtime errors that unit tests might miss.

## 4. Key Directories
- `src/app/design-system`: The source of truth for UI components. Check this route (`/design-system`) first when styling new features.
- `.agent/skills`: Contains project-specific rules (`git-guard`, `designing-ecommerce-ux`). Review these if you are unsure about commit standards or design patterns.
