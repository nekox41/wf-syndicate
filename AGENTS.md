# Repository Guidelines

## Project Structure & Module Organization

This repository contains a dependency-free, Simplified Chinese Warframe syndicate reference and calculator.

- `index.html` contains the entire application: inline CSS, page markup, syndicate data, and browser JavaScript.
- `favicon.ico` is the site icon.
- `README.md` identifies the project; `LICENSE` contains its license.

There are no separate source, test, or asset directories. Keep related changes within the existing sections of `index.html` unless a larger restructuring is justified.

## Build, Test, and Development Commands

- `python3 -m http.server 8000` serves the repository locally; open `http://localhost:8000` to preview it.
- Opening `index.html` directly in a browser also works for this static application.
- `git diff --check` checks changes for whitespace errors before committing.

No build step, package installation, or automated test command is configured.

## Coding Style & Naming Conventions

Follow the surrounding formatting: two-space indentation inside CSS and JavaScript blocks, compact CSS declarations, single-quoted JavaScript strings, and semicolons. Use `camelCase` for functions and ordinary variables, uppercase names for shared constants such as `SYN` and `ORDER`, and hyphenated CSS classes such as `axis-panel`.

Preserve Chinese interface text and section comments. Reuse CSS custom properties and existing UI classes. Keep syndicate relationships centralized in `SYN` and calculations in helpers such as `compute()` rather than duplicating logic. No formatter or linter is configured.

## Testing Guidelines

Validate changes manually in a browser. Check calculator and strategy tabs, both strategy axes, all syndicate selectors, rank changes, amount presets, daily-cap truncation, and medal mission presets. Confirm relationship effects remain +50% for allies, −50% for opposed factions, and −100% for enemies. Check narrow and desktop layouts and the browser console for errors.

There is no test framework, test naming convention, or coverage threshold currently established.

## Commit & Pull Request Guidelines

History currently contains only `Initial commit` and `第一版`; no formal commit convention is established. Write short, descriptive commit subjects focused on the change.

Pull requests should explain the affected behavior, list manual validation performed, and link related issues when applicable. Include screenshots for visible layout or interface changes and describe any changes to calculation assumptions.
