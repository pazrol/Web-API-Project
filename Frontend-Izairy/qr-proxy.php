<?php
declare(strict_types=1);
require_once __DIR__ . '/includes/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function qr_proxy_error(string $message, int $status): never {
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    qr_proxy_error('Method not allowed.', 405);
}
$bookingId = filter_input(INPUT_GET, 'booking_id', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if (!$bookingId) qr_proxy_error('A valid booking_id is required.', 422);
if ($backendApiKey === '') {
    qr_proxy_error('QR API key is not available. Check config/config.php in the backend and confirm app.api_key is set.', 503);
}
$headers = function_exists('getallheaders') ? getallheaders() : [];
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $headers['Authorization'] ?? $headers['authorization'] ?? '';
if (!is_string($authorization) || !preg_match('/^Bearer\s+\S+$/i', $authorization)) {
    qr_proxy_error('A valid Bearer token is required.', 401);
}
if (!function_exists('curl_init')) qr_proxy_error('PHP cURL is not enabled in XAMPP.', 500);
$url = rtrim($apiBaseUrl, '/') . '/bookings/' . (int)$bookingId . '/qr';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Authorization: ' . $authorization,
        'X-API-Key: ' . $backendApiKey,
    ],
]);
$body = curl_exec($ch);
$curlError = curl_error($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($body === false) qr_proxy_error('Could not contact the ticket API: ' . $curlError, 502);
http_response_code($status > 0 ? $status : 502);
echo $body;
