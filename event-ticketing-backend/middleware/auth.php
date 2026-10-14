<?php

function require_auth(): array
{
    global $config;

    $token = bearer_token();
    if (!$token) {
        error_response('Authentication required. Send a Bearer JWT token.', 401);
    }

    $payload = verify_jwt($token, $config['app']['jwt_secret']);
    if ($payload === false) {
        error_response('Invalid or expired JWT token.', 401);
    }

    return $payload;
}

function require_roles(array $roles): array
{
    $user = require_auth();
    $role = $user['role'] ?? null;

    if (!in_array($role, $roles, true)) {
        error_response('You do not have permission to perform this action.', 403);
    }

    return $user;
}

function require_api_key(): void
{
    global $config;

    $configuredKey = (string)$config['app']['api_key'];
    $key = (string)($_SERVER['HTTP_X_API_KEY'] ?? '');

    if ($configuredKey === '' || str_starts_with($configuredKey, 'CHANGE_')) {
        error_response('Server API key is not configured.', 500);
    }

    if ($key === '' || !hash_equals($configuredKey, $key)) {
        error_response('Valid X-API-Key is required for this endpoint.', 401);
    }
}
