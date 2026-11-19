/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useCDF } from "@shared/hooks/useCDF";
import { endUserSession } from "@shared/utils/userSession";
import { resetStackTo } from "@shared/utils/navigation";
import { getPreAuthRoute } from "@features/landing";

/**
 * Takes the user to the login screen when the CDF reports the session ended
 * outside a logout (a 401 or a rejected token refresh). The CDF has already
 * emptied its stores by then; this ends the app session and resets the stack.
 */
export function useSessionEndedRedirect(): void {
  const { espCDFUser, setESPCDFUser, store } = useCDF();
  const router = useRouter();

  useEffect(() => {
    if (!espCDFUser) return;
    return espCDFUser.subscribe((_user, operation, _success, data) => {
      if (operation !== "sessionEnded") return;
      console.warn("[session] ended by the SDK:", data?.reason);
      void (async () => {
        await endUserSession();
        store.groupStore.currentHomeId = null;
        setESPCDFUser(null);
        resetStackTo(router, getPreAuthRoute() as never);
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribe only when the user changes
  }, [espCDFUser]);
}
