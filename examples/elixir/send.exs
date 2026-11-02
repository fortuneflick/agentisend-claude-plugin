# Elixir — one signup notice with :httpc.
#
# There is no Elixir package for this API. :httpc ships with Erlang. Start
# :inets and :ssl, then post JSON to POST /emails. A Phoenix controller can
# call the same function; this file does not boot Phoenix.
#
# AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you have
# verified. AGENTISEND_BASE_URL is optional and defaults to the public API.
#
# Run: elixir send.exs

:inets.start()
:ssl.start()

defmodule SignupMail do
  @address ~r/^[^@\s]+@[^@\s]+\.[^@\s]+$/

  def send(email, note) do
    email = String.trim(email)

    if Regex.match?(@address, email) do
      post(email, note)
    else
      {400, %{"error" => "email must be one address, like you@example.com"}}
    end
  end

  defp env!(name) do
    case System.get_env(name) do
      nil -> raise "Set #{name}."
      "" -> raise "Set #{name}."
      value -> value
    end
  end

  defp base_url do
    case System.get_env("AGENTISEND_BASE_URL") do
      nil -> "https://api.agentisend.com"
      "" -> "https://api.agentisend.com"
      value -> String.trim_trailing(value, "/")
    end
  end

  defp json_string(raw, key) do
    case Regex.run(~r/"#{key}"\s*:\s*"([^"]*)"/, raw) do
      [_, value] -> value
      _ -> nil
    end
  end

  defp post(email, note) do
    from = env!("MAIL_FROM")
    payload =
      ~s({"from":"#{from}","to":"#{email}","subject":"Your signup","text":"Signup note: #{note}"})

    headers = [
      {'authorization', String.to_charlist("Bearer " <> env!("AGENTISEND_API_KEY"))},
      {'accept', 'application/json'},
      # The recipient, not the moment: a retry of the same note replays.
      {'idempotency-key', String.to_charlist("signup/" <> email)}
    ]

    request =
      {String.to_charlist(base_url() <> "/emails"), headers, 'application/json',
       String.to_charlist(payload)}

    case :httpc.request(:post, request, [{:timeout, 30_000}], []) do
      {:ok, {{_, status, _}, _, body}} ->
        text = to_string(body)

        if status >= 400 do
          {status, %{"code" => json_string(text, "code"), "fix" => json_string(text, "fix")}}
        else
          {status, %{"id" => json_string(text, "id")}}
        end

      other ->
        raise "request failed: #{inspect(other)}"
    end
  end
end

defmodule Emit do
  def line(step, {status, fields}) do
    pairs =
      [~s("step":"#{step}"), ~s("status":#{status})] ++
        Enum.flat_map(fields, fn
          {_key, nil} -> []
          {key, value} -> [~s("#{key}":"#{value}")]
        end)

    IO.puts("{" <> Enum.join(pairs, ",") <> "}")
  end
end

Emit.line("send", SignupMail.send("elixir@example.com", "first"))
Emit.line("retry", SignupMail.send("elixir@example.com", "first"))
Emit.line("invalid", SignupMail.send("not-an-address", "first"))
Emit.line("refused", SignupMail.send("elixir@example.com", "second"))
