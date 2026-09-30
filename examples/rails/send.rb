# frozen_string_literal: true

# Rails — the method a controller action calls.
#
# There is no Ruby SDK. ReceiptsController#send_receipt posts JSON to
# POST /emails with Net::HTTP, which is what the action would call. Rails
# itself is not booted: the method is the one the route holds.
#
# AGENTISEND_API_KEY, MAIL_FROM, and optionally AGENTISEND_BASE_URL.
# Run: ruby send.rb

require 'json'
require 'net/http'
require 'uri'

module ReceiptsController
  module_function

  ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

  # @param input [Hash]
  # @return [Hash] status and the JSON body the action would render
  def send_receipt(input)
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
    request['idempotency-key'] = "receipt/#{email}"
    request.body = JSON.generate(
      'from' => from,
      'to' => email,
      'subject' => 'Your receipt',
      'text' => "Receipt note: #{note}"
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
end

def emit(step, result)
  puts JSON.generate({ 'step' => step, 'status' => result['status'] }.merge(result['body']))
end

if __FILE__ == $PROGRAM_NAME
  emit('send', ReceiptsController.send_receipt('email' => 'rails@example.com', 'note' => 'first'))
  emit('retry', ReceiptsController.send_receipt('email' => 'rails@example.com', 'note' => 'first'))
  emit('invalid', ReceiptsController.send_receipt('email' => 'not-an-address', 'note' => 'first'))
  emit('refused', ReceiptsController.send_receipt('email' => 'rails@example.com', 'note' => 'second'))
end
