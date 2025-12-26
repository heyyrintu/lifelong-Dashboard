## Plan: Remove Dark Theme Across App

Remove the dark theme toggle and styles, consolidate to a single light theme, and refactor `dark:` Tailwind variants and `.dark` CSS into canonical base styles to avoid regressions.

### Steps
1. Remove `ThemeProvider` usage in app/layout.tsx and app/(dashboard)/layout.tsx; delete components/theme-provider.tsx.
2. Remove `ThemeToggle` in components/layout/Header.tsx; delete components/theme-toggle.tsx.
3. Consolidate CSS: move `.dark` overrides to `:root` and delete `.dark` selectors in app/globals.css.
4. Sweep UI: replace `dark:` Tailwind variants with base classes across app/(dashboard)/**, components/**, and app/login/page.tsx.
5. Tailwind config: set single-theme behavior and remove `darkMode: 'class'` if unused in tailwind.config.ts.
6. Dependencies & docs: remove `next-themes` from package.json and update mentions in README.md, PROJECT_STRUCTURE.md, START_HERE.md.

### Further Considerations
1. Retain contrast: port dark palette values into the light theme where necessary to maintain readability.
2. Tokens: confirm components referencing `hsl(var(--...))` dark-only variables are updated to base tokens before deletion.
3. Phased refactor: prioritize layout → shared UI → high-traffic pages (summary, login, upload, inventory) to reduce risk.
