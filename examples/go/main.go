// Go — one send with the standard library.
//
// There is no Go SDK. This program posts JSON to POST /emails with net/http.
// AGENTISEND_API_KEY is the key. MAIL_FROM is an address on a domain you have
// verified. AGENTISEND_BASE_URL is optional and defaults to the public API.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
)

var address = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func mailFrom() string {
	from := os.Getenv("MAIL_FROM")
	if from == "" {
		panic("Set MAIL_FROM to an address on a domain you have verified.")
	}
	return from
}

func baseURL() string {
	base := os.Getenv("AGENTISEND_BASE_URL")
	if base == "" {
		base = "https://api.agentisend.com"
	}
	return strings.TrimRight(base, "/")
}

type outcome struct {
	Status int
	Body   map[string]any
}

// send posts one invoice note. The idempotency key is the recipient, so a
// retry of the same note replays, and a different note under that key is
// refused rather than mailed twice.
func send(email, note string) outcome {
	email = strings.TrimSpace(email)
	if !address.MatchString(email) {
		return outcome{Status: 400, Body: map[string]any{
			"error": "email must be one address, like you@example.com",
		}}
	}
	payload, err := json.Marshal(map[string]string{
		"from":    mailFrom(),
		"to":      email,
		"subject": "Your invoice",
		"text":    "Invoice note: " + note,
	})
	if err != nil {
		panic(err)
	}
	req, err := http.NewRequest(http.MethodPost, baseURL()+"/emails", bytes.NewReader(payload))
	if err != nil {
		panic(err)
	}
	req.Header.Set("authorization", "Bearer "+os.Getenv("AGENTISEND_API_KEY"))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json")
	req.Header.Set("idempotency-key", "invoice/"+email)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		panic(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		panic(fmt.Sprintf("response was not JSON (%d): %s", resp.StatusCode, raw))
	}
	if resp.StatusCode >= 400 {
		errObj, _ := parsed["error"].(map[string]any)
		return outcome{Status: resp.StatusCode, Body: map[string]any{
			"code": errObj["code"],
			"fix":  errObj["fix"],
		}}
	}
	return outcome{Status: resp.StatusCode, Body: map[string]any{"id": parsed["id"]}}
}

func emit(step string, result outcome) {
	out := map[string]any{"step": step, "status": result.Status}
	for key, value := range result.Body {
		out[key] = value
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

func main() {
	emit("send", send("go@example.com", "first"))
	emit("retry", send("go@example.com", "first"))
	emit("invalid", send("not-an-address", "first"))
	emit("refused", send("go@example.com", "second"))
}
