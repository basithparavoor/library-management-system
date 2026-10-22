# Add project specific ProGuard rules here.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
-keepclassmembers class com.tgi.library.WebAppInterface {
    <methods>;
}
