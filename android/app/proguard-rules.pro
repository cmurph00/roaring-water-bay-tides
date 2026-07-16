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

# Keep readable stack traces in crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# Capacitor (Task 30). The Capacitor bridge discovers plugins and invokes their
# methods by ANNOTATION + REFLECTION, so R8 must not rename/strip the runtime,
# the plugin classes, or their @PluginMethod-annotated members. The web bundle
# in assets/ is untouched by R8; these keeps protect the thin native layer.
# ---------------------------------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
# Bundled Capacitor plugins (e.g. @capacitor/geolocation -> com.capacitorjs.plugins.*)
-keep class com.capacitorjs.plugins.** { *; }
# Cordova compatibility layer Capacitor ships with
-keep class org.apache.cordova.** { *; }
# WebView <-> JS bridge interfaces (called from JavaScript by name)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Annotations R8 needs to keep to honour the reflection-based plugin discovery
-keepattributes *Annotation*, JavascriptInterface
