<?php
/**
 * Symfony — the action a controller route calls.
 *
 * The Symfony Mailer transport is in the agentisend/laravel package, on the
 * Laravel guide. The method below is what you put on a controller and map
 * with the Route attribute. It posts JSON to POST /emails with PHP streams.
 * The framework is not booted here; the method is the one the route holds.
 *
 * AGENTISEND_API_KEY, MAIL_FROM, and optionally AGENTISEND_BASE_URL.
 * Run: php send.php
 */

/** Enough to refuse an obvious typo here; the API checks the address properly. */
function symfony_address_ok(string $email): bool
{
    return preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $email) === 1;
}

final class InvoiceController
{
    /**
     * POST /send  {"email": "ada@example.com", "note": "march"}
     *
     * @param array{email?: string, note?: string} $input
     * @return array{status: int, body: array<string, mixed>}
     */
    public function create(array $input): array
    {
        $email = trim((string) ($input['email'] ?? ''));
        $note = (string) ($input['note'] ?? '');
        if (!symfony_address_ok($email)) {
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
        $key = getenv('AGENTISEND_API_KEY') ?: '';
        $payload = json_encode([
            'from' => $from,
            'to' => $email,
            'subject' => 'Your invoice is ready',
            'text' => 'Invoice note: ' . $note,
        ], JSON_THROW_ON_ERROR);

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", [
                    'authorization: Bearer ' . $key,
                    'content-type: application/json',
                    'accept: application/json',
                    // The invoice recipient, not the moment the action ran.
                    'idempotency-key: invoice/' . $email,
                ]),
                'content' => $payload,
                'ignore_errors' => true,
                'timeout' => 30,
            ],
        ]);
        $raw = file_get_contents(rtrim((string) $base, '/') . '/emails', false, $context);
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
}

/**
 * @param array{status: int, body: array<string, mixed>} $result
 */
function symfony_emit(string $step, array $result): void
{
    echo json_encode(['step' => $step, 'status' => $result['status']] + $result['body'], JSON_THROW_ON_ERROR), "\n";
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $controller = new InvoiceController();
    symfony_emit('send', $controller->create(['email' => 'symfony@example.com', 'note' => 'first']));
    symfony_emit('retry', $controller->create(['email' => 'symfony@example.com', 'note' => 'first']));
    symfony_emit('invalid', $controller->create(['email' => 'not-an-address', 'note' => 'first']));
    symfony_emit('refused', $controller->create(['email' => 'symfony@example.com', 'note' => 'second']));
}
