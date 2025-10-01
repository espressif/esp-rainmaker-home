import { ESPRMGroup, ESPRMNode, ESPRMDevice, CreateGroupRequest } from "@espressif/rainmaker-base-sdk";
import { RoomTab } from "@/types/global";
import { transformNodesToDevices } from "./device";
import { DEFAULT_HOME_GROUP_NAME, GROUP_TYPE_HOME } from "./constants";


/**
 * Validates and sanitizes home data
 * @param home The home group to validate
 * @returns Validated home data or null
 */
export const validateHomeData = (home: ESPRMGroup | null): ESPRMGroup | null => {
    if (!home) return null;
    return {
        ...home,
        nodes: Array.isArray(home.nodes) ? home.nodes : [],
        subGroups: Array.isArray(home.subGroups) ? home.subGroups : [],
    };
};

/**
 * Gets valid nodes for a home
 * @param home home data
 * @param nodeList List of all nodes
 * @returns Array of valid nodes for the home
 */
export const getHomeNodes = (
    home: ESPRMGroup | null,
    nodeList: ESPRMNode[] | undefined
): ESPRMNode[] => {
    if (!home?.nodes || !nodeList) {
        return [];
    }
    return nodeList.filter((node) =>
        home?.nodes?.includes(node.id)
    );
};

/**
 * Creates room tabs from home data
 * @param home Validated home data
 * @param defaultTabs Default tabs to include
 * @returns Array of room tabs
 */
export const createRoomTabs = (
    home: ESPRMGroup | null,
    defaultTabs: RoomTab[]
): RoomTab[] => {
    if (!home?.subGroups) {
        return defaultTabs;
    }
    return [
        ...defaultTabs,
        ...home.subGroups.map((room) => ({
            label: room.name.trim() || 'Unnamed Room',
            id: room.id,
        })),
    ];
};

/**
 * Gets devices for a room
 * @param selectedRoom Selected room tab
 * @param rooms List of all rooms
 * @param nodeList List of all nodes
 * @param devices List of all devices
 * @returns Array of devices for the room
 */
export const getFilteredDevices = (
    selectedRoom: RoomTab | null,
    rooms: ESPRMGroup[],
    nodeList: ESPRMNode[] | undefined,
    devices: (ESPRMDevice & { node: WeakRef<ESPRMNode> })[]
): (ESPRMDevice & { node: WeakRef<ESPRMNode> })[] => {
    try {
        if (!selectedRoom || !nodeList) {
            return [];
        }

        if (selectedRoom.id === "common") {
            return devices;
        }

        const selectedRoomData = rooms.find((room) => room.id === selectedRoom.id);
        if (!selectedRoomData) {
            return [];
        }

        const roomNodeIds = selectedRoomData.nodes || [];
        const roomNodes = nodeList.filter((node) =>
            roomNodeIds.includes(node.id)
        );
        return transformNodesToDevices(roomNodes);
    } catch (error) {
        console.error('Error filtering devices:', error);
        return [];
    }
};

/**
 * Checks if a group is a valid home group
 * @param group The group to check
 * @returns boolean indicating if the group is a valid home group
 */
export const isHome = (group: ESPRMGroup): boolean => {
    return group.type === GROUP_TYPE_HOME && group.mutuallyExclusive === true;
};

/**
 * Finds the primary home from a list of groups
 * @param groups List of all groups
 * @returns The primary home or null if none found
 */
export const findPrimaryHome = (groups: ESPRMGroup[], lastSelectedHomeId: string | null): ESPRMGroup | null => {

    // First, look for a group with the id of lastSelectedHomeId
    const lastSelectedHomeInfo = groups.find(group => group.id === lastSelectedHomeId);

    if(lastSelectedHomeInfo) {
        return lastSelectedHomeInfo;
    }

    return groups.find(isHome) || null;
};

/**
 * Creates a new home configuration
 * @param nodeIds List of node IDs to include in the home
 * @returns New home configuration
 */
export const createHome = (nodeIds: string[] = []): Partial<CreateGroupRequest> => {
    return {
        name: DEFAULT_HOME_GROUP_NAME,
        type: GROUP_TYPE_HOME,
        mutuallyExclusive: true,
        nodeIds: nodeIds,
        description: "",
        customData: {},
    };
};

/**
 * Updates an existing group to be a valid home
 * @param group The group to update
 * @returns Updated group configuration
 */
export const updateToHome = (): Partial<ESPRMGroup> => {
    return {
        type: GROUP_TYPE_HOME,
        mutuallyExclusive: true,
    };
};

/**
 * Gets nodes that don't belong to any group
 * @param allNodes List of all nodes
 * @param groups List of all groups
 * @returns Array of unassigned node IDs
 */
export const getUnassignedNodes = (
    allNodes: ESPRMNode[],
    groups: ESPRMGroup[]
): string[] => {
    // Get all node IDs that are assigned to any group
    const assignedNodeIds = new Set(
        groups.flatMap(group => group.nodes || [])
    );

    // Return nodes that aren't in the assigned set
    return allNodes
        .filter(node => !assignedNodeIds.has(node.id))
        .map(node => node.id);
};

/**
 * Gets all valid homes from a list of groups
 * @param groups List of all groups
 * @returns Array of valid homes
 */
export const getValidHomes = (groups: ESPRMGroup[]): ESPRMGroup[] => {
    return groups.filter(isHome);
};
