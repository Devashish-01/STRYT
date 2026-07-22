# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

-dontwarn com.facebook.**
-dontwarn io.capawesome.capacitorjs.plugins.firebase.authentication.**
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.** { *; }

-keepattributes *Annotation*,SourceFile,LineNumberTable
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
