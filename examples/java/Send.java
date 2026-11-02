import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Java — one ticket with java.net.http.
 *
 * There is no Java package for this API. HttpClient has been in the JDK
 * since 11, so this file has no Maven or Gradle dependency.
 * AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you
 * have verified. AGENTISEND_BASE_URL is optional.
 *
 * Run: javac Send.java && java Send
 */
public class Send {
    private static final Pattern ADDRESS = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    static String env(String name) {
        String value = System.getenv(name);
        if (value == null || value.isEmpty()) {
            throw new IllegalStateException("Set " + name + ".");
        }
        return value;
    }

    static String baseUrl() {
        String base = System.getenv("AGENTISEND_BASE_URL");
        if (base == null || base.isEmpty()) base = "https://api.agentisend.com";
        return base.replaceAll("/+$", "");
    }

    static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    static String jsonString(String raw, String key) {
        Matcher matcher = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"").matcher(raw);
        return matcher.find() ? matcher.group(1) : null;
    }

    /** status, then id, code, fix, or a local error — empty strings when absent. */
    static String[] send(String email, String note) throws Exception {
        email = email.trim();
        if (!ADDRESS.matcher(email).matches()) {
            return new String[] {"400", "", "", "", "email must be one address, like you@example.com"};
        }
        String payload = "{"
            + "\"from\":\"" + jsonEscape(env("MAIL_FROM")) + "\","
            + "\"to\":\"" + jsonEscape(email) + "\","
            + "\"subject\":\"Your ticket\","
            + "\"text\":\"Ticket note: " + jsonEscape(note) + "\""
            + "}";
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl() + "/emails"))
            .header("authorization", "Bearer " + env("AGENTISEND_API_KEY"))
            .header("content-type", "application/json")
            .header("accept", "application/json")
            // The recipient, not the moment: a retry of the same note replays.
            .header("idempotency-key", "ticket/" + email)
            .POST(HttpRequest.BodyPublishers.ofString(payload))
            .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        String body = response.body() == null ? "" : response.body();
        if (response.statusCode() >= 400) {
            return new String[] {
                Integer.toString(response.statusCode()),
                "",
                jsonString(body, "code"),
                jsonString(body, "fix"),
                ""
            };
        }
        return new String[] {Integer.toString(response.statusCode()), jsonString(body, "id"), "", "", ""};
    }

    static void emit(String step, String[] result) {
        StringBuilder out = new StringBuilder();
        out.append("{\"step\":\"").append(step).append("\",\"status\":").append(result[0]);
        if (result[1] != null && !result[1].isEmpty()) out.append(",\"id\":\"").append(jsonEscape(result[1])).append('"');
        if (result[2] != null && !result[2].isEmpty()) out.append(",\"code\":\"").append(jsonEscape(result[2])).append('"');
        if (result[3] != null && !result[3].isEmpty()) out.append(",\"fix\":\"").append(jsonEscape(result[3])).append('"');
        if (result[4] != null && !result[4].isEmpty()) out.append(",\"error\":\"").append(jsonEscape(result[4])).append('"');
        out.append('}');
        System.out.println(out);
    }

    public static void main(String[] args) throws Exception {
        emit("send", send("java@example.com", "first"));
        emit("retry", send("java@example.com", "first"));
        emit("invalid", send("not-an-address", "first"));
        emit("refused", send("java@example.com", "second"));
    }
}
