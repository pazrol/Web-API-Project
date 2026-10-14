<?php

require_once __DIR__ . '/UnavailabilityController.php';

class EventController
{
    public static function index(PDO $pdo): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $search = trim((string)($_GET['search'] ?? ''));
        $status = strtolower(trim((string)($_GET['status'] ?? '')));
        $venueId = (int)($_GET['venue_id'] ?? 0);
        $categoryId = (int)($_GET['category_id'] ?? 0);
        $organiserId = (int)($_GET['organiser_id'] ?? 0);

        $conditions = [];
        $params = [];

        if ($search !== '') {
            $conditions[] = '(e.title LIKE ? OR e.description LIKE ? OR v.name LIKE ? OR c.category_name LIKE ?)';
            $term = '%' . $search . '%';
            $params = [$term, $term, $term, $term];
        }
        if ($status !== '') {
            if (!in_array($status, ['upcoming', 'ongoing', 'completed', 'cancelled'], true)) {
                error_response('Invalid event status filter.', 422);
            }
            $conditions[] = 'e.status = ?';
            $params[] = $status;
        }
        if ($venueId > 0) {
            $conditions[] = 'e.venue_id = ?';
            $params[] = $venueId;
        }
        if ($categoryId > 0) {
            $conditions[] = 'e.category_id = ?';
            $params[] = $categoryId;
        }
        if ($organiserId > 0) {
            $conditions[] = 'e.organiser_id = ?';
            $params[] = $organiserId;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countSql = "SELECT COUNT(*)
            FROM events e
            JOIN venues v ON v.id = e.venue_id
            JOIN event_categories c ON c.id = e.category_id
            JOIN users u ON u.id = e.organiser_id
            $where";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT e.id, e.title, e.description,
                    e.category_id, c.category_name,
                    e.venue_id, v.name AS venue_name, v.address AS venue_address, v.capacity AS venue_capacity,
                    e.organiser_id, u.name AS organiser_name,
                    e.start_datetime, e.end_datetime,
                    e.ticket_price, e.total_tickets, e.available_tickets,
                    e.status, e.created_at, e.updated_at
                FROM events e
                JOIN venues v ON v.id = e.venue_id
                JOIN event_categories c ON c.id = e.category_id
                JOIN users u ON u.id = e.organiser_id
                $where
                ORDER BY e.start_datetime ASC
                LIMIT ? OFFSET ?";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $i => $value) {
            $stmt->bindValue($i + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->bindValue(count($params) + 1, $perPage, PDO::PARAM_INT);
        $stmt->bindValue(count($params) + 2, $offset, PDO::PARAM_INT);
        $stmt->execute();

        json_response([
            'items' => $stmt->fetchAll(),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => $total === 0 ? 0 : (int)ceil($total / $perPage),
            ],
        ]);
    }

    public static function show(PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT e.id, e.title, e.description,
            e.category_id, c.category_name,
            e.venue_id, v.name AS venue_name, v.address AS venue_address, v.capacity AS venue_capacity,
            e.organiser_id, u.name AS organiser_name,
            e.start_datetime, e.end_datetime,
            e.ticket_price, e.total_tickets, e.available_tickets,
            e.status, e.created_at, e.updated_at
            FROM events e
            JOIN venues v ON v.id = e.venue_id
            JOIN event_categories c ON c.id = e.category_id
            JOIN users u ON u.id = e.organiser_id
            WHERE e.id = ?');
        $stmt->execute([$id]);
        $event = $stmt->fetch();
        if (!$event) {
            error_response('Event not found.', 404);
        }
        json_response($event);
    }

