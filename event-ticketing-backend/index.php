<?php

require_once __DIR__ . '/config/bootstrap.php';

header('Access-Control-Allow-Origin: ' . $config['app']['cors_origin']);
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

register_shutdown_function(static function () use ($method, $uri): void {
    log_request($method, $uri, http_response_code());
});

$apiPos = strpos($uri, '/api/');
$path = $apiPos !== false ? substr($uri, $apiPos + 5) : '';
$segments = array_values(array_filter(explode('/', trim($path, '/')), 'strlen'));

$resource = $segments[0] ?? '';
$id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
$subresource = $segments[2] ?? null;
$subresourceId = isset($segments[3]) && ctype_digit($segments[3]) ? (int)$segments[3] : null;

$input = in_array($method, ['POST', 'PUT', 'PATCH'], true) ? get_json_input() : [];
$GLOBALS['_current_request_input'] = $input;

try {
    if ($resource === '' && $method === 'GET') {
        json_response([
            'name' => $config['app']['name'],
            'version' => '2.0.0',
            'roles' => ['admin', 'organiser', 'customer'],
            'resources' => [
                '/api/auth/login',
                '/api/users',
                '/api/venues',
                '/api/unavailability',
                '/api/categories',
                '/api/events',
                '/api/bookings',
                '/api/payments',
                '/api/notifications',
                '/api/bookings/{id}/qr',
            ],
        ], 200, 'API is running.');
    }

    switch ($resource) {
        case 'health':
            if ($method !== 'GET') {
                error_response('Route not found.', 404);
            }
            json_response([
                'api' => 'up',
                'database' => 'connected',
                'server_time' => date('Y-m-d H:i:s'),
            ], 200, 'Health check successful.');
            break;

        case 'auth':
            if ($method === 'POST' && ($segments[1] ?? '') === 'login') {
                AuthController::login($pdo, $input);
                break;
            }
            if ($method === 'POST' && ($segments[1] ?? '') === 'register') {
                AuthController::register($pdo, $input);
                break;
}
            error_response('Route not found.', 404);
            break;

        case 'users':
            if ($method === 'GET' && $id === null) {
                require_roles(['admin']);
                UserController::index($pdo);
            } elseif ($method === 'GET' && $id !== null) {
                require_roles(['admin']);
                UserController::show($pdo, $id);
            } elseif ($method === 'POST' && $id === null) {
                require_roles(['admin']);
                UserController::store($pdo, $input);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null) {
                require_roles(['admin']);
                UserController::update($pdo, $id, $input);
            } elseif ($method === 'DELETE' && $id !== null) {
                $user = require_roles(['admin']);
                UserController::destroy($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'venues':
            if ($method === 'GET' && $id === null) {
                require_auth();
                VenueController::index($pdo);
            } elseif ($method === 'GET' && $id !== null && $subresource === 'unavailability') {
                require_auth();
                UnavailabilityController::forVenue($pdo, $id);
            } elseif ($method === 'GET' && $id !== null) {
                require_auth();
                VenueController::show($pdo, $id);
            } elseif ($method === 'POST' && $id === null) {
                $user = require_roles(['admin', 'organiser']);
                VenueController::store($pdo, $input, $user);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null) {
                require_roles(['admin', 'organiser']);
                VenueController::update($pdo, $id, $input);
            } elseif ($method === 'DELETE' && $id !== null) {
                require_roles(['admin']);
                VenueController::destroy($pdo, $id);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'unavailability':
            if ($method === 'GET' && $id === null) {
                require_auth();
                 UnavailabilityController::index($pdo);
            } elseif ($method === 'POST' && $id === null) {
                 $user = require_roles(['admin', 'organiser']);
                UnavailabilityController::store($pdo, $input, $user);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null) {
                $user = require_roles(['admin', 'organiser']);
                UnavailabilityController::update($pdo, $id, $input, $user);
            } elseif ($method === 'DELETE' && $id !== null) {
                $user = require_roles(['admin', 'organiser']);
                UnavailabilityController::destroy($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;
            
        case 'categories':
            if ($method === 'GET' && $id === null) {
                require_auth();
                CategoryController::index($pdo);
            } elseif ($method === 'GET' && $id !== null) {
                require_auth();
                CategoryController::show($pdo, $id);
            } elseif ($method === 'POST' && $id === null) {
                require_roles(['admin']);
                CategoryController::store($pdo, $input);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null) {
                require_roles(['admin']);
                CategoryController::update($pdo, $id, $input);
            } elseif ($method === 'DELETE' && $id !== null) {
                require_roles(['admin']);
                CategoryController::destroy($pdo, $id);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'events':
            if ($method === 'GET' && $id === null) {
                require_auth();
                EventController::index($pdo);
            } elseif ($method === 'GET' && $id !== null) {
                require_auth();
                EventController::show($pdo, $id);
            } elseif ($method === 'POST' && $id === null) {
                $user = require_roles(['admin', 'organiser']);
                EventController::store($pdo, $input, $user);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null) {
                $user = require_roles(['admin', 'organiser']);
                EventController::update($pdo, $id, $input, $user);
            } elseif ($method === 'DELETE' && $id !== null) {
                $user = require_roles(['admin', 'organiser']);
                EventController::destroy($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'bookings':
            if ($method === 'GET' && $id === null) {
                $user = require_auth();
                BookingController::index($pdo, $user);
            } elseif ($method === 'GET' && $id !== null && $subresource === 'qr') {
                $user = require_auth();
                ExternalController::qrForBooking($pdo, $id, $user);
            } elseif ($method === 'GET' && $id !== null) {
                $user = require_auth();
                BookingController::show($pdo, $id, $user);
            } elseif ($method === 'POST' && $id === null) {
                $user = require_roles(['customer']);
                BookingController::store($pdo, $input, $user);
            } elseif ($method === 'DELETE' && $id !== null) {
                $user = require_auth();
                BookingController::cancel($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'payments':
            if ($method === 'GET' && $id === null) {
                $user = require_auth();
                PaymentController::index($pdo, $user);
            } elseif ($method === 'GET' && $id !== null && $subresource === 'refund') {
                error_response('Use POST for refund operations.', 405);
            } elseif ($method === 'GET' && $id !== null) {
                $user = require_auth();
                PaymentController::show($pdo, $id, $user);
            } elseif ($method === 'POST' && $id === null) {
                $user = require_roles(['customer']);
                PaymentController::store($pdo, $input, $user);
            } elseif ($method === 'POST' && $id !== null && $subresource === 'refund') {
                $user = require_roles(['admin', 'organiser']);
                PaymentController::refund($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        case 'notifications':
            if ($method === 'GET' && $id === null) {
                $user = require_auth();
                NotificationController::index($pdo, $user);
            } elseif ($method === 'GET' && $id !== null) {
                $user = require_auth();
                NotificationController::show($pdo, $id, $user);
            } elseif ($method === 'POST' && $id === null) {
                $user = require_roles(['admin', 'organiser']);
                NotificationController::store($pdo, $input, $user);
            } elseif (in_array($method, ['PUT', 'PATCH'], true) && $id !== null && $subresource === 'read') {
                $user = require_auth();
                NotificationController::markRead($pdo, $id, $user);
            } elseif ($method === 'DELETE' && $id !== null) {
                $user = require_auth();
                NotificationController::destroy($pdo, $id, $user);
            } else {
                error_response('Route not found.', 404);
            }
            break;

        default:
            error_response('Route not found.', 404);
    }
} catch (PDOException $e) {
    error_log($e->getMessage());
    error_response('Database operation failed.', 500);
} catch (Throwable $e) {
    error_log($e->getMessage());
    error_response('Internal server error.', 500);
}
