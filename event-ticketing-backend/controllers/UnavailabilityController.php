<?php

class UnavailabilityController
{
    /**
     * Return unavailability records for one venue.
     * GET /api/venues/{venueId}/unavailability
     */
    public static function forVenue(PDO $pdo, int $venueId): void
    {
        self::ensureVenueExists($pdo, $venueId);

        $from = trim((string) ($_GET['from'] ?? ''));
        $to = trim((string) ($_GET['to'] ?? ''));

        $conditions = ['venue_id = ?'];
        $params = [$venueId];

        if ($from !== '') {
            if (!self::isDate($from)) {
                error_response('Invalid from date. Use YYYY-MM-DD.', 422);
                return;
            }
            $conditions[] = 'unavailability_date >= ?';
            $params[] = $from;
        }

        if ($to !== '') {
            if (!self::isDate($to)) {
                error_response('Invalid to date. Use YYYY-MM-DD.', 422);
                return;
            }
            $conditions[] = 'unavailability_date <= ?';
            $params[] = $to;
        }

        $sql = 'SELECT id, venue_id, booked_by, unavailability_date,
                       start_time, end_time, record_type, reason, created_at
                FROM venue_unavailability
                WHERE ' . implode(' AND ', $conditions) . '
                ORDER BY unavailability_date, start_time';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        json_response($stmt->fetchAll(), 200, 'Venue unavailability retrieved.');
    }

    /**
     * Return paginated unavailability records.
     * GET /api/unavailability?venue_id=1&from=2026-11-01&to=2026-11-30
     */
    public static function index(PDO $pdo): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $venueId = (int) ($_GET['venue_id'] ?? 0);
        $from = trim((string) ($_GET['from'] ?? ''));
        $to = trim((string) ($_GET['to'] ?? ''));
        $recordType = trim((string) ($_GET['record_type'] ?? ''));

        $conditions = [];
        $params = [];

