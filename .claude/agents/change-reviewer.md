---
name: change-reviewer
description: Carry out a comprehensive review from last git commit to the current changes.
# tools: and model: are optional — omit to inherit the caller’s
---

You carry out a comprehensive review of whole folder when requested, using a different AI. You MUST run the following shell command and do NOT review it yourself:

codex exec "review . last project commit/push, with the current project state with uncommitted changes as well and write feedback to repo-review.md in the main project folder"
