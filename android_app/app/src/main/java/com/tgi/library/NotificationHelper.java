package com.tgi.library;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.concurrent.atomic.AtomicInteger;

public class NotificationHelper {

    private static final String TAG = "NotificationHelper";
    public static final String CHANNEL_ID = "tgi_library_alerts_v2";
    public static final String CHANNEL_NAME = "TGI Library Notifications & Alerts";
    public static final String CHANNEL_DESC = "Real-time push alerts for circulation, overdue books, campus broadcasts, and approvals";

    private static final AtomicInteger NOTIFICATION_ID = new AtomicInteger(1000);

    public static void createNotificationChannel(Context context) {
        if (context == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();

                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription(CHANNEL_DESC);
                channel.enableLights(true);
                channel.setLightColor(Color.parseColor("#3B82F6"));
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 300, 200, 300});
                channel.setSound(soundUri, audioAttributes);
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

                NotificationManager manager = context.getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error creating notification channel: " + e.getMessage(), e);
            }
        }
    }

    public static void showNotification(Context context, String title, String message, String type, String actionUrl) {
        if (context == null) return;

        try {
            createNotificationChannel(context);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "POST_NOTIFICATIONS permission not granted. Cannot display native notification.");
                    return;
                }
            }

            int notifId = NOTIFICATION_ID.incrementAndGet();

            // Target Intent on Tap
            Intent intent = new Intent(context, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (actionUrl != null && !actionUrl.isEmpty()) {
                intent.putExtra("TARGET_ACTION_URL", actionUrl);
            }

            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S 
                    ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT 
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, intent, flags);

            Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_notification)
                    .setContentTitle(title != null && !title.isEmpty() ? title : "TGI LIBRARY Alert")
                    .setContentText(message != null && !message.isEmpty() ? message : "New institutional announcement")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(message != null ? message : ""))
                    .setAutoCancel(true)
                    .setSound(defaultSoundUri)
                    .setVibrate(new long[]{0, 300, 200, 300})
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setColor(context.getResources().getColor(R.color.brand_primary))
                    .setContentIntent(pendingIntent);

            NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
            notificationManager.notify(notifId, builder.build());
            Log.d(TAG, "Native notification displayed successfully: " + title);
        } catch (Exception e) {
            Log.e(TAG, "Failed to display native notification: " + e.getMessage(), e);
        }
    }

    public static void updateAppBadge(Context context, int count) {
        if (context == null) return;
        try {
            // Launcher Badge Intent Support for OEM launch screens (Samsung, Xiaomi, Sony, etc.)
            Intent intent = new Intent("android.intent.action.BADGE_COUNT_UPDATE");
            intent.putExtra("badge_count", count);
            intent.putExtra("badge_count_package_name", context.getPackageName());
            intent.putExtra("badge_count_class_name", MainActivity.class.getName());
            context.sendBroadcast(intent);

            // Notification Badge sync
            if (count > 0) {
                showNotification(context, "TGI Library Alerts", "You have " + count + " unread institutional notifications.", "BADGE_SYNC", "");
            }
        } catch (Exception ignored) {}
    }
}
