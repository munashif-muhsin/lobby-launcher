import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional IGDB credentials (Twitch developer app) live in igdb.properties (gitignored).
// Copy igdb.properties.sample -> igdb.properties and fill it in.
// When missing, the artwork lookup goes Play Store -> Generated.
val localProps = Properties().apply {
    val f = rootProject.file("igdb.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.muhsin.lobbylauncher"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.muhsin.lobbylauncher"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "IGDB_CLIENT_ID", "\"${localProps.getProperty("igdb.clientId", "")}\"")
        buildConfigField("String", "IGDB_CLIENT_SECRET", "\"${localProps.getProperty("igdb.clientSecret", "")}\"")
    }

    // Signing key lives outside git: keystore.properties + lobby-release.jks (both gitignored).
    val ks = Properties().apply {
        val f = rootProject.file("keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    val hasKey = ks.getProperty("storeFile") != null && rootProject.file(ks.getProperty("storeFile")).exists()
    signingConfigs {
        if (hasKey) create("lobby") {
            storeFile = rootProject.file(ks.getProperty("storeFile"))
            storePassword = ks.getProperty("storePassword")
            keyAlias = ks.getProperty("keyAlias")
            keyPassword = ks.getProperty("keyPassword")
        }
    }

    buildTypes {
        getByName("debug") {
            if (hasKey) signingConfig = signingConfigs.getByName("lobby")
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasKey) signingConfigs.getByName("lobby") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    androidResources { noCompress += listOf("woff2") }
}

// No AndroidX / no libraries: keeps the APK tiny and cold start fast.
dependencies {}
