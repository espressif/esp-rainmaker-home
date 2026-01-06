# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ============================================================
# Matter SDK - Required for JNI native library to work
# The native libCHIPController.so needs to call back into Java classes
# ============================================================

# Keep all Matter SDK controller classes (JNI callbacks)
-keep class chip.** { *; }
-keep class chip.devicecontroller.** { *; }
-keep class chip.tlv.** { *; }
-keep class chip.clusterinfo.** { *; }
-keep class chip.onboardingpayload.** { *; }

# Keep Matter SDK interfaces and callbacks
-keep interface chip.devicecontroller.** { *; }

# Keep app's Matter module classes
-keep class com.espressif.novahome.matter.** { *; }

# Keep native method signatures
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep enum classes used by Matter SDK
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ============================================================
# Bouncycastle - Required for certificate handling
# ============================================================
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# ============================================================
# Protobuf - Required for Matter TLV handling
# ============================================================
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.protobuf.**

# Add any project specific keep options here:
