# AgroAI sensor station: build and installation manual

A low-cost, solar-powered station that measures your field's air and soil every 15 minutes and
sends the readings to AgroAI over Wi-Fi. Budget: **under M1,000** (Maloti and Rand are at par).

| Measures | Sensor | Used for |
|---|---|---|
| Air temperature and humidity | BME280 | Crop recommendations and the advisor ("Climate source → Field sensor"), charts |
| Soil moisture | Capacitive soil moisture sensor v2.0 | Watering decisions, charts |
| Soil temperature | DS18B20 waterproof probe | Planting timing, charts |
| Battery voltage | Two resistors | Knowing when the battery needs attention |

Rainfall comes from the weather feed and N, P, K and pH from soil tests, so the station
doesn't need those sensors. Reliable NPK/pH probes cost several times this whole budget.

**Contents:** [1. Parts](#1-parts-and-budget) · [2. Tools](#2-tools) ·
[3. How it fits together](#3-how-it-fits-together) · [4. Wiring](#4-wiring) ·
[5. Assembly](#5-assembly-step-by-step) · [6. Software](#6-load-the-software) ·
[7. Calibrate](#7-calibrate-the-soil-sensor) · [8. Connect to AgroAI](#8-connect-to-agroai) ·
[9. Install in the field](#9-install-in-the-field) · [10. Power and safety](#10-power-battery-life-and-safety) ·
[11. Troubleshooting](#11-troubleshooting)

---

## 1. Parts and budget

Prices are estimates in Rand from South African listings seen in November 2026 (sources at the
end). Check current prices before ordering. Takealot delivers within South Africa, so order to
an address or pickup point there before you travel.

> **Avoid the expensive branded versions.** Takealot also lists DFRobot "Gravity" modules for
> the same jobs at around R800 to R1,000 *each*. The generic modules below do the same job for
> a fraction of the price.

### Build A: solar powered (recommended, works anywhere within Wi-Fi range)

| # | Part | What to search for | Qty | Plan price |
|---|---|---|---|---|
| 1 | ESP32 development board, ESP32-WROOM-32 or 32E, 30 or 38 pins, USB-C | `ESP32 development board Type-C` | 1 | R160 |
| 2 | BME280 module, 3.3 V, I2C, 4 pins (VIN, GND, SCL, SDA) | `BME280 sensor module` | 1 | R90 |
| 3 | Capacitive soil moisture sensor **v2.0** (3.3–5.5 V) | `capacitive soil moisture sensor` | 1 | R40 |
| 4 | DS18B20 waterproof temperature probe, stainless tip, 1 m cable | `DS18B20 waterproof probe` | 1 | R55 |
| 5 | 18650 Li-ion cell, 2,500–3,500 mAh, from Samsung, LG, Sony/Murata or Panasonic | `18650 battery 3000mAh` | 1 | R100 |
| 6 | 18650 single battery holder with wires | `18650 single battery holder` | 1 | R85 |
| 7 | TP4056 charger module, USB-C, **with protection** (6 pads: IN+, IN−, B+, B−, OUT+, OUT−) | `TP4056 Type-C protection` | 1 | R35 |
| 8 | Solar panel, 6 V, 2–3 W | `6V solar panel 2W` | 1 | R160 |
| 9 | 3.3 V low-dropout regulator rated **500 mA or more** (HT7833, ME6211 or AP2112), plus 2 × 10 µF and 1 × 470 µF capacitors | `HT7833` or `3.3V LDO regulator module` | 1 set | R30 |
| 10 | Resistors: 1 × 4.7 kΩ, 2 × 100 kΩ (a small resistor kit is fine) | `resistor kit` | 1 | R20 |
| 11 | Prototype board (perfboard, about 5 × 7 cm), female header strips, hook-up wire, heat-shrink tubing | `perfboard`, `female header`, `hook up wire` | 1 lot | R60 |
| 12 | IP65 ABS junction box (about 150 × 100 × 70 mm) and 3 cable glands (PG7) | `IP65 junction box`, `PG7 cable gland` | 1 | R130 |
| | **Total** | | | **R965** |

From around the house: a wooden stake or 1.5 m PVC pipe, cable ties, 4–5 white plastic plant
saucers (for the sun shield), and a silica-gel sachet.

**Checks before you buy:**
- **BME280**, not BMP280. The BMP280 looks identical but has no humidity sensor.
- **Soil sensor v2.0** (or a listing that says 3.3–5.5 V). Some v1.2 boards need 5 V.
- **Regulator**: not an AMS1117. It needs too much voltage to run from one Li-ion cell.
- **18650 capacity**: ignore cells claiming 4,200 to 9,900 mAh. No real 18650 holds that much;
  they are fakes with poor capacity and protection.
- A 2-pack of ESP32 boards (about R289 seen on Takealot) is worth it if the budget allows: a
  spare makes testing and repairs easier.

### Build B: powered from the house (if a plug point is within reach)

Leave out parts 5 to 9 and the two 100 kΩ resistors. Power the ESP32 with a phone charger and a
long USB cable through a gland in the box. About **R635**. The charger must be indoors or in a
weatherproof socket.

## 2. Tools

Not included in the budget. Borrow what you can.

- Soldering iron (25–40 W) and solder, wire cutters/strippers, small screwdriver
- **Multimeter**: strongly recommended for checking voltages before connecting the ESP32
- Hot glue or silicone sealant, clear nail varnish (to seal the soil sensor's electronics)
- A computer with the Arduino IDE, and a USB **data** cable (some cables only charge)

No soldering iron? A screw-terminal breakout board for the ESP32 (about R159 on Takealot) lets
you connect most wires with a screwdriver. The power parts (TP4056 and regulator) still need a
few solder joints.

## 3. How it fits together

```
 Solar panel 6 V ──► TP4056 charger ◄──► 18650 cell
                         │ OUT+ (3.0–4.2 V)
                         ├──► 3.3 V regulator ──► ESP32 3V3 pin ──► BME280 (air, in sun shield)
                         └──► 100k / 100k divider ──► GPIO35 (battery voltage)

 ESP32 GPIO26 (switched on only while measuring) ──► soil moisture sensor + DS18B20 probe

 Every 15 min: wake → power sensors → read → Wi-Fi → HTTPS POST to AgroAI → deep sleep
```

## 4. Wiring

### Signal connections

| ESP32 pin | Connects to | Wire colour (suggested) |
|---|---|---|
| **3V3** | BME280 VIN · regulator output (Build A) | Red |
| **GND** | Every GND: BME280, soil sensor, DS18B20, regulator, TP4056 OUT−, divider | Black |
| **GPIO21** | BME280 SDA | Blue |
| **GPIO22** | BME280 SCL | Yellow |
| **GPIO26** | Soil sensor VCC · DS18B20 VDD (red) · one end of the 4.7 kΩ resistor | Orange |
| **GPIO4** | DS18B20 data (yellow/white) · other end of the 4.7 kΩ resistor | White |
| **GPIO34** | Soil sensor AOUT | Green |
| **GPIO35** | Battery divider midpoint (Build A only) | Purple |

DS18B20 probes are usually **red = VDD, black = GND, yellow = data**, but some use other
colours. Check the seller's description.

### Power connections (Build A)

| From | To |
|---|---|
| Solar panel + / − | TP4056 **IN+ / IN−** |
| 18650 holder red / black | TP4056 **B+ / B−** |
| TP4056 **OUT+** | Regulator **VIN**, and the top 100 kΩ resistor |
| TP4056 **OUT−** | Common GND |
| Regulator **VOUT** | ESP32 **3V3** |
| Regulator **GND** | Common GND |
| 10 µF capacitor | Regulator VIN to GND (long leg to VIN) |
| 10 µF capacitor | Regulator VOUT to GND (long leg to VOUT) |
| 470 µF capacitor | ESP32 3V3 to GND, close to the board (long leg to 3V3) |
| Divider | OUT+ → 100 kΩ → **GPIO35** → 100 kΩ → GND |

> Regulator pin order differs between packages and makers. Check the pinout picture or
> datasheet from your seller before soldering it. A reversed regulator gets hot and can damage
> the ESP32.

> **Never connect the battery and USB at the same time.** Before plugging the ESP32 into a
> computer, unclip the 18650 cell (or disconnect OUT+).

## 5. Assembly, step by step

1. **Test the ESP32 alone.** Plug it into the computer and upload the software (section 6)
   with only the board connected. The serial monitor should print `[agroai] station boot 1` and
   messages about missing sensors. That's expected for now.
2. **Add the BME280** (3V3, GND, GPIO21, GPIO22). Upload again: the `[reading]` line should
   show a sensible air temperature and humidity.
3. **Add the soil sensors.** Solder the 4.7 kΩ resistor between GPIO26 and GPIO4 on the
   perfboard, then connect the DS18B20 and the soil sensor. Readings should appear for both.
4. **Seal the soil sensor.** Paint the electronics at the top of the soil sensor (above the
   white line) and its edges with nail varnish, then cover the connector with heat-shrink.
   Moisture on that part ruins it.
5. **Build the power section (Build A)** on the perfboard: TP4056, regulator with its
   capacitors, and the battery divider. **Before connecting it to the ESP32**, insert the cell
   and measure with the multimeter:
   - TP4056 OUT+ to GND: 3.0–4.2 V
   - Regulator VOUT to GND: 3.25–3.35 V. If it's anything else, stop and recheck the wiring.
6. **Connect power to the ESP32** (VOUT → 3V3, GND → GND) with USB unplugged. The board's LED
   blinks once after each successful report (three blinks means it couldn't send).
7. **Fit everything in the box.** Mount the perfboard and battery holder with screws or hot glue.
   Run the soil sensor, DS18B20 and BME280 cables through the glands and tighten them. Add the
   silica-gel sachet. Leave the TP4056's USB-C port reachable for charging on cloudy weeks.
8. **Make the sun shield** for the BME280: stack 4–5 white plant saucers with 2 cm spacers (nuts
   on a long bolt work well), with the sensor hanging in the middle. Air must flow through, but
   sun and rain must not reach it. Keep the BME280 cable under 1 metre.

## 6. Load the software

The firmware is in [`firmware/agroai_station`](../../firmware/agroai_station). It is checked on
every change by the project's CI, so it compiles as published.

1. Install the **Arduino IDE 2** from <https://www.arduino.cc/en/software>.
2. **File → Preferences → Additional boards manager URLs**, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Tools → Board → Boards Manager**, search **esp32** and install **esp32 by Espressif Systems**.
4. **Sketch → Include Library → Manage Libraries**, install:
   - **Adafruit BME280 Library** (click *Install all* to include its dependencies)
   - **OneWire**
   - **DallasTemperature**
5. Download the project (on GitHub: **Code → Download ZIP**), unzip it, and open
   `firmware/agroai_station/agroai_station.ino`.
6. Create your settings: copy `config.example.h` to `config.h` in the same folder (in the IDE,
   use the tab menu **New Tab**, name it `config.h`, and paste the example's contents). Fill in
   your Wi-Fi name and password. You'll add the AgroAI lines in section 8.
7. **Tools → Board → esp32 → ESP32 Dev Module**, and **Tools → Port** → the board's port.
   If no port appears on Windows, install the USB driver for your board's USB chip (CH340 or
   CP2102; it's printed on the small chip next to the USB socket).
8. Click **Upload**. If it stays on `Connecting…`, hold the board's **BOOT** button until the
   upload starts.
9. Open **Tools → Serial Monitor** at **115200 baud** to watch what the station does.

(Prefer PlatformIO? From the `firmware` folder: `pio run -t upload`, then `pio device monitor`.)

## 7. Calibrate the soil sensor

Every soil sensor reads slightly differently, so tell the firmware what "dry" and "wet" look
like for yours.

1. In `config.h`, uncomment `#define CALIBRATION_MODE` and upload. The serial monitor prints the
   soil reading in millivolts every second.
2. Hold the sensor in **dry air**: note the value (typically 2,400–2,800 mV). That's
   `SOIL_DRY_MV`.
3. Stand it in a **glass of water** up to the white line (never deeper): note the value
   (typically 1,000–1,400 mV). That's `SOIL_WET_MV`.
4. Put both numbers in `config.h`, comment `CALIBRATION_MODE` out again, and upload.

For better accuracy, use a jar of your own field's soil instead: very dry soil for `DRY`, and
the same soil soaked until water pools on top for `WET`.

## 8. Connect to AgroAI

1. In AgroAI, open your field and choose **Field sensors → Add station**. Name it (e.g. "Home
   field station").
2. It shows two lines starting with `#define AGROAI_`. Copy them into your `config.h`,
   replacing the placeholder lines. **The key is shown only once.** If you lose it, use
   **New key** on the station and update `config.h`.
3. Upload. Within a minute the serial monitor should show `[http] sent 1, 0 waiting`, and the
   station shows **Online** in AgroAI with its first readings.

Keep `config.h` private: it contains your Wi-Fi password and the station's key.

## 9. Install in the field

**Check Wi-Fi first.** Stand where the station will go with your phone connected to the same
network. You need at least two bars. Once installed, AgroAI shows the station's Wi-Fi strength;
"weak" or "very weak" means missed reports. If the field is out of range, a Wi-Fi extender
placed between the house and the field usually fixes it.

| Part | Placement |
|---|---|
| Box and pole | Pole firmly in the ground at the edge of the bed, out of the way of tools and animals |
| Sun shield with BME280 | 1.2–1.5 m above the ground, away from walls and tin roofs that radiate heat |
| Soil moisture sensor | Pushed vertically into the root zone (5–10 cm deep) **up to the white line**, in the bed itself, not the path |
| DS18B20 probe | 10 cm deep, close to the moisture sensor |
| Solar panel | Facing **north** (we are in the southern hemisphere), tilted about 45° to favour the low winter sun, never shaded |
| Cables | Loop each cable downward just before it enters the box (a "drip loop") so rain runs off; protect cables from livestock and rodents with conduit or garden hose |

## 10. Power, battery life and safety

**Battery life (estimates).** The station sleeps almost all the time and is awake for about 10
seconds every 15 minutes. Expect an average draw of a few milliamps, which is several weeks on
one 3,000 mAh cell without sun. A 2 W panel tops it up on a sunny day. Watch the battery
voltage in AgroAI:

| Battery voltage | Meaning |
|---|---|
| 3.9–4.2 V | Full |
| 3.6–3.9 V | Normal |
| Below 3.4 V | Low: check the panel for shade or dirt, or charge through the TP4056's USB-C port |
| Below 3.0 V | The TP4056's protection disconnects the cell; charge it |

Dev boards vary: their power LED and USB chip use some current even in deep sleep. If the
battery drains faster than expected, carefully removing the board's power LED (or its resistor)
noticeably extends battery life.

**Lithium battery safety.**
- Use genuine cells and a TP4056 module **with protection**. Never short the cell's terminals.
- Li-ion cells must **not be charged below 0 °C**, and the TP4056 doesn't check temperature. In
  winter, mount the box where the morning sun warms it. In the highlands, where frosts are hard,
  bring the station in over the coldest months, or plan a LiFePO4 upgrade.
- Don't leave a cell charging unattended indoors, and keep spare cells in a case.

## 11. Troubleshooting

Open the Serial Monitor (115200 baud) with the station connected by USB (battery out).

| Message or symptom | Fix |
|---|---|
| `BME280 not found` | Check SDA→21, SCL→22, VIN→3V3, GND. Make sure it's a BME280, not a BMP280. |
| `DS18B20 probe not found` | Check the 4.7 kΩ resistor between GPIO26 and GPIO4, and the probe's wire colours. |
| `moisture sensor reads … disconnected?` | Check AOUT→34 and VCC→26. |
| `could not connect` | Wrong Wi-Fi name or password, a 5 GHz-only network, or too far from the router. |
| `status 401 … device key rejected` | Paste the station's key from AgroAI again (or issue a **New key**). |
| `status -1` or `-11`, timeouts | The free server may be waking up; the reading is kept and re-sent next time. If it persists, check the API URL. |
| LED blinks 3 times after each wake | Reports aren't getting through: see the lines above. Up to 8 readings are kept and sent once the connection works. |
| Board resets during Wi-Fi, readings never sent | Power dips. Check the 470 µF capacitor and that the regulator is rated 500 mA or more. |
| Soil moisture always 0 % or 100 % | Calibrate (section 7). |
| Station "Last seen" hours ago in AgroAI | Battery flat, Wi-Fi out of range, or the station is stuck. Unplug the battery for 10 seconds to restart it. |

## Price sources (November 2026)

- Takealot: [18650 single battery holder (R85)](https://www.takealot.com/18650-single-battery-holder-with-wire/PLID95075323),
  [ESP32 starter kit (R394)](https://www.takealot.com/basic-starter-kit-for-esp32-32s-wifi-i-ot-development-board-with/PLID100195334),
  [TP4056 USB-C charger module](https://www.takealot.com/tp4056-usb-type-c-lithium-battery-charger-module-with-protection/PLID93191911),
  [ESP32 screw-terminal breakout (R159)](https://www.takealot.com/esp32-38-pin-breakout-board/PLID95441124),
  and the branded modules to avoid: [Gravity soil moisture sensor (R1,005)](https://www.takealot.com/gravity-analog-capacitive-soil-moisture-sensor-corrosion-resista/PLID56355682),
  [Gravity DS18B20 kit (R799)](https://www.takealot.com/gravity-waterproof-ds18b20-sensor-kit/PLID59530584)
- Other South African retailers, for comparison: [Pi Shop BME280 (R76.90)](https://www.pishop.co.za/store/bme280-33v-high-precision-atmospheric-pressure-temperature-humidity-sensor-module),
  [Bob Shop capacitive soil sensor (R44.95)](https://www.bobshop.co.za/capacitive-soil-moisture-sensor-module/p/676022295),
  [Bob Shop DHT22 (R41.95)](https://www.bobshop.co.za/dht22-sensor-module/p/676022296),
  [Bob Shop ESP32 USB-C board (R275)](https://www.bobshop.co.za/esp32-ch340c-typec-30p-wroom-development-board/p/640518824)
