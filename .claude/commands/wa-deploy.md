---
description: Test, build, commit, and push watch-advisor2 to trigger Netlify deploy
argument-hint: [commit message]
allowed-tools: Bash, Read
---

Deploy watch-advisor2 with commit message: **$ARGUMENTS**

## Pre-deploy checks (abort if any fail)

### 1. Tests
!`npm test 2>&1`

If any NEW test fails (beyond the 2 known pre-existing): STOP. Do not proceed. Report the failure and suggest using `/wa-fix`.

### 2. Build
!`npm run build 2>&1`

If build fails: STOP. Report the error.

### 3. No debug artifacts
!`grep -rn "console\.log\(\"\[zones\]" src/ 2>/dev/null | wc -l`

If count > 0: warn (non-blocking).

### 4. watchSeed.js unchanged
!`git diff src/data/watchSeed.js | head -5`

If diff is non-empty: STOP. watchSeed.js must never be modified.

## Deploy

```bash
git add -A
git status
```

Review staged changes. Then commit:

```bash
git commit -m "$ARGUMENTS

$(npm test 2>&1 | grep 'Tests ' | head -1 | sed 's/.*[0-9]* //' | sed 's/ .*//')/1717 tests"
```

Then push:
```bash
git pull --rebase origin main && git push origin main
```

## Post-deploy

Report:
- Commit SHA
- Test count (N/1717, note any pre-existing failures)
- Build: success / fail
- Netlify will auto-deploy from main push (usually 60-90s)
- Live URL: https://watch-advisor2.netlify.app
