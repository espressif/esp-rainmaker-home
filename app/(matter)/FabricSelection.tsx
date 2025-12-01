/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  DeviceEventEmitter,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

// Theme and Styles
import { tokens } from "@/theme/tokens";
import { globalStyles } from "@/theme/globalStyleSheet";

// Components
import { ScreenWrapper, Header } from "@/components";

// Hooks
import { useToast } from "@/hooks/useToast";
import { useCDF } from "@/hooks/useCDF";

// Types
import { ESPRMGroup } from "@espressif/rainmaker-base-sdk";
import {
  ESPCommissioningResponse,
  ESPRMFabric,
} from "@espressif/rainmaker-matter-sdk";
import { ESPMatterUtilityAdapter } from "@/adaptors/implementations/ESPMatterUtilityAdapter";
import {
  DEFAULT_MATTER_DEVICE_NAME,
  MATTER_COMMISSIONING_EVENT,
  MATTER_EVENT_COMMISSIONING_COMPLETE,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE,
  MATTER_EVENT_COMMISSIONING_ERROR,
  MATTER_STATUS_PREPARING,
  MATTER_STATUS_PREPARING_FABRIC,
  MATTER_STATUS_STARTING_COMMISSIONING,
} from "@/utils/constants";
import {
  categorizeGroupsByOwnership,
  ensureHomesAreMutuallyExclusive,
  getValidHomes,
} from "@/utils/home";

const FabricSelection = () => {
  const { qrData } = useLocalSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { esprmUser, fetchNodesAndGroups } = useCDF();
  const [groupsAndFabrics, setGroupsAndFabrics] = useState<
    (ESPRMGroup | ESPRMFabric)[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCommissioning, setIsCommissioning] = useState(false);
  const [commissioningStatus, setCommissioningStatus] = useState<string>(
    MATTER_STATUS_PREPARING
  );

  useEffect(() => {
    loadGroupsAndFabrics();
  }, []);

  useEffect(() => {
    const commissioningCompleteListener = DeviceEventEmitter.addListener(
      MATTER_COMMISSIONING_EVENT,
      (event: any) => {
        if (event.eventType === MATTER_EVENT_COMMISSIONING_COMPLETE) {
          handleCommissioningComplete(event);
        } else if (
          event.eventType === MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE
        ) {
          handleConfirmResponse(event);
        } else if (event.eventType === MATTER_EVENT_COMMISSIONING_ERROR) {
          handleCommissioningFailure(event?.errorMessage);
        }
      }
    );

    return () => {
      commissioningCompleteListener.remove();
    };
  }, []);

  const handleCommissioningComplete = async (event: any) => {
    const deviceName = event.deviceName ?? DEFAULT_MATTER_DEVICE_NAME;

    setIsCommissioning(false);
    setCommissioningStatus(MATTER_STATUS_PREPARING);

    toast.showSuccess(`Device "${deviceName}" commissioned successfully!`);

    try {
      // Refresh nodes and groups to show the newly commissioned device
      const shouldFetchFirstPage = true;
      await fetchNodesAndGroups(shouldFetchFirstPage);

      // On Android, also refresh groups and fabrics to update the fabric selection list
      if (Platform.OS === "android") {
        await loadGroupsAndFabrics();
      }

      // Navigate to home screen after successful commissioning and data refresh
      router.dismissTo("/(group)/Home");
    } catch (error) {
      console.error(
        "[FabricSelection] Failed to refresh nodes after commissioning:",
        error
      );
      // Still navigate to home even if refresh failed - the node is commissioned
      router.dismissTo("/(group)/Home");
    }
  };

  const handleCommissioningFailure = (message?: string) => {
    const failureMessage =
      message && message.trim().length > 0
        ? message
        : "Matter node confirmation failed. Please try again.";

    toast.showError("Matter commissioning failed", failureMessage);
    setIsCommissioning(false);
    setCommissioningStatus(MATTER_STATUS_PREPARING);

    setTimeout(() => {
      router.dismissTo("/(group)/Home");
    }, 500);
  };

  const handleConfirmResponse = (event: any) => {
    const status = String(event?.status || "").toLowerCase();
    if (status && status !== "success") {
      const description =
        event?.description ||
        event?.errorMessage ||
        "Invalid challenge response.";
      handleCommissioningFailure(description);
    }
  };

  const loadGroupsAndFabrics = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!esprmUser) {
        throw new Error("No authenticated user found. Please login first.");
      }

      const response = await esprmUser.getGroupsAndFabrics();

      const allItems = [...response.fabrics, ...response.groups];

      const { primaryGroups } = categorizeGroupsByOwnership(allItems);
      await ensureHomesAreMutuallyExclusive(primaryGroups, true);
      const validPrimaryHomes = getValidHomes(primaryGroups);

      if (validPrimaryHomes.length > 0) {
        setGroupsAndFabrics(validPrimaryHomes);
      } else {
        setError("No groups or fabrics found. Please create a group first.");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load groups and fabrics: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = async (item: ESPRMGroup | ESPRMFabric) => {
    try {
      setIsCommissioning(true);
      setCommissioningStatus(MATTER_STATUS_PREPARING_FABRIC);
      setError(null);

      if (!esprmUser) {
        throw new Error("No authenticated user found. Please login first.");
      }

      const fabricForCommissioning =
        await esprmUser.prepareFabricForMatterCommissioning(item);
      setCommissioningStatus(MATTER_STATUS_STARTING_COMMISSIONING);

      const isUserNocAvailableForFabric =
        await ESPMatterUtilityAdapter.isUserNocAvailableForFabric(
          fabricForCommissioning.fabricId || ""
        );

      if (!isUserNocAvailableForFabric) {
        const response = await fabricForCommissioning.issueUserNoC();
        const groupIdFromResponse = response.certificates?.at(0)?.groupId || "";
        if (groupIdFromResponse !== (item as ESPRMFabric).id) {
          throw new Error("Fabric ID mismatch between response and fabric");
        }

        const fabricDetails =
          fabricForCommissioning.fabricDetails || ({} as any);
        const userNoc = response.certificates?.at(0)?.userNoC || "";
        const rootCa = fabricDetails?.rootCa || fabricDetails?.root_ca || "";
        const matterUserId =
          fabricDetails?.matterUserId || fabricDetails?.matter_user_id || "";

        if (!userNoc || !rootCa || !matterUserId) {
          throw new Error(
            "Missing required fabric details (userNOC/rootCa/matterUserId) for pre-commission storage"
          );
        }

        await ESPMatterUtilityAdapter.storePrecommissionInfo({
          groupId: fabricForCommissioning.id,
          fabricId: fabricForCommissioning.fabricId || "",
          name: fabricForCommissioning.name,
          userNoc,
          matterUserId,
          rootCa,
          ipk: fabricDetails?.ipk,
          groupCatIdOperate:
            fabricDetails?.groupCatIdOperate ||
            fabricDetails?.group_cat_id_operate,
          groupCatIdAdmin:
            fabricDetails?.groupCatIdAdmin || fabricDetails?.group_cat_id_admin,
          userCatId: fabricDetails?.userCatId || fabricDetails?.user_cat_id,
        });
      }

      const progressLogger = (message: ESPCommissioningResponse) => {
        // Update UI with progress messages from the SDK
        if (message.description) {
          setCommissioningStatus(message.description);
        }
      };
      await fabricForCommissioning.startCommissioning(
        qrData as string,
        progressLogger
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.showError(`Failed to start commissioning: ${errorMessage}`);

      setIsCommissioning(false);
      setCommissioningStatus("Preparing...");
    }
  };

  const renderItem = ({ item }: { item: ESPRMGroup | ESPRMFabric }) => (
    <TouchableOpacity
      style={[styles.item, globalStyles.shadowElevationForLightTheme]}
      onPress={() => handleItemPress(item)}
    >
      <View style={styles.itemContent}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemType}>
          {item.isMatter ? "Matter Fabric" : "Group (can convert to fabric)"}
        </Text>
        <Text style={styles.itemId}>ID: {item.id}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading || isCommissioning) {
    const loadingMessage = loading
      ? "Loading groups and fabrics..."
      : "Commissioning device...";

    return (
      <>
        <Header label="Fabric Selection" />
        <ScreenWrapper style={styles.screenWrapper}>
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={tokens.colors.primary} />
            <Text style={styles.loadingText}>{loadingMessage}</Text>
            {isCommissioning && (
              <Text style={styles.commissioningStatusText}>
                {commissioningStatus}
              </Text>
            )}
          </View>
        </ScreenWrapper>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header label="Fabric Selection" />
        <ScreenWrapper style={styles.screenWrapper}>
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>Error: {error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadGroupsAndFabrics}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </ScreenWrapper>
      </>
    );
  }

  return (
    <>
      <Header label="Fabric Selection" />
      <ScreenWrapper style={styles.screenWrapper}>
        <Text style={styles.subtitle}>
          Choose a group or fabric to commission the device
        </Text>

        {groupsAndFabrics.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>No groups or fabrics found</Text>
            <Text style={styles.emptySubtext}>
              Create a group first to commission Matter devices
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupsAndFabrics}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id || `item-${index}`}
            style={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ScreenWrapper>
    </>
  );
};

