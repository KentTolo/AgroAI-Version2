# WhatsApp alerts and bot (free, self-hosted)

AgroAI can message farmers on WhatsApp and answer their messages, so they don't need the website
day to day:

- **Daily alerts** (at most one message a day, only when something is new): each new growth stage
  with what to do now, harvest in the next 7 days, harvest due, frost or heavy rain in the next
  3 days on a field with crops, and a sensor station that has stopped reporting.
- **A chat bot:** farmers record soil tests, plantings and harvests and ask for their status,
  weather and crop recommendations by sending short commands (listed [below](#bot-commands)).

Everything here is free:

| Part | What it is | Cost |
|---|---|---|
| [WAHA](https://github.com/devlikeapro/waha) | Open-source (Apache-2.0) WhatsApp HTTP API. It runs WhatsApp Web for a number you own. | Free |
| [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) | Gives WAHA a public HTTPS address without opening router ports | Free personal plan |
| Always-on machine | An old PC or laptop, a Raspberry Pi 4/5 (2 GB+), or an [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) VM | Free (or hardware you have) |
| GitHub Actions | Runs the daily alert job (`.github/workflows/notifications.yml`) | Free |
| A spare SIM | The bot's own WhatsApp number | The SIM, plus a little airtime to keep it active |

> **Important: unofficial access.** WAHA drives WhatsApp Web, which WhatsApp's terms don't allow for
> automated messaging. WhatsApp can ban a number it thinks is spamming. **Use a spare SIM, never
> your personal number.** AgroAI keeps the risk low: it only messages farmers who linked their
> number by messaging the bot first, sends at most one alert message per farmer per day, and
> pauses between messages. If the pilot grows into hundreds of farmers, move to the official
> WhatsApp Cloud API (replies are free; alerts cost a fraction of a US cent each).

## How it fits together

```
Farmer's WhatsApp ──► bot number (spare phone) ──► WAHA (your always-on machine)
                                                     │  webhook (signed HMAC-SHA512)
                                                     ▼
                         AgroAI API on Render ◄── reply / alerts via WAHA's /api/sendText
                                 ▲
     GitHub Actions, daily at 05:37 ──┘  POST /api/v1/internal/notifications/run
```

## 1. Prepare the bot's phone

1. Put the spare SIM in a spare Android phone. Install **WhatsApp Business** (free; it lets you
   set a profile name such as "AgroAI" and a description) and register it with the SIM's number.
2. Set the profile photo and name so farmers recognise it.
3. The phone only needs to be online now and then: WhatsApp keeps a linked device (WAHA) working
   while the phone connects at least once every 14 days.

## 2. Set up the always-on machine

Any 64-bit Linux machine with Docker works. WAHA's lightweight GOWS engine (the kit's default)
needs about 200 MB of RAM.

- **Home PC or Raspberry Pi:** install Raspberry Pi OS (64-bit) or Ubuntu, then Docker:
  `curl -fsSL https://get.docker.com | sh`.
- **Oracle Cloud Always Free:** create an Ubuntu VM with the Ampere (ARM) shape. Sign-up asks for
  a card for identity checks, but Always Free resources are not charged. Then install Docker as
  above.

## 3. Create a Tailscale account and key

1. Sign up at <https://login.tailscale.com> (free).
2. In the admin console, under **DNS**, enable **MagicDNS** and **HTTPS certificates**.
3. Under **Access controls**, allow Funnel. The console offers a button to add the `funnel`
   attribute; accept it.
4. Under **Settings → Keys**, generate an auth key that is **reusable** and **not ephemeral**.

## 4. Start WAHA

Copy the `deploy/waha` folder from this repository to the machine, then:

```bash
cd waha
cp .env.example .env
openssl rand -hex 32   # run three times: WAHA_API_KEY, WHATSAPP_HOOK_HMAC_KEY, and the cron secret
nano .env              # fill in TS_AUTHKEY, the two keys, and dashboard passwords
docker compose up -d
docker compose exec tailscale tailscale funnel status
```

The last command prints WAHA's public address, like `https://agroai-waha.tail1234.ts.net`. Keep
the third random value for the cron secret (step 6).

## 5. Link the bot's WhatsApp to WAHA

1. Open `https://agroai-waha.<your-tailnet>.ts.net/dashboard` and log in with the dashboard
   username and password from `.env`.
2. The session `default` shows a QR code. On the bot's phone, open WhatsApp → **Linked devices →
   Link a device** and scan it. The session turns **WORKING**.

## 6. Connect AgroAI (Render)

In the Render dashboard, open the **agroai-api** service → **Environment**, and add:

| Key | Value |
|---|---|
| `AGROAI_WHATSAPP_PROVIDER` | `waha` |
| `AGROAI_WAHA_URL` | WAHA's public address from step 4 |
| `AGROAI_WAHA_API_KEY` | `WAHA_API_KEY` from `.env` |
| `AGROAI_WAHA_WEBHOOK_HMAC_KEY` | `WHATSAPP_HOOK_HMAC_KEY` from `.env` |
| `AGROAI_WHATSAPP_BOT_NUMBER` | The bot's number with country code, e.g. `26650123456` |
| `AGROAI_CRON_SECRET` | The third random value |

Save; Render redeploys in a few minutes.

Then in GitHub, open the repository's **Settings → Secrets and variables → Actions → New
repository secret**: name `AGROAI_CRON_SECRET`, with the same value.

## 7. Try it

1. In AgroAI, open **Settings → WhatsApp → Link WhatsApp**. Send the code it shows (for example
   `LINK 482913`) from your own phone to the bot's number, or tap **Open WhatsApp with the message
   ready**. The bot replies "Linked!" and the page shows your number.
2. Send `STATUS` or `HELP`.
3. In GitHub, open **Actions → Daily WhatsApp alerts → Run workflow** to send today's alerts now.
   After that it runs every morning on its own.

On Render's free plan the API sleeps after 15 minutes without traffic. The first message after a
quiet spell wakes it, so that reply can take up to a minute; WAHA retries the delivery
automatically.

## Bot commands

Field and planting numbers are the ones `FIELDS` and `STATUS` show. With only one field, the
number can be left out.

| Send | Does |
|---|---|
| `STATUS` | Active plantings: stage, day, expected harvest |
| `FIELDS` | Fields and their latest soil test |
| `WEATHER 1` | 3-day forecast for field 1 |
| `SOIL 1 80 45 20 6.2` | Records a soil test for field 1: N, P, K (kg/ha) and pH. Temperature, humidity and rainfall come from the field's last 30 days of weather, or add them at the end: `SOIL 1 80 45 20 6.2 21 60 85` |
| `PLANTED maize 1` | Starts tracking maize planted today on field 1. Sesotho names work too: *poone*, *mabele*, *koro*, *linaoa*, *lierekisi*, *litapole* |
| `HARVESTED 1 350` | Records planting 1 as harvested, 350 kg |
| `RECOMMEND 1` | The best Lesotho crops for field 1's latest soil test (saved in the history) |
| `ALERTS OFF` / `ALERTS ON` | Pause or resume daily alerts (`STOP` and `START` work too) |
| `HELP` | The command list (also `MENU`, `THUSO`, `LUMELA`) |

## Keeping the bot's number healthy

- Only share the bot's number with farmers you work with, and let them message it first (linking
  does this).
- Don't add the bot to groups or use it to forward messages.
- Keep `AGROAI_WHATSAPP_SEND_DELAY_SECONDS` at 3 or more (the default).
- If WhatsApp logs the session out, the dashboard shows a new QR code: scan it again.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Settings says "WhatsApp is not set up" | `AGROAI_WHATSAPP_PROVIDER` isn't `waha` on Render, or the service hasn't redeployed yet. |
| The bot never replies | In the WAHA dashboard, check the session is WORKING. Check `WHATSAPP_HOOK_URL` in `.env` ends in `/api/v1/whatsapp/webhook`, and that both HMAC keys match (a mismatch shows as `401` in Render's logs). |
| Replies arrive but alerts don't | Run the workflow by hand and read its log: a `401` means the cron secrets differ; "skipping" means the GitHub secret is missing. |
| "That code is wrong or has expired" | Codes last 30 minutes and work once. Tap **Link WhatsApp** again. |
| WAHA logs "Unauthorized" from AgroAI | `AGROAI_WAHA_API_KEY` on Render doesn't match `WAHA_API_KEY`. |
