<?php

$password = "password123";

$hash = password_hash($password, PASSWORD_DEFAULT);

echo "<h2>Password Hash</h2>";
echo "<p><strong>Password:</strong> " . htmlspecialchars($password) . "</p>";
echo "<p><strong>Hash:</strong></p>";
echo "<textarea rows='3' cols='100'>" . htmlspecialchars($hash) . "</textarea>";