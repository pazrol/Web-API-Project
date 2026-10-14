QR TICKET FEATURE

1. Copy the frontend-emil folder into C:\xampp\htdocs\Web-API-Project\
2. Keep the existing event-ticketing-backend folder beside it.
3. Start Apache and MySQL and sign in as a customer.
4. Pay for a pending booking. On successful backend payment, booking becomes confirmed.
5. Open Bookings and click View QR Ticket.

The frontend uses ticket-qr.php as a local server-side bridge to GET /api/bookings/{id}/qr. The backend requires both JWT and X-API-Key; the bridge reads the backend config server-side and does not expose the API key in JavaScript. The backend checks booking ownership and confirmed status. QR images are served by external qrserver.com per the existing backend implementation. This is a demo QR payload, not a cryptographically signed ticket or scanner/anti-replay system.
