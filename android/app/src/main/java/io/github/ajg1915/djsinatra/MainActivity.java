package io.github.ajg1915.djsinatra;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * DJSinatra for Android / Android TV / Chromecast with Google TV.
 * Shows the DJSinatra website full screen and hands songs to the VLC app.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://ajg1915.github.io/DJSinatra/";
    private static final String HOME_HOST = "ajg1915.github.io";
    private static final String VLC = "org.videolan.vlc";
    private static final int PICK_FILES = 42;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0D0B14);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " DJSinatraApp");
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("audio/mpeg");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose MP3s"), PICK_FILES);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    toast("No file picker on this device");
                    return false;
                }
            }
        });

        // ⬇ Download buttons -> Android's Downloads folder
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (url.startsWith("blob:")) { toast("Can't download this file"); return; }
            try {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setTitle(name);
                r.setMimeType(mimeType);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                toast("Downloading " + name);
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
        web.requestFocus(View.FOCUS_DOWN);
    }

    /** Returns true when we handled the link ourselves (VLC, Play Store, other apps). */
    private boolean handleUrl(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();

        if (scheme.equals("intent")) {           // "Open in VLC" links from the website
            try {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.setComponent(null);
                intent.setSelector(null);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    // VLC missing: try any audio player, then send them to the store for VLC
                    intent.setPackage(null);
                    try {
                        startActivity(intent);
                        toast("Install VLC for the best playback");
                    } catch (ActivityNotFoundException e2) {
                        toast("Install VLC to play songs");
                        openStore(intent.getPackage() != null ? intent.getPackage() : VLC);
                    }
                }
            } catch (Exception e) {
                toast("Couldn't open VLC");
            }
            return true;
        }
        if ((scheme.equals("http") || scheme.equals("https")) && HOME_HOST.equals(uri.getHost())) {
            return false;                          // stay inside the app
        }
        openExternal(uri);                         // github.com, store links, etc.
        return true;
    }

    private void openStore(String pkg) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            openExternal(Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("No app on this device can open that link");
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK_FILES && fileCallback != null) {
            Uri[] picked = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    picked = new Uri[n];
                    for (int i = 0; i < n; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    picked = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(picked);
            fileCallback = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
