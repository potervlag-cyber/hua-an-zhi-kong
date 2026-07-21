package com.huaan.zhikong;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int REQUEST_CREATE_TEXT_FILE = 1201;
    private static final float TOP_BLACK_BAR_HEIGHT_MM = 0.5f;
    private static final String CHEMICAL_DATABASE_ASSET = "databases/chemicals.db";
    private static final String CHEMICAL_DATABASE_NAME = "chemicals.db";
    private WebView webView;
    private String pendingTextContent;
    private SQLiteDatabase chemicalDatabase;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideStatusBar();

        try {
            installChemicalDatabase();
        } catch (IOException exception) {
            Toast.makeText(this, "化学品数据库初始化失败", Toast.LENGTH_LONG).show();
        }

        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.rgb(9, 35, 74));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 247, 250));
        webView.setWebViewClient(new LocalAssetWebViewClient(this, getAssets()));
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);

        View topBlackBar = new View(this);
        topBlackBar.setBackgroundColor(Color.BLACK);
        root.addView(topBlackBar, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            millimetersToPixels(TOP_BLACK_BAR_HEIGHT_MM)
        ));
        root.addView(webView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1.0f
        ));
        setContentView(root);
        if (savedInstanceState == null) {
            webView.loadUrl("https://appassets.androidplatform.net/assets/www/mobile/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideStatusBar();
    }

    @SuppressWarnings("deprecation")
    private void hideStatusBar() {
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private int millimetersToPixels(float millimeters) {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        float verticalDpi = metrics.ydpi > 0 ? metrics.ydpi : DisplayMetrics.DENSITY_DEFAULT;
        return Math.max(1, Math.round(millimeters * verticalDpi / 25.4f));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    private void requestTextFileSave(String filename, String content, String mimeType) {
        pendingTextContent = content;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        String safeType = mimeType == null ? "text/plain" : mimeType.split(";", 2)[0];
        intent.setType(safeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename == null || filename.isEmpty() ? "report.csv" : filename);
        try {
            startActivityForResult(intent, REQUEST_CREATE_TEXT_FILE);
        } catch (ActivityNotFoundException exception) {
            pendingTextContent = null;
            Toast.makeText(this, "未找到可用于保存文件的应用", Toast.LENGTH_LONG).show();
        }
    }

    private void createPrintJob() {
        if (webView == null) return;
        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            Toast.makeText(this, "系统打印服务不可用", Toast.LENGTH_LONG).show();
            return;
        }
        String jobName = "化安智控-巡检风险报告";
        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
        printManager.print(jobName, adapter, null);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CREATE_TEXT_FILE) return;

        String content = pendingTextContent;
        pendingTextContent = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;

        try {
            OutputStream output = getContentResolver().openOutputStream(data.getData());
            if (output == null) throw new IOException("Unable to open output stream");
            try (OutputStreamWriter writer = new OutputStreamWriter(output, StandardCharsets.UTF_8)) {
                writer.write(content);
            }
            Toast.makeText(this, "文件已保存", Toast.LENGTH_SHORT).show();
        } catch (IOException exception) {
            Toast.makeText(this, "文件保存失败，请重试", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (chemicalDatabase != null) {
            chemicalDatabase.close();
            chemicalDatabase = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Copies the read-only database bundled in the APK into the app-private
     * database directory. Replacing it on launch guarantees an APK update also
     * updates the offline catalog instead of leaving a stale installed copy.
     */
    private void installChemicalDatabase() throws IOException {
        File destination = getDatabasePath(CHEMICAL_DATABASE_NAME);
        File parent = destination.getParentFile();
        if (parent == null || (!parent.exists() && !parent.mkdirs())) {
            throw new IOException("Unable to create database directory");
        }

        File temporary = new File(parent, CHEMICAL_DATABASE_NAME + ".new");
        try (InputStream input = getAssets().open(CHEMICAL_DATABASE_ASSET, AssetManager.ACCESS_STREAMING);
             FileOutputStream output = new FileOutputStream(temporary, false)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.getFD().sync();
        }

        if (destination.exists() && !destination.delete()) {
            throw new IOException("Unable to replace installed database");
        }
        if (!temporary.renameTo(destination)) {
            throw new IOException("Unable to activate bundled database");
        }
        chemicalDatabase = SQLiteDatabase.openDatabase(
            destination.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS
        );
    }

    private synchronized String chemicalsJson() {
        JSONArray chemicals = new JSONArray();
        if (chemicalDatabase == null || !chemicalDatabase.isOpen()) return chemicals.toString();

        String[] columns = {
            "id", "name", "english_name", "cas", "formula", "molecular_weight",
            "appearance", "melting_point", "boiling_point", "density", "solubility",
            "hazards", "flash_point", "explosive_limits", "toxicity", "storage", "ppe",
            "spill", "firefighting", "incompatibilities", "pubchem", "icsc", "note",
            "risk", "tags_json"
        };
        try (Cursor cursor = chemicalDatabase.query("chemicals", columns, null, null, null, null, "id ASC")) {
            while (cursor.moveToNext()) {
                JSONObject item = new JSONObject();
                item.put("id", cursor.getInt(0));
                item.put("name", cursor.getString(1));
                item.put("englishName", cursor.getString(2));
                item.put("cas", cursor.getString(3));
                item.put("formula", cursor.getString(4));
                item.put("molecularWeight", cursor.getString(5));
                item.put("appearance", cursor.getString(6));
                item.put("meltingPoint", cursor.getString(7));
                item.put("boilingPoint", cursor.getString(8));
                item.put("density", cursor.getString(9));
                item.put("solubility", cursor.getString(10));
                item.put("hazards", cursor.getString(11));
                item.put("flashPoint", cursor.getString(12));
                item.put("explosiveLimits", cursor.getString(13));
                item.put("toxicity", cursor.getString(14));
                item.put("storage", cursor.getString(15));
                item.put("ppe", cursor.getString(16));
                item.put("spill", cursor.getString(17));
                item.put("firefighting", cursor.getString(18));
                item.put("incompatibilities", cursor.getString(19));
                item.put("pubchem", cursor.getString(20));
                item.put("icsc", cursor.getString(21));
                item.put("note", cursor.getString(22));
                item.put("risk", cursor.getString(23));
                item.put("tags", new JSONArray(cursor.getString(24)));
                chemicals.put(item);
            }
        } catch (JSONException | RuntimeException ignored) {
            return "[]";
        }
        return chemicals.toString();
    }

    private synchronized String chemicalDatabaseInfoJson() {
        JSONObject info = new JSONObject();
        if (chemicalDatabase == null || !chemicalDatabase.isOpen()) return info.toString();
        try (Cursor cursor = chemicalDatabase.query("metadata", new String[]{"key", "value"}, null, null, null, null, "key ASC")) {
            while (cursor.moveToNext()) info.put(cursor.getString(0), cursor.getString(1));
        } catch (JSONException | RuntimeException ignored) {
            return "{}";
        }
        return info.toString();
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public String getChemicalsJson() {
            return chemicalsJson();
        }

        @JavascriptInterface
        public String getChemicalDatabaseInfoJson() {
            return chemicalDatabaseInfoJson();
        }

        @JavascriptInterface
        public void saveTextFile(String filename, String content, String mimeType) {
            runOnUiThread(() -> requestTextFileSave(filename, content, mimeType));
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(MainActivity.this::createPrintJob);
        }
    }

    /**
     * Serves packaged files from a same-origin HTTPS URL. ES modules are
     * blocked when a page is loaded from file:// on many Android WebViews.
     */
    private static final class LocalAssetWebViewClient extends WebViewClient {
        private static final String ASSET_HOST = "appassets.androidplatform.net";
        private static final String ASSET_PREFIX = "/assets/";
        private static final String TRUSTED_WEB_PREFIX = "/assets/www/";
        private final Context context;
        private final AssetManager assets;

        LocalAssetWebViewClient(Context context, AssetManager assets) {
            this.context = context;
            this.assets = assets;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl(), request.isForMainFrame());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(Uri.parse(url), true);
        }

        private boolean handleNavigation(Uri uri, boolean isMainFrame) {
            if (isTrustedAssetUri(uri)) return false;

            String scheme = uri.getScheme();
            if (isMainFrame && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                try {
                    context.startActivity(intent);
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(context, "未找到可打开外部链接的应用", Toast.LENGTH_LONG).show();
                }
            }
            // Fail closed for every non-local navigation and all external subframes.
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return openAsset(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return openAsset(Uri.parse(url));
        }

        private WebResourceResponse openAsset(Uri uri) {
            if (!isTrustedAssetUri(uri)) return null;

            String path = uri.getPath();
            String assetPath = path.substring(ASSET_PREFIX.length());
            if (assetPath.isEmpty() || assetPath.contains("..")) {
                return null;
            }

            try {
                InputStream stream = assets.open(assetPath, AssetManager.ACCESS_STREAMING);
                return new WebResourceResponse(mimeType(assetPath), "UTF-8", stream);
            } catch (IOException ignored) {
                return null;
            }
        }

        private static boolean isTrustedAssetUri(Uri uri) {
            String path = uri.getPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                && ASSET_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPort() == -1
                && path != null
                && path.startsWith(TRUSTED_WEB_PREFIX)
                && !path.contains("..");
        }

        private static String mimeType(String path) {
            String lower = path.toLowerCase(Locale.US);
            if (lower.endsWith(".html")) return "text/html";
            if (lower.endsWith(".js")) return "application/javascript";
            if (lower.endsWith(".css")) return "text/css";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".json")) return "application/json";
            if (lower.endsWith(".webmanifest")) return "application/manifest+json";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            return "application/octet-stream";
        }
    }
}
