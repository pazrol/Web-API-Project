EVENTORA QR FIX
The original QR bridge read HTTP_AUTHORIZATION from Apache/PHP, which may be unavailable on XAMPP even though the browser sends Authorization. The corrected bridge receives the existing login JWT in a same-origin JSON POST, then sends it to the backend as an Authorization header alongside the server-side API key.

INSTALL:
1. Back up your existing frontend-emil folder.
2. Extract the frontend-emil folder from this ZIP into C:\xampp\htdocs\Web-API-Project\, replacing frontend files only.
3. Do not modify the backend or database.
4. Refresh browser with Ctrl+F5. Sign out and log in again if your JWT expired.
5. Open Customer > Bookings > View QR Ticket.

QR generation is still governed by the backend's booking ownership and confirmed-status checks. The backend QR endpoint does not separately verify payment_status=paid, so this frontend-only fix cannot enforce that extra payment rule securely. The QR image is provided by the backend's external QR provider and requires internet access.
