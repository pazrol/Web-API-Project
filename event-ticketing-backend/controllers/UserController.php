<?php

class UserController
{
    private const ROLES = ['admin', 'organiser', 'customer'];

    public static function index(PDO $pdo): void
    {
        [$page, $perPage, $offset] = pagination_params();
        $search = trim((string)($_GET['search'] ?? ''));
        $role = trim((string)($_GET['role'] ?? ''));

        $conditions = [];
        $params = [];

        if ($search !== '') {
            $conditions[] = '(name LIKE ? OR email LIKE ?)';
            $term = '%' . $search . '%';
            $params[] = $term;
            $params[] = $term;
        }

        if ($role !== '') {
            if (!in_array($role, self::ROLES, true)) {
                error_response('Invalid role filter.', 422);
            }
            $conditions[] = 'role = ?';
            $params[] = $role;
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $pdo->prepare("SELECT id, name, email, role, created_at, updated_at FROM users $where ORDER BY id DESC LIMIT ? OFFSET ?");
        foreach ($params as $i => $value) {
            $stmt->bindValue($i + 1, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(count($params) + 1, $perPage, PDO::PARAM_INT);
        $stmt->bindValue(count($params) + 2, $offset, PDO::PARAM_INT);
        $stmt->execute();

        json_response([
            'items' => $stmt->fetchAll(),
            'pagination' => self::pagination($page, $perPage, $total),
        ]);
    }

    public static function show(PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $user = $stmt->fetch();

        if (!$user) {
            error_response('User not found.', 404);
        }

        json_response($user);
    }

    public static function store(PDO $pdo, array $data): void
    {
        $errors = validate_required($data, ['name', 'email', 'password', 'role']);

        $email = strtolower(trim((string)($data['email'] ?? '')));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Invalid email format.';
        }

        if (isset($data['role']) && !in_array($data['role'], self::ROLES, true)) {
            $errors['role'] = 'Role must be admin, organiser, or customer.';
        }

        if (isset($data['password']) && strlen((string)$data['password']) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        }

        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $check = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $check->execute([$email]);
        if ($check->fetch()) {
            error_response('Email is already registered.', 409);
        }

        $stmt = $pdo->prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
        $stmt->execute([
            trim((string)$data['name']),
            $email,
            password_hash((string)$data['password'], PASSWORD_DEFAULT),
            $data['role'],
        ]);

        self::show($pdo, (int)$pdo->lastInsertId());
    }

    public static function update(PDO $pdo, int $id, array $data): void
    {
        $find = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $find->execute([$id]);
        if (!$find->fetch()) {
            error_response('User not found.', 404);
        }

        $fields = [];
        $values = [];

        if (array_key_exists('name', $data)) {
            if (trim((string)$data['name']) === '') {
                error_response('Name cannot be empty.', 422);
            }
            $fields[] = 'name = ?';
            $values[] = trim((string)$data['name']);
        }

        if (array_key_exists('email', $data)) {
            $email = strtolower(trim((string)$data['email']));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                error_response('Invalid email format.', 422);
            }
            $fields[] = 'email = ?';
            $values[] = $email;
        }

        if (array_key_exists('password', $data)) {
            if (strlen((string)$data['password']) < 8) {
                error_response('Password must be at least 8 characters.', 422);
            }
            $fields[] = 'password = ?';
            $values[] = password_hash((string)$data['password'], PASSWORD_DEFAULT);
        }

        if (array_key_exists('role', $data)) {
            if (!in_array($data['role'], self::ROLES, true)) {
                error_response('Invalid role.', 422);
            }
            $fields[] = 'role = ?';
            $values[] = $data['role'];
        }

        if (!$fields) {
            error_response('No fields supplied for update.', 422);
        }

        $values[] = $id;

        try {
            $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?');
            $stmt->execute($values);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                error_response('Email is already registered.', 409);
            }
            throw $e;
        }

        self::show($pdo, $id);
    }

    public static function destroy(PDO $pdo, int $id, array $user): void
    {
        if ($id === (int)$user['sub']) {
            error_response('You cannot delete your own logged-in account.', 409);
        }

        $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
        try {
            $stmt->execute([$id]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1451) {
                error_response('User cannot be deleted because related records exist.', 409);
            }
            throw $e;
        }

        if ($stmt->rowCount() === 0) {
            error_response('User not found.', 404);
        }

        json_response(null, 200, 'User deleted successfully.');
    }

    private static function pagination(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total === 0 ? 0 : (int)ceil($total / $perPage),
        ];
    }
}
