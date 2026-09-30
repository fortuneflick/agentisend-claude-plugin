// Verify an AgentiSend delivery with crypto/hmac.
//
// HMAC-SHA256 over "<unix seconds>.<raw body>", header "t=<unix seconds>,v1=<hex>".
// Reject a timestamp more than five minutes off. Compare in constant time.
//
// The examples suite sets WEBHOOK_SECRET, WEBHOOK_SIGNATURE, WEBHOOK_BODY and
// WEBHOOK_NOW_SECONDS, then reads "ok" or "rejected".
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const toleranceSeconds = 5 * 60

func acceptDelivery(secret, signature, rawBody string, nowSeconds int64) bool {
	var timestamp int64
	var haveTimestamp bool
	var provided []string
	for _, part := range strings.Split(signature, ",") {
		key, value, ok := strings.Cut(part, "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			parsed, err := strconv.ParseInt(value, 10, 64)
			if err != nil {
				return false
			}
			timestamp = parsed
			haveTimestamp = true
		case "v1":
			if value != "" {
				provided = append(provided, value)
			}
		}
	}
	if !haveTimestamp || len(provided) == 0 {
		return false
	}
	delta := nowSeconds - timestamp
	if delta < 0 {
		delta = -delta
	}
	if delta > toleranceSeconds {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d.%s", timestamp, rawBody)))
	expected := hex.EncodeToString(mac.Sum(nil))
	matched := false
	for _, item := range provided {
		if hmac.Equal([]byte(expected), []byte(item)) {
			matched = true
		}
	}
	return matched
}

func main() {
	now, err := strconv.ParseInt(os.Getenv("WEBHOOK_NOW_SECONDS"), 10, 64)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	ok := acceptDelivery(
		os.Getenv("WEBHOOK_SECRET"),
		os.Getenv("WEBHOOK_SIGNATURE"),
		os.Getenv("WEBHOOK_BODY"),
		now,
	)
	if ok {
		fmt.Println("ok")
	} else {
		fmt.Println("rejected")
	}
}
