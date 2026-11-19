/*
  AgroAI sensor station firmware
  ==============================

  Hardware: ESP32 dev board (ESP32-WROOM-32 / 32E), BME280 air sensor, capacitive soil
  moisture sensor (v2.0), DS18B20 waterproof soil temperature probe, optional 18650 battery
  with a voltage divider. Wiring and assembly: docs/hardware/README.md.

  Every REPORT_INTERVAL_MINUTES the board wakes up, powers the soil sensors, takes readings,
  joins Wi-Fi, sends them to AgroAI (POST /api/v1/telemetry with an X-Device-Key header) and
  goes back into deep sleep. If sending fails, readings are kept in RTC memory (which
  survives deep sleep) and sent with the next successful report.

  Libraries (Arduino IDE: Sketch -> Include Library -> Manage Libraries):
    - Adafruit BME280 Library (accept the prompt to install its dependencies)
    - OneWire
    - DallasTemperature
*/

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <time.h>

#include <Adafruit_BME280.h>
#include <DallasTemperature.h>
#include <OneWire.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Copy config.example.h to config.h in this folder and fill in your settings."
#endif

// ---------------------------------------------------------------------------------------
// Pins (see the wiring table in the guide)
// ---------------------------------------------------------------------------------------
constexpr int PIN_SDA = 21;           // BME280 SDA
constexpr int PIN_SCL = 22;           // BME280 SCL
constexpr int PIN_SENSOR_POWER = 26;  // switched 3.3 V for the soil sensors
constexpr int PIN_ONE_WIRE = 4;       // DS18B20 data (4.7 kOhm pull-up to sensor power)
constexpr int PIN_SOIL = 34;          // soil moisture analogue output (ADC1, input only)
constexpr int PIN_BATTERY = 35;       // battery voltage divider midpoint (ADC1, input only)
constexpr int PIN_LED = 2;            // on-board LED on most ESP32 dev boards

constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint32_t NTP_TIMEOUT_MS = 6000;
constexpr uint16_t HTTP_TIMEOUT_MS = 60000;  // a sleeping free-tier server can take ~50 s to wake
constexpr uint8_t BACKLOG_SIZE = 8;

// ---------------------------------------------------------------------------------------
// Readings. NAN means "not measured"; those fields are left out of the report.
// ---------------------------------------------------------------------------------------
struct Reading {
  uint32_t epoch;  // seconds since 1970 (UTC), or 0 if the time was unknown
  float airTemperature;
  float airHumidity;
  float soilMoisture;
  float soilTemperature;
  float batteryVoltage;
};

// Outcome of one upload. Declared up here because the Arduino build generates function
// prototypes near the top of the sketch, before later type definitions.
enum class SendResult { Sent, Rejected, Failed };

// RTC memory keeps its contents through deep sleep (but not through a power cut).
RTC_DATA_ATTR Reading backlog[BACKLOG_SIZE];
RTC_DATA_ATTR uint8_t backlogCount = 0;
RTC_DATA_ATTR uint32_t bootCount = 0;

Adafruit_BME280 bme;
OneWire oneWire(PIN_ONE_WIRE);
DallasTemperature soilProbe(&oneWire);

// ---------------------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------------------

uint32_t averageMilliVolts(int pin, int samples = 16) {
  uint32_t total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogReadMilliVolts(pin);
    delay(2);
  }
  return total / samples;
}

void readAir(Reading &r) {
  Wire.begin(PIN_SDA, PIN_SCL);
  // Most modules use address 0x76; some use 0x77. A BMP280 (no humidity) is rejected here.
  if (!bme.begin(0x76, &Wire) && !bme.begin(0x77, &Wire)) {
    Serial.println("[air] BME280 not found: check wiring (and that it is not a BMP280)");
    return;
  }
  // Forced mode: one measurement on request, then the sensor sleeps (saves power, avoids
  // self-heating).
  bme.setSampling(Adafruit_BME280::MODE_FORCED, Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::SAMPLING_X1,
                  Adafruit_BME280::FILTER_OFF);
  bme.takeForcedMeasurement();
  float t = bme.readTemperature();
  float h = bme.readHumidity();
  if (!isnan(t) && t > -40 && t < 85) r.airTemperature = t;
  if (!isnan(h) && h >= 0 && h <= 100) r.airHumidity = h;
}

