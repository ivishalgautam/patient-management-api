# WhatsApp Cloud API

Each practice connects one WhatsApp Business number through Meta's Cloud API
and uses it to chat with leads, send approved templates and run campaigns.
The module follows BW Task's WhatsApp module.

## Setup

1. Set these on the server (see `.env.example`):
   - `WHATSAPP_APP_SECRET`: the Meta app secret. Webhook signatures
     (`X-Hub-Signature-256`) are checked with it.
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: any random string, also entered in Meta.
   - `WHATSAPP_GRAPH_API_VERSION` (optional) and
     `WHATSAPP_CAMPAIGN_SEND_INTERVAL_MS` (pause between campaign sends).
2. In the dashboard, open **Settings › WhatsApp setup** and enter:
   - the phone number ID,
   - the WhatsApp Business Account ID,
   - a permanent system-user token with `whatsapp_business_messaging` and
     `whatsapp_business_management`.

   The number is checked with Meta before it is saved, and the token is
   stored encrypted.
3. In the Meta app, open WhatsApp › Configuration:
   - Set the callback URL shown on the settings page
     (`<API_URL>/webhooks/whatsapp`) and the verify token.
   - Subscribe to `messages` and `message_template_status_update`.

## Behaviour

- **24-hour window.** Free text can only be sent within 24 hours of the
  customer's last message. Outside that window an approved template is
  required, and the API returns `WHATSAPP_WINDOW_CLOSED`.
- **Inbound messages.** A message from an unknown number creates a WhatsApp
  lead in the configured pipeline and stage, unless that option is turned off.
  Conversations are linked to leads by normalised phone number.
- **Webhooks.** Meta can deliver the same webhook more than once, so every
  write is idempotent: messages are unique by wamid, and a status only moves
  forward (sent → delivered → read).
- **Templates.**
  - Submitted to Meta from the builder; the approval status arrives by
    webhook, or can be pulled with "Sync from Meta".
  - Deleting a template is a soft delete in the app only. It stays in Meta
    and can be restored.
- **Campaigns.**
  - A campaign sends one approved template to the leads in a pipeline,
    optionally narrowed by stage and status.
  - It is created as a draft, then started. Sending runs on the
    `whatsapp-cloud.campaign` queue, is paced, and resumes after a restart.
  - Failures with Meta's rate and marketing-limit codes
    (131049, 131048, 130429, 131056) are counted as "Limited by Meta".
  - Failed recipients can be retried.

## Permissions

- `whatsapp.use` (doctor, staff): inbox, sending, viewing templates.
- `whatsapp.manage` (doctor): settings, templates, campaigns, deleting chats.
