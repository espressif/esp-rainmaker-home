/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useToastController } from "@tamagui/toast";
import {
  TOAST_TYPE_SUCCESS,
  TOAST_TYPE_ERROR,
  TOAST_TYPE_WARNING,
} from "@/utils/constants";

export interface ToastOptions {
  duration?: number;
  persistent?: boolean;
}

export const useToast = () => {
  const toast = useToastController();

  const showSuccessToast = (
    title: string,
    message?: string,
    options?: ToastOptions
  ) => {
    toast.show(title, {
      message,
      customData: {
        type: TOAST_TYPE_SUCCESS,
      },
      duration: options?.persistent ? 0 : options?.duration || 2500,
    });
  };

  const showErrorToast = (
    title: string,
    message?: string,
    options?: ToastOptions
  ) => {
    toast.show(title, {
      message,
      customData: {
        type: TOAST_TYPE_ERROR,
      },
      duration: options?.persistent ? 0 : options?.duration || 2500,
    });
  };

  const showWarningToast = (
    title: string,
    message?: string,
    options?: ToastOptions
  ) => {
    toast.show(title, {
      message,
      customData: {
        type: TOAST_TYPE_WARNING,
      },
      duration: options?.persistent ? 0 : options?.duration || 2500,
    });
  };

  const showInfoToast = (
    title: string,
    message?: string,
    options?: ToastOptions
  ) => {
    toast.show(title, {
      message,
      customData: {
        type: "info",
      },
      duration: options?.persistent ? 0 : options?.duration || 2500,
    });
  };

  return {
    showSuccess: showSuccessToast,
    showError: showErrorToast,
    showWarning: showWarningToast,
    showInfo: showInfoToast,
  };
};
