# Review findings

## [P1] Do not leave an unsandboxed-command override as an unignored local change

`.claude/settings.local.json:5` sets `allowUnsandboxedCommands` to `true`, allowing Claude to run commands outside its sandbox. The file is neither ignored by `.gitignore` nor otherwise excluded, so a routine `git add -A` can commit this machine-specific security downgrade and apply it to every collaborator who uses the repository. Remove the override (or set it to `false`) and add `.claude/settings.local.json` to `.gitignore` if this is intentionally local-only configuration.
