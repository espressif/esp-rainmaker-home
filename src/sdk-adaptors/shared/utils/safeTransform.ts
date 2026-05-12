/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Coerces `raw` to an array (otherwise empty), maps each element with `mapItem`, and collects
 * results. If `mapItem` throws for an index, `onItemSkipped` runs and that element is omitted.
 * Used so partial SDK payloads (missing or bad entries) do not fail the whole list transform.
 * @param raw - SDK list or unknown (non-arrays become no-op).
 * @param context - Short label forwarded to `onItemSkipped` (e.g. transform stage).
 * @param mapItem - Maps one SDK element to CDF; may throw to skip only that element.
 * @param onItemSkipped - Called when `mapItem` throws for `items[index]`.
 * @param options - Optional `skipElement` to omit indices without calling `mapItem` or `onItemSkipped`.
 * @returns Mapped values in source order, excluding skipped indices.
 */
export function safeTransform<TIn, TOut>(
    raw: unknown,
    context: string,
    mapItem: (item: TIn, index: number) => TOut,
    onItemSkipped: (detail: { index: number; context: string; error: unknown }) => void,
    options?: { skipElement?: (item: TIn | undefined, index: number) => boolean },
): TOut[] {
    const sdkItems = Array.isArray(raw) ? raw : [];
    const cdfItems: TOut[] = [];
    const skipElement = options?.skipElement;

    for (let index = 0; index < sdkItems.length; index += 1) {
        const item = sdkItems[index] as TIn | undefined;
        if (skipElement?.(item, index)) {
            continue;
        }
        try {
            cdfItems.push(mapItem(item as TIn, index));
        } catch (error) {
            onItemSkipped({ index, context, error });
        }
    }

    return cdfItems;
}
