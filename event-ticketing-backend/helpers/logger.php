<?php

function log_request(string $method, string $path, int $status): void
{
    global $config;

    $dir = __DIR__ . '/../storage/logs';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $user = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $line = sprintf(
        "[%s] %s %s -> %d | IP=%s\n",
        date('Y-m-d H:i:s'),
        $method,
        $path,
        $status,
        $user
    );

    file_put_contents($dir . '/app.log', $line, FILE_APPEND | LOCK_EX);
}
