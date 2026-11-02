/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNeoBase, ESPTransportMode } from "@espressif/rainmaker-neo-base-sdk";
import type { ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPRMNeoMatterBase,
  MatterSubscriptionChannelIds,
} from "@espressif/rainmaker-neo-matter-sdk";
import type { ESPRMNeoMatterBaseConfig } from "@espressif/rainmaker-neo-matter-sdk";
import type { ESPCDFUser, ESPSDKAdaptorAPIResponse } from "@store";
import { SUCESS } from "@shared/utils/constants";
import { StartupError } from "@shared/utils/startupError";
import { ESPRMNeoMatterBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { getActiveMatterFabricId } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import { isMatterNodeLocallyReachable } from "@shared/utils/matterLocalReachability";
import { ESPRMNeoBaseSDKAdaptor } from "@sdk-adaptors/ESPRMNeoBase";
import { setCloudUpdateFilter } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/cloudUpdateFilter";
import { clearParamDeliveries } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/paramDeliveryHelpers";
import type { ESPMatterSubscriptionAdapterInterface } from "@native-adaptors/contracts/matter";
import { createMatterDuplicateFilter } from "./utils/matterDuplicateFilter";
import { NEO_MATTER_DESC_SDK_INITIALIZED } from "./constants";
import { transformToESPCDFUser } from "./transformers/transformToESPCDFUser";

/**
 * Neo Matter SDK adaptor — the full Matter surface on top of the Neo base.
 *
 * Extends the Neo base adaptor rather than reimplementing it: auth, users,
 * groups and every other CDF operation are inherited unchanged, and this class
 * adds only what Matter needs. `ESPRMNeoMatterBase extends ESPRMNeoBase`, so
 * configuring it configures the base too — one `configure` call, one set of
 * statics. Safe because the base assigns its statics through explicit class
 * references, not `this`, so they land on `ESPRMNeoBase` regardless of which
 * subclass receives the call.
 *
 * Commissioning (hybrid + pure Matter), the "matter" subscription channel,
 * local Matter control and discovery adapters, and the cluster registry are
 * all passed through `getNeoMatterSDKConfig`.
 */
export class ESPRMNeoMatterBaseSDKAdaptor extends ESPRMNeoBaseSDKAdaptor {
  _identifier: string = ESPRMNeoMatterBaseAdaptorIdentifier;

  /**
   * Configures the Neo Matter SDK, which configures the Neo base underneath,
   * and registers the Matter subscription channel.
   *
   * Called by the bootstrap on the adaptor it makes active, never from the
   * constructor, so the shared native Matter layer is only ever driven by the
   * stack that owns the session.
   * @returns CDF response indicating successful initialization.
   * @throws StartupError when the Matter update channel cannot be set up; MQTT cannot replace it.
   */
  async initializeSDK(): Promise<ESPSDKAdaptorAPIResponse> {
    ESPRMNeoBase.setTransportOrder([
      ESPTransportMode.local,
      ESPTransportMode.mqtt,
    ]);

    const matterConfig = this.config as ESPRMNeoMatterBaseConfig;
    ESPRMNeoMatterBase.configure(matterConfig);
    // A filter and deliveries from an earlier start are dropped; the filter
    // is set again below on success.
    setCloudUpdateFilter(undefined);
    clearParamDeliveries();
    this._authInstance = ESPRMNeoBase.getAuthInstance();

    // Register the "matter" subscription channel.
    if (matterConfig.matterSubscriptionAdapter) {
      try {
        // `configure` starts a fresh channel list and the SDK ignores repeat
        // registration, so any error here is a real failure.
        await ESPRMNeoMatterBase.initializeMatterSubscription();

        // The channel resolves fabric ids per node before subscribing; the
        // native control adapter does its own rmNodeId → matterNodeId lookup
        // and ignores the fabric id, so the active fabric from the session
        // cache is sufficient (empty pre-sync is harmless).
        const matterChannel = ESPRMNeoMatterBase.getMatterSubscriptionChannel();
        matterChannel?.setFabricIdResolver(
          async () => getActiveMatterFabricId() ?? "",
        );

        // A hybrid is only worth taking off the fabric while it is actually on
        // the LAN; the channel leaves it to MQTT the rest of the time.
        matterChannel?.setLocalReachabilityResolver?.(isMatterNodeLocallyReachable);

        const subscriptionManager = ESPRMNeoBase.subscriptionManager as {
          getGlobalChannelOrder?: () => string[];
          setGlobalChannelOrder: (ids: string[]) => void;
        };
        const currentOrder =
          subscriptionManager.getGlobalChannelOrder?.() ?? [];
        subscriptionManager.setGlobalChannelOrder(
          Array.from(
            new Set([MatterSubscriptionChannelIds.MATTER, ...currentOrder]),
          ),
        );

        // Cloud copies of what a live Matter link already delivered are dropped.
        const linkState = matterConfig.matterSubscriptionAdapter as Pick<
          ESPMatterSubscriptionAdapterInterface,
          "isLinkLive"
        >;
        setCloudUpdateFilter(
          createMatterDuplicateFilter(
            (...nodeIds) => linkState.isLinkLive?.(...nodeIds) === true,
          ),
        );
      } catch (error) {
        console.error(
          "[ESPRMNeoMatterBaseSDKAdaptor] initializeMatterSubscription failed:",
          error,
        );
        throw new StartupError("Matter update channel could not be set up", error);
      }
    }

    return {
      status: SUCESS,
      description: NEO_MATTER_DESC_SDK_INITIALIZED,
    };
  }

  /**
   * Builds the CDF user with Matter-aware groups.
   *
   * Overriding this one seam is what makes every inherited auth path — login,
   * current-user lookup — return groups carrying the commissioning verbs. The
   * base's error mapping and session handling are untouched.
   * @param user - Neo SDK user, or null when not signed in.
   * @param initialUserId - User id read from the id token.
   * @returns CDF user whose groups expose Matter commissioning.
   */
  protected transformUser(
    user: ESPRMNeoUser | null,
    initialUserId?: string,
  ): ESPCDFUser {
    return transformToESPCDFUser(user, initialUserId);
  }
}

export { ESPRMNeoMatterBaseAdaptorIdentifier };
