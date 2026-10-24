# Local security backport

Upstream braces 3.0.3, MIT license retained. No compatible patched release was
available for CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm on 23 October 2026.
The parser now caps combined brace/parenthesis nesting at 128. All recursive
AST entry points validate depth and cycles iteratively before walking a tree.
No option can disable the cap. Ordinary glob behavior is unchanged.

Regression coverage: `tests/security-backports.test.mts`. Remove this override
when an upstream release with equivalent safeguards passes those tests.
