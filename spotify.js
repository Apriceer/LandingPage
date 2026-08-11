const clientId = "9a14dfc4a093402493d69ad154347ce2";
const redirectUri = "https://apriceer.github.io/LandingPage/";

const scopes = [
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-modify-playback-state"
];


// ================================
// PKCE HELPERS
// ================================

function generateRandomString(length) {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let result = "";

    for (let i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length)
        );
    }

    return result;
}


async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    return btoa(
        String.fromCharCode(...new Uint8Array(digest))
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}


// ================================
// LOGIN
// ================================

async function loginSpotify() {

    const verifier = generateRandomString(64);

    localStorage.setItem(
        "spotify_code_verifier",
        verifier
    );

    const challenge =
        await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        code_challenge_method: "S256",
        code_challenge: challenge
    });

    window.location.href =
        "https://accounts.spotify.com/authorize?" +
        params.toString();
}


// ================================
// GET ACCESS TOKEN
// ================================

async function getAccessToken(code) {
    const verifier = localStorage.getItem("spotify_code_verifier");

    console.log("Authorization code:", code);
    console.log("Code verifier exists:", !!verifier);

    if (!verifier) {
        console.error("ERROR: No code verifier found in localStorage.");
        return null;
    }

    const response = await fetch(
        "https://accounts.spotify.com/api/token",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },

            body: new URLSearchParams({
                client_id: clientId,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: redirectUri,
                code_verifier: verifier
            })
        }
    );

    const data = await response.json();

    console.log("Spotify token response:", data);

    if (!response.ok) {
        console.error(
            "Token request failed:",
            response.status,
            data
        );
        return null;
    }

    localStorage.setItem(
        "spotify_access_token",
        data.access_token
    );

    if (data.refresh_token) {
        localStorage.setItem(
            "spotify_refresh_token",
            data.refresh_token
        );
    }

    return data.access_token;
}


// ================================
// GET CURRENTLY PLAYING
// ================================

async function getCurrentlyPlaying() {

    const token =
        localStorage.getItem("spotify_access_token");

    if (!token) {
        console.log("Not logged into Spotify.");
        return null;
    }

    const response = await fetch(
        "https://api.spotify.com/v1/me/player",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    // 204 = nothing is currently playing
    if (response.status === 204) {
        console.log("Nothing is currently playing.");
        return null;
    }

    if (!response.ok) {
        console.error(
            "Spotify API error:",
            response.status
        );

        return null;
    }

    const data = await response.json();

    console.log("CURRENT SPOTIFY JSON:");
    console.log(data);

    return data;
}

// ================================
// HANDLE LOGIN CALLBACK
// ================================

async function initializeSpotify() {

    const params = new URLSearchParams(window.location.search);

    const code = params.get("code");
    const error = params.get("error");

    // Spotify rejected authorization
    if (error) {
        console.error("Spotify authorization error:", error);
        return;
    }

    // Spotify sent us an authorization code
    if (code) {

        console.log("Authorization code received!");

        const token = await getAccessToken(code);

        if (!token) {
            console.error("Failed to get Spotify access token.");
            return;
        }

        console.log("Spotify login successful!");
        console.log("Access token received.");

        // Remove ?code=... from the URL
        window.history.replaceState(
            {},
            document.title,
            redirectUri
        );

        const currentlyPlaying =
            await getCurrentlyPlaying();

        console.log(
            "Currently playing:",
            currentlyPlaying
        );

        return;
    }

    // No code → check whether we already have a token
    const token =
        localStorage.getItem("spotify_access_token");

    if (token) {
        console.log("Existing Spotify token found.");

        await getCurrentlyPlaying();

    } else {
        console.log("Not logged into Spotify yet.");
    }
}
// Start everything
initializeSpotify();

// ================================
// UPDATE SONG
// ================================

async function updateSong() {

    const data = await getCurrentlyPlaying();

    console.log("updateSong is running");

    if (!data || !data.item) {
        document.getElementById("song-name").textContent =
            "Nothing playing";

        document.getElementById("artist-name").textContent = "";

        return;
    }

    console.log("updateSong is running with data");

    document.getElementById("song-name").textContent =
        data.item.name;

    document.getElementById("artist-name").textContent =
        data.item.artists[0].name;

    document.getElementById("album-art").src =
        data.item.album.images[0].url;
}

updateSong();

setInterval(updateSong, 5000);

// ================================
// FUNCTIONALITY
// ================================

async function skipSong() {

    const token =
        localStorage.getItem("spotify_access_token");

    if (!token) {
        console.log("Not logged into Spotify.");
        return;
    }

    const response = await fetch(
        "https://api.spotify.com/v1/me/player/next",
        {
            method: "POST",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        console.error(
            "Could not skip song:",
            response.status
        );

        return;
    }

    // Give Spotify a moment to change tracks,
    // then update the UI.
    setTimeout(updateSong, 500);
}
