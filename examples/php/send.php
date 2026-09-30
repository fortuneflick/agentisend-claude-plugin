<?php
/**
 * PHP — one send with the standard library.
 *
 * There is no PHP SDK. This file posts JSON to POST /emails with PHP streams.
 * AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you have
 * verified. AGENTISEND_BASE_URL is optional and defaults to the public API.
 *
 * Run: php send.php
 */

/** Enough to refuse an obvious typo here; the API checks the address properly. */
function agentisend_address_ok(string $email): bool
{
    return preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $email) === 1;
}

/**
 * @param array{email?: string, note?: string} $input
 * @return array{status: int, body: array<string, mixed>}
 */
function agentisend_send(array $input): array
{
    $email = trim((string) ($input['email'] ?? ''));
    $note = (string) ($input['note'] ?? '');
    if (!agentisend_address_ok($email)) {
        return [
            'status' => 400,
            'body' => ['error' => 'email must be one address, like you@example.com'],
        ];
    }

    $from = getenv('MAIL_FROM');
    if ($from === false || $from === '') {
        throw new RuntimeException('Set MAIL_FROM to an address on a domain you have verified.');
    }
    $base = getenv('AGENTISEND_BASE_URL');
    if ($base === false || $base === '') {
        $base = 'https://api.agentisend.com';
    }
    $base = rtrim($base, '/');
    $key = getenv('AGENTISEND_API_KEY');
    if ($key === false) {
        $key = '';
    }

    $payload = json_encode([
        'from' => $from,
        'to' => $email,
        'subject' => 'Your receipt',
        'text' => 'Receipt note: ' . $note,
    ], JSON_THROW_ON_ERROR);

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", [
                'authorization: Bearer ' . $key,
                'content-type: application/json',
                'accept: application/json',
                // The recipient, not the moment: a retry of the same note replays.
                'idempotency-key: receipt/' . $email,
            ]),
            'content' => $payload,
            'ignore_errors' => true,
            'timeout' => 30,
        ],
    ]);
    $raw = file_get_contents($base . '/emails', false, $context);
    if ($raw === false) {
        throw new RuntimeException('POST /emails failed before a response');
    }
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match) === 1) {
        $status = (int) $match[1];
    }
    /** @var array<string, mixed> $parsed */
    $parsed = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if ($status >= 400) {
        $error = is_array($parsed['error'] ?? null) ? $parsed['error'] : [];
        return ['status' => $status, 'body' => ['code' => $error['code'] ?? null, 'fix' => $error['fix'] ?? null]];
    }
    return ['status' => $status, 'body' => ['id' => $parsed['id'] ?? null]];
}

/**
 * @param array{status: int, body: array<string, mixed>} $result
 */
function agentisend_emit(string $step, array $result): void
{
    echo json_encode(['step' => $step, 'status' => $result['status']] + $result['body'], JSON_THROW_ON_ERROR), "\n";
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    agentisend_emit('send', agentisend_send(['email' => 'php@example.com', 'note' => 'first']));
    agentisend_emit('retry', agentisend_send(['email' => 'php@example.com', 'note' => 'first']));
    agentisend_emit('invalid', agentisend_send(['email' => 'not-an-address', 'note' => 'first']));
    agentisend_emit('refused', agentisend_send(['email' => 'php@example.com', 'note' => 'second']));
}
