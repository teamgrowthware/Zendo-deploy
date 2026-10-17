package app.zendo.phone;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.util.Log;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String TAG = "ZendoDemo";
    private static final String PREFS = "zendo";
    private static final String KEY_URL = "url";

    private static final String BUNDLED_HOST = "appassets.androidplatform.net";
    private static final String BUNDLED_ROOT = "www";
    // This explicit query flag enables the Android presentation layer. It is
    // persisted by the frontend and deliberately does not rely on user-agent sniffing.
    private static final String BUNDLED_URL = "https://" + BUNDLED_HOST + "/?zendo_app=android";

    private WebView web;
    private FrameLayout webContainer;
    private EditText urlField;
    private boolean bundled;
    private boolean hosted;
    private String hostedOrigin = "";
    private boolean webInitializationScheduled;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        bundled = countBundledAssets() > 0;
        hostedOrigin = normalize(getString(R.string.default_url));
        hosted = !bundled && !hostedOrigin.isEmpty();

        LinearLayout bar = findViewById(R.id.bar);
        urlField = findViewById(R.id.url);
        Button open = findViewById(R.id.open);
        Button privacy = findViewById(R.id.privacy);

        if (bundled || hosted) {
            bar.setVisibility(View.GONE);
        } else {
            bar.setVisibility(View.VISIBLE);
        }

        if (Build.VERSION.SDK_INT >= 33 && !bundled && !hosted
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }

        open.setOnClickListener(view -> openCurrent());
        privacy.setOnClickListener(view -> openPrivacy());

        // WebView initialization can block a cold renderer start.  Construct it
        // after this native container receives its first frame so Android's
        // system splash is dismissed by real Activity content, not a timeout.
        webContainer = findViewById(R.id.web_container);
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        // A cold WebView provider can synchronously load native code for several
        // seconds. Scheduling that work only after Android has completed the
        // first focus transaction prevents the input-dispatch ANR seen when the
        // provider was created from the pre-focus first-frame callback.
        if (hasWindowFocus && !webInitializationScheduled && webContainer != null) {
            webInitializationScheduled = true;
            webContainer.post(() -> initializeWebView(webContainer));
        }
    }

    private void initializeWebView(FrameLayout container) {
        Log.i(TAG, "Creating bundled WebView");
        web = new WebView(this);
        container.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings settings = webSettings();
        settings.setSupportZoom(!bundled);
        settings.setBuiltInZoomControls(!bundled);

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                Log.w(TAG, "JS " + message.messageLevel() + " " + message.message());
                return super.onConsoleMessage(message);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                Log.i(TAG, "Page started " + url);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                Log.i(TAG, "Page visible " + url);
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && BUNDLED_HOST.equalsIgnoreCase(uri.getHost())) {
                    WebResourceResponse response = bundledAsset(uri);
                    if (response == null) Log.w(TAG, "Missing bundled asset " + uri);
                    return response;
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAllowedNavigation(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page finished " + url);
                if (bundled || hosted) return;
                if (isHttps(Uri.parse(url == null ? "" : url))) {
                    urlField.setText(origin(url));
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, origin(url)).apply();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                Log.e(TAG, "WebView error " + error.getErrorCode() + " " + error.getDescription() + " " + request.getUrl());
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, R.string.open_failed, Toast.LENGTH_LONG).show();
                }
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> save(url, userAgent, contentDisposition, mimeType));

        if (bundled) {
            Log.i(TAG, "Loading bundled entry " + BUNDLED_URL);
            web.loadUrl(BUNDLED_URL);
            return;
        }

        if (hosted) {
            String start = androidModeUrl(hostedOrigin);
            Log.i(TAG, "Loading configured HTTPS origin " + start);
            web.loadUrl(start);
            return;
        }

        String saved = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, getString(R.string.default_url));
        String start = normalize(saved);
        urlField.setText(start);
        urlField.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                openCurrent();
                return true;
            }
            return false;
        });
        if (!start.isEmpty()) {
            web.loadUrl(start);
        }
    }

    private WebSettings webSettings() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(true);
        }
        return settings;
    }

    private int countBundledAssets() {
        try {
            String[] top = getAssets().list(BUNDLED_ROOT);
            return top == null ? 0 : top.length;
        } catch (IOException error) {
            return 0;
        }
    }

    private WebResourceResponse bundledAsset(Uri uri) {
        if (!bundled) {
            return null;
        }
        String path = uri.getPath();
        if (path == null || path.isEmpty()) {
            path = "/";
        }
        if (path.startsWith("/_next/image")) {
            String inner = uri.getQueryParameter("url");
            if (inner != null) {
                path = inner;
            }
        }
        if (path.contains("..")) {
            return null;
        }
        // AAPT excludes an `_next` asset directory. Keep Next's public URL
        // intact while resolving it from the Android-safe `www/next` tree.
        String name = path.startsWith("/_next/")
                ? BUNDLED_ROOT + "/next/" + path.substring("/_next/".length())
                : BUNDLED_ROOT + path;
        if (path.endsWith("/")) {
            name += "index.html";
        } else if (!hasExtension(path)) {
            name += "/index.html";
        }
        try {
            InputStream stream = getAssets().open(name);
            return new WebResourceResponse(mime(name), null, stream);
        } catch (IOException error) {
            return null;
        }
    }

    private boolean hasExtension(String path) {
        int slash = path.lastIndexOf('/');
        int dot = path.lastIndexOf('.');
        return dot > slash;
    }

    private String mime(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".map")) return "application/json";
        return "application/octet-stream";
    }

    private void save(String url, String userAgent, String contentDisposition, String mimeType) {
        Uri uri = Uri.parse(url);
        String name = uri.getLastPathSegment();
        if (name == null || !name.toLowerCase().endsWith(".zip")) {
            name = URLUtil.guessFileName(url, contentDisposition, "application/zip");
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(uri);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            request.setMimeType("application/zip");
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) {
                Toast.makeText(this, R.string.open_failed, Toast.LENGTH_LONG).show();
                return;
            }
            manager.enqueue(request);
            Toast.makeText(this, getString(R.string.saving, name), Toast.LENGTH_LONG).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, R.string.open_failed, Toast.LENGTH_LONG).show();
        }
    }

    private void openCurrent() {
        if (hosted) {
            web.loadUrl(androidModeUrl(hostedOrigin));
            return;
        }
        String next = normalize(urlField.getText().toString());
        if (next.isEmpty()) {
            Toast.makeText(this, R.string.https_required, Toast.LENGTH_LONG).show();
            return;
        }
        urlField.setText(next);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, next).apply();
        web.loadUrl(next);
    }

    private void openPrivacy() {
        String next = normalize(urlField.getText().toString());
        if (next.isEmpty()) {
            Toast.makeText(this, R.string.https_required, Toast.LENGTH_LONG).show();
            return;
        }
        Uri uri = Uri.parse(next);
        String privacy = uri.getScheme() + "://" + uri.getAuthority() + "/privacy";
        web.loadUrl(privacy);
    }

    private String normalize(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            String baked = getString(R.string.default_url).trim();
            value = baked;
        }
        if (value.isEmpty()) {
            return "";
        }
        if (value.startsWith("http://")) {
            value = "https://" + value.substring("http://".length());
        } else if (!value.startsWith("https://")) {
            value = "https://" + value;
        }
        Uri uri = Uri.parse(value);
        if (!isHttps(uri) || uri.getHost() == null || uri.getHost().isEmpty()) {
            return "";
        }
        return value;
    }

    private String origin(String url) {
        Uri uri = Uri.parse(url);
        if (!isHttps(uri) || uri.getHost() == null) {
            return url;
        }
        return uri.getScheme() + "://" + uri.getAuthority();
    }

    private String androidModeUrl(String raw) {
        Uri uri = Uri.parse(raw);
        return uri.buildUpon().appendQueryParameter("zendo_app", "android").build().toString();
    }

    private boolean isAllowedNavigation(Uri uri) {
        if (!isHttps(uri)) return false;
        if (!hosted) return true;
        Uri expected = Uri.parse(hostedOrigin);
        return expected.getHost() != null
                && expected.getHost().equalsIgnoreCase(uri.getHost())
                && expected.getPort() == uri.getPort();
    }

    private boolean isHttps(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && !uri.getHost().isEmpty();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
