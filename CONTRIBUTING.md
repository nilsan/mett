# Contributing to me[tt]

Thanks for helping. me[tt] is used at real tables during long game weekends, so the bar is: it must not break a game in progress.

## Reporting

- **Bugs:** open an [issue](https://github.com/nilsan/mett/issues/new/choose) with the page, the screen or phone, the version from the page header, and a screenshot if you can.
- **Rules:** if me[tt] gets a rule wrong, quote the rulebook (West or East, Basic or Expert). [RULES.md](RULES.md) lists what is implemented and what is simplified.
- **Ideas:** describe the situation at the table rather than the solution; there may be a simpler fix.

## Code

Setup, architecture, API and tests are in [DEV.md](DEV.md). In short:

```bash
bun install
bun run dev              # http://localhost:3000, reloads on save
bun run test             # unit, integration and full-game simulations
bunx tsc --noEmit        # type check
bun run test:browser     # Playwright layout and screenshot tests
bun run css:usage        # no unused CSS
```

Before opening a pull request:

1. **Tests.** New behaviour comes with tests; a bug fix comes with a test that fails without it. All of the above must pass (CI runs them too).
2. **Screens.** The status board must never scroll or clip at 1920×1080 and up (including 4K with OS scaling); every page must work on a phone without sideways scrolling. `tests/browser/layout.spec.ts` checks this.
3. **One source for each rule.** A.S.T. rules live only in `AGE_TABLE` (`src/shared/ast-pure.ts`), empire data only in `CIVS` (`src/civs.ts`).
4. **Database changes** go in `db/schema.sql` *and* as a new entry in `MIGRATIONS` (`src/services/db.ts`); never edit a released migration.
5. **Client code:** after changing `src/client/` or `src/shared/`, run `bun run build:client` and commit the rebuilt bundles.
6. **Version and changelog:** bump `package.json` by the rules in [DEV.md › Versioning](DEV.md#versioning) and add a line to [CHANGELOG.md](CHANGELOG.md).
7. **License:** contributions are under the [Mozilla Public License 2.0](LICENSE). New source files start with the MPL notice (a test checks this).

Keep pull requests small and about one thing; screenshots help for anything visible.
