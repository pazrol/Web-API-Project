<?php

function json_response(mixed $data = null, int $status = 200, ?string $message = null): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    $payload = [
        'success' => $status >= 200 && $status < 300,
    ];

    if ($message !== null) {
        $payload['message'] = $message;
    }

    if ($data !== null) {
        $payload['data'] = $data;
    }

    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function error_response(string $message, int $status = 400, mixed $details = null): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    $payload = [
        'success' => false,
        'message' => $message,
    ];

    if ($details !== null) {
        $payload['errors'] = $details;
    }

    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function get_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        error_response('Request body must contain valid JSON.', 400);
    }

    return $data;
}

function validate_required(array $data, array $fields): array
{
    $errors = [];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data) || $data[$field] === '' || $data[$field] === null) {
            $errors[$field] = 'This field is required.';
        }
    }
    return $errors;
}

function pagination_params(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(50, max(1, (int)($_GET['per_page'] ?? 10)));
    $offset = ($page - 1) * $perPage;
    return [$page, $perPage, $offset];
}

function parse_datetime_value(mixed $value): ?int
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    $timestamp = strtotime($value);
    return $timestamp === false ? null : $timestamp;
}

function format_decimal(float $amount): float
{
    return (float)number_format($amount, 2, '.', '');
}
