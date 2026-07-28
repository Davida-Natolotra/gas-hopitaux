package com.rdavi.rfs

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Edge-to-edge draws the WebView under the status/navigation bars, so the
  // page needs the bar heights to keep its own content out from under them.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val density = resources.displayMetrics.density
      val topPx = bars.top / density
      val bottomPx = bars.bottom / density
      webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--safe-area-inset-top', '${topPx}px');" +
          "document.documentElement.style.setProperty('--safe-area-inset-bottom', '${bottomPx}px');",
        null
      )
      insets
    }
  }
}
