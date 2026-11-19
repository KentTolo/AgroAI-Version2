// AgroAI sensor station settings.
//
// 1. Copy this file to config.h (in the same folder).
// 2. Fill in your Wi-Fi details.
// 3. In AgroAI, open your field, choose "Field sensors" -> "Add station", and paste the two
//    AGROAI_ lines it shows over the placeholders below.
//
// config.h holds your Wi-Fi password and device key. Never share it or commit it to Git.

#pragma once

// --- Wi-Fi (2.4 GHz only; the ESP32 cannot join 5 GHz networks) --------------------------
#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// --- AgroAI (copied from the "Add station" dialog) ----------------------------------------
#define AGROAI_API_URL    "https://agroai-api-c9cq.onrender.com/api/v1/telemetry"
#define AGROAI_DEVICE_KEY "agk_paste-your-key-here"

// --- Reporting ---------------------------------------------------------------------------
// Minutes between readings. 15 keeps the free Render server awake; longer saves battery.
#define REPORT_INTERVAL_MINUTES 15

// --- Soil moisture calibration (see the guide, "Calibrate the soil sensor") ---------------
// Millivolts the sensor reads in dry air (0%) and in a glass of water (100%).
#define SOIL_DRY_MV 2600
#define SOIL_WET_MV 1100

// --- Battery measurement ------------------------------------------------------------------
// The two 100 kOhm resistors halve the battery voltage, so the reading is multiplied by 2.
// If a multimeter disagrees with the reported voltage, adjust this (e.g. 2.04).
#define BATTERY_DIVIDER 2.0

// --- Optional -----------------------------------------------------------------------------
// Uncomment to print raw sensor values every second instead of reporting (for calibration).
// #define CALIBRATION_MODE

// Uncomment and paste a root certificate to verify the server's identity. Without it the
// connection is still encrypted, but the server is not authenticated. See the guide.
// #define AGROAI_ROOT_CA "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
