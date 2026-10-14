# Event Ticketing & Venue Booking System - Frontend

Plain HTML/CSS/JS frontend for the Event Ticketing & Venue Booking PHP REST API.
No build step, no framework, no npm install - just static files that talk to the
backend over fetch().

## 1. How to run it

You need the backend running on XAMPP first (Apache + MySQL started, database
imported, the `event-ticketing-backend` folder in `htdocs`).

Two ways to serve this frontend folder:

**Option A - drop it in htdocs next to the backend (easiest)**
Copy this whole `frontend` folder into your XAMPP `htdocs` directory, e.g.:
```
htdocs/
  event-ticketing-backend/   <- the PHP API
  frontend/                  <- this folder
```
Then open `http://localhost/frontend/index.html` in your browser.

**Option B - serve it with any static file server**
Since there's no build step, any simple static server works, e.g. from inside
this folder:
```
python3 -m http.server 5500
```
Then open `http://localhost:5500/index.html`. (The backend must still be
running separately in XAMPP - CORS is open on the API side, `cors_origin: '*'`.)

## 2. Point it at YOUR backend

Each group member needs their own XAMPP install, so the API base URL is a
single constant you edit per machine. Open **`js/api.js`** and change the top
two lines:

```js
const API_BASE = "http://localhost/event-ticketing-backend/api";
const API_KEY = "DSvpeKbVqg789PCAQ6EWONRnsMJUwF2d";
```

- `API_BASE` - change this if your backend folder has a different name, or if
  you're all sharing one teammate's backend over the network (use their IP,
  e.g. `http://192.168.1.5/event-ticketing-backend/api`).
- `API_KEY` - must match `config/config.php` -> `app.api_key` on whichever
  backend you're pointing at. It's only used for the "Get QR ticket" button
  (`GET /bookings/{id}/qr`), which the backend requires an `X-API-Key` header
  for on top of the normal login token. The value above is the default that
  ships in the backend repo - if your copy of `config.php` has a different
  key, update it here too.

That's it - no other file needs editing.

## 3. Demo accounts

All demo accounts use the password `password123`:

| Role      | Email                     |
|-----------|---------------------------|
| Admin     | admin@example.com         |
| Organiser | organiser1@example.com    |
| Organiser | organiser2@example.com    |
| Customer  | customer1@example.com     |
| Customer  | customer2@example.com     |
| Customer  | customer3@example.com     |

## 4. What's in here

```
frontend/
  index.html          Login page
  dashboard.html       Main app shell (top nav + all sections)
  css/
    style.css          The provided design system - copied as-is, don't edit
    extra.css           A few small additions (toasts, pagination row, etc.)
  js/
    api.js             fetch() wrapper - API_BASE/API_KEY live here
    auth.js             Login/logout/session (localStorage)
    app.js              Nav, section switching, modal helper, toasts, notification bell
    events.js            Browse/search events, create/edit/delete, booking, "My bookings"
    venues.js             Venue list + create/edit/delete
    availability.js       Venue availability slot management
    categories.js         Event category admin
    bookings.js            Bookings list, pay, cancel, QR ticket
    payments.js             Payments list, pay-now modal, refund
    notifications.js         Compose/send notification full-page screen
    users.js                  Admin user management
```

Every section hides/shows its own buttons based on the logged-in user's role
(admin / organiser / customer), matching `docs/PERMISSION-MATRIX.md`. The
backend enforces the same rules server-side, so a hidden button is just a UI
nicety - if the frontend ever got out of sync, the API would still return a
403 and the frontend shows that as a red toast message.

## 5. Notes for the group

- The JWT expires after 1 hour by default (`jwt_ttl` in `config.php`) - if
  you get logged out unexpectedly, just log back in.
- The database, PHP server, and this frontend are three separate things.
  Only ONE of you needs to run the shared backend+DB if you're testing
  together; the rest just point `API_BASE` at that person's machine IP. For
  solo testing, run your own local XAMPP copy of the backend instead.
- This was built without a live backend connection, so while every request
  was checked carefully against the controllers in `controllers/*.php` and
  `docs/API-DOCUMENTATION.md`, test the full flow (login -> browse events ->
  book -> pay -> QR ticket -> cancel -> refund) against a real running
  backend before submitting, and fix anything that doesn't match your
  teammates' exact database state.
