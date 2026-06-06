# Sinnerbox / Fortuna's Palace — Project Conventions

This file is read automatically by Claude Code at the start of every session
in this repo. The conventions below apply to every new source file under
`js/`, `pages/`, `css/`, and the root `index.html`.

`orphan/` and `html/orphan/` are deprecated — do not apply any convention
there and do not back-edit those files.

---

## Storage key prefix (do not "fix")

`wendys_palace_*` localStorage keys are intentional and project-specific
(the user's wife is named Wendy; the keys date her into the work). Never
rename them to a "cleaner" prefix. Preserve verbatim in code and in any
documentation comments.

---

## File-header convention — overview

Every new JS, HTML, or CSS file gets a top-of-file block with two layers:

1. A **diagram** showing function/section flow, entry points, and exports —
   for humans and AI alike. Treat each function as a black box (signature +
   one-line role; no full implementation).
2. A **terse AI-readable** block underneath, using compressed notation, so a
   future model can reconstruct intent without reading the source.

Box-drawing chars: `┌ ┐ └ ┘ ├ ┤ ─ │ ► ◄`.
Width rule: interior 74 chars between the `│` rails. Total line width 78
chars (`  │` + 74 + `│`). Top and bottom borders are 74 `─` between corners.

Verify width with PowerShell: `(Get-Content -Encoding UTF8 file)[N].Length`
should equal 78 for any interior diagram line.

---

## JS files

**Exemplar:** [js/sinnerbox/slot.js](js/sinnerbox/slot.js)

Place the block at the very top of the file, before any IIFE wrapper, import,
or code. Single `/* ... */` block containing both the diagram and the CODE
section.

```
/*
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  MODULE NAME — one-line role                                             │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   <entry point> ──► <function call chain>                                │
  │                          ├─ subcall(args) ──► returnDesc                 │
  │                          └─ otherCall(args) ──► returnDesc               │
  │                                                                          │
  │   Exports (window.X): { funcA, funcB, CONSTS }                           │
  │   External deps: Wallet, Sound, Child, ...                               │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘

  CODE (terse, AI-readable):
  CONST_NAME=value; OTHER=...
  state: var1=init, var2=init
  funcName(args)→retDesc: terse imperative body using symbols
  ...
  exports: global.X={...}; on DOMContentLoaded→init
*/
```

### Terse notation conventions (CODE block)

| Symbol               | Meaning                                            |
|----------------------|----------------------------------------------------|
| `→`                  | returns / leads to                                 |
| `∀`                  | for-each                                           |
| `Σ`                  | sum                                                |
| `∈`                  | in / member of                                     |
| `&&`, `\|\|`, `?:`   | logical operators                                  |
| `$$()`               | `document.querySelectorAll`                        |
| `$()`                | `document.querySelector`                           |
| `#id`                | `document.getElementById('id')`                    |
| `.text`              | `textContent`                                      |
| `.html`              | `innerHTML`                                        |
| `T` / `F`            | true / false                                       |
| `bal`                | balance (Wallet.getBalance)                        |
| `rnd`                | `Math.random()`                                    |
| `guard(cond)`        | early-return when cond                             |
| `cond→ret`           | guard returning a specific value                   |
| `name(args)→ret: …`  | function signature with body summary               |
| `;`                  | sequence imperative steps                          |
| `localStorage[key]`  | storage access                                     |
| `:async`             | mark function as async                             |

Drop articles, prepositions, and any human-readability flourish. Token
efficiency is the goal — not legibility. Each function gets 1–2 dense lines
unless the logic genuinely warrants more.

### Data-only JS files

For pure data modules (e.g. [js/wikirace/articles.js](js/wikirace/articles.js),
[js/shapebots/data.js](js/shapebots/data.js)): replace per-function bodies
with one line per data constant listing key shape + count + consumers.

---

## HTML files

**Exemplar:** [pages/sinnerbox.html](pages/sinnerbox.html)

Place the block between `<!DOCTYPE html>` and `<html lang="en">`. Single
`<!-- ... -->` block with two named sections: prose for humans, terse for AI.

```
<!--
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  PAGE NAME — short role                                                  │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  For humans:                                                             │
  │    Plain-prose description of player interaction. Reference the JS      │
  │    modules that drive it. Mention key DOM ids by name.                  │
  │                                                                          │
  │  For AI (terse):                                                         │
  │    loads: <js files in order>                                            │
  │    inline route-guards (if any): <conditions → redirect targets>         │
  │    DOM ids: <key ids/classes>                                            │
  │    flow: <terse call chain, refs to JS CODE blocks>                      │
  │    storage R/W: <localStorage keys read / written>                       │
  │    routes out: <links and redirects>                                     │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
-->
```

For terminal pages (no further routing — e.g. [pages/death.html](pages/death.html)):
say so explicitly. For data-thin pages (giftshop item displays): a shorter
"For humans" block is fine, but keep all the "For AI (terse)" rows.

---

## CSS files

CSS files get a smaller header — no box-drawing, just a `/* ... */` block
declaring module identity, the sections inside, the selectors it owns, and
who consumes it. Skip the box because CSS lives outside the diagrammable
function-flow paradigm.

```
/*
  MODULE NAME — one-line role (which page/component this styles)
  ─────────────────────────────────────────────────────────────────────────
  Sections:
    1. Resets / variables
    2. <section>:  <what it styles>
    3. <section>:  <what it styles>
    ...
  Owns selectors: .foo, #bar, [data-baz], etc.
  CSS vars: --carpet-base, --carpet-deep, ...  (set inline by page.js)
  Consumed by: pages/<page>.html
  External deps: base.css (if any)
*/
```

No "terse AI" block — CSS rules already are the terse form. Section comments
inside the file are fine where useful but not required.

When backfilling CSS files (out of scope for new-file convention): only do
so when explicitly asked.

---

## Page-comment / page-script poem hooks

If you encounter `co-creator:` lines inside diagram blocks (currently in
[pages/splash.html](pages/splash.html), [pages/sinnerbox.html](pages/sinnerbox.html),
[pages/child.html](pages/child.html), [pages/death.html](pages/death.html)):
these are intentional. They are part of the artifact, not stray notes. Do
not delete or "clean up" without explicit instruction from the user.

---

## Scope of the convention

| Path                          | Apply convention?            |
|-------------------------------|------------------------------|
| `js/**/*.js`                  | yes                          |
| `pages/**/*.html`             | yes                          |
| `index.html` (root)           | yes                          |
| `css/**/*.css`                | yes (new files; not backfill)|
| `assets/**`                   | no                           |
| `pages/shapebots/BALANCE.md`  | no — domain doc              |
| `assets/shapebots/teams/README.md` | no — domain doc         |
| `orphan/**`, `html/orphan/**` | no — deprecated              |

---

## Theme guidance (carries over from user memory)

The Palace is a beloved-but-rejecting home. Antagonists in the work are
external contempt — never the player's internal shame. Subtext stays
subtext. When writing the human-prose section of any header, describe
mechanics neutrally; do not editorialize on the project's emotional
register.
