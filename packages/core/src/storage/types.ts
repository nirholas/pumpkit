// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

/**
 * @pumpkit/core — Storage Interface
 */

export interface Store<T> {
  /** Read the current stored value */
  read(): T;
  /** Write a new value to storage */
  write(data: T): void;
}
