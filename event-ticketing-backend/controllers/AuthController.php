
<?php

class AuthController
{
    public static function login(PDO $pdo, array $data): void
    {
        global $config;

        $errors = validate_required($data, ['email', 'password']);

        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        $email = strtolower(trim((string) $data['email']));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            error_response('Invalid email format.', 422, [
                'email' => 'Please provide a valid email address.',
            ]);
        }

        $stmt = $pdo->prepare(
            'SELECT id, name, email, password, role
             FROM users
             WHERE email = ?
             LIMIT 1'
        );

        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (
            !$user ||
            !password_verify(
                (string) $data['password'],
                $user['password']
            )
        ) {
            error_response('Invalid email or password.', 401);
        }

        $token = create_jwt([
            'sub' => (int) $user['id'],
            'email' => $user['email'],
            'role' => $user['role'],
        ], $config['app']['jwt_secret'], $config['app']['jwt_ttl']);

        unset($user['password']);

        json_response([
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => $config['app']['jwt_ttl'],
            'user' => $user,
        ], 200, 'Login successful.');
    }

    public static function register(PDO $pdo, array $data): void
    {
        global $config;

        // 1. Check required fields
        $errors = validate_required(
            $data,
            ['name', 'email', 'password', 'role']
        );

        if ($errors) {
            error_response('Validation failed.', 422, $errors);
        }

        // 2. Validate name
        $name = trim((string) $data['name']);

        if ($name === '') {
            error_response('Name is required.', 422, [
                'name' => 'Please enter your name.',
            ]);
        }

        // 3. Validate email
        $email = strtolower(trim((string) $data['email']));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            error_response('Invalid email format.', 422, [
                'email' => 'Please provide a valid email address.',
            ]);
        }

        // 4. Validate password
        $password = (string) $data['password'];

        if (strlen($password) < 8) {
            error_response('Password is too short.', 422, [
                'password' => 'Password must contain at least 8 characters.',
            ]);
        }

        // 5. Validate selected role
        $role = strtolower(trim((string) $data['role']));

        if (!in_array($role, ['admin', 'organiser', 'customer'], true)) {
            error_response('Invalid role selected.', 422, [
                'role' => 'Choose admin, organiser or customer.',
            ]);
        }

        // 6. Admin registration requires a valid reference key
        if ($role === 'admin') {
            $expectedKey = (string) (
                $config['app']['admin_signup_key'] ?? ''
            );

            $providedKey = (string) (
                $data['reference_key'] ?? ''
            );

            if (
                $expectedKey === '' ||
                !hash_equals($expectedKey, $providedKey)
            ) {
                error_response(
                    'Invalid or missing admin reference key.',
                    403
                );
            }
        }

        // 7. Prevent duplicate email addresses
        $check = $pdo->prepare(
            'SELECT id FROM users WHERE email = ? LIMIT 1'
        );

        $check->execute([$email]);

        if ($check->fetch()) {
            error_response('Email address is already registered.', 409);
        }

        // 8. Hash password before storing it
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        if ($passwordHash === false) {
            error_response('Unable to process registration.', 500);
        }

        // 9. Save new account in the existing database
        $stmt = $pdo->prepare(
            'INSERT INTO users (name, email, password, role)
             VALUES (?, ?, ?, ?)'
        );

        $stmt->execute([
            $name,
            $email,
            $passwordHash,
            $role,
        ]);

        // 10. Return the newly created account
        $user = [
            'id' => (int) $pdo->lastInsertId(),
            'name' => $name,
            'email' => $email,
            'role' => $role,
        ];

        json_response([
            'user' => $user,
        ], 201, 'Registration successful.');
    }
}