    public static function store(PDO $pdo, array $data, array $user): void
    {
        $errors = validate_required($data, [
            'title',
            'category_id',
            'venue_id',
            'start_datetime',
            'end_datetime',
            'ticket_price',
            'total_tickets',
        ]);

        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $title = trim((string)$data['title']);
        if ($title === '') {
            error_response('Title cannot be empty.', 422);
        }

        $categoryId = (int)$data['category_id'];
        $venueId = (int)$data['venue_id'];
        $ticketPrice = (float)$data['ticket_price'];
        $totalTickets = (int)$data['total_tickets'];
        $start = parse_datetime_value($data['start_datetime']);
        $end = parse_datetime_value($data['end_datetime']);

        if ($start === null || $end === null || $end <= $start) {
            error_response('Invalid event date/time range.', 422);
        }
        if ($ticketPrice < 0) {
            error_response('Ticket price must be zero or more.', 422);
        }
        if ($totalTickets <= 0) {
            error_response('Total tickets must be a positive integer.', 422);
        }

        $categoryStmt = $pdo->prepare('SELECT id FROM event_categories WHERE id = ?');
        $categoryStmt->execute([$categoryId]);
        if (!$categoryStmt->fetch()) {
            error_response('Event category not found.', 404);
        }

        $venueStmt = $pdo->prepare('SELECT id, capacity FROM venues WHERE id = ?');
        $venueStmt->execute([$venueId]);
        $venue = $venueStmt->fetch();
        if (!$venue) {
            error_response('Venue not found.', 404);
        }
        if ($totalTickets > (int)$venue['capacity']) {
            error_response('Total tickets cannot exceed venue capacity.', 422);
        }

        $organiserId = self::resolveOrganiserId($pdo, $data, $user);
        UnavailabilityController::assertEventFitsUnavailability(
            $pdo,
            $venueId,
            date('Y-m-d H:i:s', $start),
            date('Y-m-d H:i:s', $end)
        );

        $status = self::normalizeStatus((string)($data['status'] ?? 'upcoming'));
        if ($status === 'completed' || $status === 'cancelled') {
            if ($user['role'] !== 'admin') {
                error_response('Only administrators can directly create completed or cancelled events.', 403);
            }
        }

        $stmt = $pdo->prepare('INSERT INTO events
            (title, description, category_id, venue_id, organiser_id, start_datetime, end_datetime,
             ticket_price, total_tickets, available_tickets, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $title,
            trim((string)($data['description'] ?? '')),
            $categoryId,
            $venueId,
            $organiserId,
            date('Y-m-d H:i:s', $start),
            date('Y-m-d H:i:s', $end),
            format_decimal($ticketPrice),
            $totalTickets,
            $totalTickets,
            $status,
        ]);

        $eventId = (int)$pdo->lastInsertId();

        self::notifyEventCreated($pdo, $eventId);
        self::show($pdo, $eventId);
    }

