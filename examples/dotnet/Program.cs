// .NET — one booking with HttpClient.
//
// There is no .NET package for this API. HttpClient is in the shared
// framework, so the project file names no extra package. AGENTISEND_API_KEY
// is the key. MAIL_FROM is an address on a domain you have verified.
// AGENTISEND_BASE_URL is optional and defaults to the public API.
//
// Run: dotnet run

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

var address = new Regex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.CultureInvariant);

string Env(string name)
{
    var value = Environment.GetEnvironmentVariable(name);
    if (string.IsNullOrEmpty(value)) throw new InvalidOperationException($"Set {name}.");
    return value;
}

string BaseUrl()
{
    var value = Environment.GetEnvironmentVariable("AGENTISEND_BASE_URL");
    if (string.IsNullOrEmpty(value)) value = "https://api.agentisend.com";
    return value.TrimEnd('/');
}

string? JsonString(string raw, string key)
{
    using var doc = JsonDocument.Parse(raw);
    if (!doc.RootElement.TryGetProperty(key, out var direct) || direct.ValueKind != JsonValueKind.String)
    {
        if (!doc.RootElement.TryGetProperty("error", out var error)) return null;
        if (!error.TryGetProperty(key, out var nested) || nested.ValueKind != JsonValueKind.String) return null;
        return nested.GetString();
    }
    return direct.GetString();
}

using var http = new HttpClient();

async Task<(int Status, string? Id, string? Code, string? Fix, string? Error)> Send(string email, string note)
{
    email = email.Trim();
    if (!address.IsMatch(email))
    {
        return (400, null, null, null, "email must be one address, like you@example.com");
    }

    var payload = JsonSerializer.Serialize(new Dictionary<string, string>
    {
        ["from"] = Env("MAIL_FROM"),
        ["to"] = email,
        ["subject"] = "Your booking",
        ["text"] = "Booking note: " + note,
    });
    var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl() + "/emails")
    {
        Content = new StringContent(payload, Encoding.UTF8, "application/json"),
    };
    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Env("AGENTISEND_API_KEY"));
    request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    // The recipient, not the moment: a retry of the same note replays.
    request.Headers.TryAddWithoutValidation("idempotency-key", "booking/" + email);

    var response = await http.SendAsync(request);
    var body = await response.Content.ReadAsStringAsync();
    var status = (int)response.StatusCode;
    if (status >= 400)
    {
        return (status, null, JsonString(body, "code"), JsonString(body, "fix"), null);
    }
    return (status, JsonString(body, "id"), null, null, null);
}

void Emit(string step, int status, string? id, string? code, string? fix, string? error)
{
    var fields = new Dictionary<string, object> { ["step"] = step, ["status"] = status };
    if (id is not null) fields["id"] = id;
    if (code is not null) fields["code"] = code;
    if (fix is not null) fields["fix"] = fix;
    if (error is not null) fields["error"] = error;
    Console.WriteLine(JsonSerializer.Serialize(fields));
}

var send = await Send("dotnet@example.com", "first");
Emit("send", send.Status, send.Id, send.Code, send.Fix, send.Error);
var retry = await Send("dotnet@example.com", "first");
Emit("retry", retry.Status, retry.Id, retry.Code, retry.Fix, retry.Error);
var invalid = await Send("not-an-address", "first");
Emit("invalid", invalid.Status, invalid.Id, invalid.Code, invalid.Fix, invalid.Error);
var refused = await Send("dotnet@example.com", "second");
Emit("refused", refused.Status, refused.Id, refused.Code, refused.Fix, refused.Error);
