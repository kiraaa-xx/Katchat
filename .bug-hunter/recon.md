## Architecture Summary
KatChat frontend: 18 JS files loaded via `<script defer>` in `index.html`. Inline HTML event handlers (onclick, oninput, onkeydown, onchange) reference JavaScript functions. Function declarations at the top level of unconditional scripts auto-create `window.*` properties. Functions inside `if`-guarded blocks (sage.js, fixes.js, error-handler.js, validation.js) require explicit `window.fn = fn` exports. `let`/`const` declarations do NOT create `window.*` properties.

## Risk Map
### CRITICAL
- index.html — all inline event handlers reference functions by name
- state.js — declares shared state with `let` (no window properties)
- admin.js — functions exported to window (previously broken by SyntaxError, now fixed)
- announcements.js — functions exported to window (previously broken by SyntaxError, now fixed)

### HIGH
- All feature JS files (chat.js, global.js, auth.js, settings.js, ui.js, friends.js, app.js)

## Previously Fixed
- BUG-0a: Duplicate `let editingAnnId` removed from announcements.js:1 (was SyntaxError)
- BUG-0b: Duplicate `let editingRoleName` removed from admin.js:229 (was SyntaxError)

## Known Issue
- index.html:266: `onclick="openProfile(window.activeFriend)"` — `activeFriend` is `let` binding, not `window` property
