// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/** Format a SOL amount with proper decimals, e.g. "1.23 SOL" */
export function SolAmount({ lamports, sol, decimals = 2 }: { lamports?: number; sol?: number; decimals?: number }) {
  const value = sol ?? (lamports != null ? lamports / 1e9 : 0);
  return (
    <span className="font-mono text-pump-green">
      {value.toFixed(decimals)} SOL
    </span>
  );
}
