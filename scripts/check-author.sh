#!/usr/bin/env sh
want="323344275+mplsjohnnycage@users.noreply.github.com"
got="$(git config user.email)"
[ "$got" = "$want" ] || { echo "commit email must be $want (got: ${got:-unset})" >&2; exit 1; }
