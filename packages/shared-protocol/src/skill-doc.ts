import { SceneGraphDocument } from "@frameforge/scene-graph";
import { analyzeSceneGraph } from "./inspector.js";

export function generateSkillDoc(doc: SceneGraphDocument): string {
  const analysis = analyzeSceneGraph(doc);
  const primaryColors = analysis.colors.slice(0, 5);
  const primaryFont = analysis.typography[0]?.fontFamily || "Inter";

  const colorTokens = primaryColors
    .map((c, i) => `  --color-${c.nearestTailwind.name || `brand-${i + 1}`}: ${c.hex}; /* ${c.rgb} */`)
    .join("\n");

  return `---
name: "${doc.title.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "web-design-system"}"
description: "Implementation rules and design tokens extracted from ${doc.title} (${doc.url}) for AI coding agents"
---

# Design System Implementation Skill

## 1. Core Visual Tokens

### Color Palette
\`\`\`css
:root {
${colorTokens}
}
\`\`\`

### Primary Typography
- **Font Family**: \`"${primaryFont}", system-ui, -apple-system, sans-serif\`
- **Base Font Size**: 16px
- **Heading Scale**: 32px (h1), 24px (h2), 20px (h3)

---

## 2. Component & Layout Rules

1. **Auto Layout Conventions**:
   - Use Flexbox (\`display: flex\`) with explicit \`gap\` rather than margin hacks.
   - For vertical stacks: \`flex-direction: column; gap: 1rem;\`.
   - For horizontal button rows / badges: \`flex-direction: row; align-items: center; gap: 0.75rem;\`.
2. **Surface Styling**:
   - Cards use subtle rounded corners (\`border-radius: 12px\` or \`16px\`).
   - Use layered subtle box-shadows (\`box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)\`).
3. **Typography Hygiene**:
   - Maintain line-height multipliers between \`1.4\` and \`1.6\` for body text readability.
   - Use semibold (\`font-weight: 600\`) for interactive buttons and headings.

---

## 3. Accessibility & Contrast Guidelines

- All body text must meet or exceed **4.5:1** contrast ratio against its card background.
- Primary buttons must have visible keyboard focus states (\`outline: 2px solid var(--color-brand); outline-offset: 2px;\`).
- Provide alternative text for all imagery and icons.

---

## 4. Verification Checklist

- [ ] Verify font \`${primaryFont}\` loads via Google Fonts or system fallback.
- [ ] Confirm flex gap behaves consistently across desktop and mobile viewports.
- [ ] Check contrast ratios using Chrome DevTools or Lighthouse.
`;
}