        if ($venueId > 0) {
            $conditions[] = 'vu.venue_id = ?';
            $params[] = $venueId;
        }
        if ($from !== '') {
            if (!self::isDate($from)) {
                error_response('Invalid from date. Use YYYY-MM-DD.', 422);
                return;
            }
            $conditions[] = 'vu.unavailability_date >= ?';
            $params[] = $from;
        }
        if ($to !== '') {
            if (!self::isDate($to)) {
                error_response('Invalid to date. Use YYYY-MM-DD.', 422);
                return;
            }
            $conditions[] = 'vu.unavailability_date <= ?';
            $params[] = $to;
        }
        if ($recordType !== '') {
            if (!in_array($recordType, ['admin_block', 'organiser_booking'], true)) {
                error_response('Invalid record_type.', 422);
                return;
            }
            $conditions[] = 'vu.record_type = ?';
            $params[] = $recordType;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM venue_unavailability vu $where");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT vu.id, vu.venue_id, v.name AS venue_name, vu.booked_by,
                    vu.unavailability_date, vu.start_time, vu.end_time,
                    vu.record_type, vu.reason, vu.created_at
             FROM venue_unavailability vu
             JOIN venues v ON v.id = vu.venue_id
             $where
             ORDER BY vu.unavailability_date, vu.start_time
             LIMIT ? OFFSET ?"
        );
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
                'total_pages' => $total === 0 ? 0 : (int) ceil($total / $perPage),
            ],
        ], 200, 'Venue unavailability retrieved.');
    }

    /**
     * Create an admin block or organiser hall reservation.
     * The record type and booked_by value come from the authenticated user, never the request body.
     */
    public static function store(PDO $pdo, array $data, array $user = []): void
    {
        $role = strtolower((string) ($user['role'] ?? ''));
        $userId = (int) ($user['id'] ?? $user['sub'] ?? 0);
        if (!in_array($role, ['admin', 'organiser'], true)) {
            error_response('Only Admins and Organisers can create unavailability records.', 403);
            return;
        }

        $errors = validate_required($data, [
            'venue_id', 'unavailability_date', 'start_time', 'end_time'
        ]);
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
            return;
        }

        $venueId = (int) $data['venue_id'];
        self::ensureVenueExists($pdo, $venueId);

        $date = trim((string) $data['unavailability_date']);
        if (!self::isDate($date)) {
            error_response('Unavailability date must use YYYY-MM-DD format.', 422);
            return;
        }

        $startTime = self::normaliseTime((string) $data['start_time']);
        $endTime = self::normaliseTime((string) $data['end_time']);
        if ($startTime === null || $endTime === null || $endTime <= $startTime) {
            error_response('End time must be later than start time. Use HH:MM or HH:MM:SS.', 422);
            return;
        }

        $reason = trim((string) ($data['reason'] ?? ''));
        $recordType = $role === 'admin' ? 'admin_block' : 'organiser_booking';
        $bookedBy = $role === 'organiser' && $userId > 0 ? $userId : null;
        if ($role === 'organiser' && $bookedBy === null) {
            error_response('Could not identify the signed-in organiser from the token.', 401);
            return;
        }

        self::assertNoUnavailableOverlap($pdo, $venueId, $date, $startTime, $endTime);
        if (self::hasEventOverlap($pdo, $venueId, $date, $startTime, $endTime)) {
            error_response('This venue has an event scheduled during the selected time.', 409);
            return;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO venue_unavailability
                (venue_id, booked_by, unavailability_date, start_time, end_time, record_type, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$venueId, $bookedBy, $date, $startTime, $endTime, $recordType, $reason !== '' ? $reason : null]);

        self::show($pdo, (int) $pdo->lastInsertId(), 201, 'Unavailability record created successfully.');
    }

    /** Update an Admin block or the current Organiser's own reservation. */
    public static function update(PDO $pdo, int $id, array $data, array $user = []): void
    {
        $role = strtolower((string) ($user['role'] ?? ''));
        $userId = (int) ($user['id'] ?? $user['sub'] ?? 0);

        $find = $pdo->prepare('SELECT * FROM venue_unavailability WHERE id = ? LIMIT 1');
        $find->execute([$id]);
        $slot = $find->fetch(PDO::FETCH_ASSOC);
        if (!$slot) {
            error_response('Unavailability record not found.', 404);
            return;
        }
        self::assertCanManageRecord($slot, $role, $userId);

        $venueId = array_key_exists('venue_id', $data) ? (int) $data['venue_id'] : (int) $slot['venue_id'];
        self::ensureVenueExists($pdo, $venueId);
        $date = trim((string) ($data['unavailability_date'] ?? $slot['unavailability_date']));
        $startTime = self::normaliseTime((string) ($data['start_time'] ?? $slot['start_time']));
        $endTime = self::normaliseTime((string) ($data['end_time'] ?? $slot['end_time']));

        if (!self::isDate($date)) {
            error_response('Unavailability date must use YYYY-MM-DD format.', 422);
            return;
        }
        if ($startTime === null || $endTime === null || $endTime <= $startTime) {
            error_response('End time must be later than start time. Use HH:MM or HH:MM:SS.', 422);
            return;
        }

        $reason = array_key_exists('reason', $data) ? trim((string) $data['reason']) : (string) ($slot['reason'] ?? '');
        self::assertNoUnavailableOverlap($pdo, $venueId, $date, $startTime, $endTime, $id);
        if (self::hasEventOverlap($pdo, $venueId, $date, $startTime, $endTime)) {
            error_response('This venue has an event scheduled during the selected time.', 409);
            return;
        }

        $stmt = $pdo->prepare(
            'UPDATE venue_unavailability
             SET venue_id = ?, unavailability_date = ?, start_time = ?, end_time = ?, reason = ?
             WHERE id = ?'
        );
        $stmt->execute([$venueId, $date, $startTime, $endTime, $reason !== '' ? $reason : null, $id]);
        self::show($pdo, $id, 200, 'Unavailability record updated successfully.');
    }

    /** Admin can remove blocks; an Organiser can release only their own hall reservation. */
    public static function destroy(PDO $pdo, int $id, array $user = []): void
    {
        $role = strtolower((string) ($user['role'] ?? ''));
        $userId = (int) ($user['id'] ?? $user['sub'] ?? 0);

        $find = $pdo->prepare('SELECT * FROM venue_unavailability WHERE id = ? LIMIT 1');
        $find->execute([$id]);
        $slot = $find->fetch(PDO::FETCH_ASSOC);
        if (!$slot) {
            error_response('Unavailability record not found.', 404);
            return;
        }
        self::assertCanManageRecord($slot, $role, $userId);

        $stmt = $pdo->prepare('DELETE FROM venue_unavailability WHERE id = ?');
        $stmt->execute([$id]);
        json_response(null, 200, 'Unavailability record deleted successfully.');
    }

    /** Called by the event controller before creating/updating an event in a venue. */
    public static function assertEventFitsUnavailability(
        PDO $pdo,
        int $venueId,
        string $startDatetime,
        string $endDatetime,
        ?int $eventId = null
    ): void {
        $startTs = strtotime($startDatetime);
        $endTs = strtotime($endDatetime);
        if ($startTs === false || $endTs === false || $endTs <= $startTs) {
            error_response('Invalid event start or end date/time.', 422);
            return;
        }

        $startDate = date('Y-m-d', $startTs);
        $startTime = date('H:i:s', $startTs);
        $endDate = date('Y-m-d', $endTs);
        $endTime = date('H:i:s', $endTs);
        if ($startDate !== $endDate) {
            error_response('Events must start and end on the same date for this venue booking system.', 422);
            return;
        }

        // In the new design, a matching record means unavailable; no matching record means available.
        self::assertNoUnavailableOverlap($pdo, $venueId, $startDate, $startTime, $endTime);

        $eventSql = "SELECT COUNT(*) FROM events
                     WHERE venue_id = ?
                       AND status IN ('upcoming', 'ongoing')
                       AND start_datetime < ?
                       AND end_datetime > ?";
        $eventParams = [$venueId, $endDatetime, $startDatetime];
        if ($eventId !== null) {
            $eventSql .= ' AND id <> ?';
            $eventParams[] = $eventId;
        }
        $eventStmt = $pdo->prepare($eventSql);
        $eventStmt->execute($eventParams);
        if ((int) $eventStmt->fetchColumn() > 0) {
            error_response('The selected venue is already booked by another event for part of the requested time.', 409);
            return;
        }
    }

    private static function show(PDO $pdo, int $id, int $httpStatus = 200, string $message = 'Unavailability record retrieved.'): void
    {
        $stmt = $pdo->prepare(
            'SELECT vu.id, vu.venue_id, v.name AS venue_name, vu.booked_by,
                    vu.unavailability_date, vu.start_time, vu.end_time,
                    vu.record_type, vu.reason, vu.created_at
             FROM venue_unavailability vu
             JOIN venues v ON v.id = vu.venue_id
             WHERE vu.id = ?'
        );
        $stmt->execute([$id]);
        $slot = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$slot) {
            error_response('Unavailability record not found.', 404);
            return;
        }
        json_response($slot, $httpStatus, $message);
    }

    private static function ensureVenueExists(PDO $pdo, int $venueId): void
    {
        if ($venueId < 1) {
            error_response('A valid venue_id is required.', 422);
            return;
        }
        $stmt = $pdo->prepare('SELECT id FROM venues WHERE id = ? LIMIT 1');
        $stmt->execute([$venueId]);
        if (!$stmt->fetchColumn()) {
            error_response('Venue not found.', 404);
        }
    }

    private static function assertNoUnavailableOverlap(
        PDO $pdo,
        int $venueId,
        string $date,
        string $startTime,
        string $endTime,
        ?int $excludeId = null
    ): void {
        $sql = 'SELECT COUNT(*) FROM venue_unavailability
                WHERE venue_id = ? AND unavailability_date = ?
                  AND start_time < ? AND end_time > ?';
        $params = [$venueId, $date, $endTime, $startTime];
        if ($excludeId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $excludeId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        if ((int) $stmt->fetchColumn() > 0) {
            error_response('This venue already has an overlapping block or reservation.', 409);
        }
    }

    private static function assertCanManageRecord(array $slot, string $role, int $userId): void
    {
        if ($role === 'admin') {
            // Admin can manage administrative blocks, but does not cancel organiser-owned reservations.
            if (($slot['record_type'] ?? '') !== 'admin_block') {
                error_response('Admins can manage admin blocks, but cannot directly cancel an organiser reservation.', 403);
                return;
            }
            return;
        }

        if ($role === 'organiser'
            && ($slot['record_type'] ?? '') === 'organiser_booking'
            && (int) ($slot['booked_by'] ?? 0) === $userId
            && $userId > 0
        ) {
            return;
        }

        error_response('You do not have permission to manage this unavailability record.', 403);
    }

    private static function isDate(string $date): bool
    {
        $dt = DateTime::createFromFormat('!Y-m-d', $date);
        return $dt !== false && $dt->format('Y-m-d') === $date;
    }

    private static function normaliseTime(string $time): ?string
    {
        $time = trim($time);
        if (preg_match('/^(\d{2}):(\d{2})$/', $time, $matches)) {
            $time .= ':00';
        }
        if (!preg_match('/^(\d{2}):(\d{2}):(\d{2})$/', $time, $matches)) {
            return null;
        }
        $hour = (int) $matches[1];
        $minute = (int) $matches[2];
        $second = (int) $matches[3];
        if ($hour > 23 || $minute > 59 || $second > 59) {
            return null;
        }
        return sprintf('%02d:%02d:%02d', $hour, $minute, $second);
    }

    private static function hasEventOverlap(
        PDO $pdo,
        int $venueId,
        string $date,
        string $startTime,
        string $endTime
    ): bool {
        $start = $date . ' ' . $startTime;
        $end = $date . ' ' . $endTime;
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM events
             WHERE venue_id = ?
               AND status IN ('upcoming', 'ongoing')
               AND start_datetime < ?
               AND end_datetime > ?"
        );
        $stmt->execute([$venueId, $end, $start]);
        return (int) $stmt->fetchColumn() > 0;
    }
}
