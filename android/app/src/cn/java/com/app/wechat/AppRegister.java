/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.wechat;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.app.BuildConfig;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

/**
 * Handles WeChat's ACTION_REFRESH_WXAPP broadcast so registration stays alive
 * across process restarts. CN-flavor only.
 */
public class AppRegister extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        final IWXAPI api = WXAPIFactory.createWXAPI(context, null, false);
        api.registerApp(BuildConfig.WECHAT_APP_ID);
    }
}
