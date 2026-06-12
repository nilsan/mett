Quick session-start health check for me[tt]. Run both parts and report results together.

## 1. Prod instance versions

Fetch the git SHA from all 5 prod instances and compare to the latest local commit:

```bash
git log --oneline -1
for sub in katja arne dag me roe; do echo -n "$sub: "; curl -s https://${sub}.mett.games/ | grep -oE '[0-9a-f]{7}' | head -1; done
```

Report whether all instances are on the latest local commit. Flag any that are behind or mismatched.

## 2. Open todo items

Read `todo.md` and list all items. Everything in the file is open work — completed items are deleted on ship (the record lives in `git log`). Group by section. Show item number and one-line description only.

---

Present the output as two short sections: **Prod** and **Todo**.
