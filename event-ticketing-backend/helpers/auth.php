<?php

function b64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64url_decode(string $data): string|false
{
    $remainder = strlen($data) % 4;
    if ($remainder > 0) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'), true);
}

function create_jwt(array $claims, string $secret, int $ttl): string
{
    $header = [
        'typ' => 'JWT',
        'alg' => 'HS256',
    ];

    $now = time();
    $payload = array_merge($claims, [
        'iat' => $now,
        'exp' => $now + $ttl,
    ]);

    $encodedHeader = b64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $encodedPayload = b64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signingInput = $encodedHeader . '.' . $encodedPayload;
    $signature = hash_hmac('sha256', $signingInput, $secret, true);

    return $signingInput . '.' . b64url_encode($signature);
}

function verify_jwt(string $token, string $secret): array|false
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return false;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $headerJson = b64url_decode($encodedHeader);
    $payloadJson = b64url_decode($encodedPayload);
    $signature = b64url_decode($encodedSignature);

    if ($headerJson === false || $payloadJson === false || $signature === false) {
        return false;
    }

    $header = json_decode($headerJson, true);
    $payload = json_decode($payloadJson, true);

    if (!is_array($header) || !is_array($payload)) {
        return false;
    }

    if (($header['alg'] ?? '') !== 'HS256' || ($header['typ'] ?? '') !== 'JWT') {
        return false;
    }

    $expected = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, $secret, true);
    if (!hash_equals($expected, $signature)) {
        return false;
    }

    if (!isset($payload['sub'], $payload['exp']) || time() >= (int)$payload['exp']) {
        return false;
    }

    return $payload;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        return trim($matches[1]);
    }

    return null;
}
