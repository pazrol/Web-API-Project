<?php

class NotificationController
{
    public static function index(PDO $pdo, array $user): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $isRead = $_GET['is_read'] ?? null;
        $search = trim((string)($_GET['search'] ?? ''));

        $conditions = [];
        $params = [];

        if ($user['role'] === 'customer') {
            $conditions[] = 'n.recipient_id = ?';
            $params[] = (int)$user['sub'];
        } elseif ($user['role'] === 'organiser') {
            $conditions[] = '(n.recipient_id = ? OR n.sender_id = ?)';
            $params[] = (int)$user['sub'];
            $params[] = (int)$user['sub'];
        }

        if ($isRead !== null && $isRead !== '') {
            if (!in_array((string)$isRead, ['0', '1'], true)) {
                error_response('is_read must be 0 or 1.', 422);
            }
            $conditions[] = 'n.is_read = ?';
            $params[] = (int)$isRead;
        }

        if ($search !== '') {
            $conditions[] = '(n.title LIKE ? OR n.message LIKE ?)';
            $term = '%' . $search . '%';
            $params[] = $term;
            $params[] = $term;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM notifications n $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT n.id,
                    n.sender_id, s.name AS sender_name,
                    n.recipient_id, r.name AS recipient_name,
                    n.event_id, e.title AS event_title,
                    n.title, n.message, n.notification_type, n.is_read, n.created_at
                FROM notifications n
                LEFT JOIN users s ON s.id = n.sender_id
                JOIN users r ON r.id = n.recipient_id
                LEFT JOIN events e ON e.id = n.event_id
                $where
                ORDER BY n.created_at DESC
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

    public static function store(PDO $pdo, array $data, array $sender): void
    {
        if (!in_array($sender['role'], ['admin', 'organiser'], true)) {
            error_response('Only administrators and organisers can send notifications.', 403);
        }

        $errors = validate_required($data, ['title', 'message']);
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $title = trim((string)$data['title']);
        $message = trim((string)$data['message']);
        if ($title === '' || $message === '') {
            error_response('Title and message cannot be empty.', 422);
        }

        $type = strtolower((string)($data['notification_type'] ?? 'general'));
        $allowedTypes = ['general', 'booking_confirmed', 'booking_cancelled', 'event_updated', 'event_cancelled', 'event_reminder', 'payment', 'refund'];
        if (!in_array($type, $allowedTypes, true)) {
            error_response('Invalid notification type.', 422);
        }

        $eventId = isset($data['event_id']) && $data['event_id'] !== '' ? (int)$data['event_id'] : null;
        if ($eventId !== null) {
            $eventStmt = $pdo->prepare('SELECT id FROM events WHERE id = ?');
            $eventStmt->execute([$eventId]);
            if (!$eventStmt->fetch()) {
                error_response('Event not found.', 404);
            }
        }

        $recipientId = $data['recipient_id'] ?? null;
        $broadcast = !empty($data['broadcast']) || $recipientId === 'all';

        $stmt = $pdo->prepare('INSERT INTO notifications (sender_id, recipient_id, event_id, title, message, notification_type) VALUES (?, ?, ?, ?, ?, ?)');

        if ($broadcast) {
            $customers = $pdo->query("SELECT id FROM users WHERE role = 'customer'")->fetchAll();
            if (!$customers) {
                error_response('No customer accounts are available for broadcast.', 409);
            }

            $created = 0;
            foreach ($customers as $customer) {
                $stmt->execute([
                    (int)$sender['sub'],
                    (int)$customer['id'],
                    $eventId,
                    $title,
                    $message,
                    $type,
                ]);
                $created++;
            }

            json_response(['recipients_count' => $created], 201, 'Notification broadcast successfully.');
        }

        if (!is_numeric($recipientId) || (int)$recipientId <= 0) {
            error_response('recipient_id must be a valid customer ID, or use broadcast=true.', 422);
        }

        $recipientStmt = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'");
        $recipientStmt->execute([(int)$recipientId]);
        if (!$recipientStmt->fetch()) {
            error_response('Recipient customer was not found.', 404);
        }

        $stmt->execute([
            (int)$sender['sub'],
            (int)$recipientId,
            $eventId,
            $title,
            $message,
            $type,
        ]);

        self::show($pdo, (int)$pdo->lastInsertId(), $sender);
    }

    public static function show(PDO $pdo, int $id, array $user): void
    {
        $stmt = $pdo->prepare('SELECT n.id, n.sender_id, s.name AS sender_name, n.recipient_id,
            r.name AS recipient_name, n.event_id, e.title AS event_title,
            n.title, n.message, n.notification_type, n.is_read, n.created_at
            FROM notifications n
            LEFT JOIN users s ON s.id = n.sender_id
            JOIN users r ON r.id = n.recipient_id
            LEFT JOIN events e ON e.id = n.event_id
            WHERE n.id = ?');
        $stmt->execute([$id]);
        $notification = $stmt->fetch();
        if (!$notification) {
            error_response('Notification not found.', 404);
        }

        if ($user['role'] === 'customer' && (int)$notification['recipient_id'] !== (int)$user['sub']) {
            error_response('You are not allowed to view this notification.', 403);
        }
        if ($user['role'] === 'organiser' && (int)$notification['sender_id'] !== (int)$user['sub'] && (int)$notification['recipient_id'] !== (int)$user['sub']) {
            error_response('You are not allowed to view this notification.', 403);
        }

        json_response($notification);
    }

    public static function markRead(PDO $pdo, int $id, array $user): void
    {
        $stmt = $pdo->prepare('SELECT recipient_id FROM notifications WHERE id = ?');
        $stmt->execute([$id]);
        $recipientId = $stmt->fetchColumn();
        if ($recipientId === false) {
            error_response('Notification not found.', 404);
        }

        if ($user['role'] !== 'admin' && (int)$recipientId !== (int)$user['sub']) {
            error_response('You can only mark your own notifications as read.', 403);
        }

        $update = $pdo->prepare('UPDATE notifications SET is_read = TRUE WHERE id = ?');
        $update->execute([$id]);

        json_response(null, 200, 'Notification marked as read.');
    }

    public static function destroy(PDO $pdo, int $id, array $user): void
    {
        $stmt = $pdo->prepare('SELECT recipient_id FROM notifications WHERE id = ?');
        $stmt->execute([$id]);
        $recipientId = $stmt->fetchColumn();
        if ($recipientId === false) {
            error_response('Notification not found.', 404);
        }

        if ($user['role'] !== 'admin' && (int)$recipientId !== (int)$user['sub']) {
            error_response('You can only delete your own notifications.', 403);
        }

        $delete = $pdo->prepare('DELETE FROM notifications WHERE id = ?');
        $delete->execute([$id]);

        json_response(null, 200, 'Notification deleted successfully.');
    }
}
