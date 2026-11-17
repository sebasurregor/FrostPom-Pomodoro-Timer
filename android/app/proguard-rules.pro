# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- FrostPom (tools/app-android.mjs, v4.7.4) ---
# El puente entre la web y Android (Capacitor) se llama por su nombre desde JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# (v4.8.0) El complemento propio (notificación, widgets y alarmas): es pequeño y lo usa Android
# por su nombre (widgets, avisos, botones), así que va completo, sin cambiarle nombres.
-keep class com.startupprometeus.frostpom.timer.** { *; }
# Errores de Play legibles: guarda los números de línea (Play los traduce con el mapping.txt).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
# --- fin FrostPom ---
