# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** El Rancho
**Generated:** 2026-06-26 01:21:01
**Category:** Productivity Tool

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#3B7326` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#4E9933` | `--color-secondary` |
| Accent/CTA | `#EA580C` | `--color-accent` |
| Background | `#EFF9EC` | `--color-background` |
| Foreground | `#0E1B09` | `--color-foreground` |
| Muted | `#E0F2D9` | `--color-muted` |
| Border | `#C0E6B3` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#62BF40` | `--color-ring` |

**Color Notes:** Frosted mint primary system + action orange for commercial/CTA moments. Accent adjusted from `#F97316` to `#EA580C` for WCAG 3:1.

### Typography

- **Heading Font:** Fira Code
- **Body Font:** Fira Sans
- **Mood:** dashboard, data, analytics, code, technical, precise
- **Google Fonts:** [Fira Code + Fira Sans](https://fonts.google.com/share?selection.family=Fira+Code:wght@400;500;600;700|Fira+Sans:wght@300;400;500;600;700)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #EA580C;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #3B7326;
  border: 2px solid #3B7326;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #EFF9EC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #62BF40;
  outline: none;
  box-shadow: 0 0 0 3px #62BF4020;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

### PWA Navigation Tabs

Use these tabs as the app information architecture for Claude Design screens. Mobile shows bottom tabs; desktop shows the same items in a sticky left sidebar. Keep max 5 primary destinations.

| Order | Tab | Route | Lucide icon | Purpose | Visibility |
|-------|-----|-------|-------------|---------|------------|
| 1 | `Hoy` | `/hoy` | `BarChart3` | Daily summary: production, sales, expenses, profit, sync state | Admin |
| 2 | `Registrar` | `/registrar` | `ClipboardList` | Fast entry hub for daily field work | Admin + Worker |
| 3 | `Inventario` | `/inventario` | `PackageCheck` | Egg stock by category, last update, available quantity | Admin |
| 4 | `Reportes` | `/reportes` | `LineChart` | Date filters, trends, exports, profit review | Admin |
| 5 | `Ajustes` | `/ajustes` | `Settings` | Users, farm profile, prices, offline/sync, account | Admin + Worker limited |

`Registrar` has secondary segmented tabs inside the screen:

| Segment | Route | Lucide icon | Main action |
|---------|-------|-------------|-------------|
| `Recoleccion` | `/registrar/recoleccion` | `Egg` | Save eggs by category + broken eggs |
| `Venta` | `/registrar/venta` | `CircleDollarSign` | Sell carton/offer and discount inventory |
| `Gasto` | `/registrar/gasto` | `ReceiptText` | Save purchases, feed, vaccines, medicine, transport |

Tab rules:
- Mobile bottom tab height: 64-72px plus `env(safe-area-inset-bottom)`.
- Touch target: minimum 44px; preferred 52px.
- Active tab: solid `--color-primary`, white text/icon, `aria-current="page"`.
- Inactive tab: transparent/white surface, `--color-foreground` at 75-85% emphasis, no saturated fill.
- Badge allowed only for pending sync count on `Registrar` or `Ajustes`; use amber bg + dark amber text, not red unless data failed.
- Worker role may collapse primary tabs to `Registrar` and `Ajustes`; do not show disabled admin tabs.
- If screen needs more sections, use in-page segmented control, not extra bottom tabs.
- Copy labels stay short: one word where possible. Avoid `Administracion` in nav; use `Ajustes`.

Mobile structure:

```tsx
<nav className="primary-tabs" aria-label="Navegacion principal">
  <a aria-current="page" href="/registrar">
    <ClipboardList aria-hidden="true" />
    <span>Registrar</span>
  </a>
</nav>
```

Desktop structure:

```tsx
<aside className="sidebar-tabs" aria-label="Navegacion principal">
  <a aria-current="page" href="/hoy">
    <BarChart3 aria-hidden="true" />
    <span>Hoy</span>
  </a>
</aside>
```

---

## Style Guidelines

**Style:** Flat Design Mobile (Touch-First)

**Keywords:** flat, 2D, no shadow, color blocking, geometric, bold, poster, icon, touch-first, minimal, clean, tailored, cross-platform

**Best For:** Cross-platform apps (iOS+Android parity), information-dense dashboards, system UI, brand illustration, onboarding flows, marketing pages, icon design

**Key Effects:** Immediate press feedback (scale 0.97, no delay), color section blocking (full-width contrasting View), zero elevation/shadow, solid icon containers (colored squares/circles), geometric low-opacity shape overlays, bottom tabs solid fill (no floating)

### Page Pattern

**Pattern Name:** Real-Time / Operations Landing

- **Conversion Strategy:** For ops/security/iot products. Demo or sandbox link. Trust signals.
- **CTA Placement:** Primary CTA in nav + After metrics
- **Section Order:** 1. Hero (product + live preview or status), 2. Key metrics/indicators, 3. How it works, 4. CTA (Start trial / Contact)

---

## Anti-Patterns (Do NOT Use)

- ❌ Complex onboarding
- ❌ Slow performance

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
