<?php

class BookingController
{
    public static function index(PDO $pdo, array $user): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $search = trim((string)($_GET['search'] ?? ''));
        $status = strtolower(trim((string)($_GET['status'] ?? '')));

        $conditions = [];
        $params = [];

        if ($user['role'] === 'customer') {
            $conditions[] = 'b.customer_id = ?';
            $params[] = (int)$user['sub'];
        } elseif ($user['role'] === 'organiser') {
            $conditions[] = 'e.organiser_id = ?';
            $params[] = (int)$user['sub'];
        }

        if ($search !== '') {
            $conditions[] = '(b.booking_code LIKE ? OR e.title LIKE ? OR c.name LIKE ?)';
            $term = '%' . $search . '%';
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        if ($status !== '') {
            if (!in_array($status, ['pending', 'confirmed', 'cancelled'], true)) {
                error_response('Invalid booking status filter.', 422);
            }
            $conditions[] = 'b.status = ?';
            $params[] = $status;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM bookings b JOIN events e ON e.id = b.event_id JOIN users c ON c.id = b.customer_id $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT b.id, b.booking_code, b.event_id, e.title AS event_title,
                    b.customer_id, c.name AS customer_name,
                    b.quantity, b.total_amount, b.status,
                    b.booked_at, b.cancelled_at, b.cancellation_reason,
                    e.start_datetime, e.end_datetime, v.name AS venue_name,
                    p.payment_status, p.payment_method, p.payment_reference
                FROM bookings b
                JOIN events e ON e.id = b.event_id
                JOIN users c ON c.id = b.customer_id
                JOIN venues v ON v.id = e.venue_id
                LEFT JOIN payments p ON p.booking_id = b.id
                $where
                ORDER BY b.id DESC
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

    public static function show(PDO $pdo, int $id, array $user): void
    {
        $stmt = $pdo->prepare("SELECT b.id, b.booking_code, b.event_id,
                    e.title AS event_title, e.description AS event_description,
                    b.customer_id, c.name AS customer_name, c.email AS customer_email,
                    b.quantity, b.total_amount, b.status,
                    b.booked_at, b.cancelled_at, b.cancellation_reason,
                    e.start_datetime, e.end_datetime,
                    v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
                    p.id AS payment_id, p.payment_reference, p.payment_method,
                    p.payment_status, p.amount AS payment_amount, p.paid_at, p.refunded_at, p.refund_amount
                FROM bookings b
                JOIN events e ON e.id = b.event_id
                JOIN users c ON c.id = b.customer_id
                JOIN venues v ON v.id = e.venue_id
                LEFT JOIN payments p ON p.booking_id = b.id
                WHERE b.id = ?");
        $stmt->execute([$id]);
        $booking = $stmt->fetch();
        if (!$booking) {
            error_response('Booking not found.', 404);
        }

        if (!self::canView($pdo, $booking, $user)) {
            error_response('You are not allowed to view this booking.', 403);
        }

        json_response($booking);
    }

    public static function store(PDO $pdo, array $data, array $user): void
    {
        if ($user['role'] !== 'customer') {
            error_response('Only customers can create bookings.', 403);
        }

        $errors = validate_required($data, ['event_id', 'quantity']);
        if (isset($data['quantity']) && (!is_numeric($data['quantity']) || (int)$data['quantity'] <= 0)) {
            $errors['quantity'] = 'Quantity must be a positive integer.';
        }
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $eventId = (int)$data['event_id'];
        $quantity = (int)$data['quantity'];

        $pdo->beginTransaction();
        try {
            $eventStmt = $pdo->prepare('SELECT * FROM events WHERE id = ? FOR UPDATE');
            $eventStmt->execute([$eventId]);
            $event = $eventStmt->fetch();

            if (!$event) {
                throw new RuntimeException('Event not found.', 404);
            }
            if (!in_array($event['status'], ['upcoming', 'ongoing'], true)) {
                throw new RuntimeException('Event is not available for booking.', 422);
            }
            if (strtotime($event['start_datetime']) <= time()) {
                throw new RuntimeException('This event is no longer available for new bookings.', 422);
            }
            if ($quantity > (int)$event['available_tickets']) {
                throw new RuntimeException('Not enough tickets available.', 422);
            }

            $bookingCode = 'BK' . date('YmdHis') . strtoupper(bin2hex(random_bytes(3)));
            $total = format_decimal($quantity * (float)$event['ticket_price']);

            $stmt = $pdo->prepare("INSERT INTO bookings (booking_code, event_id, customer_id, quantity, total_amount, status) VALUES (?, ?, ?, ?, ?, 'pending')");
            $stmt->execute([$bookingCode, $eventId, (int)$user['sub'], $quantity, $total]);

            $bookingId = (int)$pdo->lastInsertId();
            $pdo->commit();

            self::show($pdo, $bookingId, $user);
        } catch (RuntimeException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_response($e->getMessage(), $e->getCode() >= 400 ? $e->getCode() : 400);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function cancel(PDO $pdo, int $id, array $user): void
    {
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT b.*, e.start_datetime, e.title AS event_title FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $booking = $stmt->fetch();
            if (!$booking) {
                throw new RuntimeException('Booking not found.', 404);
            }

            $isCustomer = $user['role'] === 'customer' && (int)$booking['customer_id'] === (int)$user['sub'];
            $isAdmin = $user['role'] === 'admin';
            $isOwner = $user['role'] === 'organiser' && self::isEventOwner($pdo, (int)$booking['event_id'], (int)$user['sub']);

            if (!($isCustomer || $isAdmin || $isOwner)) {
                throw new RuntimeException('You are not allowed to cancel this booking.', 403);
            }

            if ($booking['status'] === 'cancelled') {
                throw new RuntimeException('Booking is already cancelled.', 409);
            }

            if ($isCustomer && $booking['status'] === 'confirmed') {
                $hoursBeforeEvent = ((int)strtotime($booking['start_datetime']) - time()) / 3600;
                if ($hoursBeforeEvent < 24) {
                    throw new RuntimeException('Customers can only cancel confirmed bookings at least 24 hours before the event.', 409);
                }
            }

            $cancelledStatus = 'cancelled';
            $reason = trim((string)($GLOBALS['_current_request_input']['reason'] ?? ''));
            if ($reason === '') {
                $reason = $isCustomer ? 'Cancelled by customer' : 'Cancelled by administrator/organiser';
            }

            $update = $pdo->prepare("UPDATE bookings SET status = ?, cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? WHERE id = ?");
            $update->execute([$cancelledStatus, $reason, $id]);

            if ($booking['status'] === 'confirmed') {
                $restore = $pdo->prepare('UPDATE events SET available_tickets = LEAST(total_tickets, available_tickets + ?) WHERE id = ?');
                $restore->execute([(int)$booking['quantity'], (int)$booking['event_id']]);
            }

            $paymentStmt = $pdo->prepare("UPDATE payments SET
                    payment_status = CASE
                        WHEN payment_status = 'paid' THEN 'refund_pending'
                        WHEN payment_status = 'pending' THEN 'failed'
                        ELSE payment_status
                    END,
                    refunded_at = NULL,
                    refund_amount = NULL
                    WHERE booking_id = ?");
            $paymentStmt->execute([$id]);

            $notify = $pdo->prepare("INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (?, ?, ?, 'Booking Cancelled', ?, 'booking_cancelled')");
            $notify->execute([
                (int)$user['sub'],
                (int)$booking['customer_id'],
                (int)$booking['event_id'],
                'Booking ' . $booking['booking_code'] . ' for ' . $booking['event_title'] . ' has been cancelled.',
            ]);

            $pdo->commit();
        } catch (RuntimeException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_response($e->getMessage(), $e->getCode() >= 400 ? $e->getCode() : 400);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        json_response(null, 200, 'Booking cancelled successfully.');
    }

    private static function canView(PDO $pdo, array $booking, array $user): bool
    {
        if ($user['role'] === 'admin') {
            return true;
        }
        if ($user['role'] === 'customer') {
            return (int)$booking['customer_id'] === (int)$user['sub'];
        }
        return $user['role'] === 'organiser' && self::isEventOwner($pdo, (int)$booking['event_id'], (int)$user['sub']);
    }

    private static function isEventOwner(PDO $pdo, int $eventId, int $userId): bool
    {
        $stmt = $pdo->prepare('SELECT organiser_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $organiserId = $stmt->fetchColumn();
        return $organiserId !== false && (int)$organiserId === $userId;
    }
}
