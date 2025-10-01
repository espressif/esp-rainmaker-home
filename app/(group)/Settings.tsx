/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { StyleSheet } from "react-native";

// Styles
import { globalStyles } from "@/theme/globalStyleSheet";
import { tokens } from "@/theme/tokens";

// Hooks
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCDF } from "@/hooks/useCDF";
import { useToast } from "@/hooks/useToast";

// Icons
import { ChevronRight } from "lucide-react-native";

// Constants
import { SUCESS, ERROR_CODES_MAP } from "@/utils/constants";

// Components
import {
  Header,
  ContentWrapper,
  ScreenWrapper,
  AddUserModal,
  HomeName,
  HomeSharing,
  HomeRemove,
} from "@/components";

// Types
import { HomeUpdateResponse, GroupSharedUser } from "@/types/global";

// Utils
import {
  getRemainingDays,
  isRequestExpired,
  formatExpirationMessage,
  sortByExpirationDate,
} from "@/utils/dateUtils";
import { generateRandomId } from "@/utils/common";

/**
 * Setting Component
 *
 * Manages home settings and information.
 * Features:
 * - Edit home name
 * - Navigate to room management
 * - Remove home
 */
const Setting = () => {
  // Hooks
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams();
  const { store } = useCDF();

  // Get current home
  const home = store?.groupStore?.groupList?.find((home) => home.id === id);

  // State for dynamic primary user determination
  const [isPrimary, setIsPrimary] = useState(false);

  // State
  const [homeName, setHomeName] = useState(home?.name || "");
  const [isLoading, setIsLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<GroupSharedUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<GroupSharedUser[]>([]);
  const [sharedByUser, setSharedByUser] = useState<GroupSharedUser | null>(
    null
  );
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [isAddingUserLoading, setIsAddingUserLoading] = useState(false);
  const [removeUserLoading, setRemoveUserLoading] = useState(false);
  const [makePrimary, setMakePrimary] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [transferAndAssignRole, setTransferAndAssignRole] = useState(false);

  const norm = (s?: string) => (s || "").trim().toLowerCase();

  /**
   * Fetches the shared users
   *
   * SDK function used:
   * - ESPRMGroup.getSharingInfo
   * - ESPRMUser.getIssuedGroupSharingRequests
   */
  const getSharedUsers = async () => {
    try {
      const res = await home?.getSharingInfo({
        metadata: false,
        withSubGroups: false,
        withParentGroups: false,
      });
      if (!res) return;

      const currentUsername = norm(store?.userStore?.userInfo?.username);
      const primaryUsers = (res.primaryUsers || []).map((u) => ({
        ...u,
        username: norm(u.username),
      }));
      const secondaryUsers = (res.secondaryUsers || []).map((u) => ({
        ...u,
        username: norm(u.username),
      }));

      const isCurrentUserPrimary = primaryUsers.some(
        (u) => u.username === currentUsername
      );
      setIsPrimary(isCurrentUserPrimary);

      if (!isCurrentUserPrimary && primaryUsers.length > 0) {
        setSharedByUser({
          id: generateRandomId(),
          username: primaryUsers[0].username,
          metadata: primaryUsers[0].metadata,
        });
        setSharedUsers([]);
        setPendingUsers([]);
        return;
      }

      if (isCurrentUserPrimary) {
        const issuedSharingInfo =
          await store?.userStore?.user?.getIssuedGroupSharingRequests();

        // Extract all requests from all status categories
        let allSharingRequests: any[] = [];

        if (issuedSharingInfo?.sharedRequests) {
          const sharedRequestsObj = issuedSharingInfo.sharedRequests as any;
          allSharingRequests = Object.values(sharedRequestsObj).reduce(
            (acc: any[], curr: any) => {
              if (Array.isArray(curr)) {
                acc.push(...curr);
              }
              return acc;
            },
            []
          );
        }

        const pendingRequests = allSharingRequests
          .filter((req: any) => {
            const isPending = req.status === "pending";
            const isForThisGroup = req.groupIds?.includes(home?.id);
            const isNotExpired = !isRequestExpired(req.timestamp);
            return isPending && isForThisGroup && isNotExpired;
          })
          .map((req: any) => ({
            id: req.id || generateRandomId(),
            username: norm(req.username),
            metadata: req.metadata || {},
            requestId: req.id,
            timestamp: req.timestamp,
            remainingDays: getRemainingDays(req.timestamp),
            expirationMessage: formatExpirationMessage(req.timestamp, t),
          }));

        setPendingUsers((prev) => {
          const map = new Map<string, GroupSharedUser>();
          prev.forEach((u) => map.set(u.username, u));
          pendingRequests.forEach((u) => map.set(u.username, u));
          const mergedUsers = Array.from(map.values());

          return sortByExpirationDate(mergedUsers);
        });

        const acceptedUsers = [
          ...primaryUsers.filter((u) => u.username !== currentUsername),
          ...secondaryUsers.filter((u) => u.username !== currentUsername),
        ].map((u) => ({
          id: generateRandomId(),
          username: u.username,
          metadata: u.metadata,
        }));

        setSharedUsers(acceptedUsers);
        setSharedByUser(null);
      }
    } catch (error) {
      toast.showError(t("group.errors.errorGettingSharedUsers"));
    }
  };

  /**
   * Effect to fetch the shared users of the home
   */
  useEffect(() => {
    if (home) {
      getSharedUsers();
    }
  }, [home]);

  // Handlers
  /**
   * Validates and updates the home name
   * - Checks minimum length (3 characters)
   * - Checks maximum length (20 characters)
   * - Updates the home name if validation passes
   *
   * SDK function used:
   * - ESPRMGroup.updateGroupInfo
   */
  const handleHomeNameUpdate = async () => {
    if (homeName?.length > 0) {
      setIsLoading(true);
      home
        ?.updateGroupInfo({
          groupName: homeName,
        })
        .then((res: HomeUpdateResponse) => {
          if (res.status === SUCESS) {
            toast.showSuccess(t("group.settings.homeNameUpdatedSuccessfully"));
          } else {
            toast.showError(
              t("group.errors.homeNameUpdateFailed"),
              res.description || t("group.errors.fallback")
            );
          }
        })
        .catch((error) => {
          toast.showError(
            t("group.errors.homeNameUpdateFailed"),
            error.description || t("group.errors.fallback")
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  /**
   * Handles home deletion for primary users or leaving group for secondary users
   * - Shows confirmation dialog
   * - Deletes home (primary) or leaves group (secondary) if confirmed
   * - Shows success/error message
   * - Navigates back on success
   *
   * SDK function used:
   * - ESPRMGroup.delete (for primary users)
   * - ESPRMGroup.leave (for secondary users)
   */
  const handleRemoveHome = () => {
    setIsLoading(true);

    const action = isPrimary ? home?.delete() : home?.leave();
    const successMessage = isPrimary
      ? t("group.settings.homeRemovedSuccessfully")
      : t("group.settings.homeLeftSuccessfully");
    const errorMessage = isPrimary
      ? t("group.errors.errorRemovingHome")
      : t("group.errors.errorLeavingHome");

    action
      ?.then((res: HomeUpdateResponse) => {
        if (res.status === SUCESS) {
          toast.showSuccess(successMessage);
          router.dismiss(1);
        } else {
          toast.showError(res.description || errorMessage);
        }
      })
      .catch(() => {
        toast.showError(errorMessage);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  /**
   * Navigates to room management screen
   */
  const handleRoom = () => {
    router.push({
      pathname: "/(group)/Rooms",
      params: { id },
    } as any);
  };

  /**
   * Adds a user to the home
   *
   * SDK function used:
   * - ESPRMGroup.Share
   */
  const handleAddUser = async () => {
    setIsAddingUserLoading(true);

    try {
      if (transferAndAssignRole) {
        await home?.transfer({
          toUserName: newUserEmail,
          assignRoleToSelf: "secondary",
          metadata: {},
        });
      } else if (transfer) {
        await home?.transfer({
          toUserName: newUserEmail,
          metadata: {},
        });
      } else {
        await home?.Share({
          toUserName: newUserEmail,
          makePrimary: makePrimary,
        });
      }

      toast.showSuccess(
        transfer || transferAndAssignRole
          ? t("group.settings.transferRequestedSuccessfully")
          : t("group.settings.sharingRequestedSuccessfully")
      );
      setIsAddingUser(false);
      setNewUserEmail("");
      setMakePrimary(false);
      setTransfer(false);
      setTransferAndAssignRole(false);

      // Refresh sharing info to show pending users
      getSharedUsers();
    } catch (err: any) {
      switch (err.errorCode) {
        case ERROR_CODES_MAP.USER_NOT_FOUND:
          toast.showError(t("group.errors.userNotFound"));
          break;
        case ERROR_CODES_MAP.ADDING_SELF_NOT_ALLOWED:
          toast.showError(t("group.errors.addingSelfNotAllowed"));
          break;
        default:
          toast.showError(err.description);
          break;
      }
    } finally {
      setIsAddingUserLoading(false);
    }
  };

  /**
   * Removes a user from the home
   *
   * SDK function used:
   * - ESPRMGroup.removeSharingFor
   */
  const handleRemoveUser = (username: string) => {
    setRemoveUserLoading(true);
    home
      ?.removeSharingFor(username)
      .then(() => {
        toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));

        // Refresh sharing info to get updated list
        getSharedUsers();
      })
      .catch((err) => {
        toast.showError(err.description);
      })
      .finally(() => {
        setRemoveUserLoading(false);
      });
  };

  /**
   * Removes a pending user from the home
   *
   * SDK function used:
   * - ESPRMUser.getIssuedGroupSharingRequests
   * - ESPRMGroupSharingRequest.remove
   */
  const handleRemovePendingUser = async (username: string) => {
    try {
      setRemoveUserLoading(true);

      const issuedSharingInfo =
        await store?.userStore?.user?.getIssuedGroupSharingRequests();

      let allSharingRequests: any[] = [];

      if (issuedSharingInfo?.sharedRequests) {
        const sharedRequestsObj = issuedSharingInfo.sharedRequests as any;
        allSharingRequests = Object.values(sharedRequestsObj).reduce(
          (acc: any[], curr: any) => {
            if (Array.isArray(curr)) {
              acc.push(...curr);
            }
            return acc;
          },
          []
        );
      }

      const pendingRequest = allSharingRequests.find((req: any) => {
        const isMatchingUser = norm(req.username) === norm(username);
        const isForThisGroup = req.groupIds?.includes(home?.id);
        const isPending = req.status === "pending";
        return isMatchingUser && isForThisGroup && isPending;
      });

      if (pendingRequest) {
        await pendingRequest.remove();
        toast.showSuccess(t("group.settings.sharingRemovedSuccessfully"));

        getSharedUsers();
      } else {
        throw new Error("Pending request not found");
      }
    } catch (error) {
      toast.showError(t("group.errors.errorRemovingUser"));
    } finally {
      setRemoveUserLoading(false);
    }
  };

  /**
   * Validates an email address
   */
  const validateEmail = (email: string): boolean => {
    if (!email) {
      email = newUserEmail;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      return false;
    }
    if (!emailRegex.test(email.trim())) {
      return false;
    }
    return true;
  };

  // Render
  return (
    <>
      <Header label={home?.name || ""} showBack={true} />
      <ScreenWrapper
        style={{
          ...globalStyles.container,
          backgroundColor: tokens.colors.bg5,
        }}
        excludeTop={true}
      >
        <HomeName
          homeName={homeName}
          setHomeName={setHomeName}
          onSave={handleHomeNameUpdate}
          isSaving={isLoading}
          isPrimary={isPrimary}
          disabled={!isPrimary}
        />

        {/* Only show Room Management for primary users */}
        {isPrimary && (
          <ContentWrapper
            title={t("group.settings.roomManagement")}
            leftSlot={<ChevronRight size={20} color={tokens.colors.bg3} />}
            style={styles.contentWrapper}
            onPress={handleRoom}
          />
        )}

        <HomeSharing
          sharedUsers={sharedUsers}
          pendingUsers={pendingUsers}
          sharedByUser={sharedByUser}
          onRemoveUser={handleRemoveUser}
          onRemovePendingUser={handleRemovePendingUser}
          onAddUser={() => {
            setIsAddingUser(true);
          }}
          isPrimaryUser={isPrimary}
          isLoading={removeUserLoading || isAddingUserLoading}
        />

        <HomeRemove
          onRemove={handleRemoveHome}
          isLoading={isLoading}
          showDelete={showDelete}
          setShowDelete={setShowDelete}
          isPrimary={isPrimary}
        />

        {/* Add user modal */}
        <AddUserModal
          visible={isAddingUser}
          onClose={() => {
            setIsAddingUser(false);
            setNewUserEmail("");
            setMakePrimary(false);
            setTransfer(false);
            setTransferAndAssignRole(false);
          }}
          onAdd={handleAddUser}
          email={newUserEmail}
          handleEmailChange={(text: string) => {
            setNewUserEmail(text);
          }}
          isLoading={isAddingUserLoading}
          validateEmail={validateEmail}
          makePrimary={makePrimary}
          onMakePrimaryChange={setMakePrimary}
          transfer={transfer}
          onTransferChange={setTransfer}
          transferAndAssignRole={transferAndAssignRole}
          onTransferAndAssignRoleChange={setTransferAndAssignRole}
        />
      </ScreenWrapper>
    </>
  );
};

export default Setting;

const styles = StyleSheet.create({
  contentWrapper: {
    marginBottom: tokens.spacing._15,
    paddingBottom: tokens.spacing._15,
    backgroundColor: tokens.colors.white,
    ...globalStyles.shadowElevationForLightTheme,
  },
});
