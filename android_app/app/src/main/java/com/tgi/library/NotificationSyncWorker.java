package com.tgi.library;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class NotificationSyncWorker extends Worker {

    private static final String SUPABASE_URL = "https://sfiezqvhbnpjrtdsmcxc.supabase.co";
    private static final String SUPABASE_KEY = "sb_publishable_yfIe49lEmLRf2oQjVKIV_w_SPgjnHbf";
    private static final String PREF_LAST_NOTIF_TIME = "LAST_SYNCED_NOTIF_TIME";

    public NotificationSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            SharedPreferences prefs = getApplicationContext().getSharedPreferences("TGI_LIBRARY_PREFS", Context.MODE_PRIVATE);
            String lastTime = prefs.getString(PREF_LAST_NOTIF_TIME, "");

            String endpoint = SUPABASE_URL + "/rest/v1/notifications?order=created_at.desc&limit=5";
            if (!lastTime.isEmpty()) {
                endpoint += "&created_at=gt." + lastTime;
            }

            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", SUPABASE_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            if (conn.getResponseCode() == 200) {
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                in.close();

                JSONArray arr = new JSONArray(response.toString());
                if (arr.length() > 0) {
                    String latestTime = lastTime;
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject notif = arr.getJSONObject(i);
                        String title = notif.optString("title", "TGI Library Alert");
                        String message = notif.optString("message", "");
                        String type = notif.optString("type", "BROADCAST");
                        String actionUrl = notif.optString("action_link", "");
                        String createdAt = notif.optString("created_at", "");

                        if (createdAt.compareTo(latestTime) > 0) {
                            latestTime = createdAt;
                        }

                        // Trigger native status bar notification
                        NotificationHelper.showNotification(getApplicationContext(), title, message, type, actionUrl);
                    }

                    if (!latestTime.isEmpty()) {
                        prefs.edit().putString(PREF_LAST_NOTIF_TIME, latestTime).apply();
                    }
                }
            }
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }
}
