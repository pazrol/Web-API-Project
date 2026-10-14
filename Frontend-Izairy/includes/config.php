<?php
$apiBaseUrl = 'http://localhost/Web-API-Project/event-ticketing-backend/api';

// Backend and frontend folders are siblings under Web-API-Project.
$backendConfigFile = __DIR__ . '/../../event-ticketing-backend/config/config.php';
$backendConfig = [];
if (is_file($backendConfigFile)) {
    // Support either a config file that returns an array or one that defines $config.
    $loadedConfig = require $backendConfigFile;
    if (is_array($loadedConfig)) {
        $backendConfig = $loadedConfig;
    } elseif (isset($config) && is_array($config)) {
        $backendConfig = $config;
    }
}
$backendApiKey = (string) ($backendConfig['app']['api_key'] ?? '');