float soilMoisturePercent(uint32_t mv) {
  float pct = 100.0f * (float(SOIL_DRY_MV) - float(mv)) / float(SOIL_DRY_MV - SOIL_WET_MV);
  return constrain(pct, 0.0f, 100.0f);
}

void readSoil(Reading &r) {
  uint32_t mv = averageMilliVolts(PIN_SOIL);
  // A reading near 0 V or 3.3 V means the sensor is disconnected.
  if (mv > 200 && mv < 3200) {
    r.soilMoisture = soilMoisturePercent(mv);
  } else {
    Serial.printf("[soil] moisture sensor reads %lu mV: disconnected?\n", (unsigned long)mv);
  }

  soilProbe.begin();
  soilProbe.requestTemperatures();  // blocks for ~750 ms at 12-bit resolution
  float t = soilProbe.getTempCByIndex(0);
  // -127 means no probe; exactly 85 is the probe's power-on value, not a real reading.
  if (t != DEVICE_DISCONNECTED_C && t != 85.0f && t > -55 && t < 125) {
    r.soilTemperature = t;
  } else {
    Serial.println("[soil] DS18B20 probe not found: check wiring and the 4.7 kOhm resistor");
  }
}

void readBattery(Reading &r) {
  float volts = averageMilliVolts(PIN_BATTERY) * BATTERY_DIVIDER / 1000.0f;
  // Without a battery divider (USB powered) the pin reads ~0 V: report nothing.
  if (volts > 2.5f && volts < 5.0f) r.batteryVoltage = volts;
}

Reading takeReading() {
  Reading r = {0, NAN, NAN, NAN, NAN, NAN};
  pinMode(PIN_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SENSOR_POWER, HIGH);
  delay(300);  // let the soil sensors settle

  readAir(r);
  readSoil(r);
  readBattery(r);

  digitalWrite(PIN_SENSOR_POWER, LOW);
  return r;
}

void printReading(const Reading &r) {
  Serial.printf("[reading] air %.1f C, %.0f %%RH | soil %.1f %%, %.1f C | battery %.2f V\n",
                r.airTemperature, r.airHumidity, r.soilMoisture, r.soilTemperature,
                r.batteryVoltage);
}

// ---------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, signal %d dBm\n", WiFi.RSSI());
    return true;
  }
  Serial.println("[wifi] could not connect: check the name/password and that it is 2.4 GHz");
  return false;
}

uint32_t currentEpoch() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  uint32_t start = millis();
  time_t now = time(nullptr);
  while (now < 1700000000 && millis() - start < NTP_TIMEOUT_MS) {  // 1700000000 = Nov 2023
    delay(200);
    now = time(nullptr);
  }
  return now >= 1700000000 ? uint32_t(now) : 0;
}

// Appends ,"name":value when the value was measured.
void addField(String &json, const char *name, float value, int decimals) {
  if (isnan(value)) return;
  json += ",\"";
  json += name;
  json += "\":";
  json += String(value, decimals);
}

String toJson(const Reading &r, int rssi) {
  String json = "{\"signal_strength\":";
  json += String(constrain(rssi, -120, 0));
  if (r.epoch) {
    char stamp[25];
    time_t t = r.epoch;
    strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", gmtime(&t));
    json += ",\"recorded_at\":\"";
    json += stamp;
    json += "\"";
  }
  addField(json, "air_temperature", r.airTemperature, 2);
  addField(json, "air_humidity", r.airHumidity, 1);
  addField(json, "soil_moisture", r.soilMoisture, 1);
  addField(json, "soil_temperature", r.soilTemperature, 2);
  addField(json, "battery_voltage", r.batteryVoltage, 3);
  json += "}";
  return json;
}

