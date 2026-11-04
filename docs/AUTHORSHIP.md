# Commit authorship rule
All agents and humans commit to this repo as:

    git config user.name  "mplsjohnnycage"
    git config user.email "323344275+mplsjohnnycage@users.noreply.github.com"

Why: Vercel blocks Git deployments for commits authored as `noreply@local` or an agentmail address.

Check: `scripts/check-author.sh` fails if the configured email differs. It reads `git config user.email` for the repo you are about to commit in. It does not inspect existing history. Optional hook:

    git config core.hooksPath .githooks   # with .githooks/pre-commit calling scripts/check-author.sh
