import {
  ESPRMGroup,
  ESPRMNode,
  ESPRMDevice,
  CreateGroupRequest,
  ESPRMUser,
} from "@espressif/rainmaker-base-sdk";
import { RoomTab } from "@/types/global";
import { transformNodesToDevices } from "./device";
import {
  DEFAULT_HOME_GROUP_NAME,
  ERROR_CODES_MAP,
  REJECTED_STATUS,
  GROUP_TYPE_HOME,
} from "./constants";
import { getRandom4DigitString } from "./common";

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
 * Finds a home group based on different selection strategies
 * @param groups List of all groups to search through
 * @param options Selection options
 * @param options.preferredId Optional ID to prioritize (e.g., lastSelectedHomeId)
 * @param options.preferredName Optional name to prioritize (e.g., "Home")
 * @returns The matching home group or null if none found
 *
 * Priority order:
 * 1. Group with preferredId (if provided)
 * 2. Group with preferredName (case-insensitive, if provided)
 * 3. First valid home group (type: "home" && mutuallyExclusive: true)
 */
export const findHomeGroup = (
  groups: ESPRMGroup[],
  options?: {
    preferredId?: string | null;
    preferredName?: string | null;
  }
): ESPRMGroup | null => {
  // Priority 1: Find by preferred ID (e.g., lastSelectedHomeId)
  if (options?.preferredId) {
    const groupById = groups.find((group) => group.id === options.preferredId);
    if (groupById) {
      return groupById;
    }
  }

  // Priority 2: Find by preferred name (case-insensitive, e.g., "Home")
  if (options?.preferredName) {
    const groupByName = groups.find(
      (group) =>
        group.name.trim().toLowerCase() ===
        options.preferredName?.trim().toLowerCase()
    );
    if (groupByName) {
      return groupByName;
    }
  }

  // Priority 3: Fallback to first valid home
  return groups.find(isHome) || null;
};

/**
 * Creates a new home configuration
 * @param nodeIds List of node IDs to include in the home
 * @returns New home configuration
 */
