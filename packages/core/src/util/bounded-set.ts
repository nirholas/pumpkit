// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/pumpkit

/**
 * A set that forgets its oldest entries once it holds `capacity` of them.
 * Used to de-duplicate transaction signatures without growing forever.
 */
export class BoundedSet<T> {
    private readonly items = new Set<T>();

    constructor(private readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1) {
            throw new RangeError(`BoundedSet capacity must be a positive integer, got ${capacity}`);
        }
    }

    get size(): number {
        return this.items.size;
    }

    has(value: T): boolean {
        return this.items.has(value);
    }

    /** Add `value`. Returns `false` when it was already present. */
    add(value: T): boolean {
        if (this.items.has(value)) return false;
        this.items.add(value);
        if (this.items.size > this.capacity) {
            const oldest = this.items.values().next().value as T;
            this.items.delete(oldest);
        }
        return true;
    }
}
