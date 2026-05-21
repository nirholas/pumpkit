---
description: Coach an existing pump.fun integration through V1 → V2 migration (additive — keeps V1 working)
argument-hint: [package-path]
---

Run the additive V1 → V2 migration playbook for the package at `$ARGUMENTS` (or the whole repo if no arg).

## Steps

1. **Confirm the goal.** Ask: "Adding USDC support only, or also moving SOL pair to V2 as a forcing function?" These are different scopes.
2. **Inventory V1 call sites:**
   ```bash
   grep -rn --include='*.ts' -E "buildBuy|buildSell|buildCreate" "$ARGUMENTS" 2>/dev/null || \
   grep -rn --include='*.ts' -E "buildBuy|buildSell|buildCreate" packages/ examples/ tools/
   ```
   Print the list. Classify TX-out vs RX-events vs constants.
3. **Show the diff plan** without applying it:
   - Adapter file to add/edit
   - Decoders to update
   - Schema migration
   - Formatters
   - Tests
4. **Walk through each phase in order**, getting approval between phases. **Do not** apply multi-file changes in one shot — they need to be reviewable.
5. **At the end**, summarise the completion checklist from [tutorials/52-v1-to-v2-migration.md](../../tutorials/52-v1-to-v2-migration.md) and report green/red per item.

## Reference materials

- Skill: [.claude/skills/migrate-v1-to-v2/SKILL.md](../skills/migrate-v1-to-v2/SKILL.md)
- Tutorial: [tutorials/52-v1-to-v2-migration.md](../../tutorials/52-v1-to-v2-migration.md)
- Agent: `migration-coach` (use it for sub-questions during the walk-through)

## Avoid

- Removing V1 paths — the migration is **additive**.
- Renaming exports just because — only rename if the surface is genuinely breaking.
- Skipping V1 tests — they protect the majority cohort.
