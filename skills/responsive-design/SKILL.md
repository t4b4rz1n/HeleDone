---
name: responsive-design
description: Rules and patterns for building responsive, mobile-first, and RTL-compliant UI in Madaar. Use whenever creating, styling, or reviewing UI components, pages, modals, tables, kanban boards, sidebars, toolbars, forms, or navigation to ensure seamless UX across mobile (360px+), tablet (768px+), and desktop (1024px+) viewports.
---

# Madaar Responsive Design Guidelines

This skill defines the engineering rules for responsive, mobile-first, and RTL-safe UI development in Madaar (React 19, Tailwind CSS v4, DaisyUI, Coastal Workspace).

---

## 1. Breakpoints & Viewport Strategy

Madaar follows standard Tailwind breakpoints, designed mobile-first:

| Prefix | Min Width | Target Devices | Layout Behavior |
| :--- | :--- | :--- | :--- |
| *(default)* | `< 640px` | Phones (Mobile) | Single-column, full-width cards, bottom sheets, sticky headers |
| `sm:` | `640px` | Large Phones / Phablets | 2-column forms, relaxed padding |
| `md:` | `768px` | Tablets / Small Laptops | Collapsible sidebar, 2-3 column grids, standard modals |
| `lg:` | `1024px` | Desktops | Full sidebar, kanban horizontal boards, multi-column analytics |
| `xl:` | `1280px` | Wide Desktops | Max-width content containers (`max-w-7xl mx-auto`) |

### Core Rules:
1. **Mobile-First Utility Classes:** Write base styles for mobile without prefixes, then layer `sm:`, `md:`, `lg:` for larger screens.
   ```tsx
   // ✅ Good: Mobile 1 column, Tablet 2 columns, Desktop 3 columns
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
   ```
2. **Never Hardcode Fixed Widths on In-Flow Containers:**
   - ❌ Never: `w-[500px]`, `w-[800px]`, `w-60` on mobile in-flow flex containers
   - ✅ Always: `w-full max-w-lg`, `w-full max-w-4xl`, or `clamp(260px, 30vw, 380px)`
3. **Prevent Flex Box Blowouts with `min-w-0`:**
   Any flex child that contains truncated text (`truncate`, `line-clamp`) or child components must include `min-w-0`, otherwise flex items will expand beyond the viewport on mobile:
   ```tsx
   // ✅ Good: Keeps the card within mobile screen width
   <div className="flex items-center gap-3 min-w-0 w-full">
     <div className="min-w-0 flex-1">
       <h4 className="truncate text-sm font-semibold">{task.title}</h4>
     </div>
   </div>
   ```

---

## 2. Dynamic Height & Touch Targets

1. **Use `dvh` Instead of `vh`:**
   Mobile browsers (Safari, Chrome) expand/collapse their address bar, making `100vh` clip behind UI bars.
   - ✅ Use: `h-[100dvh]`, `min-h-[100dvh]`, `max-h-[calc(100dvh-5rem)]`
2. **Touch Targets (Minimum 44×44px):**
   All interactive elements (buttons, icons, menu triggers, checkboxes) must have a tap target of at least 44×44px on mobile:
   ```tsx
   // ✅ Icon button with proper tap area
   <button type="button" className="p-2 sm:p-1.5 rounded-lg active:scale-95 transition">
     <More size={18} />
   </button>
   ```

---

## 3. Component-Specific Patterns

### A. Primary & In-Page (Secondary) Sidebars
- **Never render an in-page sidebar (`w-60`, `w-72`) inline next to content on mobile:**
  Inline sidebars leave as little as 100px for main content, causing devastating layout squishing and letter-by-letter text wraps.
- **Desktop (`>= lg`):** Static in-flow sidebar (`lg:static lg:z-30 lg:w-60`).
- **Mobile (`< lg`):** Convert into an off-canvas drawer overlay (`fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] shadow-2xl`) with backdrop blur overlay and smooth translation:
  ```tsx
  {/* Mobile Drawer Backdrop */}
  {isDrawerOpen && (
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
      onClick={() => setDrawerOpen(false)}
    />
  )}

  {/* Sidebar Element */}
  <aside
    className={`
      fixed inset-y-0 start-0 z-50 flex flex-col border-e border-base-200 bg-base-100 transition-transform duration-300 w-72 max-w-[85vw] shadow-2xl
      lg:static lg:z-30 lg:shadow-none lg:transition-all lg:duration-200
      ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0'}
      ${isCollapsed ? 'lg:w-16' : 'lg:w-60'}
    `}
  >
    {/* Close button for mobile inside drawer */}
    <button type="button" className="lg:hidden p-1.5" onClick={() => setDrawerOpen(false)}>
      <X size={18} />
    </button>
    ...
  </aside>
  ```
- Always provide a clear toggle trigger button (`Menu` or `PanelLeftOpen`) on mobile in the header or toolbar.

