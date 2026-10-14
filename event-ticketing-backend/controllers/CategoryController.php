<?php

class CategoryController
{
    public static function index(PDO $pdo): void
    {
        $stmt = $pdo->query('SELECT id, category_name, description, created_at FROM event_categories ORDER BY category_name ASC');
        json_response($stmt->fetchAll());
    }

    public static function show(PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT id, category_name, description, created_at FROM event_categories WHERE id = ?');
        $stmt->execute([$id]);
        $category = $stmt->fetch();
        if (!$category) {
            error_response('Category not found.', 404);
        }
        json_response($category);
    }

    public static function store(PDO $pdo, array $data): void
    {
        $errors = validate_required($data, ['category_name']);
        $name = trim((string)($data['category_name'] ?? ''));
        if ($name !== '' && mb_strlen($name) > 100) {
            $errors['category_name'] = 'Category name must not exceed 100 characters.';
        }
        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        try {
            $stmt = $pdo->prepare('INSERT INTO event_categories (category_name, description) VALUES (?, ?)');
            $stmt->execute([$name, trim((string)($data['description'] ?? ''))]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                error_response('Category name already exists.', 409);
            }
            throw $e;
        }

        self::show($pdo, (int)$pdo->lastInsertId());
    }

    public static function update(PDO $pdo, int $id, array $data): void
    {
        $find = $pdo->prepare('SELECT id FROM event_categories WHERE id = ?');
        $find->execute([$id]);
        if (!$find->fetch()) {
            error_response('Category not found.', 404);
        }

        $fields = [];
        $values = [];

        if (array_key_exists('category_name', $data)) {
            $name = trim((string)$data['category_name']);
            if ($name === '') {
                error_response('Category name cannot be empty.', 422);
            }
            $fields[] = 'category_name = ?';
            $values[] = $name;
        }
        if (array_key_exists('description', $data)) {
            $fields[] = 'description = ?';
            $values[] = trim((string)$data['description']);
        }

        if (!$fields) {
            error_response('No fields supplied for update.', 422);
        }

        $values[] = $id;
        try {
            $stmt = $pdo->prepare('UPDATE event_categories SET ' . implode(', ', $fields) . ' WHERE id = ?');
            $stmt->execute($values);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                error_response('Category name already exists.', 409);
            }
            throw $e;
        }

        self::show($pdo, $id);
    }

    public static function destroy(PDO $pdo, int $id): void
    {
        $check = $pdo->prepare('SELECT COUNT(*) FROM events WHERE category_id = ?');
        $check->execute([$id]);
        if ((int)$check->fetchColumn() > 0) {
            error_response('Category cannot be deleted while events are linked to it.', 409);
        }

        $stmt = $pdo->prepare('DELETE FROM event_categories WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            error_response('Category not found.', 404);
        }

        json_response(null, 200, 'Category deleted successfully.');
    }
}
