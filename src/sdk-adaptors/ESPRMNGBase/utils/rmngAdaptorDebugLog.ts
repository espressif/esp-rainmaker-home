/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const PREFIX = "[rmngAdaptor]";
const MAX_STRING_PREVIEW = 48;

function preview(value: unknown): string | number | boolean | null | undefined {
    if (value == null) {
        return value as null | undefined;
    }
    if (typeof value === "string") {
        return value.length <= MAX_STRING_PREVIEW
            ? value
            : `${value.slice(0, MAX_STRING_PREVIEW)}…(${value.length}c)`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return `[array:${value.length}]`;
    }
    if (typeof value === "object") {
        return `{obj:${Object.keys(value as object).length}k}`;
    }
    return String(value);
}

function summarizeFabricDetails(details: unknown): Record<string, unknown> | undefined {
    if (details == null || typeof details !== "object") {
        return undefined;
    }

    const d = details as Record<string, unknown>;
    const rootCa = d.root_ca ?? d.rootCa;
    const rootCaStr = typeof rootCa === "string" ? rootCa : "";

    return {
        fabric_id: preview(d.fabric_id ?? d.fabricId),
        has_root_ca: rootCaStr.length > 0,
        root_ca_len: rootCaStr.length,
        has_ipk: Boolean(d.ipk),
        group_cat_id_operate: preview(d.group_cat_id_operate ?? d.groupCatIdOperate),
        group_cat_id_admin: preview(d.group_cat_id_admin ?? d.groupCatIdAdmin),
        matter_user_id: preview(d.matter_user_id ?? d.matterUserId),
        user_cat_id: preview(d.user_cat_id ?? d.userCatId),
    };
}

function summarizeCapabilities(capabilities: unknown): string[] | undefined {
    if (capabilities == null) {
        return undefined;
    }
    if (Array.isArray(capabilities)) {
        return capabilities.map((item) => preview(item) as string);
    }
    if (typeof capabilities === "object") {
        return Object.keys(capabilities as object);
    }
    return [String(capabilities)];
}

function snapshotSdkGroupOrFabric(item: unknown): unknown {
    if (item == null || typeof item !== "object") {
        return item;
    }

    const g = item as {
        groupId?: unknown;
        groupName?: unknown;
        accessType?: unknown;
        parentId?: unknown;
        nodeIds?: unknown;
        node_ids?: unknown;
        nodeDetails?: unknown;
        subgroups?: unknown[];
        capabilities?: unknown;
        fabricDetails?: unknown;
    };

    const nodeIdsList = Array.isArray(g.nodeIds)
        ? g.nodeIds
        : Array.isArray(g.node_ids)
          ? g.node_ids
          : [];

    return {
        groupId: g.groupId,
        groupName: g.groupName,
        accessType: g.accessType,
        parentId: g.parentId,
        nodeIds: nodeIdsList.map((id) => preview(id)),
        nodeDetails: snapshotNodeDetailsRecord(g.nodeDetails),
        fabricDetails: summarizeFabricDetails(g.fabricDetails),
        capabilities: summarizeCapabilities(g.capabilities),
        subgroupsCount: Array.isArray(g.subgroups) ? g.subgroups.length : 0,
        subgroups: Array.isArray(g.subgroups)
            ? g.subgroups.map(snapshotSdkGroupOrFabric)
            : undefined,
    };
}

function snapshotNodeDetailsRecord(
    nodeDetails: unknown,
): Record<string, unknown> | undefined {
    if (nodeDetails == null || typeof nodeDetails !== "object") {
        return undefined;
    }

    const out: Record<string, unknown> = {};
    for (const [nodeId, info] of Object.entries(
        nodeDetails as Record<string, unknown>,
    )) {
        if (info == null || typeof info !== "object") {
            out[nodeId] = preview(info);
            continue;
        }
        const record = info as Record<string, unknown>;
        const caps = summarizeCapabilities(record.capabilities);
        const capDetails =
            record.capability_details && typeof record.capability_details === "object"
                ? (record.capability_details as Record<string, unknown>)
                : undefined;
        const matterDetail =
            capDetails?.matter && typeof capDetails.matter === "object"
                ? (capDetails.matter as Record<string, unknown>)
                : undefined;
        const legacyMatter =
            record.capabilities &&
            typeof record.capabilities === "object" &&
            !Array.isArray(record.capabilities)
                ? ((record.capabilities as Record<string, unknown>).matter as
                      | Record<string, unknown>
                      | undefined)
                : undefined;
        out[nodeId] = {
            capabilities: caps,
            matter_node_id: preview(
                matterDetail?.matter_node_id ??
                    matterDetail?.matterNodeId ??
                    legacyMatter?.matter_node_id ??
                    legacyMatter?.matterNodeId,
            ),
        };
    }
    return out;
}

function snapshotRawApiGroup(group: unknown): unknown {
    if (group == null || typeof group !== "object") {
        return group;
    }

    const g = group as Record<string, unknown>;
    return {
        group_id: g.group_id,
        group_name: g.group_name,
        node_ids: Array.isArray(g.node_ids)
            ? g.node_ids.map((id) => preview(id))
            : [],
        node_details: snapshotNodeDetailsRecord(g.node_details),
        matter: summarizeFabricDetails(g.matter),
        capabilities: summarizeCapabilities(g.capabilities),
    };
}

