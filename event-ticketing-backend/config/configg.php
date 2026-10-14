<?php

return [
    'app' => [
        'name' => 'Event Ticketing & Venue Booking API',
        'timezone' => 'Asia/Kuala_Lumpur',
        'base_path' => '/event-ticketing-backend',
        'jwt_secret' => '',
        'jwt_ttl' => 3600,
        'api_key' => '',
        'cors_origin' => '*',
        'admin_signup_key' => '',
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => '3306',
        'name' => 'event_ticketing',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
];
