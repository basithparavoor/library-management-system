package com.tgi.library;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

public class WebAppInterface {
    private final MainActivity activity;
    private final WebView webView;

    public WebAppInterface(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void showToast(String toast) {
        activity.runOnUiThread(() -> Toast.makeText(activity, toast, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void playHapticFeedback(String type) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if ("error".equalsIgnoreCase(type)) {
                        v.vibrate(VibrationEffect.createWaveform(new long[]{0, 80, 50, 80}, -1));
                    } else {
                        v.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
                    }
                } else {
                    v.vibrate(50);
                }
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void updateInstitutionBranding(String logoUrl, String instName, String tagline) {
        try {
            SharedPreferences prefs = activity.getSharedPreferences("TGI_LIBRARY_PREFS", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("INSTITUTION_LOGO", logoUrl)
                .putString("INSTITUTION_NAME", instName)
                .putString("INSTITUTION_TAGLINE", tagline)
                .apply();
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void printDocument(String title) {
        activity.runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (printManager != null) {
                    PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(title != null ? title : "TGI_Library_Document");
                    PrintAttributes.Builder builder = new PrintAttributes.Builder();
                    builder.setMediaSize(PrintAttributes.MediaSize.ISO_A4);
                    printManager.print(title != null ? title : "TGI_Library_Document", printAdapter, builder.build());
                }
            } catch (Exception e) {
                Toast.makeText(activity, "Print service unavailable: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void postNativeNotification(String title, String message, String type, String actionUrl) {
        activity.runOnUiThread(() -> {
            NotificationHelper.showNotification(activity, title, message, type, actionUrl);
        });
    }

    @JavascriptInterface
    public void postNativeNotification(String title, String message) {
        postNativeNotification(title, message, "BROADCAST", "");
    }

    @JavascriptInterface
    public void updateBadgeCount(int count) {
        activity.runOnUiThread(() -> {
            NotificationHelper.updateAppBadge(activity, count);
        });
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return "1.0.0 (Native Android with Push Notifications)";
    }
}
