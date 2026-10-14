# Event Ticketing & Venue Booking API

Shared PHP + MySQL RESTful backend for the SWC3633/SWC4443 Event Ticketing and Venue Booking System.

## Final design

### Roles
- Admin
- Organiser
- Customer

### Database tables
1. `users` — user accounts and roles
2. `venues` — event locations and capacity
3. `venue_unavailability` — available/blocked date and time slots
4. `event_categories` — Concert, Talk Session, Workshop, Seminar, Sports, etc.
5. `events` — event details, schedule, ticket limits and availability
6. `bookings` — customer ticket bookings and cancellation history
7. `payments` — simulated payment and refund status
8. `notifications` — admin/organiser messages delivered to customers

## Requirements
- XAMPP (Apache + MySQL)
- PHP 8.1 or newer
- MySQL / MariaDB compatible with the SQL script
- Postman for API testing

## Setup
1. Put the folder in `C:\xampp\htdocs\event-ticketing-backend`.
2. Start Apache and MySQL in XAMPP.
3. Open phpMyAdmin and import `database/schema.sql`.
4. Edit `config/config.php` and set a strong `jwt_secret` and `api_key`.
5. Open `http://localhost/event-ticketing-backend/api/`.
6. The shared API base URL is `http://localhost/event-ticketing-backend/api`.

## Demo accounts
All demo accounts use the password:
`password123`

- `admin@example.com` — admin
- `organiser1@example.com` — organiser
- `organiser2@example.com` — organiser
- `customer1@example.com` — customer
- `customer2@example.com` — customer
- `customer3@example.com` — customer

## Main permission model

### Admin
- Manage users
- Manage venues
- Manage venue unavailability
- Manage categories
- Create/update/delete events
- View all bookings/payments
- Send notifications

### Organiser
- View/manage venues and unvailability
- Create/update/delete own events
- Manage ticket availability through events
- View bookings for own events
- View payments for own events
- Send notifications
- Process event-related refunds

### Customer
- Browse/search events and categories
- View venue availability
- Create bookings
- Pay for bookings (simulated)
- View own bookings/payments
- Cancel eligible bookings
- Receive/read notifications
- Generate QR ticket for confirmed booking

## API endpoints

### Authentication
- `POST /auth/login`

### Users
- `GET /users`
- `GET /users/{id}`
- `POST /users`
- `PUT /users/{id}`
- `DELETE /users/{id}`

### Venues
- `GET /venues`
- `GET /venues/{id}`
- `POST /venues`
- `PUT /venues/{id}`
- `DELETE /venues/{id}`
- `GET /venues/{id}/availability`

### Venue availability
- `GET /availability`
- `POST /availability`
- `PUT /availability/{id}`
- `DELETE /availability/{id}`

### Categories
- `GET /categories`
- `GET /categories/{id}`
- `POST /categories`
- `PUT /categories/{id}`
- `DELETE /categories/{id}`

### Events
- `GET /events`
- `GET /events/{id}`
- `POST /events`
- `PUT /events/{id}`
- `DELETE /events/{id}`

Search example:
`GET /events?search=Cyber&page=1&per_page=10`

Filter examples:
- `GET /events?category_id=1`
- `GET /events?venue_id=2`
- `GET /events?status=upcoming`

### Bookings
- `GET /bookings`
- `GET /bookings/{id}`
- `POST /bookings`
- `DELETE /bookings/{id}` — cancel booking
- `GET /bookings/{id}/qr` — JWT + X-API-Key

### Payments
- `GET /payments`
- `GET /payments/{id}`
- `POST /payments` — simulated payment
- `POST /payments/{id}/refund` — admin/organiser refund

### Notifications
- `GET /notifications`
- `GET /notifications/{id}`
- `POST /notifications`
- `PUT /notifications/{id}/read`
- `DELETE /notifications/{id}`

Notification broadcast example body:
```json
{
  "title": "System Announcement",
  "message": "The event system will be updated tonight.",
  "notification_type": "general",
  "broadcast": true
}
```

## Important business rules

### Venue unavailability
An event can only be created when:
1. the selected venue exists;
2. a matching `available` venue slot exists for the same date and time; and
3. another upcoming/ongoing event does not overlap the requested time.

### Venue capacity
`total_tickets` cannot exceed the venue capacity.

### Booking
A customer first creates a `pending` booking. The booking becomes `confirmed` only after a successful simulated payment.

### Cancellation
- Customers can cancel their own confirmed booking at least 24 hours before the event.
- Organisers can cancel bookings belonging to their own events.
- Admins can cancel any booking.
- Cancelled confirmed bookings return the tickets to `available_tickets`.
- Paid cancellations are first marked `refund_pending`; an admin/organiser then processes the simulated refund through the payment endpoint.
- Booking rows are kept for history; they are not physically deleted.

### Event cancellation
When an event is changed to `cancelled`, confirmed bookings are cancelled and paid payments are marked as `refund_pending` so an admin/organiser can process the simulated refunds.

## External API

The QR ticket endpoint integrates with the external QR Code Generator API:
`https://api.qrserver.com/v1/create-qr-code/`

Request:
`GET /bookings/{id}/qr`

Headers:
- `Authorization: Bearer <JWT>`
- `X-API-Key: <configured API key>`

## API management features

This backend demonstrates:
- Request logging (`storage/logs/app.log`)
- Pagination (`page`, `per_page`)
- Search and filtering
- JWT authentication
- Role-based access control
- Input validation
- Centralised JSON error responses

## GitHub

Do not commit `config/config.php` with your real secret. Keep `config/config.example.php` in the repository and configure local secrets separately.
