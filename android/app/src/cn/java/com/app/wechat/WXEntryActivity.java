/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package com.app.wechat;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.tencent.mm.opensdk.constants.ConstantsAPI;
import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

/**
 * WXEntryActivity — WeChat's required callback activity.
 *
 * WeChat delivers auth results to the component named
 * {@code <applicationId>.wxapi.WXEntryActivity}. Rather than couple this class
 * to the (configurable) applicationId, it lives in the stable {@code com.app.wechat}
 * package and the manifest maps the WeChat-required name to it with an
 * {@code <activity-alias>}. So changing ANDROID_APP_APPLICATION_ID does not break
 * the callback.
 *
 * On receiving the auth code it resolves the pending JS promise via
 * {@link ESPWeChatModule} and finishes; the RainMaker Base SDK then exchanges
 * the code for tokens on the JS side ({@code loginWithOauthCode}).
 */
public class WXEntryActivity extends Activity implements IWXAPIEventHandler {

    private static final String TAG = "WXEntryActivity";
    private IWXAPI api;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        api = WXAPIFactory.createWXAPI(this, ESPWeChatModule.WECHAT_APP_ID);
        api.handleIntent(getIntent(), this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        api.handleIntent(intent, this);
    }

    @Override
    public void onReq(BaseReq baseReq) {
        // No incoming requests from WeChat are expected for the login flow.
    }

    @Override
    public void onResp(BaseResp baseResp) {
        Log.d(TAG, "onResp type=" + baseResp.getType() + " errCode=" + baseResp.errCode);

        if (baseResp.getType() != ConstantsAPI.COMMAND_SENDAUTH) {
            finish();
            return;
        }

        switch (baseResp.errCode) {
            case BaseResp.ErrCode.ERR_OK:
                break;
            case BaseResp.ErrCode.ERR_USER_CANCEL:
                notifyError("WECHAT_CANCELLED: User cancelled WeChat login");
                finish();
                return;
            case BaseResp.ErrCode.ERR_AUTH_DENIED:
                notifyError("WECHAT_AUTH_DENIED: User denied WeChat login");
                finish();
                return;
            default:
                notifyError("WECHAT_AUTH_FAILED: errCode=" + baseResp.errCode
                        + " errStr=" + baseResp.errStr);
                finish();
                return;
        }

        String code = ((SendAuth.Resp) baseResp).code;
        Log.d(TAG, "WeChat auth code received");
        ESPWeChatModule module = ESPWeChatModule.instance;
        if (module != null) {
            module.resolveWithCode(code);
        } else {
            Log.e(TAG, "ESPWeChatModule instance is null on auth code");
        }
        finish();
    }

    private void notifyError(String error) {
        ESPWeChatModule module = ESPWeChatModule.instance;
        if (module != null) {
            module.rejectLogin(error);
        } else {
            Log.e(TAG, "ESPWeChatModule instance null, cannot notify error: " + error);
        }
    }
}
