# Coding Standards

Rules for the **review** agent (not the implementation agent). Each rule is a
judgement call a guardrail cannot substitute for — a CSS/DOM interaction, a
cross-file consistency check, or a "matches the surrounding style" call.

## CSS: `hidden` attribute vs `display` specificity

The `hidden` attribute sets `display: none` via the UA stylesheet, but a class
rule that sets `display` (e.g. `.foo { display: flex; }`) wins on equal
specificity — the author rule beats the UA rule. So an element that carries the
`hidden` attribute **and** whose class sets `display` will *not* actually be
hidden; the class rule silently overrides the attribute.

**Rule:** When applying the `hidden` attribute to an element whose class sets
`display`, add a `[hidden] { display: none; }` rule scoped to that class
(e.g. `.foo[hidden] { display: none; }`). The attribute+class selector has
higher specificity than the class rule, so it wins and restores the hide.
