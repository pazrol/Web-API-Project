EVENTORA FRONTEND — NEW BACKEND API

1. Back up your old frontend-emil folder before replacing anything.
2. Extract these frontend files into C:\xampp\htdocs\Web-API-Project\frontend-emil\
3. Extract the supplied NEW backend ZIP into C:\xampp\htdocs\Web-API-Project\event-ticketing-backend\ (do not nest a second folder).
4. Import the supplied event_ticketing (2).sql in phpMyAdmin into database event_ticketing. BACK UP any existing database first.
5. Start Apache and MySQL in XAMPP.
6. Open http://localhost/Web-API-Project/event-ticketing-backend/api/health . You should receive JSON indicating API and database are working.
7. Open http://localhost/Web-API-Project/frontend-emil/index.html and sign in.
8. Check config.js if you use a different backend directory.

This is a newly written frontend that imitates the same glass aesthetic; the original frontend source was not provided, so exact CSS fidelity cannot be guaranteed.

Registration uses the new /auth/register route. Admin registration requires a reference key configured on the backend. Do not put that key into frontend JavaScript. The supplied backend also allows public organiser registration; review this security decision with your group before deploying.

Event creation requires a suitable venue availability slot according to the backend rules. Booking requires customer login; payment confirms a pending booking.

The supplied backend ZIP contains its own configuration and secrets. Review and change default JWT secret, API key, admin registration reference key and database credentials before deploying beyond local development.

This frontend was statically checked against the uploaded API routes and data structures. Live XAMPP/MySQL connection testing must be done on your own computer.


HAULIX-INSPIRED DESIGN UPDATE
- Replaced pastel glass dashboard with dark fixed sidebar, lime accents, clean tables and cards.
- Preserved backend endpoints and role-specific workflows.
- Admin Create Event form now includes an Organiser ID dropdown loaded from /users.
- Test locally with Apache/MySQL; backend permissions remain authoritative.
