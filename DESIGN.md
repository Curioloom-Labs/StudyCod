# StudyCod design system

This specification covers the public site, self-study, EDU, contests, editor, administration, and support areas. The full reference set lives in [design/references/redesign-2026-10](design/references/redesign-2026-10/README.md). References guide composition and hierarchy; use the real StudyCod mark, actual product data, and current design tokens in the interface.

## Direction

Present the product clearly on public pages. Keep workspaces calm, direct, and easy to scan. Global navigation stays at the top on desktop and mobile. Contextual course, class, contest, and administration tabs sit under the current page title. Remove persistent side rails and their reserved margins.

Keep the shipped StudyCod logo, Fixel Text, Fixel Display, and evergreen brand. Support Ukrainian and English, dark and light themes, keyboard use, and reduced motion. Do not copy generated logos, sample content, or invented metrics from reference images.

## Tokens

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg-base` | `#0c130e` | `#f4f4ef` | Main page canvas |
| `--bg-surface` | `#151f18` | `#fffefa` | Menus, dialogs, and distinct work surfaces |
| `--bg-hover` | `#202c23` | `#edf0e9` | Hover and selected surfaces |
| `--bg-code` | `#0a110c` | `#ecefe9` | Code and inset controls |
| `--text-primary` | `#f2f7f2` | `#1b2720` | Main text |
| `--text-secondary` | `#d0dbd1` | `#405047` | Supporting text |
| `--text-muted` | `#aab9ad` | `#617067` | Metadata |
| `--primary` | `#8fbd99` | `#346f4b` | Main action and progress |
| `--accent-warn` | `#d3ac78` | `#936527` | Attention |
| `--accent-error` | `#e59c9c` | `#b4494d` | Errors |
| `--border` | `#34443a` | `#d5dbd2` | Structural boundaries |

Use the existing semantic Tailwind tokens (`bg-bg-base`, `bg-bg-surface`, `text-text-secondary`, `border-border`, `text-primary`, and the status accents). Keep literal colors for code syntax or established artwork, not as a second palette. Avoid adding `!important` overrides.

## Layout and components

- Global navigation: 64px desktop, 56px mobile. At narrow widths, keep the logo, menu, theme, language, and account controls visible; place global sections in the top menu. Do not use a bottom bar or a permanent left rail.
- Context navigation: compact tabs directly below the active section title. Preserve route parameters and deep links when changing tabs.
- Standard reading width: 1280px. Dense tables can reach 1600px. The editor uses the available viewport width.
- Use 16/24/32px as common content gaps. Controls have 8px corners; work surfaces use 12–16px corners. Prefer structural dividers and compact lists over nested cards.
- Put the page title and its primary action together. Keep status beside the information it describes. Show loading, first-load error, successful emptiness, stale data, access denial, and success as distinct states.
- Keep tables as tables. On phones, allow horizontal scrolling inside a table and keep its row identity clear.
- Use 44×44px touch targets for primary mobile navigation and essential actions. Compact desktop controls retain the existing desktop density.
- Use the shared `Modal` for confirmation and forms. Keep Escape, focus containment, focus restoration, and scroll locking.
- Keep one `main` landmark per view. The skip link must focus the first useful content, not a later demo.

## Editor behavior

Below 1024px, use the tabs “Умова / Код / Результат”; at 1024px and above, use independently scrollable panes. Keep Monaco mounted as tabs change so code, selection, cursor, undo, scroll, language, and custom input survive. Collapse the mobile stdin field by default so code remains the largest working area. Keep Run and Submit grouped and visible. Put secondary commands in More. The result tab opens automatically only if the learner stayed in Code; otherwise mark the new result. Size the workspace against the visible viewport, including global and course navigation, safe areas, and the on-screen keyboard.

## Motion

Apply [design-motion-principles](https://github.com/kylezantos/design-motion-principles) by action frequency:

- **Emil / frequent work:** editor keys, tab changes, filter edits, and table refreshes respond immediately. Never animate typing, cursor movement, or recurring counts.
- **Jakub / controls:** feedback is about 120ms; menu and dialog opening is 180–240ms; closing is 120–160ms. Do not delay primary content.
- **Jhey / presentation:** use a short guided “code → test → hint” demonstration and a one-time completion effect when a learner completes an action.
- **Reduced motion:** show the final state immediately. Remove travel, scale, animated blur, and decorative loops. Keep the meaning in text and status indicators.

## Applied skills

The requested taste-skill names were mapped to their installed equivalents: `taste-skill-v1` → `design-taste-frontend-v1`; `gpt-tasteskill` → `gpt-taste`; `redesign-skill` → `redesign-existing-projects`; `image-to-code-skill` → `image-to-code`; `output-skill` → `full-output-enforcement`; `soft-skill` → `high-end-visual-design`; `minimalist-skill` → `minimalist-ui`; `brutalist-skill` → `industrial-brutalist-ui`. `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit`, `stitch-design-taste`, and `design-motion-principles` were applied as separate reference, brand, implementation, and motion lenses. Product behavior, accessibility, and the preserved StudyCod brand take precedence over stylistic variations.

## Reference and audit records

- [All 29 separate image references and their intended use](design/references/redesign-2026-10/README.md)
- [Route, role, finding, evidence, and acceptance register](design/DESIGN_AUDIT.md)
- [Motion audit and interactive examples](design/motion-audits/studycod-frontend-2026-10-10.html)