### B. Action Toolbars & Page Headers
- On mobile (`< sm`), stack title and actions vertically (`flex-col sm:flex-row sm:items-center sm:justify-between`).
- **Prioritize 1 primary action:** Show full text on the main action button (e.g. `+ New task`).
- **Compact secondary actions:** On mobile, hide text and show icon-only buttons for secondary actions (`<span className="hidden sm:inline">New Board</span>`) or tuck them into a kebab dropdown (`MoreVertical`).
- Wrap the title container in `min-w-0 flex-1` and use `truncate` so long titles do not wrap character by character.

### C. Filter Bars & Chip Rows
- **Never allow filter chips to wrap (`flex-wrap`) on mobile:**
  Wrapping chips in a narrow column turns the filter into a giant vertical list that pushes all content down.
- **Always use a horizontal touch-scrollable row on mobile:**
  ```tsx
  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 max-w-full">
    {filters.map((filter) => (
      <button key={filter.id} className="shrink-0 whitespace-nowrap px-2.5 py-1 text-xs ...">
        {filter.label}
      </button>
    ))}
  </div>
  ```

### D. Modals & Sheets
- **Mobile (`< sm`):** Convert modals to bottom-sheets or full-screen overlays with safe-area padding.
- **Desktop (`>= sm`):** Centered floating dialog.
```tsx
<div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-base-100 p-5 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
  {/* Content */}
</div>
```

### E. Data Tables & Grids
Tables break mobile viewports if uncontained:
1. **Always wrap tables in horizontal scroll containers:**
   ```tsx
   <div className="w-full overflow-x-auto rounded-xl border border-base-content/10">
     <table className="table w-full min-w-[600px] text-xs sm:text-sm">
       ...
     </table>
   </div>
   ```
2. **Or prefer Adaptive Card-View for Mobile:**
   - Display a responsive `<div className="sm:hidden space-y-3">` card list on phones, and `table` on `hidden sm:table`.

### F. Kanban Boards
- **Desktop (`>= lg`):** Horizontal scroll with fixed-width swimlanes (`min-w-[280px] w-[280px]`).
- **Mobile (`< lg`):** When the in-page sidebar is safely tucked away, columns receive full mobile viewport space:
  - Container: `overflow-x-auto snap-x snap-mandatory px-4`
  - Each swimlane: `snap-center min-w-[85vw] sm:min-w-[280px] sm:w-[clamp(280px,20vw,320px)]`
  - Allows natural one-column-at-a-time horizontal flicking on touch screens.

### G. Popovers, Tooltips & Floating Inputs
- Popovers spawned via Portals must clamp to window boundaries:
  ```tsx
  const maxAllowedLeft = window.innerWidth - dropdownWidth - 16;
  const safeLeft = Math.max(16, Math.min(caretLeft, maxAllowedLeft));
  ```
- On touch screens, prefer tap-triggered popovers over hover-only tooltips.

---

## 4. Bilingual & RTL Layout Safety

Madaar strictly supports Persian (RTL) and English (LTR). Responsive rules must never break directional flow:

1. **Logical Positioning & Margins:**
   - Use `start-` / `end-` instead of `left-` / `right-`
   - Use `ps-` / `pe-` instead of `pl-` / `pr-`
   - Use `ms-` / `me-` instead of `ml-` / `mr-`
   - Use `border-s-` / `border-e-` instead of `border-l-` / `border-r-`
2. **Drawer Translations:**
   - Always pair LTR/RTL translations for off-canvas elements:
     `-translate-x-full rtl:translate-x-full` for hidden state, `translate-x-0` for open.
3. **Text Alignment:**
   - Always use `text-start` and `text-end` (never hardcode `text-left` or `text-right`).
4. **Avatar Stacks & Reverse Flex:**
   - For overlapping avatar stacks, always add `rtl:space-x-reverse`:
     ```tsx
     <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
     ```

---

## 5. Verification Checklist

Before completing any UI change or feature:
- [ ] **Mobile Screen Check (375px):** No horizontal page blowout on body or document root.
- [ ] **Remaining Viewport Width:** In-page sidebars do not eat horizontal real estate on `< lg`; main content receives 100% of the mobile screen.
- [ ] **Truncation & Wrapping:** Long titles and tags don't break character-by-character (`truncate` + `min-w-0`).
- [ ] **Filter Chips Horizontal Scroll:** Filter chip rows swipe smoothly horizontally without breaking into vertical multi-line stacks.
- [ ] **Action Bar Prioritization:** Primary button is clear; secondary buttons are compact/icon-only on mobile.
- [ ] **Keyboard / Input Pop:** Inputs in modals don't get covered by mobile software keyboards (`dvh` + scrollable body).
- [ ] **RTL Direction Check:** Drawers slide in from the correct physical side (right in RTL, left in LTR) and spacings adapt properly.
- [ ] **Touch Target:** Buttons and interactive badges are easy to tap without accidental miss-clicks (min 44×44px hit-box).
