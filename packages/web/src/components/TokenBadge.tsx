// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/** Token name with symbol badge, e.g. "PumpKitty $KITTY" */
export function TokenBadge({ name, symbol }: { name: string; symbol: string }) {
  return (
    <span className="text-sm text-zinc-200">
      {name} <span className="text-zinc-400">${symbol}</span>
    </span>
  );
}