/**
 * Stylesheet for FabricSelection component
 *
 * Uses design tokens for consistency with the app's design system:
 * - Colors, spacing, fonts, and radii from tokens
 * - Shadow elevations from global styles
 * - Responsive design for different screen sizes
 */
const styles = StyleSheet.create({
  screenWrapper: {
    padding: tokens.spacing._15,
    backgroundColor: tokens.colors.bg5,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing._20,
  },
  subtitle: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    marginBottom: tokens.spacing._20,
    textAlign: "center",
    fontFamily: tokens.fonts.regular,
  },
  loadingText: {
    marginTop: tokens.spacing._15,
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.regular,
  },
  commissioningStatusText: {
    marginTop: tokens.spacing._10,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.primary,
    fontFamily: tokens.fonts.medium,
    textAlign: "center",
  },
  errorText: {
    fontSize: tokens.fontSize.md,
    color: tokens.colors.error,
    textAlign: "center",
    marginBottom: tokens.spacing._15,
    fontFamily: tokens.fonts.regular,
  },
  retryButton: {
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: tokens.spacing._20,
    paddingVertical: tokens.spacing._15,
    borderRadius: tokens.radius.md,
  },
  retryButtonText: {
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fonts.medium,
  },
  emptyText: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    marginBottom: tokens.spacing._15,
    fontFamily: tokens.fonts.medium,
  },
  emptySubtext: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text_secondary,
    textAlign: "center",
    fontFamily: tokens.fonts.regular,
  },
  list: {
    flex: 1,
  },
  item: {
    backgroundColor: tokens.colors.white,
    marginVertical: tokens.spacing._5,
    borderRadius: tokens.radius.md,
  },
  itemContent: {
    padding: tokens.spacing._15,
  },
  itemName: {
    fontSize: tokens.fontSize.lg,
    fontFamily: tokens.fonts.medium,
    color: tokens.colors.text_primary,
    marginBottom: tokens.spacing._5,
  },
  itemType: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.primary,
    marginBottom: tokens.spacing._5,
    fontFamily: tokens.fonts.medium,
  },
  itemId: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text_secondary,
    fontFamily: tokens.fonts.regular,
  },
});

export default FabricSelection;
