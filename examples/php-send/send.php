<?php
/**
 * Send one email over HTTP with the PHP standard library.
 *
 * No Composer package is loaded here. The install line on the SDKs page is
 * `composer require agentisend/agentisend-php`; this file is the request that
 * client makes, and the examples suite runs it.
 *
 * Set AGENTISEND_API_KEY, AGENTISEND_BASE_URL, MAIL_FROM and SEND_TO.
 */

declare(strict_types=1);

$base = getenv('AGENTISEND_BASE_URL') ?: 'https://api.agentisend.com';
$to = getenv('SEND_TO') ?: 'someone@example.com';
$body = json_encode([
    'from' => getenv('MAIL_FROM'),
    'to' => $to,
    'subject' => 'Hello from PHP',
    'text' => 'Sent with the PHP standard library.',
], JSON_THROW_ON_ERROR);

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Authorization: Bearer ' . getenv('AGENTISEND_API_KEY'),
            'Content-Type: application/json',
            'Idempotency-Key: sdk-php/' . $to,
        ]),
        'content' => $body,
        'ignore_errors' => true,
        'timeout' => 30,
    ],
]);

$raw = file_get_contents($base . '/emails', false, $context);
$decoded = json_decode($raw === false ? '' : $raw, true);
if (!is_array($decoded) || !isset($decoded['id'])) {
    $error = is_array($decoded) && isset($decoded['error']) ? $decoded['error'] : [];
    $code = is_array($error) && isset($error['code']) ? $error['code'] : 'request_failed';
    $fix = is_array($error) && isset($error['fix']) ? $error['fix'] : '';
    fwrite(STDERR, $code . ': ' . $fix . PHP_EOL);
    exit(1);
}

echo $decoded['id'], PHP_EOL;
