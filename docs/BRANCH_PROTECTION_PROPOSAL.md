# Branch protection proposal for `main` — NOT APPLIED

Johnny applies this himself. No agent has changed any repository setting, ruleset, or branch protection rule.

Required status check contexts are the job ids from `.github/workflows/ci.yml`:

- `lint`
- `typecheck`
- `unit`
- `convex-test`

Confirm those strings in the ruleset picker against the checks on the CI pull request before saving. The checks UI may display them as `CI / lint` and so on; the context stored by the API is the job id when that id is unique. Do not require any job whose name ends in `(non-blocking)` or that is marked continue-on-error.

Rules: 1 approving review (CODEOWNERS), dismiss stale reviews, block force pushes, block deletion. Linear history is optional and not in the JSON below. `bypass_actors` actor_id `5` with `actor_type` `RepositoryRole` is the repository admin role. `bypass_mode` `pull_request` lets that admin bypass on pull requests only. With a single maintainer, a required review blocks self-merges unless that admin bypass is used.

`integration_id` is omitted, so GitHub accepts the check from any source. To lock the source to GitHub Actions, set `integration_id` on each check to the GitHub Actions app id (commonly `15368`) after confirming it in the ruleset UI.

```sh
gh api -X POST repos/mplsjohnnycage/prospect-studio/rulesets --input ruleset.json
```

`ruleset.json`:

```json
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "lint" }, { "context": "typecheck" },
          { "context": "unit" }, { "context": "convex-test" } ] } }
  ]
}
```

Optional: add `{ "type": "required_linear_history" }`.