function snapshotRawApiResponse(raw: unknown): unknown {
    if (raw == null || typeof raw !== "object") {
        return raw;
    }

    const response = raw as { groups?: unknown[] };
    return {
        groupsCount: Array.isArray(response.groups) ? response.groups.length : 0,
        groups: Array.isArray(response.groups)
            ? response.groups.map(snapshotRawApiGroup)
            : undefined,
    };
}

function summarizePayload(payload: unknown): unknown {
    if (payload == null) {
        return payload;
    }

    if (Array.isArray(payload)) {
        return payload.map(snapshotSdkGroupOrFabric);
    }

    if (typeof payload !== "object") {
        return payload;
    }

    const record = payload as Record<string, unknown>;

    if ("rawApiResponse" in record || "sdkGroups" in record) {
        return {
            rawApiResponse: snapshotRawApiResponse(record.rawApiResponse),
            sdkGroups: Array.isArray(record.sdkGroups)
                ? record.sdkGroups.map(snapshotSdkGroupOrFabric)
                : snapshotSdkGroupOrFabric(record.sdkGroups),
            ...(record.groupId != null ? { groupId: record.groupId } : {}),
            ...(record.groupName != null ? { groupName: record.groupName } : {}),
            ...(record.resolvedFabricDetails != null
                ? {
                      resolvedFabricDetails: summarizeFabricDetails(
                          record.resolvedFabricDetails,
                      ),
                  }
                : {}),
            ...(record.sdkFabricDetails != null
                ? {
                      sdkFabricDetails: summarizeFabricDetails(
                          record.sdkFabricDetails,
                      ),
                  }
                : {}),
            ...(record.rawApiGroup != null
                ? { rawApiGroup: snapshotRawApiGroup(record.rawApiGroup) }
                : {}),
        };
    }

    return snapshotSdkGroupOrFabric(payload);
}

function logSummary(tag: string, source: string, payload: unknown): void {
    const summary = summarizePayload(payload);
    console.log(`${PREFIX} ${tag} ${source} ${JSON.stringify(summary)}`);
}

/** Raw getGroups / fabric payloads — compact summary only (no certs or nested dumps). */
export function logRmngGroupsFabricsRaw(source: string, payload: unknown): void {
    logSummary("[groups-fabrics]", source, payload);
}

function summarizeNodeConfig(payload: unknown): unknown {
    if (payload == null || typeof payload !== "object") {
        return preview(payload);
    }

    const record = payload as Record<string, unknown>;
    const keys = Object.keys(record);
    const summary: Record<string, unknown> = {
        topLevelKeys: keys,
    };

    if (record.Matter != null && typeof record.Matter === "object") {
        const matter = record.Matter as Record<string, unknown>;
        summary.Matter = {
            keys: Object.keys(matter),
            endpointsCount:
                matter.endpoints && typeof matter.endpoints === "object"
                    ? Object.keys(matter.endpoints as object).length
                    : 0,
        };
    }

    if (record.Info != null && typeof record.Info === "object") {
        const info = record.Info as Record<string, unknown>;
        summary.Info = {
            keys: Object.keys(info),
            node_id: preview(info.node_id ?? info.nodeId),
        };
    }

    if (Array.isArray(record.devices)) {
        summary.devicesCount = record.devices.length;
    }

    if (record.endpoints != null && typeof record.endpoints === "object") {
        summary.endpointsCount = Object.keys(record.endpoints as object).length;
    }

    if (record.data_model != null) {
        summary.data_model = preview(record.data_model);
    }

    if (record.config != null && typeof record.config === "object") {
        const inner = record.config as Record<string, unknown>;
        summary.configKeys = Object.keys(inner);
        if (Array.isArray(inner.devices)) {
            summary.configDevicesCount = inner.devices.length;
        }
        if (inner.data_model != null) {
            summary.configDataModel = preview(inner.data_model);
        }
        if (inner.endpoints != null && typeof inner.endpoints === "object") {
            summary.configEndpointsCount = Object.keys(inner.endpoints as object)
                .length;
        }
    }

    return summary;
}

function summarizeDeviceParams(payload: unknown): unknown {
    if (payload == null || typeof payload !== "object") {
        return preview(payload);
    }

    const record = payload as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        out[key] = preview(value);
    }
    return out;
}

/** Node config/schema summary at CDF build (no full cloud config dump). */
export function logRmngNodeConfigRaw(
    source: string,
    nodeId: string,
    payload: unknown,
    extra?: Record<string, unknown>,
): void {
    const summary: Record<string, unknown> = {
        nodeId,
        payload: summarizeNodeConfig(payload),
    };
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            summary[key] = preview(value);
        }
    }
    console.log(
        `${PREFIX} [node-config] ${source} ${JSON.stringify(summary)}`,
    );
}

/** Device param values summary (names + short previews only). */
export function logRmngDeviceParamsRaw(
    source: string,
    nodeId: string,
    transport: "mqtt" | "matter" | "sdk-getParams" | "initial",
    payload: unknown,
    extra?: Record<string, unknown>,
): void {
    const summary: Record<string, unknown> = {
        nodeId,
        transport,
        payload: summarizeDeviceParams(payload),
    };
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            summary[key] = preview(value);
        }
    }
    console.log(
        `${PREFIX} [device-params] ${source} ${JSON.stringify(summary)}`,
    );
}