    public static function update(PDO $pdo, int $id, array $data, array $user): void
    {
        $find = $pdo->prepare('SELECT * FROM events WHERE id = ?');
        $find->execute([$id]);
        $event = $find->fetch();
        if (!$event) {
            error_response('Event not found.', 404);
        }

        if ($user['role'] === 'organiser' && (int)$event['organiser_id'] !== (int)$user['sub']) {
            error_response('You can only modify events assigned to your account.', 403);
        }

        $title = array_key_exists('title', $data) ? trim((string)$data['title']) : $event['title'];
        $description = array_key_exists('description', $data) ? trim((string)$data['description']) : $event['description'];
        $categoryId = array_key_exists('category_id', $data) ? (int)$data['category_id'] : (int)$event['category_id'];
        $venueId = array_key_exists('venue_id', $data) ? (int)$data['venue_id'] : (int)$event['venue_id'];
        $start = parse_datetime_value($data['start_datetime'] ?? $event['start_datetime']);
        $end = parse_datetime_value($data['end_datetime'] ?? $event['end_datetime']);
        $ticketPrice = array_key_exists('ticket_price', $data) ? (float)$data['ticket_price'] : (float)$event['ticket_price'];
        $totalTickets = array_key_exists('total_tickets', $data) ? (int)$data['total_tickets'] : (int)$event['total_tickets'];
        $status = self::normalizeStatus((string)($data['status'] ?? $event['status']));

        if ($title === '') {
            error_response('Title cannot be empty.', 422);
        }
        if ($start === null || $end === null || $end <= $start) {
            error_response('Invalid event date/time range.', 422);
        }
        if ($ticketPrice < 0) {
            error_response('Ticket price must be zero or more.', 422);
        }
        if ($totalTickets <= 0) {
            error_response('Total tickets must be a positive integer.', 422);
        }

        if ($user['role'] !== 'admin' && in_array($status, ['completed', 'cancelled'], true) && $status !== $event['status']) {
            // Organisers can cancel their own events, but the system will handle affected bookings/refunds.
            if ($status !== 'cancelled') {
                error_response('Only administrators can mark an event as completed.', 403);
            }
        }

        $catStmt = $pdo->prepare('SELECT id FROM event_categories WHERE id = ?');
        $catStmt->execute([$categoryId]);
        if (!$catStmt->fetch()) {
            error_response('Event category not found.', 404);
        }

        $venueStmt = $pdo->prepare('SELECT id, capacity FROM venues WHERE id = ?');
        $venueStmt->execute([$venueId]);
        $venue = $venueStmt->fetch();
        if (!$venue) {
            error_response('Venue not found.', 404);
        }
        if ($totalTickets > (int)$venue['capacity']) {
            error_response('Total tickets cannot exceed venue capacity.', 422);
        }

        $bookedStmt = $pdo->prepare("SELECT COALESCE(SUM(quantity), 0) FROM bookings WHERE event_id = ? AND status = 'confirmed'");
        $bookedStmt->execute([$id]);
        $booked = (int)$bookedStmt->fetchColumn();
        if ($totalTickets < $booked) {
            error_response('Total tickets cannot be lower than the number of confirmed booked tickets.', 422);
        }

        if ($status !== 'cancelled' && $status !== 'completed') {
            UnavailabilityController::assertEventFitsUnavailability(
                $pdo,
                $venueId,
                date('Y-m-d H:i:s', $start),
                date('Y-m-d H:i:s', $end),
                $id
            );
        }

        $availableTickets = $totalTickets - $booked;

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('UPDATE events SET
                title = ?, description = ?, category_id = ?, venue_id = ?,
                start_datetime = ?, end_datetime = ?, ticket_price = ?,
                total_tickets = ?, available_tickets = ?, status = ?
                WHERE id = ?');
            $stmt->execute([
                $title,
                $description,
                $categoryId,
                $venueId,
                date('Y-m-d H:i:s', $start),
                date('Y-m-d H:i:s', $end),
                format_decimal($ticketPrice),
                $totalTickets,
                $availableTickets,
                $status,
                $id,
            ]);

            if ($status === 'cancelled' && $event['status'] !== 'cancelled') {
                self::cancelConfirmedBookings($pdo, $id);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        if ($status !== $event['status']) {
            self::notifyEventStatusChange($pdo, $id, $status);
        }

        self::show($pdo, $id);
    }

    public static function destroy(PDO $pdo, int $id, array $user): void
    {
        $find = $pdo->prepare('SELECT id, organiser_id, status FROM events WHERE id = ?');
        $find->execute([$id]);
        $event = $find->fetch();
        if (!$event) {
            error_response('Event not found.', 404);
        }

        if ($user['role'] === 'organiser' && (int)$event['organiser_id'] !== (int)$user['sub']) {
            error_response('You can only delete events assigned to your account.', 403);
        }

        $check = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE event_id = ? AND status IN (\'pending\', \'confirmed\')');
        $check->execute([$id]);
        if ((int)$check->fetchColumn() > 0) {
            error_response('Event cannot be physically deleted while pending or confirmed bookings exist. Cancel the event instead.', 409);
        }

        $stmt = $pdo->prepare('DELETE FROM events WHERE id = ?');
        $stmt->execute([$id]);

        json_response(null, 200, 'Event deleted successfully.');
    }

    private static function resolveOrganiserId(PDO $pdo, array $data, array $user): int
    {
        if ($user['role'] === 'organiser') {
            return (int)$user['sub'];
        }

        $requested = (int)($data['organiser_id'] ?? 0);
        if ($requested <= 0) {
            error_response('Administrators must provide organiser_id when creating an event.', 422);
        }

        $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'organiser'");
        $stmt->execute([$requested]);
        if (!$stmt->fetch()) {
            error_response('Selected organiser was not found.', 404);
        }

        return $requested;
    }

    private static function normalizeStatus(string $status): string
    {
        $status = strtolower(trim($status));
        if (!in_array($status, ['upcoming', 'ongoing', 'completed', 'cancelled'], true)) {
            error_response('Status must be upcoming, ongoing, completed, or cancelled.', 422);
        }
        return $status;
    }

    private static function cancelConfirmedBookings(PDO $pdo, int $eventId): void
    {
        $stmt = $pdo->prepare("SELECT id, booking_code, customer_id, quantity FROM bookings WHERE event_id = ? AND status = 'confirmed' FOR UPDATE");
        $stmt->execute([$eventId]);
        $bookings = $stmt->fetchAll();

        if (!$bookings) {
            return;
        }

        $cancel = $pdo->prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = 'Event cancelled by organiser/administrator' WHERE id = ?");
        $payment = $pdo->prepare("UPDATE payments SET payment_status = CASE WHEN payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END, refunded_at = NULL, refund_amount = NULL WHERE booking_id = ?");
        $notify = $pdo->prepare("INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (NULL, ?, ?, 'Event Cancelled', ?, 'event_cancelled')");

        foreach ($bookings as $booking) {
            $cancel->execute([(int)$booking['id']]);
            $payment->execute([(int)$booking['id']]);
            $notify->execute([
                (int)$booking['customer_id'],
                $eventId,
                'Your booking ' . $booking['booking_code'] . ' has been cancelled because the event was cancelled. Any paid amount is now pending refund processing.',
            ]);
        }
    }

    private static function notifyEventCreated(PDO $pdo, int $eventId): void
    {
        // Creation notifications are intentionally not broadcast. Event browsing is sufficient;
        // targeted notifications are used for booking and status changes.
    }

    private static function notifyEventStatusChange(PDO $pdo, int $eventId, string $status): void
    {
        // Cancellation already creates targeted booking cancellation notifications.
        // For other status changes, notify customers who have/had a booking for this event.
        if ($status === 'cancelled') {
            return;
        }

        $customersStmt = $pdo->prepare('SELECT DISTINCT customer_id FROM bookings WHERE event_id = ?');
        $customersStmt->execute([$eventId]);
        $customers = $customersStmt->fetchAll();

        if (!$customers) {
            return;
        }

        $title = 'Event Status Updated';
        $message = 'An event you booked or interacted with has been updated. Current status: ' . strtoupper($status) . '.';
        $notify = $pdo->prepare("INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (NULL, ?, ?, ?, ?, 'event_updated')");

        foreach ($customers as $customer) {
            $notify->execute([(int)$customer['customer_id'], $eventId, $title, $message]);
        }
    }
}
