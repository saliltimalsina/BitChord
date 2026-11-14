package main

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/KabirSinghBhatia/BitChord/backend/clock"
	"github.com/KabirSinghBhatia/BitChord/backend/codes"
	"github.com/KabirSinghBhatia/BitChord/backend/config"
	"github.com/KabirSinghBhatia/BitChord/backend/party"
	"github.com/KabirSinghBhatia/BitChord/backend/protocol"
)

// "Your devices" (Spotify Connect's device list): one person's own phones,
// browsers and tablets, always connected to each other while open, so any of
// them can see what another is playing and take it over.
//
// A home is opened by a secret key that only its devices hold. The first device
// makes the key up; another device gets it by pairing once — the first shows a
// short code, the second claims it — and stores it. Nothing about a home is
// discoverable from a userId, which the server cannot verify and which every
// party a person joins can see.

const (
	homeKeyMin    = 32
	homeKeyMax    = 128
	pairingTTL    = 10 * time.Minute
	pairingClaims = 10 // per IP per minute: six characters are guessable without a ceiling
)

type pairing struct {
	homeKey string
	expires time.Time
}

var (
	pairingsMu   sync.Mutex
	pairings     = map[string]pairing{}
	claimLimiter = newIPRateLimiter(time.Minute, pairingClaims, config.RateLimitMaxEntries)
	pairLimiter  = newIPRateLimiter(time.Minute, pairingClaims, config.RateLimitMaxEntries)
)

type homeJoinRequest struct {
	protocol.JoinRequest
	HomeKey string `json:"homeKey"`
}

func validHomeKey(key string) bool {
	key = strings.TrimSpace(key)
	return len(key) >= homeKeyMin && len(key) <= homeKeyMax
}

// handleJoinHome opens (or creates) the home a key names and joins this device
// to it. The answer is a party membership in every respect, so the clients'
// socket, sync and controls are the party's own.
func handleJoinHome(w http.ResponseWriter, r *http.Request) {
	var req homeJoinRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if !validHomeKey(req.HomeKey) {
		jsonError(w, http.StatusUnprocessableEntity, "invalid_home_key", "That device key isn't valid.")
		return
	}
	if err := req.JoinRequest.Validate(); err != nil {
		jsonError(w, http.StatusUnprocessableEntity, "validation_error", err.Error())
		return
	}
	p, err := store.GetOrCreateHome(strings.TrimSpace(req.HomeKey), config.MaxParties)
	if err != nil {
		writePartyError(w, err)
		return
	}
	p.Lock()
	m, err := p.Join(req.UserId, req.DeviceId, req.DisplayName, req.AvatarUrl)
	if err != nil {
		p.Unlock()
		writePartyError(w, err)
		return
	}
	m.DeviceName = req.DeviceName
	partyWire := p.ToWire()
	youWire := m.ToWire()
	token, code := m.Token, p.Code
	members := membersFrame(p)
	p.Unlock()
	// The others learn a device came online without waiting for its socket.
	hubInst.Broadcast(code, members, "")

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"code":  code,
		"token": token,
		"you":   youWire,
		"party": partyWire,
	})
}

// handleStartPairing mints a short code that hands this home's key to one other
// device, once, within pairingTTL.
func handleStartPairing(w http.ResponseWriter, r *http.Request) {
	if !pairLimiter.Allow(clientIP(r)) {
		jsonError(w, http.StatusTooManyRequests, "rate_limited", "Too many pairing codes. Try again in a minute.")
		return
	}
	var req struct {
		HomeKey string `json:"homeKey"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if !validHomeKey(req.HomeKey) {
		jsonError(w, http.StatusUnprocessableEntity, "invalid_home_key", "That device key isn't valid.")
		return
	}
	now := time.Now()
	pairingsMu.Lock()
	for code, p := range pairings {
		if now.After(p.expires) {
			delete(pairings, code)
		}
	}
	code := codes.NewCode()
	for i := 0; i < 8; i++ {
		if _, taken := pairings[code]; !taken {
			break
		}
		code = codes.NewCode()
	}
	pairings[code] = pairing{homeKey: strings.TrimSpace(req.HomeKey), expires: now.Add(pairingTTL)}
	pairingsMu.Unlock()
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"code":        code,
		"expiresAtMs": clock.NowMs() + pairingTTL.Milliseconds(),
	})
}

// handleClaimPairing trades a pairing code for the home key, and spends it.
func handleClaimPairing(w http.ResponseWriter, r *http.Request) {
	if !claimLimiter.Allow(clientIP(r)) {
		jsonError(w, http.StatusTooManyRequests, "rate_limited", "Too many tries. Wait a minute and check the code.")
		return
	}
	code := codes.Normalise(r.PathValue("code"))
	pairingsMu.Lock()
	p, ok := pairings[code]
	if ok {
		delete(pairings, code)
	}
	pairingsMu.Unlock()
	if !ok || time.Now().After(p.expires) {
		jsonError(w, http.StatusNotFound, "no_such_pairing", "That code isn't valid or has expired. Show a new one on your other device.")
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"homeKey": p.homeKey})
}

func writePartyError(w http.ResponseWriter, err error) {
	if pe, ok := err.(*party.PartyError); ok {
		jsonError(w, pe.Status, pe.Code, pe.Message)
		return
	}
	jsonError(w, http.StatusInternalServerError, "server_error", err.Error())
}
