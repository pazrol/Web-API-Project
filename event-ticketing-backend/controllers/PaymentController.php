<?php

class PaymentController
{
    private const METHODS = ['credit_card', 'debit_card', 'online_banking', 'e_wallet'];

    public static function index(PDO $pdo, array $user): void
    {
        [$page, $perPage, $offset] = pagination_params();
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

        if ($status !== '') {
            if (!in_array($status, ['pending', 'paid', 'failed', 'refund_pending', 'refunded'], true)) {
                error_response('Invalid payment status filter.', 422);
            }
            $conditions[] = 'p.payment_status = ?';
            $params[] = $status;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN events e ON e.id = b.event_id $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT p.id, p.booking_id, b.booking_code, b.customer_id,
                    e.title AS event_title, p.payment_reference, p.amount,
                    p.payment_method, p.payment_status, p.paid_at, p.refunded_at, p.refund_amount,
                    p.created_at, p.updated_at
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                JOIN events e ON e.id = b.event_id
                $where
                ORDER BY p.id DESC
                LIMIT ? OFFSET ?");
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
        $stmt = $pdo->prepare('SELECT p.id, p.booking_id, b.booking_code, b.customer_id,
            e.id AS event_id, e.title AS event_title,
            p.payment_reference, p.amount, p.payment_method, p.payment_status,
            p.paid_at, p.refunded_at, p.refund_amount, p.created_at, p.updated_at
            FROM payments p
            JOIN bookings b ON b.id = p.booking_id
            JOIN events e ON e.id = b.event_id
            WHERE p.id = ?');
        $stmt->execute([$id]);
        $payment = $stmt->fetch();
        if (!$payment) {
            error_response('Payment not found.', 404);
        }

        self::authorizePayment($pdo, $payment, $user);
        json_response($payment);
    }

    public static function store(PDO $pdo, array $data, array $user): void
    {
        if ($user['role'] !== 'customer') {
            error_response('Only customers can make payments for bookings.', 403);
        }

        $errors = validate_required($data, ['booking_id', 'payment_method']);
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $bookingId = (int)$data['booking_id'];
        $method = strtolower(trim((string)$data['payment_method']));
        if (!in_array($method, self::METHODS, true)) {
            error_response('Payment method must be credit_card, debit_card, online_banking, or e_wallet.', 422);
        }

        $pdo->beginTransaction();
        try {
            $bookingStmt = $pdo->prepare('SELECT b.*, e.title AS event_title, e.available_tickets, e.start_datetime FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = ? FOR UPDATE');
            $bookingStmt->execute([$bookingId]);
            $booking = $bookingStmt->fetch();

            if (!$booking) {
                throw new RuntimeException('Booking not found.', 404);
            }
            if ((int)$booking['customer_id'] !== (int)$user['sub']) {
                throw new RuntimeException('You are not allowed to pay for this booking.', 403);
            }
            if ($booking['status'] !== 'pending') {
                throw new RuntimeException('Only pending bookings can be paid.', 409);
            }
            if (strtotime((string)$booking['start_datetime']) <= time()) {
                throw new RuntimeException('Payment is no longer allowed after the event has started.', 409);
            }
            if ((int)$booking['quantity'] > (int)$booking['available_tickets']) {
                throw new RuntimeException('There are no longer enough tickets available for this booking.', 409);
            }

            $existingStmt = $pdo->prepare('SELECT id, payment_status FROM payments WHERE booking_id = ? FOR UPDATE');
            $existingStmt->execute([$bookingId]);
            $existing = $existingStmt->fetch();
            if ($existing) {
                throw new RuntimeException('A payment record already exists for this booking.', 409);
            }

            $reference = 'PAY' . date('YmdHis') . strtoupper(bin2hex(random_bytes(3)));
            $amount = format_decimal((float)$booking['total_amount']);

            $paymentStmt = $pdo->prepare("INSERT INTO payments (booking_id, payment_reference, amount, payment_method, payment_status, paid_at) VALUES (?, ?, ?, ?, 'paid', CURRENT_TIMESTAMP)");
            $paymentStmt->execute([$bookingId, $reference, $amount, $method]);

            $bookingUpdate = $pdo->prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?");
            $bookingUpdate->execute([$bookingId]);

            $ticketUpdate = $pdo->prepare('UPDATE events SET available_tickets = available_tickets - ? WHERE id = ? AND available_tickets >= ?');
            $ticketUpdate->execute([(int)$booking['quantity'], (int)$booking['event_id'], (int)$booking['quantity']]);
            if ($ticketUpdate->rowCount() === 0) {
                throw new RuntimeException('Ticket availability changed. Payment was not completed.', 409);
            }

            $notify = $pdo->prepare("INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (NULL, ?, ?, 'Booking Confirmed', ?, 'booking_confirmed')");
            $notify->execute([
                (int)$user['sub'],
                (int)$booking['event_id'],
                'Your payment ' . $reference . ' was successful and booking ' . $booking['booking_code'] . ' is confirmed.',
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

        $stmt = $pdo->prepare('SELECT * FROM payments WHERE booking_id = ?');
        $stmt->execute([$bookingId]);
        json_response($stmt->fetch(), 201, 'Payment successful. Booking confirmed.');
    }

    public static function refund(PDO $pdo, int $id, array $user): void
    {
        if (!in_array($user['role'], ['admin', 'organiser'], true)) {
            error_response('Only administrators or organisers can manually process a refund.', 403);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT p.*, b.customer_id, b.booking_code, b.event_id, b.status AS booking_status FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $payment = $stmt->fetch();
            if (!$payment) {
                throw new RuntimeException('Payment not found.', 404);
            }

            if ($user['role'] === 'organiser') {
                $owner = $pdo->prepare('SELECT organiser_id FROM events WHERE id = ?');
                $owner->execute([(int)$payment['event_id']]);
                if ((int)$owner->fetchColumn() !== (int)$user['sub']) {
                    throw new RuntimeException('You are not allowed to refund a payment for this event.', 403);
                }
            }

            $bookingState = (string)($payment['booking_status'] ?? '');
            if ($bookingState !== 'cancelled') {
                throw new RuntimeException('The booking must be cancelled before its payment can be refunded.', 409);
            }

            if (!in_array($payment['payment_status'], ['paid', 'refund_pending'], true)) {
                throw new RuntimeException('Only paid or refund-pending payments can be refunded.', 409);
            }

            $update = $pdo->prepare("UPDATE payments SET payment_status = 'refunded', refunded_at = CURRENT_TIMESTAMP, refund_amount = amount WHERE id = ?");
            $update->execute([$id]);

            $notify = $pdo->prepare("INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (?, ?, ?, 'Payment Refunded', ?, 'refund')");
            $notify->execute([
                (int)$user['sub'],
                (int)$payment['customer_id'],
                (int)$payment['event_id'],
                'Your payment ' . $payment['payment_reference'] . ' has been refunded.',
            ]);

            $pdo->commit();
        } catch (RuntimeException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_response($e->getMessage(), $e->getCode() >= 400 ? $e->getCode() : 400);
        }

        json_response(null, 200, 'Payment refunded successfully.');
    }

    private static function authorizePayment(PDO $pdo, array $payment, array $user): void
    {
        if ($user['role'] === 'admin') {
            return;
        }
        if ($user['role'] === 'customer' && (int)$payment['customer_id'] === (int)$user['sub']) {
            return;
        }
        if ($user['role'] === 'organiser') {
            $stmt = $pdo->prepare('SELECT organiser_id FROM events WHERE id = ?');
            $stmt->execute([(int)$payment['event_id']]);
            if ((int)$stmt->fetchColumn() === (int)$user['sub']) {
                return;
            }
        }
        error_response('You are not allowed to view this payment.', 403);
    }
}
