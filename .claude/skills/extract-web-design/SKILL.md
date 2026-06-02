---
name: extract-web-design
description: |
    Use when a prompt asks to extract a design system, color palette, typography,
    or design tokens from a website URL. Triggers: "디자인 시스템 뽑아줘",
    "이 사이트 색상/폰트 추출해줘", "디자인 토큰 알려줘", "디자인 언어 분석해줘",
    "extract design", "get design system", "design tokens", "what colors/fonts does this site use",
    or "/extract-web-design".
allowed-tools: Bash, Read, Write, Glob
---

# Extract Design Language

Extract the complete design language from any website URL. Generates 8 output
files covering colors, typography, spacing, shadows, components, breakpoints,
animations, and accessibility.

## Prerequisites

Verify `designlang` is reachable before running:

```bash
npx designlang --version
```

If unavailable (offline / restricted network), stop and report — do not retry silently.

## Process

1. **Run the extraction** on the provided URL:

```bash
npx designlang <url> --screenshots
```

Multi-page crawl: `npx designlang <url> --depth 3 --screenshots`
Dark mode: `npx designlang <url> --dark --screenshots`
SPA (delayed render): `npx designlang <url> --wait 3000 --screenshots`

2. **Read the generated markdown file:**

```bash
cat design-extract-output/*-design-language.md
```

3. **Present key findings** to the user:
    - Primary color palette with hex codes
    - Font families in use
    - Spacing system (base unit if detected)
    - WCAG accessibility score
    - Component patterns found
    - Notable design decisions (shadows, radii, etc.)

4. **Offer next steps:**
    - Copy `*-tailwind.config.js` into their project
    - Import `*-variables.css` into their stylesheet
    - Paste `*-shadcn-theme.css` into globals.css for shadcn/ui users
    - Import `*-theme.js` for React/CSS-in-JS projects
    - Import `*-figma-variables.json` into Figma for designer handoff
    - Open `*-preview.html` in a browser for a visual overview
    - Use the markdown file as context for AI-assisted development

## Output Files (8)

| File                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `*-design-language.md`   | AI-optimized markdown — the full design system for LLMs     |
| `*-preview.html`         | Visual HTML report with swatches, type scale, shadows, a11y |
| `*-design-tokens.json`   | W3C Design Tokens format                                    |
| `*-tailwind.config.js`   | Ready-to-use Tailwind CSS theme                             |
| `*-variables.css`        | CSS custom properties                                       |
| `*-figma-variables.json` | Figma Variables import format                               |
| `*-theme.js`             | React/CSS-in-JS theme object                                |
| `*-shadcn-theme.css`     | shadcn/ui theme CSS variables                               |

## Additional Commands

- **Compare two sites:** `npx designlang diff <urlA> <urlB>`
- **View history:** `npx designlang history <url>`

## Options

| Flag                 | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `--out <dir>`        | Output directory (default: `./design-extract-output`) |
| `--dark`             | Also extract dark mode color scheme                   |
| `--depth <n>`        | Crawl N internal pages for site-wide extraction       |
| `--screenshots`      | Capture component screenshots (buttons, cards, nav)   |
| `--wait <ms>`        | Wait time after page load for SPAs                    |
| `--framework <type>` | Generate only specific theme (`react` or `shadcn`)    |

## Common Mistakes

| Mistake | Fix |
|---|---|
| SPA returns near-empty tokens | Add `--wait 2000` (or higher) for client-rendered content |
| Dark-themed site extracted in light mode | Add `--dark` (or run twice — once each) |
| Single-page extraction missing site-wide tokens | Use `--depth 3` to crawl internal pages |
| Output overwrites previous run | Use `--out ./design-extract-output/<site-slug>` per site |
| Network/firewall blocks `npx` fetch | Stop and report — do not retry silently |

## 다음 단계

산출물이 `./design-extract-output/` 에 저장된 후 `frontend-design` 스킬을 호출하여 실제 컴포넌트로 구현한다.
