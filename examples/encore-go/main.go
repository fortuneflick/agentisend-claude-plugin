// Encore for Go — the function an //encore:api endpoint calls.
//
// The documented endpoint is a function with this shape:
//
//	//encore:api public method=POST path=/send
//	func Send(ctx context.Context, params *Params) (*Reply, error)
//
// There is no Go package for this API. Send posts JSON to POST /emails with
// net/http. This file does not run the Encore compiler; main calls Send the
// way the generated endpoint would. AGENTISEND_API_KEY is the key. MAIL_FROM
// is an address on a domain you have verified. AGENTISEND_BASE_URL is optional.
package main

import (
	"bytes"
	"context"
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

// Params is the JSON body of POST /send.
type Params struct {
	Email string `json:"email"`
	Note  string `json:"note"`
}

// Reply is what the endpoint returns. Status is the HTTP status Encore would
// set; the other fields are the JSON body.
type Reply struct {
	Status int
	Body   map[string]any
}

// Send posts one welcome note. The idempotency key is the recipient, so a
// retry of the same note replays, and a different note under that key is
// refused rather than mailed twice.
func Send(ctx context.Context, params *Params) Reply {
	email := strings.TrimSpace(params.Email)
	if !address.MatchString(email) {
		return Reply{Status: 400, Body: map[string]any{
			"error": "email must be one address, like you@example.com",
		}}
	}
	payload, err := json.Marshal(map[string]string{
		"from":    mailFrom(),
		"to":      email,
		"subject": "Your account is ready",
		"text":    "Welcome note: " + params.Note,
	})
	if err != nil {
		panic(err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL()+"/emails", bytes.NewReader(payload))
	if err != nil {
		panic(err)
	}
	req.Header.Set("authorization", "Bearer "+os.Getenv("AGENTISEND_API_KEY"))
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json")
	req.Header.Set("idempotency-key", "welcome/"+email)
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
		return Reply{Status: resp.StatusCode, Body: map[string]any{
			"code": errObj["code"],
			"fix":  errObj["fix"],
		}}
	}
	return Reply{Status: resp.StatusCode, Body: map[string]any{"id": parsed["id"]}}
}

func emit(step string, result Reply) {
	out := map[string]any{"step": step, "status": result.Status}
	for key, value := range result.Body {
		out[key] = value
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

func main() {
	ctx := context.Background()
	emit("send", Send(ctx, &Params{Email: "encore-go@example.com", Note: "first"}))
	emit("retry", Send(ctx, &Params{Email: "encore-go@example.com", Note: "first"}))
	emit("invalid", Send(ctx, &Params{Email: "not-an-address", Note: "first"}))
	emit("refused", Send(ctx, &Params{Email: "encore-go@example.com", Note: "second"}))
}