SendResult send(const Reading &r) {
  String url = AGROAI_API_URL;
  bool https = url.startsWith("https://");
  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  if (https) {
#ifdef AGROAI_ROOT_CA
    secureClient.setCACert(AGROAI_ROOT_CA);
#else
    secureClient.setInsecure();  // encrypted, but the server's certificate is not checked
#endif
  }

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(20000);
  bool ok = https ? http.begin(secureClient, url) : http.begin(plainClient, url);
  if (!ok) {
    Serial.println("[http] invalid AGROAI_API_URL");
    return SendResult::Rejected;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", AGROAI_DEVICE_KEY);

  String body = toJson(r, WiFi.RSSI());
  int code = http.POST(body);
  String response = code > 0 ? http.getString() : http.errorToString(code);
  http.end();

  if (code == 201) return SendResult::Sent;
  Serial.printf("[http] status %d: %s\n", code, response.c_str());
  if (code == 401) Serial.println("[http] device key rejected: paste the key from AgroAI again");
  // 4xx errors will not succeed on retry (bad key or invalid values), so drop the reading.
  return (code >= 400 && code < 500) ? SendResult::Rejected : SendResult::Failed;
}

void remember(const Reading &r) {
  if (backlogCount == BACKLOG_SIZE) {  // full: drop the oldest
    memmove(&backlog[0], &backlog[1], sizeof(Reading) * (BACKLOG_SIZE - 1));
    backlogCount--;
  }
  backlog[backlogCount++] = r;
}

// Sends stored readings oldest first, then the new one. Stops at the first network failure.
bool sendAll(const Reading &latest) {
  remember(latest);
  uint8_t sent = 0;
  while (sent < backlogCount) {
    SendResult result = send(backlog[sent]);
    if (result == SendResult::Failed) break;
    sent++;  // Sent or Rejected: either way it is done with
  }
  memmove(&backlog[0], &backlog[sent], sizeof(Reading) * (backlogCount - sent));
  backlogCount -= sent;
  Serial.printf("[http] sent %u, %u waiting for next time\n", sent, backlogCount);
  return backlogCount == 0;
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

void blink(int times) {
  pinMode(PIN_LED, OUTPUT);
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(60);
    digitalWrite(PIN_LED, LOW);
    delay(140);
  }
}

void sleepUntilNextReport() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.printf("[sleep] %d minutes\n", REPORT_INTERVAL_MINUTES);
  Serial.flush();
  esp_sleep_enable_timer_wakeup(uint64_t(REPORT_INTERVAL_MINUTES) * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  bootCount++;
  Serial.printf("\n[agroai] station boot %lu\n", (unsigned long)bootCount);
  analogSetAttenuation(ADC_11db);  // full 0-3.3 V range on the analogue pins

#ifdef CALIBRATION_MODE
  pinMode(PIN_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SENSOR_POWER, HIGH);
  Serial.println("[calibration] soil sensor millivolts (dry air, then in water):");
  while (true) {
    Reading r = takeReading();
    digitalWrite(PIN_SENSOR_POWER, HIGH);
    Serial.printf("[calibration] soil %lu mV -> %.1f %% | ",
                  (unsigned long)averageMilliVolts(PIN_SOIL), r.soilMoisture);
    printReading(r);
    delay(1000);
  }
#endif

  Reading reading = takeReading();
  printReading(reading);

  bool delivered = false;
  if (connectWiFi()) {
    reading.epoch = currentEpoch();
    delivered = sendAll(reading);
  } else {
    remember(reading);
  }
  blink(delivered ? 1 : 3);
  sleepUntilNextReport();
}

void loop() {
  // Never reached: the board deep-sleeps at the end of setup() and restarts on waking.
}