export const createHome = (nodeIds: string[] = []): CreateGroupRequest => {
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

/**
 * Categorizes groups by ownership - primary user groups vs shared groups
 * @param groups List of all groups
 * @returns Object containing primaryGroups and sharedGroups arrays
 */
export const categorizeGroupsByOwnership = (
  groups: ESPRMGroup[]
): {
  primaryGroups: ESPRMGroup[];
  sharedGroups: ESPRMGroup[];
} => {
  return groups.reduce(
    (acc, group) => {
      if (group.isPrimaryUser === true) {
        acc.primaryGroups.push(group);
      } else {
        acc.sharedGroups.push(group);
      }
      return acc;
    },
    { primaryGroups: [], sharedGroups: [] } as {
      primaryGroups: ESPRMGroup[];
      sharedGroups: ESPRMGroup[];
    }
  );
};

/**
 * Finds home groups that need mutuallyExclusive flag updated
 * Identifies groups with type "home" but mutuallyExclusive set to false
 *
 * @param groups List of groups to check
 * @returns Array of groups that need mutuallyExclusive updated to true
 */
export const getHomesNeedingMutualExclusiveUpdate = (
  groups: ESPRMGroup[]
): ESPRMGroup[] => {
  return groups.filter(
    (group) =>
      group.type === GROUP_TYPE_HOME && group.mutuallyExclusive === false
  );
};

/**
 * Ensures all home groups have mutuallyExclusive flag set to true
 *
 * This function:
 * - Identifies home groups with mutuallyExclusive: false
 * - Updates them in parallel using Promise.allSettled for optimal performance
 * - Logs failures without throwing (graceful degradation)
 * - Uses CDF interceptor pattern which updates group objects in place
 *
 * Note: Updates are reflected immediately in all references to these groups
 * due to MobX observable and CDF interceptor pattern.
 *
 * @param groups List of primary groups to check and update
 * @returns Promise that resolves when all updates complete (success or failure)
 */
export const ensureHomesAreMutuallyExclusive = async (
  groups: ESPRMGroup[]
): Promise<void> => {
  // Find groups that need mutuallyExclusive update
  const homesNeedingUpdate = getHomesNeedingMutualExclusiveUpdate(groups);

  if (homesNeedingUpdate.length === 0) {
    return;
  }

  // Update all groups in parallel using Promise.allSettled
  // CDF interceptor pattern updates the group objects in place, so changes are
  // automatically reflected in the original groups array references
  const updateResults = await Promise.allSettled(
    homesNeedingUpdate.map((group) =>
      group?.updateGroupInfo({
        mutuallyExclusive: true,
      })
    )
  );

  // Log any update failures
  updateResults.forEach((result, index) => {
    if (result.status === REJECTED_STATUS) {
      console.error(
        `Failed to update group with id ${homesNeedingUpdate[index].id}`,
        result.reason
      );
    }
  });
};

/**
 * Creates and submits a new home group with the given nodes
 *
 * Creates a default home group with:
 * - Name: "Home" (or "Home_XXXX" if withRandomSuffix is true)
 * - Type: "home"
 * - MutuallyExclusive: true
 * - Includes all specified node IDs
 *
 * @param user The user object to create the group with
 * @param nodeIds Array of node IDs to include in the home
 * @param withRandomSuffix Whether to append a random 4-digit suffix to avoid name collisions
 * @returns Promise that resolves when the group is created
 */
export const createDefaultHomeGroup = async (
  user: ESPRMUser | null,
  nodeIds: string[],
  withRandomSuffix: boolean = false
): Promise<void> => {
  const newHomePayload = createHome(nodeIds);
  if (withRandomSuffix) {
    newHomePayload.name = `${DEFAULT_HOME_GROUP_NAME}_${getRandom4DigitString()}`;
  }
  await user?.createGroup(newHomePayload);
};

/**
 * Ensures all unassigned nodes are added to a home group
 *
 * This function handles the complete flow of node assignment:
 * 1. Identifies unassigned nodes (not in any valid primary home or shared home)
 * 2. If no unassigned nodes exist, returns early
 * 3. Finds candidate home group (preferring one named "Home")
 * 4. If candidate exists: adds nodes to it
 * 5. If no candidate: creates new home with nodes
 * 6. Handles name collision (errorCode 108007) by retrying with random suffix
 *
 * @param user The user object to create groups with
 * @param nodeList List of all nodes in the account
 * @param validPrimaryHomes List of valid primary home groups (type: "home" && mutuallyExclusive: true)
 * @param sharedHomes List of shared home groups (isPrimaryUser: false)
 * @returns Promise that resolves when all nodes are assigned to a home
 * @throws Re-throws errors other than name collision (errorCode 108007)
 */
export const assignUnassignedNodesToHome = async (
  user: ESPRMUser | null,
  nodeList: ESPRMNode[],
  validPrimaryHomes: ESPRMGroup[],
  sharedHomes: ESPRMGroup[]
): Promise<void> => {
  // Get nodes that are not assigned to any valid primary home or shared home
  const unAssignedNodes: string[] = getUnassignedNodes(nodeList, [
    ...validPrimaryHomes,
    ...sharedHomes,
  ]);

  // Find a candidate group to add nodes to (preferring one named "Home")
  const candidateGroup = findHomeGroup(validPrimaryHomes, {
    preferredName: DEFAULT_HOME_GROUP_NAME,
  });

  if (candidateGroup) {
    // If candidate group exists, add unassigned nodes to it if any
    if (unAssignedNodes.length > 0) {
      await candidateGroup.addNodes(unAssignedNodes);
    }
  } else {
    // If no candidate group found, create a new home with the unassigned nodes
    // Create a new home even if unassigned nodes are empty 
    // to ensure at least one valid home exists
    try {
      await createDefaultHomeGroup(user, unAssignedNodes);
    } catch (error: any) {
      console.error("Failed to create home:", error);
      // Fallback: If failed due to name already exists (errorCode 108007),
      // create home with a randomized name to ensure at least one valid home exists
      if (
        error.errorCode &&
        error.errorCode === ERROR_CODES_MAP.GROUP_NAME_ALREADY_EXISTS_ERROR_CODE
      ) {
        const withRandomSuffix = true;
        await createDefaultHomeGroup(user, unAssignedNodes, withRandomSuffix);
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }
};
