# Playbook: fix bug

1. Capture a reproducible failing scenario when possible.
2. Run `prepare_task` against the failure description.
3. Identify the narrowest code path and related tests.
4. Add/preserve a regression check.
5. Implement the smallest valid fix.
6. Run fast affected verification, then required full verification.
7. Submit evidence: reproduction before, verification after.
