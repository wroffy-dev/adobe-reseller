# Custom emails, plan limits and activity emails

Three pieces that belong together: what admins can send, how many they may
create, and how the super admin is kept informed.

| Screen | Who | What |
| --- | --- | --- |
| **Marketing → Custom Emails** (`/admin/emails`) | `emails.view` to see, `emails.manage` to write and send | Write emails, send them to up to 20 addresses at a time |
| **Settings → Plan & Limits** (`/admin/settings/plan`) | Super Admin only | How many custom emails the plan allows; activity emails on/off and recipients |
| **Settings → Email** (`/admin/settings/email`) | Super Admin only | SMTP server, sender, notification recipients, templates |

Plan & Limits and SMTP are checked by **role**, not by a permission, on the
page and in every action: a permission can be given to any role from the Staff
screen, and these settings must not be delegable.

## Custom emails

- Written in the rich-text editor; the HTML is sanitised on save.
- `{{email}}` is the recipient's address; `{{name}}` is the name of the lead or
  customer with that address, or empty.
- Each recipient gets their own message — nobody sees anyone else's address.
- Sending needs SMTP set up by the super admin; until then emails can be
  written but not sent. Every send is audited with how many were delivered.

## The limit

- Blank means no limit. A number (e.g. `5`) is shown to admins as
  “Only 5 emails you can create in your plan — 2 used, 3 left”.
- At the limit, **New email** is disabled and the server refuses the create —
  the check and the insert run in one transaction under a Postgres advisory
  lock, so two people saving at once cannot both take the last place.
- Lowering the limit keeps existing emails; they can still be edited, sent and
  deleted. Deleting one frees a place.

## Activity emails

- Every write in the admin already calls `recordAudit`; when activity emails
  are on, each of those by a non-super-admin is emailed to the listed
  recipients (subject: who did what; body: the summary and a link to the audit
  log).
- The super admin's own actions are not emailed to them.
- Sending is fire-and-forget after the action; a slow or failing SMTP server
  never delays or fails what the admin was doing. Settings are cached for 30
  seconds and refreshed immediately when saved.

## Upgrading

```bash
npm run db:deploy   # applies 20260930100000_custom_emails_plan
```

The migration grants `emails.view` and `emails.manage` to the built-in Admin
role. Other roles get them from **Staff → Roles & permissions**.
