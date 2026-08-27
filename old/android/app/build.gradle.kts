plugins {
    id("com.android.application")
}

android {
    namespace = "ai.yance.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "ai.yance.android"
        minSdk = 30
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.work:work-runtime:2.11.2")
    testImplementation("junit:junit:4.13.2")
}
