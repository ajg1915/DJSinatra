package io.github.ajg1915.djsinatra;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Checks GitHub Releases for a newer DJSinatra APK and installs it with one click.
 * Releases are tagged "apk-v1.0.N" where N is the app's versionCode.
 */
final class Updater {

    private static final String LATEST = "https://api.github.com/repos/ajg1915/DJSinatra/releases/latest";
    private static final String APK_NAME = "DJSinatra.apk";
    private static final long CHECK_EVERY_MS = 3 * 60 * 60 * 1000L; // at most every 3 hours

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SharedPreferences prefs;
    private long downloadId = -1;
    private String pendingUrl;
    private int pendingVersion;
    private BroadcastReceiver receiver;

    Updater(Activity activity) {
        this.activity = activity;
        this.prefs = activity.getSharedPreferences("updater", Context.MODE_PRIVATE);
    }

    /** Call from onResume. */
    void checkSoon() {
        // Came back from the "allow installs" settings screen: continue the update.
        if (pendingUrl != null && canInstall()) { download(pendingUrl, pendingVersion); pendingUrl = null; return; }
        long last = prefs.getLong("lastCheck", 0);
        if (System.currentTimeMillis() - last < CHECK_EVERY_MS) return;
        prefs.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
        new Thread(this::check, "djs-update-check").start();
    }

    private void check() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(LATEST).openConnection();
            c.setRequestProperty("Accept", "application/vnd.github+json");
            c.setRequestProperty("User-Agent", "DJSinatra-Android");
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            if (c.getResponseCode() != 200) return;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            JSONObject rel = new JSONObject(sb.toString());
            String tag = rel.optString("tag_name", "");
            int latest = parseVersion(tag);
            if (latest <= currentVersion()) return;

            String url = null;
            JSONArray assets = rel.optJSONArray("assets");
            for (int i = 0; assets != null && i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (APK_NAME.equals(a.optString("name"))) url = a.optString("browser_download_url");
            }
            if (url == null) return;
            final String apkUrl = url;
            main.post(() -> offer(latest, apkUrl));
        } catch (Exception ignored) {
            // offline or GitHub unreachable: try again next time
        }
    }

    static int parseVersion(String tag) {
        int dot = tag.lastIndexOf('.');
        try { return Integer.parseInt(tag.substring(dot + 1)); } catch (Exception e) { return -1; }
    }

    @SuppressWarnings("deprecation")
    private int currentVersion() {
        try {
            PackageInfo p = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return p.versionCode;
        } catch (Exception e) {
            return Integer.MAX_VALUE;
        }
    }

    private void offer(int version, String url) {
        if (activity.isFinishing()) return;
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("DJSinatra update available")
                .setMessage("A new version of the app (v1.0." + version + ") is ready. Install it now?")
                .setPositiveButton("Install", (d, w) -> startUpdate(url, version))
                .setNegativeButton("Later", null)
                .show();
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || activity.getPackageManager().canRequestPackageInstalls();
    }

    private void startUpdate(String url, int version) {
        if (!canInstall()) {
            pendingUrl = url;
            pendingVersion = version;
            toast("Turn on \"Allow from this source\" for DJSinatra, then press Back");
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) {
                activity.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
            }
            return;
        }
        download(url, version);
    }

    private void download(String url, int version) {
        try {
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File old = new File(dir, "DJSinatra-update.apk");
            if (old.exists()) old.delete();

            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle("DJSinatra update v1.0." + version);
            r.setMimeType("application/vnd.android.package-archive");
            r.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "DJSinatra-update.apk");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            listenForDownload();
            downloadId = dm.enqueue(r);
            toast("Downloading update…");
        } catch (Exception e) {
            toast("Update download failed");
        }
    }

    private void listenForDownload() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;
                DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                Uri apk = dm.getUriForDownloadedFile(id);
                if (apk == null) { toast("Update download failed"); return; }
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(apk, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    activity.startActivity(install);
                } catch (Exception e) {
                    toast("Couldn't open the installer");
                }
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(receiver, f, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(receiver, f);
        }
    }

    /** Call from onDestroy. */
    void release() {
        if (receiver != null) {
            try { activity.unregisterReceiver(receiver); } catch (Exception ignored) { }
            receiver = null;
        }
    }

    private void toast(String msg) {
        main.post(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }
}
