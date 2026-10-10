# StudyCod design system

This document describes the shared visual and interaction rules for the public site, learner workspaces, EDU, contests, the code editor, and administration. Keep the StudyCod mark, Fixel fonts, and evergreen brand recognizable while letting each screen give its main task enough space.

## Brand

- Use the existing mark in `frontend/public/favicon.svg` and the `Logo` component as the source of truth. The generated brand board is a visual reference, not an asset to ship; its logo rendering is approximate.
- Use Fixel Text for interface and body text and Fixel Display for major headings. Keep the system monospace stack for code, identifiers, timestamps, and compact diagnostic data.
- Dark and light themes are both supported. Use semantic tokens so the same component retains meaning in either theme.
- Keep the forest and mint greens for primary actions and progress. Use amber for caution, red for errors, and blue-gray for secondary information. Reserve vivid colors for a clear status or action.

## Core tokens

| Token | Dark theme | Light theme | Use |
|---|---|---|---|
| `--bg-base` | `#0d1510` | `#ffffff` | Page background |
| `--bg-surface` | `#17221a` | `#ffffff` | Cards, menus, dialogs |
| `--bg-hover` | `#233127` | `#f3f6f3` | Hover and selected surfaces |
| `--bg-code` | `#0a110c` | `#f1f4f1` | Code and inset controls |
| `--text-primary` | `#f2f7f2` | `#1b2720` | Headings and main content |
| `--text-secondary` | `#d0dbd1` | `#405047` | Supporting content |
| `--text-muted` | `#aab9ad` | `#617067` | Secondary labels |
| `--primary` | `#8fbd99` | `#346f4b` | Main actions and progress |
| `--accent-warn` | `#d3ac78` | `#936527` | Caution and attention |
| `--accent-error` | `#e59c9c` | `#b4494d` | Errors and destructive state |
| `--border` | `#35463a` | `#d8ded7` | Structural boundaries |

Prefer `bg-bg-base`, `bg-bg-surface`, `text-text-secondary`, `border-border`, `text-primary`, and the semantic accent tokens over literal color values. Keep literal colors for code syntax or a specific existing brand illustration; migrate other legacy values when editing that component. Do not add new `!important` color overrides.

## Type and spacing

- Use the existing hierarchy: caption `12px`, UI `14px`, body `16px` with a relaxed line height, and display headings from `22px` upward.
- Keep heading line-height near `1.18`; use compact line-height for labels and controls and about `1.58` for paragraphs.
- Use the existing 4px spacing scale: `4, 8, 12, 16, 24, 32, 48, 64px`. Denser layouts may use `4–16px` gaps; public and learner content can use `24–48px` between sections.
- Prefer the existing surface, control, button, and modal radius tokens. Keep tables and code panels structurally square enough to scan; reserve large rounded corners for primary cards and dialogs.

## Components and interaction states

- Primary buttons should have one clear visual priority per region. Secondary actions use outline or ghost treatment. Destructive actions use the error semantic token.
- Inputs and controls need a visible focus ring, a label or accessible name, and a disabled state that remains legible.
- Use `Button`'s `touch` and `touch-icon` sizes for mobile actions. For mobile navigation and essential icon actions, target at least `44×44px`; preserve compact desktop density.
- Keep status and commands visually distinct. A connection or result state should not resemble an enabled action.
- Use `Modal` for confirmation and form dialogs. It handles Escape, focus containment and restoration, body scroll lock, and the reduced-motion variant.
- A page has one main landmark. Shell skip links target a focusable `main-content` destination; keep the target near the beginning of the useful content.

## Layout and density

- Let content and tables keep their natural structure. On small screens, scroll wide tables horizontally instead of turning each row into unrelated cards.
- Public pages lead with one primary action and show the product quickly. Learner dashboards lead with the next course action and current status.
- Dense teacher, contest, admin, and editor screens prioritize scan order, clear states, and stable control placement over decorative whitespace.
- The IDE uses condition/code/result tabs below `1024px` and panels at `1024px` and above. Its mobile workspace follows the visible viewport and safe area. Keep the editor mounted while panes change so code, cursor, scroll position, language, and input survive.
- Test layouts at `320, 390, 768, 1024, 1366, and 1920px`, at `200%` zoom, and with the on-screen keyboard open.

## Motion policy

Choose motion by action frequency and purpose, following [design-motion-principles](https://github.com/kylezantos/design-motion-principles):

- **Frequent editing and keyboard actions:** instant. Do not animate keystrokes, cursor movement, repeated table updates, or tab key navigation.
- **Daily controls:** short transitions, typically `120–180ms`. Open lightweight menus in about `180ms`; close them in `120–160ms`.
- **Presentation and onboarding:** restrained reveals up to `240ms`; do not delay primary content.
- **One-time learning completion:** a brief, non-blocking celebration may run once after the learner completes an action. Never replay it on ordinary page load.
- **Reduced motion:** remove movement, scale, blur, and decorative loops; present the final state immediately. Keep text and status cues so meaning does not depend on animation.
- Avoid persistent live pulses and repeated count-up animations. A live status can use a static indicator and a readable label.

## Reference boards

The boards below are direction-setting examples. They were generated for this audit and must be translated into real components; use the current StudyCod mark and typography rather than copying any approximated logo or embedded text.

| Reference | File |
|---|---|
| Brand board | [brandkit-studycod.png](design/references/brandkit-studycod.png) |
| Public landing, desktop | [landing-desktop.png](design/references/landing-desktop.png) |
| Learner dashboard, desktop | [learning-dashboard-desktop.png](design/references/learning-dashboard-desktop.png) |
| Teacher workspace, desktop | [teacher-workspace-desktop.png](design/references/teacher-workspace-desktop.png) |
| IDE, desktop | [ide-desktop.png](design/references/ide-desktop.png) |
| IDE statement, mobile | [ide-mobile-condition.png](design/references/ide-mobile-condition.png) |
| IDE code, mobile | [ide-mobile-code.png](design/references/ide-mobile-code.png) |
| IDE result, mobile | [ide-mobile-result.png](design/references/ide-mobile-result.png) |

## Applied audit lenses

- `taste-skill-v1`, `gpt-tasteskill`, and `redesign-skill` guided hierarchy, layout variation, and changes to existing workflows.
- `soft-skill`, `minimalist-skill`, and `brutalist-skill` informed the calmer surfaces, reduced decoration, and clearer dense work areas.
- `image-to-code-skill`, `imagegen-frontend-web`, and `imagegen-frontend-mobile` produced separate desktop/mobile references that were translated into layout rules before implementation.
- `brandkit` and `stitch-skill` informed the brand board and this portable `DESIGN.md` system spec; `output-skill` informed the evidence, priority, fix, and acceptance register.
- `design-motion-principles` supplied the Emil-first daily-work weighting, Jakub's transition polish, selective Jhey celebration, and the reduced-motion audit.

## Audit and acceptance

The current audit register and implementation status are in [design/DESIGN_AUDIT.md](design/DESIGN_AUDIT.md). Closed scenarios that could only be inspected in code are marked there; verify their role-specific paths in preview before release. Use [motion-audits/studycod-frontend-2026-10-10.html](motion-audits/studycod-frontend-2026-10-10.html) for the motion audit and interactive motion examples.
