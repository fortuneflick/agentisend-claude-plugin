// Send one email over HTTP with the Go standard library.
//
// The module path of the generated client is github.com/fortuneflick/agentisend-go.
// This file does not import it. It is the request that client makes, and the
// examples suite runs it with `go run`.
//
// Set AGENTISEND_API_KEY, AGENTISEND_BASE_URL, MAIL_FROM and SEND_TO.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

func main() {
	base := os.Getenv("AGENTISEND_BASE_URL")
	if base == "" {
		base = "https://api.agentisend.com"
	}
	to := os.Getenv("SEND_TO")
	if to == "" {
		to = "someone@example.com"
	}
	payload, err := json.Marshal(map[string]any{
		"from":    os.Getenv("MAIL_FROM"),
		"to":      to,
		"subject": "Hello from Go",
		"text":    "Sent with the Go standard library.",
	})
	if err != nil {
		fail(err)
	}
	request, err := http.NewRequest(http.MethodPost, base+"/emails", bytes.NewReader(payload))
	if err != nil {
		fail(err)
	}
	request.Header.Set("Authorization", "Bearer "+os.Getenv("AGENTISEND_API_KEY"))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "sdk-go/"+to)
	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		fail(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		fail(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		fail(err)
	}
	id, _ := decoded["id"].(string)
	if id == "" {
		fmt.Fprintln(os.Stderr, string(raw))
		os.Exit(1)
	}
	fmt.Println(id)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err.Error())
	os.Exit(1)
}
