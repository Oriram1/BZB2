# Session: Drawer Notifications & Header Cleanup (2026-08-06)

## Changes

### 1. Notification bell moved into drawer menu
- **Before**: Bell was absolutely positioned in the page header (left side).
- **After**: Bell icon with unread badge sits in the drawer header, next to the X button.
- Clicking the bell slides the drawer content from the menu view to an inline notifications panel (no popover).

### 2. Back arrow replaces bell in header
- The back arrow (`←`) now sits in the absolute-left position where the bell used to be.
- Arrow direction flipped (rotated 180°) to point left.

### 3. Inline notifications panel in drawer
- Instead of a floating popover, notifications render as a full panel inside the drawer.
- Two-panel slide animation using CSS `translateX` (GPU-composited, no JS animation frames).
- Header switches between logo/bell and back-arrow/title/"mark all read" icon.
- Touch scroll isolated inside notification list (`overscrollBehavior: contain`).
- Settings button hidden in drawer context (only shows in header popover variant).
- "Mark all read" button is icon-only (✓✓) with `aria-label`.

### 4. Sticky header fix
- `overflow-x-hidden` on `RouteViewport` in `App.tsx` was breaking `position: sticky`.
- Replaced with `overflow-x: clip` which clips without creating a scroll container.

### 5. Drawer logo updated
- Replaced `🐝 BZB` emoji text with `BzbLogo` component + "BZB" text (matches page header).

### 6. Removed duplicate NotificationBell from FloatingNavTrigger
- Was causing duplicate Supabase realtime subscriptions and `cannot add postgres_changes callbacks after subscribe()` error.
- FloatingNavTrigger now only renders the hamburger menu trigger.

## Files changed
- `src/components/PageHeader.tsx` — removed bell, moved back arrow to absolute-left
- `src/components/MobileNav.tsx` — inline notification panel, slide animation, logo update
- `src/components/NotificationBell.tsx` — added `variant` prop (header/drawer), icon-only mark-all-read
- `src/App.tsx` — `overflow-x-hidden` → `overflow-x: clip`
