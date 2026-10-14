<?php

class VenueController
{
    public static function index(PDO $pdo): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $search = trim((string)($_GET['search'] ?? ''));

        $conditions = [];
        $params = [];

        if ($search !== '') {
            $conditions[] = '(v.name LIKE ? OR v.address LIKE ? OR v.description LIKE ?)';
            $term = '%' . $search . '%';
            $params = [$term, $term, $term];
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM venues v $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT v.id, v.name, v.address, v.capacity, v.description,
                    v.created_by, u.name AS creator_name, v.created_at, v.updated_at
                FROM venues v
                LEFT JOIN users u ON u.id = v.created_by
                $where
                ORDER BY v.id DESC
                LIMIT ? OFFSET ?");
        foreach ($params as $i => $value) {
            $stmt->bindValue($i + 1, $value, PDO::PARAM_STR);
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
        $stmt = $pdo->prepare('SELECT v.id, v.name, v.address, v.capacity, v.description,
            v.created_by, u.name AS creator_name, v.created_at, v.updated_at
            FROM venues v
            LEFT JOIN users u ON u.id = v.created_by
            WHERE v.id = ?');
        $stmt->execute([$id]);
        $venue = $stmt->fetch();

        if (!$venue) {
            error_response('Venue not found.', 404);
        }

        json_response($venue);
    }

    public static function store(PDO $pdo, array $data, array $user): void
    {
        $errors = validate_required($data, ['name', 'address', 'capacity']);
        if (isset($data['capacity']) && (!is_numeric($data['capacity']) || (int)$data['capacity'] <= 0)) {
            $errors['capacity'] = 'Capacity must be a positive integer.';
        }
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $stmt = $pdo->prepare('INSERT INTO venues (name, address, capacity, description, created_by) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([
            trim((string)$data['name']),
            trim((string)$data['address']),
            (int)$data['capacity'],
            trim((string)($data['description'] ?? '')),
            (int)$user['sub'],
        ]);

        self::show($pdo, (int)$pdo->lastInsertId());
    }

    public static function update(PDO $pdo, int $id, array $data): void
    {
        $find = $pdo->prepare('SELECT * FROM venues WHERE id = ?');
        $find->execute([$id]);
        $venue = $find->fetch();

        if (!$venue) {
            error_response('Venue not found.', 404);
        }

        $fields = [];
        $values = [];

        foreach (['name', 'address', 'description'] as $field) {
            if (array_key_exists($field, $data)) {
                if ($field !== 'description' && trim((string)$data[$field]) === '') {
                    error_response(ucfirst($field) . ' cannot be empty.', 422);
                }
                $fields[] = "$field = ?";
                $values[] = trim((string)$data[$field]);
            }
        }

        if (array_key_exists('capacity', $data)) {
            if (!is_numeric($data['capacity']) || (int)$data['capacity'] <= 0) {
                error_response('Capacity must be a positive integer.', 422);
            }
            $newCapacity = (int)$data['capacity'];

            $maxTicketsStmt = $pdo->prepare("SELECT COALESCE(MAX(total_tickets), 0) FROM events WHERE venue_id = ? AND status IN ('upcoming','ongoing')");
            $maxTicketsStmt->execute([$id]);
            $maxTickets = (int)$maxTicketsStmt->fetchColumn();
            if ($newCapacity < $maxTickets) {
                error_response('Capacity cannot be lower than the ticket allocation of an existing upcoming/ongoing event.', 422);
            }

            $fields[] = 'capacity = ?';
            $values[] = $newCapacity;
        }

        if (!$fields) {
            error_response('No fields supplied for update.', 422);
        }

        $values[] = $id;
        $stmt = $pdo->prepare('UPDATE venues SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($values);

        self::show($pdo, $id);
    }

    public static function destroy(PDO $pdo, int $id): void
    {
        $check = $pdo->prepare('SELECT COUNT(*) FROM events WHERE venue_id = ?');
        $check->execute([$id]);
        if ((int)$check->fetchColumn() > 0) {
            error_response('Venue cannot be deleted while events are linked to it.', 409);
        }

        $stmt = $pdo->prepare('DELETE FROM venues WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            error_response('Venue not found.', 404);
        }

        json_response(null, 200, 'Venue deleted successfully.');
    }
}
