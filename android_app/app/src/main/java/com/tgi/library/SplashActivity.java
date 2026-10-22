package com.tgi.library;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

@SuppressLint("CustomSplashScreen")
public class SplashActivity extends AppCompatActivity {

    private static final String SUPABASE_URL = "https://sfiezqvhbnpjrtdsmcxc.supabase.co";
    private static final String SUPABASE_KEY = "sb_publishable_yfIe49lEmLRf2oQjVKIV_w_SPgjnHbf";

    private ImageView splashLogo;
    private TextView splashTitle;
    private TextView splashTagline;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        splashLogo = findViewById(R.id.splashLogo);
        splashTitle = findViewById(R.id.splashTitle);
        splashTagline = findViewById(R.id.splashTagline);

        // 1. Load cached branding from SharedPreferences
        SharedPreferences prefs = getSharedPreferences("TGI_LIBRARY_PREFS", Context.MODE_PRIVATE);
        String cachedLogo = prefs.getString("INSTITUTION_LOGO", "");
        String cachedName = prefs.getString("INSTITUTION_NAME", "TGI LIBRARY");
        String cachedTagline = prefs.getString("INSTITUTION_TAGLINE", "Smart Campus & Library Management System");

        splashTitle.setText(cachedName);
        splashTagline.setText(cachedTagline);

        if (cachedLogo != null && !cachedLogo.isEmpty()) {
            displayLogo(cachedLogo);
        }

        // 2. Fetch latest branding in background from Supabase
        fetchRemoteBranding();

        // 3. Smooth transition to MainActivity
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent intent = new Intent(SplashActivity.this, MainActivity.class);
            if (getIntent() != null && getIntent().getAction() != null) {
                intent.setAction(getIntent().getAction());
                intent.setData(getIntent().getData());
                intent.putExtras(getIntent());
            }
            startActivity(intent);
            finish();
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        }, 1600);
    }

    private void displayLogo(String logoUrl) {
        runOnUiThread(() -> {
            try {
                Glide.with(this)
                        .load(logoUrl)
                        .placeholder(R.drawable.ic_launcher_foreground)
                        .error(R.drawable.ic_launcher_foreground)
                        .into(splashLogo);
            } catch (Exception ignored) {}
        });
    }

    private void fetchRemoteBranding() {
        new Thread(() -> {
            try {
                URL url = new URL(SUPABASE_URL + "/rest/v1/institution_profile?id=eq.primary_institution&select=name,tagline,logo_url");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("apikey", SUPABASE_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);

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
                        JSONObject obj = arr.getJSONObject(0);
                        String remoteName = obj.optString("name", "TGI LIBRARY");
                        String remoteTagline = obj.optString("tagline", "Smart Campus & Library Management System");
                        String remoteLogo = obj.optString("logo_url", "");

                        SharedPreferences prefs = getSharedPreferences("TGI_LIBRARY_PREFS", Context.MODE_PRIVATE);
                        prefs.edit()
                                .putString("INSTITUTION_NAME", remoteName)
                                .putString("INSTITUTION_TAGLINE", remoteTagline)
                                .putString("INSTITUTION_LOGO", remoteLogo)
                                .apply();

                        if (!remoteLogo.isEmpty()) {
                            displayLogo(remoteLogo);
                        }
                        runOnUiThread(() -> {
                            splashTitle.setText(remoteName);
                            splashTagline.setText(remoteTagline);
                        });
                    }
                }
            } catch (Exception ignored) {}
        }).start();
    }
}
