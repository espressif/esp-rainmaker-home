/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** A plain AWS shadow document, as `/update/accepted` carries it. */
export interface CloudShadowDocument {
  state: { reported: Record<string, unknown> };
}

/**
 * Decides what of a cloud `/update/accepted` document reaches the store: the
 * document to apply, or null to drop it. The base stack keeps everything;
 * the Matter adaptor sets one that drops the cloud's copy of what a live
 * Matter link already delivered.
 */
export type CloudUpdateFilter = (
  nodeId: string,
  doc: CloudShadowDocument,
) => CloudShadowDocument | null;

const keepEveryUpdate: CloudUpdateFilter = (_nodeId, doc) => doc;

let cloudUpdateFilter: CloudUpdateFilter = keepEveryUpdate;

/**
 * Sets the filter for cloud `/update/accepted` documents.
 * @param filter - New filter, or undefined to keep every update again
 */
export function setCloudUpdateFilter(
  filter: CloudUpdateFilter | undefined,
): void {
  cloudUpdateFilter = filter ?? keepEveryUpdate;
}

/**
 * Runs the current filter on one document.
 * @param nodeId - Node the document is for
 * @param doc - Shadow document from the cloud
 * @returns The document to apply, or null to drop it
 */
export function filterCloudUpdate(
  nodeId: string,
  doc: CloudShadowDocument,
): CloudShadowDocument | null {
  return cloudUpdateFilter(nodeId, doc);
}
