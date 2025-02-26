package com.voiceclone.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import android.content.res.AssetManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    // JavaScript interface for console logging
    private class WebAppInterface {
        @JavascriptInterface
        public void postMessage(String message) {
            Log.d(TAG, "WebView Console: " + message);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "onCreate started");
        super.onCreate(savedInstanceState);

        // Check if index.html exists
        try {
            String[] files = getAssets().list("public");
            Log.d(TAG, "Files in assets/public:");
            for (String file : files) {
                Log.d(TAG, "- " + file);
            }
        } catch (IOException e) {
            Log.e(TAG, "Error listing assets:", e);
        }

        // Create cache directories
        createWebViewCacheDirs();

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        
        Log.d(TAG, "Setting up WebView with JavaScript enabled: " + settings.getJavaScriptEnabled());
        
        // Add JavaScript interface for console logging
        webView.addJavascriptInterface(new WebAppInterface(), "console_log_bridge");
        
        // Enable JavaScript and storage
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // Enable file access
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        
        // Disable zoom controls
        settings.setBuiltInZoomControls(false);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);
        
        // Other settings
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Set WebChromeClient for console message logging
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                String sourceId = consoleMessage.sourceId() != null ? consoleMessage.sourceId() : "unknown";
                Log.d(TAG, String.format("Console: [%s] %s -- From line %d of %s", 
                    consoleMessage.messageLevel(),
                    consoleMessage.message(),
                    consoleMessage.lineNumber(),
                    sourceId));
                return true;
            }
        });

        // Set WebView client for debugging
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                Log.d(TAG, "Page started loading: " + url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "Page finished loading: " + url);
                
                // First check if the page loaded successfully
                view.evaluateJavascript(
                    "(function() { return document.documentElement.innerHTML; })();",
                    value -> Log.d(TAG, "Page HTML length: " + (value != null ? value.length() : 0))
                );
                
                // Inject console logging JavaScript
                String jsCode = 
                    "console.log('Starting JavaScript injection');" +
                    "window.onerror = function(message, source, lineno, colno, error) {" +
                    "   console.log('Error: ' + message + ' at ' + source + ':' + lineno);" +
                    "   return false;" +
                    "};" +
                    "console.log = function() {" +
                    "   var message = Array.prototype.slice.call(arguments).join(' ');" +
                    "   console_log_bridge.postMessage(message);" +
                    "};" +
                    "console.error = function() {" +
                    "   var message = 'ERROR: ' + Array.prototype.slice.call(arguments).join(' ');" +
                    "   console_log_bridge.postMessage(message);" +
                    "};" +
                    "console.warn = function() {" +
                    "   var message = 'WARN: ' + Array.prototype.slice.call(arguments).join(' ');" +
                    "   console_log_bridge.postMessage(message);" +
                    "};" +
                    "document.addEventListener('click', function(e) {" +
                    "   console.log('Click event on: ' + e.target.tagName + ' - ' + (e.target.textContent || e.target.innerText));" +
                    "}, true);" +
                    "window.addEventListener('popstate', function(e) {" +
                    "   console.log('PopState event - state:', JSON.stringify(e.state));" +
                    "});" +
                    "window.addEventListener('hashchange', function(e) {" +
                    "   console.log('HashChange event - old:', e.oldURL, 'new:', e.newURL);" +
                    "});" +
                    "console.log('JavaScript injection completed');";
                
                view.evaluateJavascript(jsCode, value -> {
                    Log.d(TAG, "JavaScript injection result: " + value);
                    // Test console logging
                    view.evaluateJavascript(
                        "console.log('Test console log from injection');",
                        null
                    );
                });
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                Log.e(TAG, "WebView error: " + description + " (code: " + errorCode + ") for URL: " + failingUrl);
                // Try to load a basic HTML to test JavaScript
                String testHtml = "<html><body><h1>Test Page</h1><button onclick='console.log(\"Test button clicked\")'>Test Button</button></body></html>";
                view.loadData(testHtml, "text/html", "UTF-8");
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                Log.d(TAG, "Loading resource: " + url + " (Method: " + request.getMethod() + ")");
                return super.shouldInterceptRequest(view, request);
            }
        });

        Log.d(TAG, "Loading initial URL: file:///android_asset/public/index.html");
        // Load the index.html file from assets
        webView.loadUrl("file:///android_asset/public/index.html");
    }

    private void createWebViewCacheDirs() {
        try {
            // Create WebView cache directories
            File webViewCache = new File(getApplicationContext().getCacheDir(), "WebView");
            if (!webViewCache.exists()) {
                webViewCache.mkdirs();
            }

            File defaultCache = new File(webViewCache, "Default");
            if (!defaultCache.exists()) {
                defaultCache.mkdirs();
            }

            File httpCache = new File(defaultCache, "HTTP Cache");
            if (!httpCache.exists()) {
                httpCache.mkdirs();
            }

            File codeCache = new File(httpCache, "Code Cache");
            if (!codeCache.exists()) {
                codeCache.mkdirs();
            }

            // Create specific cache directories
            new File(codeCache, "wasm").mkdirs();
            new File(codeCache, "js").mkdirs();

            Log.d(TAG, "WebView cache directories created successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error creating WebView cache directories", e);
        }
    }
}
