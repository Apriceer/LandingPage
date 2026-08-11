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

    // console.log("CURRENT SPOTIFY JSON:");
    // console.log(data);

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

        //updateLoginButton();

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
        updateLoginButton();

    } else {
        console.log("Not logged into Spotify yet.");
    }
}
// Start everything
initializeSpotify();

// ================================
// UPDATE SONG
// ================================

let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;

async function updateSong() {

    const data = await getCurrentlyPlaying();

    const spotifyPlayer =
        document.querySelector(".spotify-player");

    const spotifyOpenButton =
        document.getElementById("spotify-open-button");


    if (!data || !data.item) {

        spotifyPlayer.style.display = "none";
        spotifyOpenButton.style.display = "flex";

        return;
    }

    spotifyPlayer.style.display = "flex";
    spotifyOpenButton.style.display = "none";



    const songName =
        document.getElementById("song-name");

    const artistName =
        document.getElementById("artist-name");

    const albumArt =
        document.getElementById("album-art");

    const playPauseIcon =
        document.getElementById("play-pause-icon");

    if (!data || !data.item) {

        songName.textContent = "Nothing playing";
        artistName.textContent = "";

        albumArt.src = "";

        currentProgress = 0;
        currentDuration = 0;
        isPlaying = false;

        updateProgressDisplay();

        return;
    }

    // Song information
    songName.textContent =
        data.item.name;

    artistName.textContent =
        data.item.artists
            .map(artist => artist.name)
            .join(", ");

    albumArt.src =
        data.item.album.images[0].url;


    // Sync progress with Spotify
    currentProgress =
        data.progress_ms || 0;

    currentDuration =
        data.item.duration_ms || 0;

    isPlaying =
        data.is_playing;


    // Change play/pause icon
    if (isPlaying) {

        playPauseIcon.src =
            "SpotifyIcons/pause-button.png";

    } else {

        playPauseIcon.src =
            "SpotifyIcons/play-button.png";
    }


    updateProgressDisplay();
}

updateSong()

setInterval(updateSong, 3000)

// ================================
// FORMATTING
// ================================

function updateLoginButton() {

    const button =
        document.getElementById("spotify-login-button");

    if (!button) return;

    const token =
        localStorage.getItem("spotify_access_token");

    if (token) {
        button.style.display = "none";
    } else {
        button.style.display = "";
    }
}

updateLoginButton();

function updateProgressDisplay() {

    const progressBar =
        document.getElementById("spotify-progress-bar");

    const currentTime =
        document.getElementById("spotify-current-time");

    const duration =
        document.getElementById("spotify-duration");


    if (currentDuration <= 0) {

        progressBar.style.width = "0%";

        currentTime.textContent = "0:00";
        duration.textContent = "0:00";

        return;
    }


    const percentage =
        (currentProgress / currentDuration) * 100;

    progressBar.style.width =
        `${Math.min(percentage, 100)}%`;


    currentTime.textContent =
        formatTime(currentProgress);

    duration.textContent =
        formatTime(currentDuration);
}

setInterval(() => {

    if (isPlaying && currentProgress < currentDuration) {

        currentProgress += 100;

        updateProgressDisplay();
    }

}, 100);

function formatTime(milliseconds) {

    const totalSeconds =
        Math.floor(milliseconds / 1000);

    const minutes =
        Math.floor(totalSeconds / 60);

    const seconds =
        totalSeconds % 60;

    return `${minutes}:${seconds
        .toString()
        .padStart(2, "0")}`;
}

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

async function previousSong() {

    const token =
        localStorage.getItem("spotify_access_token");

    if (!token) return;

    const response = await fetch(
        "https://api.spotify.com/v1/me/player/previous",
        {
            method: "POST",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        console.error(
            "Could not go to previous song:",
            response.status
        );

        return;
    }

    setTimeout(updateSong, 500);
}

async function togglePlay() {

    const token =
        localStorage.getItem("spotify_access_token");

    if (!token) return;

    const data = await getCurrentlyPlaying();

    if (!data) return;

    const endpoint = data.is_playing
        ? "pause"
        : "play";

    const response = await fetch(
        `https://api.spotify.com/v1/me/player/${endpoint}`,
        {
            method: "PUT",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        console.error(
            "Could not change playback:",
            response.status
        );

        return;
    }

    setTimeout(updateSong, 500);
}

// ================================
// MISCELLANEOUS
// ================================

async function openSpotify() {

    const token =
        localStorage.getItem("spotify_access_token");

    if (!token) {
        loginSpotify();
        return;
    }

    // Start/resume playback
    const response = await fetch(
        "https://api.spotify.com/v1/me/player/play",
        {
            method: "PUT",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        console.error(
            "Could not start Spotify playback:",
            response.status
        );

        // Open Spotify anyway
        window.open(
            "https://open.spotify.com/",
            "_blank"
        );

        return;
    }

    // Open Spotify's web player
    window.open(
        "https://open.spotify.com/",
        "_blank"
    );
}