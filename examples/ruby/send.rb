# frozen_string_literal: true

# Ruby — one statement with the standard library.
#
# There is no Ruby package for this API. This file posts JSON to POST /emails
# with Net::HTTP. A Rails controller has its own page; call this method from
# a script, a Rake task, or a route that is not Rails.
#
# AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you have
# verified. AGENTISEND_BASE_URL is optional and defaults to the public API.
#
# Run: ruby send.rb

require 'json'
require 'net/http'
require 'uri'

ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

# @param input [Hash]
# @return [Hash] status and the JSON body a caller would render
def send_statement(input)
  email = input.fetch('email', '').to_s.strip
  note = input.fetch('note', '').to_s
  unless ADDRESS.match?(email)
    return { 'status' => 400, 'body' => { 'error' => 'email must be one address, like you@example.com' } }
  end

  from = ENV.fetch('MAIL_FROM') { raise 'Set MAIL_FROM to an address on a domain you have verified.' }
  base = (ENV['AGENTISEND_BASE_URL'] || 'https://api.agentisend.com').sub(%r{/+$}, '')
  uri = URI("#{base}/emails")
  request = Net::HTTP::Post.new(uri)
  request['authorization'] = "Bearer #{ENV.fetch('AGENTISEND_API_KEY')}"
  request['content-type'] = 'application/json'
  request['accept'] = 'application/json'
  # The recipient, not the moment: a retry of the same note replays.
  request['idempotency-key'] = "statement/#{email}"
  request.body = JSON.generate(
    'from' => from,
    'to' => email,
    'subject' => 'Your statement',
    'text' => "Statement note: #{note}"
  )

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') do |http|
    http.request(request)
  end
  parsed = JSON.parse(response.body)
  status = response.code.to_i
  if status >= 400
    error = parsed.fetch('error', {})
    return { 'status' => status, 'body' => { 'code' => error['code'], 'fix' => error['fix'] } }
  end

  { 'status' => status, 'body' => { 'id' => parsed['id'] } }
end

def emit(step, result)
  puts JSON.generate({ 'step' => step, 'status' => result['status'] }.merge(result['body']))
end

if __FILE__ == $PROGRAM_NAME
  emit('send', send_statement('email' => 'ruby@example.com', 'note' => 'first'))
  emit('retry', send_statement('email' => 'ruby@example.com', 'note' => 'first'))
  emit('invalid', send_statement('email' => 'not-an-address', 'note' => 'first'))
  emit('refused', send_statement('email' => 'ruby@example.com', 'note' => 'second'))
end
