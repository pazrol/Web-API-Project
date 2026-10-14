<?php

class ExternalController
{
    public static function qrForBooking(PDO $pdo, int $id, array $user): void
    {
        require_api_key();

        $stmt = $pdo->prepare("SELECT b.id, b.booking_code, b.customer_id, b.event_id, b.status,
            e.title, e.start_datetime, e.end_datetime, v.name AS venue_name, v.address AS venue_address
            FROM bookings b
            JOIN events e ON e.id = b.event_id
            JOIN venues v ON v.id = e.venue_id
            WHERE b.id = ?");
        $stmt->execute([$id]);
        $booking = $stmt->fetch();

        if (!$booking) {
            error_response('Booking not found.', 404);
        }

        $allowed = $user['role'] === 'admin'
            || ($user['role'] === 'customer' && (int)$booking['customer_id'] === (int)$user['sub'])
            || ($user['role'] === 'organiser' && self::eventOwnedBy($pdo, (int)$booking['event_id'], (int)$user['sub']));

        if (!$allowed) {
            error_response('You are not allowed to generate this ticket QR code.', 403);
        }

        if ($booking['status'] !== 'confirmed') {
            error_response('A QR ticket can only be generated for a confirmed booking.', 409);
        }

       $payload = $booking['booking_code'];

        $qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . rawurlencode($payload);

        json_response([
            'booking_code' => $booking['booking_code'],
            'qr_data' => $payload,
            'qr_image_url' => $qrUrl,
            'external_service' => 'QR Code Generator API',
        ]);
    }

    private static function eventOwnedBy(PDO $pdo, int $eventId, int $userId): bool
    {
        $stmt = $pdo->prepare('SELECT organiser_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $owner = $stmt->fetchColumn();
        return $owner !== false && (int)$owner === $userId;
    }
}
