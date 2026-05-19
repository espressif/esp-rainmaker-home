/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Transforms RMNG schedule data to unified ESPCDFSchedule with CRUD operations
 * that use @espressif/rmng-base-sdk node.getSchedules() / node.setSchedules().
 * Compatible with esp-rainmaker-home schedule store and ScheduleStoreSynchronizer
 * (operations return array of { node_id, status }).
 */

import {
    ESPCDFAPIResponse,
    ESPCDFSchedule,
    ESPCDFScheduleEditInput,
    ESPCDFScheduleOperation,
} from "@store";
import { ESPRMNGUser } from "@espressif/rmng-base-sdk";
import { SUCCESS } from "@store";

/** Response shape expected by ScheduleStoreSynchronizer (node_id + status per node). */
type NodeResult = { node_id: string; status: string };

/**
 * Transforms RMNG schedule data to ESPCDFSchedule with add, edit, remove, enable, disable
 * using rmng node.getSchedules/setSchedules. Returns responses as array of { node_id, status }
 * so ScheduleStoreSynchronizer works without changes.
 */
export function transformToESPCDFSchedule(
    schedule: Partial<ESPCDFSchedule>,
    user: ESPRMNGUser,
    identifier: string,
    groupId: string,
): ESPCDFSchedule {
    const scheduleId = schedule.id ?? `schedule_${Date.now()}`;
    const scheduleNodes = schedule.nodes ?? [];

    const performPerNode = async (
        op: "add" | "edit" | "remove" | "enable" | "disable",
        editPayload?: {
            name?: string;
            triggers?: typeof schedule.triggers;
            action?: typeof schedule.action;
            info?: string;
            flags?: number;
            validity?: { start?: number; end?: number };
            enabled?: boolean;
        }
    ): Promise<NodeResult[]> => {
        const results: NodeResult[] = [];
        const nodesToUse = op === "add" ? scheduleNodes : scheduleNodes.slice();
        for (const nodeId of nodesToUse) {
            try {
                // add is always called without editPayload; use schedule data only
                if (op === "add") {
                    const nodeAction = schedule.action?.[nodeId] ?? {};
                    const payload: any = {
                        id: scheduleId,
                        name: schedule.name,
                        enabled: true,
                        triggers: schedule.triggers,
                        action: nodeAction,
                        validity: schedule.validity,
                    };
                    await user.createSchedule(groupId, nodeId, payload);
                    results.push({ node_id: nodeId, status: SUCCESS });
                    continue;
                }

                if (op === "edit" && editPayload) {
                    const updatePayload: any = {};
                    if (editPayload.name !== undefined) updatePayload.name = editPayload.name;
                    if (editPayload.triggers !== undefined) updatePayload.triggers = editPayload.triggers;
                    if (editPayload.validity !== undefined) updatePayload.validity = editPayload.validity;
                    if (editPayload.enabled !== undefined) updatePayload.enabled = editPayload.enabled;
                    const nodeAction =
                        (editPayload.action ?? schedule.action)?.[nodeId] ??
                        schedule.action?.[nodeId];
                    if (nodeAction !== undefined) {
                        updatePayload.action = nodeAction;
                    }
                    await user.updateSchedule(groupId, nodeId, scheduleId, updatePayload);
                    results.push({ node_id: nodeId, status: SUCCESS });
                    continue;
                }

                if (op === "remove") {
                    await user.deleteSchedule(groupId, nodeId, scheduleId);
                    results.push({ node_id: nodeId, status: SUCCESS });
                    continue;
                }

                if ((op === "enable" || op === "disable")) {
                    await user.updateSchedule(groupId, nodeId, scheduleId, {
                        enabled: op === "enable",
                    });
                    results.push({ node_id: nodeId, status: SUCCESS });
                    continue;
                }
            } catch (err) {
                results.push({ node_id: nodeId, status: (err as Error)?.message ?? "error" });
            }
        }
        return results;
    };

    const asSyncResponse = (data: NodeResult[]): ESPCDFAPIResponse =>
        data as unknown as ESPCDFAPIResponse;

    const operations: ESPCDFScheduleOperation = {
        async add(): Promise<ESPCDFAPIResponse> {
            return asSyncResponse(await performPerNode("add"));
        },
        async edit(data: ESPCDFScheduleEditInput): Promise<ESPCDFAPIResponse> {
            return asSyncResponse(
                await performPerNode("edit", {
                    name: data.name,
                    triggers: data.triggers,
                    action: data.action,
                    info: data.info,
                    flags: data.flags,
                    validity: data.validity,
                    enabled: data.enabled,
                })
            );
        },
        async remove(): Promise<ESPCDFAPIResponse> {
            return asSyncResponse(await performPerNode("remove"));
        },
        async enable(): Promise<ESPCDFAPIResponse> {
            return asSyncResponse(await performPerNode("enable", { enabled: true }));
        },
        async disable(): Promise<ESPCDFAPIResponse> {
            return asSyncResponse(await performPerNode("disable", { enabled: false }));
        },
    };

    const devicesCount =
        schedule.devicesCount ??
        Object.values(schedule.action ?? {}).reduce((acc: number, deviceAction: any) => {
            acc += Object.keys(deviceAction ?? {}).length;
            return acc;
        }, 0);

    return new ESPCDFSchedule({
        id: scheduleId,
        name: schedule.name ?? "",
        info: schedule.info ?? "",
        nodes: scheduleNodes,
        triggers: schedule.triggers ?? [],
        action: schedule.action ?? {},
        enabled: schedule.enabled,
        validity: schedule.validity,
        flags: schedule.flags,
        devicesCount,
        adaptorIdentifier: identifier,
        operations: operations,
        _raw: schedule,
    });
}
