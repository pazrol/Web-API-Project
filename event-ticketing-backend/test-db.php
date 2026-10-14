<?php

require_once __DIR__ . '/config/bootstrap.php';

json_response([
    'database' => $config['db']['name'],
    'host' => $config['db']['host'],
    'connected' => true,
], 200, 'Database connection successful.');
