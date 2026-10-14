# Ticket4u - Event Ticketing System

This version uses a **multi-page structure**. Each screen has its own PHP file, and the JavaScript for each page is separated into its own file. Shared API utilities, common layout, and CSS are kept in reusable folders. The visual style uses a restrained pastel-purple and ash-grey palette with a conventional horizontal navigation bar and centred sign-in/register cards.

## Folder structure

```text
Event-Ticketing-Frontend/
├── index.php
├── README.md
├── includes/
│   ├── config.php
│   ├── header.php
│   └── footer.php
├── pages/
│   ├── login.php
│   ├── register.php
│   ├── dashboard.php
│   ├── events.php
│   ├── venues.php
│   ├── availability.php
│   ├── bookings.php
│   ├── payments.php
│   ├── notifications.php
│   └── users.php
└── assets/
    ├── css/styles.css
    └── js/
        ├── api.js
        ├── auth.js
        ├── common.js
        └── pages/
            ├── dashboard.js
            ├── events.js
            ├── venues.js
            ├── availability.js
            ├── bookings.js
            ├── payments.js
            ├── notifications.js
            └── users.js
```

## Install in XAMPP

1. Start **Apache** and **MySQL** in XAMPP.
2. Keep the backend at `C:\xampp\htdocs\Web-API-Project\event-ticketing-backend`.
3. Copy this `Event-Ticketing-Frontend` folder to `C:\xampp\htdocs\Web-API-Project\event-ticketing-frontend`.
4. Open `http://localhost/Web-API-Project/event-ticketing-frontend/`.
5. The frontend API address is configured once in `includes/config.php`. No API Settings page is shown in the UI. Default value:

   `http://localhost/Web-API-Project/event-ticketing-backend/api`

Change that one PHP value if your backend uses a different path.

## Authentication and registration

- `pages/login.php` sends credentials to `POST /auth/login`.
- `pages/register.php` sends details to `POST /auth/register`, then logs the new user in using `/auth/login`.
- The frontend expects login to return `data.token` and `data.user` (with the user's role).
- The Admin role displays a reference-key field. The backend must independently validate the key; client-side hiding/showing of the field is not security.
- Registration will not work until the backend has the `AuthController::register()` method and `/auth/register` route. Use the patch instructions previously prepared for the shared backend; do not replace unrelated API routes.

This frontend expects the backend's registration handler to accept `name`, `email`, `password`, `role`, and `reference_key`. For Admin signup, configure a private `admin_signup_key` under `$config['app']` in the backend's local `config/config.php` and enter the same value in the registration form. Do not commit private production keys to GitHub. No API Settings page is included.

## Role-based pages

- **Admin:** all pages, including User Management; event, venue, availability, payment and notification management.
- **Organiser:** events, venues, availability, bookings, payments and notifications. User management is hidden.
- **Customer:** events, own bookings, payments and notifications. Management pages are hidden.

These menu restrictions are for the interface only. API role-based access control must still be enforced in the backend.

## Pages and page-specific scripts

| Screen | PHP file | JavaScript |
|---|---|---|
| Login | `pages/login.php` | `assets/js/auth.js` |
| Register | `pages/register.php` | `assets/js/auth.js` |
| Overview | `pages/dashboard.php` | `assets/js/pages/dashboard.js` |
| Events | `pages/events.php` | `assets/js/pages/events.js` |
| Venues | `pages/venues.php` | `assets/js/pages/venues.js` |
| Venue availability | `pages/availability.php` | `assets/js/pages/availability.js` |
| Bookings | `pages/bookings.php` | `assets/js/pages/bookings.js` |
| Payments | `pages/payments.php` | `assets/js/pages/payments.js` |
| Notifications | `pages/notifications.php` | `assets/js/pages/notifications.js` |
| User management | `pages/users.php` | `assets/js/pages/users.js` |

## Existing demo accounts

If the matching sample accounts still exist in your local database, you can use `admin@example.com`, `organiser1@example.com`, or `customer1@example.com` with the sample password `password123`.

## Loading behaviour

- The shared layout no longer contains a permanent generic spinner. Only sections that actually make data requests display a loading indicator.
- Requests time out after 12 seconds, and failed sections show the error returned by the API plus a **Try again** button. A final 18-second safeguard replaces any orphaned spinner left by an unexpected page-script error.
- If an error appears, verify that XAMPP Apache/MySQL are running and test the configured API `/health` endpoint in the browser or Postman. A timeout prevents endless loading; it does not itself fix an unavailable API.

## Troubleshooting

- API requests time out after 12 seconds instead of leaving an endless spinner. The page then shows an error message and a Try again button. If a section is still showing a spinner after 18 seconds, the shared page guard replaces it with a retry panel.
- If sign-in or data loading says it cannot reach the API, start Apache and MySQL and verify `includes/config.php`.
- If Register returns 404, the shared backend does not have the `/auth/register` route yet.
- If a user sees 403 or 422 for a data action, the backend may have rejected the role, request body, or related record. The frontend does not bypass those checks.
- A page uses the relevant API routes documented for the current project. Some optional fields (for example venue names included in events or payment details included with bookings) depend on exactly what the local backend returns.

## Venue unavailability frontend fix

The venue calendar page now follows the `venue_unavailability` model:
- Fetches `GET /venues/{venue_id}/unavailability`.
- Reads `unavailability_date` (and accepts legacy date aliases for compatibility).
- Uses `record_type` to distinguish `admin_block` from `organiser_booking`.
- Submits `venue_id`, `unavailability_date`, `start_time`, `end_time`, and `reason` to `POST /unavailability`; edits use `PUT /unavailability/{id}` and delete uses `DELETE /unavailability/{id}`.
- An Admin may manage blocks; an Organiser can manage their own hall reservations when the API response includes `record_type='organiser_booking'` and `booked_by` matching the logged-in user's ID.

### Backend dependency (important)

The frontend cannot register API routes. Your backend must implement these routes and query the renamed `venue_unavailability` table using `unavailability_date`, `record_type`, `booked_by`, `start_time`, `end_time`, and `reason`. If the Block a date action returns `Route not found`, merge the `/unavailability` route into the existing `index.php` router and implement the corresponding controller methods. Do not create a second duplicate route switch or replace unrelated API routes. The server must infer `record_type` and `booked_by` from the verified JWT role/identity, validate date/time and overlapping events, and check role/ownership for update/delete.


## Latest update: Printable tickets and supported payment methods

- The customer Bookings page shows a Ticket QR action for paid bookings. The ticket dialog includes booking code, booking ID, customer, event, venue, dates, ticket quantity, amount, booking status, payment status/method and QR code.
- The dialog's Print ticket button opens a print-friendly ticket page and starts the browser print dialog. Allow pop-ups for localhost if the browser blocks it.
- FPX was removed. The payment selector now uses `e_wallet`, `credit_card`, `debit_card`, and `online_banking`, matching the backend validation previously shown.
- No database change is needed for these frontend updates.
