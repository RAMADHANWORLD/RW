// --- Constants ---
const QURAN_AUDIO_BASE_URL = 'https://download.quranicaudio.com/quran/abdullah_basfar/';
const QURAN_TEXT_ARABIC_BASE_URL = 'https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=';
const QURAN_TEXT_TRANSLATION_BASE_URL = 'https://api.quran.com/api/v4/quran/translations/131?chapter_number=';

// --- DOM Elements & State ---
const loadingScreen = document.getElementById('loading-screen');
const mainContent = document.getElementById('main-content');
const islamicDateEl = document.getElementById('islamic-date');
const locationEl = document.getElementById('location');
const nextPrayerNameEl = document.getElementById('next-prayer-name');
const countdownTimerEl = document.getElementById('countdown-timer');

// Prayer time elements for the Salah view
const salahPrayerTimeElements = { 
    Fajr: document.querySelector('#salah-fajr span:last-child'), 
    Sunrise: document.querySelector('#salah-sunrise span:last-child'), 
    Dhuhr: document.querySelector('#salah-dhuhr span:last-child'), 
    Asr: document.querySelector('#salah-asr span:last-child'), 
    Maghrib: document.querySelector('#salah-maghrib span:last-child'), 
    Isha: document.querySelector('#salah-isha span:last-child') 
};

const views = { 
    home: document.getElementById('home-view'), 
    qibla: document.getElementById('qibla-view'), 
    quran: document.getElementById('quran-view'), 
    salah: document.getElementById('salah-view'), 
    naat: document.getElementById('naat-view'),
    tasbeeh: document.getElementById('tasbeeh-view'), 
    settings: document.getElementById('settings-view') 
};
const qiblaDirectionEl = document.getElementById('qibla-direction');
const qiblaMarker = document.getElementById('qibla-marker');

// Quran Audio and Text elements
const surahSelect = document.getElementById('surah-select');
const quranReadingContent = document.getElementById('quran-reading-content'); 
const quranAudioPlayer = document.getElementById('quran-audio-player');
const currentSurahName = document.getElementById('current-surah-name');

// Home page radio player elements
const radioPlayer = document.getElementById('radioPlayer'); 
const radioPlayPauseButton = document.getElementById('radio-play-pause-button'); 
const radioStatusMessage = document.getElementById('radio-status-message'); 

// Separate audio elements for different azans
const azanFajrAudio = document.getElementById('azan-fajr-audio');
const azanOtherAudio = document.getElementById('azan-other-audio');

const settingsSavedMessage = document.getElementById('settings-saved-message');
const azanPlayFailedMessage = document.getElementById('azan-play-failed-message');

// Naat player buttons
const tvPauseButton = document.getElementById('tv-pause-button');

// PWA Install button and fallback message
const installAppButton = document.getElementById('install-app-button');
const installAppFallback = document.getElementById('install-app-fallback');
let deferredPrompt; 

let countdownInterval;
let userCoords = { latitude: null, longitude: null }; 
let qiblaAngle = null; 
let settings = { azanNotification: 'notification' }; // Default to notification only
let youtubePlayer; 
let tasbeehCount = 0; 
const tasbeehCounterDisplay = document.getElementById('tasbeeh-counter-display'); 
let allSurahs = []; // To store the list of all Surahs

// --- Core Functions ---

async function initializeApp() {
    loadSettings();
    
    // Get user location automatically
    getLocation(async (loc) => {
        userCoords.latitude = loc.latitude;
        userCoords.longitude = loc.longitude;
        // Reverse geocode to get city/country for display
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}`);
            if (!response.ok) {
                throw new Error(`Reverse geocoding API request failed with status ${response.status}`);
            }
            const data = await response.json();
            const city = data.address.city || data.address.town || data.address.village || 'Unknown City';
            const country = data.address.country || 'Unknown Country';
            locationEl.textContent = `${city}, ${country}`;
        } catch (error) {
            locationEl.textContent = `Location detected, but city name unknown or geocoding failed.`;
            console.error("Error reverse geocoding:", error);
            showTemporaryMessage(`Could not determine city name.`, true);
        }
        await getPrayerTimes(userCoords.latitude, userCoords.longitude);
        await getQiblaDirection(userCoords.latitude, userCoords.longitude);
    });

    await loadAllSurahs(); // Load Surahs at app initialization
    hideLoading(); // Hide loading screen once initial data is fetched
    showView('home'); // Show home view once loaded
    
    // Attempt to play Ramadhan Radio on load (if not already playing)
    // This is still subject to browser autoplay policies
    if (radioPlayer.paused) {
        try {
            await radioPlayer.play();
            radioPlayPauseButton.textContent = "Pause Ramadhan World Radio";
            radioStatusMessage.classList.add('hidden');
            console.log("Ramadhan Radio playing.");
        } catch (e) {
            console.warn("Autoplay prevented for Ramadhan Radio:", e);
            // Removed the specific "Autoplay blocked..." message from display
            radioPlayPauseButton.textContent = "Play Ramadhan World Radio"; // Ensure button says Play
        }
    }
    loadTasbeehCount(); // Load tasbeeh count on app initialization
}

// Updated getLocation function to use ipinfo.io
function getLocation(callback) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                callback({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    method: "GPS"
                });
            },
            error => {
                // If denied or failed, fallback to IP using ipinfo.io
                fetch("https://ipinfo.io/json")
                    .then(res => {
                        if (!res.ok) {
                            throw new Error(`IP API request failed with status ${res.status}`);
                        }
                        return res.json();
                    })
                    .then(data => {
                        const [lat, lon] = data.loc.split(',');
                        callback({
                            latitude: parseFloat(lat),
                            longitude: parseFloat(lon),
                            method: "IP"
                        });
                    })
                    .catch(e => {
                        console.error("IP API fetch failed:", e);
                        // Fallback to Karachi if IP API also fails
                        callback({ latitude: 24.8607, longitude: 67.0011, method: "Default (Karachi)" }); 
                        locationEl.textContent = "Location detection failed. Showing times for Karachi, Pakistan.";
                        showTemporaryMessage("Location detection failed. Showing times for Karachi, Pakistan.", true);
                    });
            }
        );
    } else {
        // No geolocation, fallback to IP using ipinfo.io
        fetch("https://ipinfo.io/json")
            .then(res => {
                if (!res.ok) {
                    throw new Error(`IP API request failed with status ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                const [lat, lon] = data.loc.split(',');
                callback({
                    latitude: parseFloat(lat),
                    longitude: parseFloat(lon),
                    method: "IP"
                });
            })
            .catch(e => {
                console.error("IP API fetch failed:", e);
                // Fallback to Karachi if IP API also fails
                callback({ latitude: 24.8607, longitude: 67.0011, method: "Default (Karachi)" }); 
                locationEl.textContent = "Location detection failed. Showing times for Karachi, Pakistan.";
                showTemporaryMessage("Location detection failed. Showing times for Karachi, Pakistan.", true);
            });
    }
}

async function getPrayerTimes(latitude, longitude) { 
    try {
        const date = new Date();
        const dateString = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
        // Using timings API with latitude and longitude
        const apiUrl = `https://api.aladhan.com/v1/timings/${dateString}?latitude=${latitude}&longitude=${longitude}&method=2`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();

        if (data.code === 200) {
            displayPrayerTimes(data.data);
            updateCountdown(data.data.timings);
            // Update Qibla angle
            if (data.data.meta && typeof data.data.meta.qibla !== 'undefined') { 
                qiblaAngle = data.data.meta.qibla;
                qiblaDirectionEl.textContent = `Qibla is at ${qiblaAngle.toFixed(2)}° from North. Rotate your device until the blue line points upwards.`;
            } else {
                // If not from prayer times API, try fetching from dedicated Qibla API
                await getQiblaDirection(latitude, longitude);
            }
        } else {
            throw new Error('Could not fetch prayer times from the API.');
        }
    } catch (error) {
        console.error("Error fetching prayer times:", error);
        locationEl.textContent = `Could not fetch prayer times for current location. Please try again.`;
        showTemporaryMessage(`Could not fetch prayer times for current location.`, true);
        // Clear prayer times display
        for (const prayer in salahPrayerTimeElements) {
            if (salahPrayerTimeElements[prayer]) {
                salahPrayerTimeElements[prayer].textContent = '--:--';
            }
        }
        countdownTimerEl.textContent = "N/A";
        nextPrayerNameEl.textContent = "No Prayer Times";
    }
}

async function getQiblaDirection(latitude, longitude) {
    try {
        const qiblaApiUrl = `https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`;
        const response = await fetch(qiblaApiUrl);
        if (!response.ok) {
            throw new Error(`Qibla API request failed with status ${response.status}`);
        }
        const data = await response.json();
        if (data.code === 200 && data.data && typeof data.data.direction !== 'undefined') {
            qiblaAngle = data.data.direction;
            qiblaDirectionEl.textContent = `Qibla is at ${qiblaAngle.toFixed(2)}° from North. Rotate your device until the blue line points upwards.`;
        } else {
            qiblaAngle = null;
            console.warn("Qibla direction not found in API response from dedicated Qibla API.");
        }
    } catch (error) {
        qiblaAngle = null;
        console.error("Error fetching Qibla direction:", error);
    }
}

function displayPrayerTimes(data) {
    const timings = data.timings;
    islamicDateEl.textContent = `${data.date.hijri.weekday.en}, ${data.date.hijri.day} ${data.date.hijri.month.en} ${data.date.hijri.year}`;
    
    for (const prayer in salahPrayerTimeElements) {
        if (salahPrayerTimeElements[prayer]) {
            salahPrayerTimeElements[prayer].textContent = formatTime(timings[prayer]);
        }
    }
}

function updateCountdown(timings) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        const now = new Date();
        const nextPrayer = findNextPrayer(now, timings);

        document.querySelectorAll('.prayer-time').forEach(el => el.classList.remove('active'));

        if (nextPrayer) {
            nextPrayerNameEl.textContent = nextPrayer.name;
            const prayerTime = new Date(now.toDateString() + ' ' + nextPrayer.time);
            const diff = prayerTime.getTime() - now.getTime();
            
            const nextPrayerElement = document.getElementById(`salah-${nextPrayer.name.toLowerCase()}`);
            if (nextPrayerElement) {
                nextPrayerElement.classList.add('active');
            }

            if (diff > 0) {
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                countdownTimerEl.textContent = `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;

                // Trigger notification when countdown hits zero
                if (hours === 0 && minutes === 0 && seconds === 0) {
                    handleAzan(nextPrayer.name, nextPrayer.name === 'Sunrise');
                }
            } else {
                // If countdown has passed for the current prayer, immediately re-fetch times for the current location
                if (userCoords.latitude && userCoords.longitude) {
                    getPrayerTimes(userCoords.latitude, userCoords.longitude);
                } else {
                    // If location not available, stop countdown
                    clearInterval(countdownInterval);
                    countdownTimerEl.textContent = "N/A";
                    nextPrayerNameEl.textContent = "Location Unknown";
                }
            }
        } else {
            // If all prayers for today have passed, show countdown to Fajr tomorrow
            nextPrayerNameEl.textContent = 'Fajr (Tomorrow)';
            const fajrTimeToday = timings['Fajr'] ? new Date(now.toDateString() + ' ' + timings['Fajr']) : null;
            let fajrTimeTomorrow = null;

            if (fajrTimeToday) {
                fajrTimeTomorrow = new Date(fajrTimeToday);
                fajrTimeTomorrow.setDate(fajrTimeTomorrow.getDate() + 1); // Set to tomorrow's Fajr
            } else {
                // Fallback if Fajr time is not available for some reason
                fajrTimeTomorrow = new Date(now);
                fajrTimeTomorrow.setDate(fajrTimeTomorrow.getDate() + 1);
                fajrTimeTomorrow.setHours(5, 0, 0, 0); // Default to 5 AM tomorrow
            }

            const diff = fajrTimeTomorrow.getTime() - now.getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            countdownTimerEl.textContent = `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
        }
    }, 1000);
}

function findNextPrayer(now, timings) {
    const prayerOrder = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    for (const prayerName of prayerOrder) {
        if (timings[prayerName]) {
            const prayerTime = new Date(now.toDateString() + ' ' + timings[prayerName]);
            if (prayerTime > now) return { name: prayerName, time: timings[prayerName] };
        }
    }
    return null;
}

// --- UI & View Management ---

function showView(viewName) {
    // Pause all media when switching views
    radioPlayer.pause();
    if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') {
        youtubePlayer.pauseVideo();
    }
    azanFajrAudio.pause();
    azanOtherAudio.pause();
    quranAudioPlayer.pause();

    Object.values(views).forEach(view => {
        if (view) { 
            view.classList.add('hidden');
        }
    });

    if (views[viewName]) { 
        views[viewName].classList.remove('hidden');
    }
    
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    const activeButton = document.querySelector(`.nav-button[onclick="showView('${viewName}')"]`);
    if (activeButton) { 
        activeButton.classList.add('active');
    }
    
    // Specific actions for each view
    if (viewName === 'qibla') {
        startCompass();
    } else {
        stopCompass();
    }

    if (viewName === 'quran') {
        // Ensure surah list is populated and a surah is selected/loaded
        if (allSurahs.length > 0) {
            // Load the first surah by default if none selected
            loadSurah(allSurahs[0].id);
        }
    }

    if (viewName === 'naat' && youtubePlayer) {
        // No autoplay, just ensure player is ready for user interaction
    }

    if (viewName === 'tasbeeh') {
        loadTasbeehCount();
    }
}

function hideLoading() {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        mainContent.classList.remove('opacity-0');
    }, 500);
}

// --- Qibla Compass ---

function startCompass() {
    if (qiblaAngle === null) {
        qiblaDirectionEl.textContent = 'Qibla direction unavailable. Location not determined.';
        console.warn("Qibla angle is null, cannot start compass accurately.");
        return;
    }

    // Update initial Qibla direction text
    qiblaDirectionEl.textContent = `Qibla Direction: ${qiblaAngle.toFixed(2)}° from North. Rotate your device until the blue line points upwards.`;

    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                     qiblaDirectionEl.textContent = "Permission for device orientation not granted.";
                }
            })
            .catch(e => {
                console.error("DeviceOrientationEvent permission error:", e);
                qiblaDirectionEl.textContent = "Device orientation permission failed.";
            });
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', handleOrientation);
    } else {
        qiblaDirectionEl.textContent = "Device orientation not supported on this browser.";
    }
}

function stopCompass() {
    window.removeEventListener('deviceorientation', handleOrientation);
}

function handleOrientation(event) {
    if (qiblaAngle === null) {
        qiblaDirectionEl.textContent = 'Qibla direction unavailable.';
        return;
    }

    let alpha;
    if (event.webkitCompassHeading) {
        alpha = event.webkitCompassHeading; 
    } else if (event.alpha !== null) {
        alpha = event.alpha; 
    } else {
        qiblaDirectionEl.textContent = "Could not get device heading.";
        return;
    }

    // Rotate the Qibla marker (blue line) to point towards Qibla relative to the device's current orientation.
    // The qiblaAngle is the Qibla direction relative to True North.
    // Alpha is the device's current heading relative to True North.
    // To make the marker point to Qibla, it needs to rotate by (Qibla Angle - Device Heading).
    // The SVG is designed to point upwards when rotation is 0.
    qiblaMarker.style.transform = `rotate(${qiblaAngle - alpha}deg)`;

    qiblaDirectionEl.textContent = `Qibla: ${qiblaAngle.toFixed(2)}° from North. Your device is pointing ${alpha.toFixed(2)}° from North. Rotate until the blue line points upwards.`; 
}


// --- Quran Section (All Surahs) ---
async function loadAllSurahs() {
    try {
        const response = await fetch('https://api.quran.com/api/v4/chapters');
        const data = await response.json();
        if (data.chapters) {
            allSurahs = data.chapters;
            populateSurahSelect();
            // Load the first Surah by default
            loadSurah(allSurahs[0].id);
        } else {
            console.error('Failed to load surah list:', data);
            showTemporaryMessage('Failed to load Surah list.', true);
        }
    } catch (error) {
        console.error('Error fetching surah list:', error);
        showTemporaryMessage('Error fetching Surah list. Check internet connection.', true);
    }
}

function populateSurahSelect() {
    surahSelect.innerHTML = ''; // Clear existing options
    allSurahs.forEach(surah => {
        const option = document.createElement('option');
        option.value = surah.id;
        option.textContent = `${surah.id}. ${surah.name_simple} (${surah.name_arabic})`;
        surahSelect.appendChild(option);
    });

    surahSelect.addEventListener('change', (event) => {
        const surahId = parseInt(event.target.value);
        loadSurah(surahId);
    });
}

async function loadSurah(surahId) {
    const selectedSurah = allSurahs.find(s => s.id === surahId);
    if (!selectedSurah) {
        console.error(`Surah with ID ${surahId} not found.`);
        return;
    }

    currentSurahName.textContent = `${selectedSurah.name_simple} (${selectedSurah.name_arabic})`;
    surahSelect.value = surahId; // Update select dropdown

    // Load Arabic and English text
    await loadSurahText(surahId);

    // Set audio source and load (manual play)
    const audioUrl = `${QURAN_AUDIO_BASE_URL}${String(surahId).padStart(3, '0')}.mp3`;
    quranAudioPlayer.src = audioUrl;
    quranAudioPlayer.load(); // Load the new audio, but do not autoplay
}

async function loadSurahText(surahId) {
    quranReadingContent.innerHTML = `<p class="text-center text-gray-400">Loading text for Surah ${surahId}...</p>`;
    try {
        const arabicResponse = await fetch(`${QURAN_TEXT_ARABIC_BASE_URL}${surahId}`);
        const arabicData = await arabicResponse.json();
        const arabicVerses = arabicData.verses;

        const translationResponse = await fetch(`${QURAN_TEXT_TRANSLATION_BASE_URL}${surahId}`);
        const translationData = await translationResponse.json();
        const translationVerses = translationData.translations;

        let htmlContent = '';
        for (let i = 0; i < arabicVerses.length; i++) {
            const arabicText = arabicVerses[i] ? arabicVerses[i].text_uthmani : '';
            // Ensure translation text exists before accessing .text
            const translationText = (translationVerses[i] && translationVerses[i].text) ? translationVerses[i].text : '';
            const ayahNumber = arabicVerses[i] ? arabicVerses[i].verse_number : '';

            htmlContent += `
                <div class="quran-ayah-group">
                    <span class="arabic-text">${arabicText} <span class="ayah-number-inline">(${ayahNumber})</span></span>
                    <span class="translation-text">${translationText}</span>
                </div>
            `;
        }
        quranReadingContent.innerHTML = htmlContent;
    } catch (error) {
        quranReadingContent.innerHTML = `<p class="text-center text-red-400">Failed to load Surah text. Please check your internet connection.</p>`;
        console.error("Error fetching Surah text:", error);
    }
}

// --- Radio Section (now with explicit Play/Pause button) ---
function toggleRadioPlayback() {
    if (radioPlayer.paused) {
        radioPlayer.play().then(() => {
            radioPlayPauseButton.textContent = "Pause Ramadhan World Radio";
            radioStatusMessage.classList.add('hidden');
            console.log("Ramadhan Radio playing.");
        }).catch(e => {
            console.error("Error playing Ramadhan Radio:", e);
            let errorMessage = "Failed to play radio. Autoplay might be blocked or stream unavailable. ";
            if (e.name === "NotAllowedError") {
                errorMessage += "Please click the play button on the audio player directly.";
            } else if (e.name === "AbortError") {
                errorMessage += "Playback was aborted, possibly due to network issues or unsupported format.";
            }
            radioStatusMessage.textContent = errorMessage;
            radioStatusMessage.classList.remove('hidden');
            showTemporaryMessage(errorMessage, true);
        });
    } else {
        radioPlayer.pause();
        radioPlayPauseButton.textContent = "Play Ramadhan World Radio";
        radioStatusMessage.textContent = "Ramadhan Radio paused.";
        radioStatusMessage.classList.remove('hidden');
        console.log("Ramadhan Radio paused.");
    }
}

// Add event listeners for the radioPlayer to update status messages
radioPlayer.addEventListener('play', () => {
    radioPlayPauseButton.textContent = "Pause Ramadhan World Radio";
    radioStatusMessage.classList.add('hidden');
});

radioPlayer.addEventListener('pause', () => {
    radioPlayPauseButton.textContent = "Play Ramadhan World Radio";
    radioStatusMessage.textContent = "Ramadhan Radio paused.";
    radioStatusMessage.classList.remove('hidden');
});

radioPlayer.addEventListener('error', (e) => {
    console.error("Ramadhan Radio Error event:", e);
    let errorMessage = "Error loading Ramadhan Radio stream. ";
    if (radioPlayer.error) {
        switch (radioPlayer.error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
                errorMessage += "Playback aborted.";
                break;
            case MediaError.MEDIA_ERR_NETWORK:
                errorMessage += "Network error. Please check your internet connection.";
                break;
            case MediaError.MEDIA_ERR_DECODE:
                errorMessage += "Audio decoding error. The format might not be supported.";
                break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage += "The audio source is not supported or cannot be found.";
                break;
            default:
                errorMessage += "An unknown error occurred.";
                break;
        }
    }
    radioStatusMessage.textContent = errorMessage;
    radioStatusMessage.classList.remove('hidden');
    showTemporaryMessage(errorMessage, true);
});


// --- YouTube Naat Section ---
function onYouTubeIframeAPIReady() {
    youtubePlayer = new YT.Player('youtube-player', {
        height: '360',
        width: '640',
        videoId: 'mU72MeSW5Zs', // Specific video ID
        playerVars: {
            'playsinline': 1,
            'autoplay': 0, 
            'controls': 0, 
            'rel': 0, 
            'showinfo': 0, 
            'modestbranding': 1, 
            'listType': 'playlist',
            'list': 'PL6b_3Yr67_wFpDJfaZLlMEUP6h5EroJi2' // Playlist ID
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('YouTube Player is ready.');
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        tvPauseButton.textContent = "Pause"; // Update button text
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        tvPauseButton.textContent = "Play"; // Update button text
    }
}

function toggleVideoPlayback() {
    if (youtubePlayer && typeof youtubePlayer.getPlayerState === 'function') {
        const playerState = youtubePlayer.getPlayerState();
        if (playerState === YT.PlayerState.PLAYING) {
            youtubePlayer.pauseVideo();
        } else {
            youtubePlayer.playVideo();
        }
    } else {
        console.warn("YouTube player not ready or state function not available.");
    }
}

function nextVideo() {
    if (youtubePlayer && typeof youtubePlayer.nextVideo === 'function') {
        youtubePlayer.nextVideo();
    } else {
        console.warn("YouTube player not ready or nextVideo function not available.");
    }
}

function previousVideo() {
    if (youtubePlayer && typeof youtubePlayer.previousVideo === 'function') {
        youtubePlayer.previousVideo();
    } else {
        console.warn("YouTube player not ready or previousVideo function not available.");
    }
}

// --- Tasbeeh Counter Functions ---
function incrementTasbeeh() {
    tasbeehCount++;
    tasbeehCounterDisplay.textContent = tasbeehCount;
    saveTasbeehCount();
}

function resetTasbeeh() {
    tasbeehCount = 0;
    tasbeehCounterDisplay.textContent = tasbeehCount;
    saveTasbeehCount();
}

function saveTasbeehCount() {
    localStorage.setItem('tasbeehCount', tasbeehCount);
}

function loadTasbeehCount() {
    const savedCount = localStorage.getItem('tasbeehCount');
    if (savedCount !== null) {
        tasbeehCount = parseInt(savedCount, 10);
        tasbeehCounterDisplay.textContent = tasbeehCount;
    }
}

// --- Settings & Notifications ---

function saveSettings() {
    settings.azanNotification = document.querySelector('input[name="azan-notification"]:checked').value;
    localStorage.setItem('ramadanAppSettings', JSON.stringify(settings));
    showTemporaryMessage('Settings Saved!');
}

function loadSettings() {
    const savedSettings = localStorage.getItem('ramadanAppSettings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        const azanRadioInput = document.querySelector(`input[name="azan-notification"][value="${settings.azanNotification}"]`);
        if (azanRadioInput) {
            azanRadioInput.checked = true;
        }
    }
}

// Modified handleAzan to respect settings and ignore Sunrise audio
function handleAzan(prayerName, isSunrise = false) {
    if (settings.azanNotification === 'silent') return;

    // Only send notification if not silent and not Sunrise
    if (!isSunrise) { // Only send notification for non-Sunrise prayers
        if (Notification.permission === "granted") {
            new Notification(`It's ${prayerName} time!`);
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(`It's ${prayerName} time!`);
                }
            });
        }
    }
    // Azan audio will NOT play automatically here. It can only be played via testAzanSound().
}

// Function to test Azan sound (user-initiated)
function testAzanSound() {
    azanOtherAudio.play().then(() => {
        showTemporaryMessage("Azan sound played successfully!");
    }).catch(e => {
        console.error("Test Azan sound failed:", e);
        showTemporaryMessage("Failed to play Azan sound. Browser might require more interaction (e.g., clicking on the page first).", true);
    });
}

function showTemporaryMessage(message, isError = false) {
    settingsSavedMessage.textContent = message;
    if (isError) {
        settingsSavedMessage.classList.add('bg-red-500');
        settingsSavedMessage.classList.remove('bg-green-500');
    } else {
        settingsSavedMessage.classList.remove('bg-red-500');
        settingsSavedMessage.classList.add('bg-green-500');
    }
    settingsSavedMessage.classList.remove('hidden');
    settingsSavedMessage.classList.add('show');
    setTimeout(() => {
        settingsSavedMessage.classList.remove('show');
        settingsSavedMessage.classList.add('hidden');
    }, 5000); 
}

// --- Utility Functions ---

function formatTime(time24) {
    const [hour, minute] = time24.split(':'); 
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${padZero(h12)}:${minute} ${ampm}`;
}

function padZero(num) {
    return num < 10 ? '0' + num : num;
}

// --- PWA Installation Logic ---
// This event fires when the browser determines that the user can install the PWA.
// It's a good place to show your "Install App" button.
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Show the install button
    installAppButton.classList.remove('hidden');
    // Hide the fallback message if the button is shown
    installAppFallback.classList.add('hidden');
    console.log('beforeinstallprompt fired. PWA install prompt available.');
});

// Event listener for the "Install App" button click
installAppButton.addEventListener('click', async () => {
    if (deferredPrompt) {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and it can't be used again. Clear it.
        deferredPrompt = null;
        // If the user accepts, the appinstalled event will fire. If they dismiss, the button remains visible.
    } else {
        // Fallback for browsers that don't support beforeinstallprompt or if it hasn't fired
        // This message should ideally be hidden if the button is shown.
        // It's primarily for environments where beforeinstallprompt never fires.
        installAppFallback.classList.remove('hidden');
        installAppButton.classList.add('hidden');
        console.log('PWA installation not directly supported or prompt not available.');
    }
});

// Event listener for when the app is successfully installed
window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    // Hide the install button as the app is now installed
    installAppButton.classList.add('hidden'); 
    // Show a success message to the user
    showTemporaryMessage('Ramadhan World App installed successfully!');
});

// Fallback for browsers that doesn't support beforeinstallprompt or if it hasn't fired
// This runs on initial load to determine if the fallback message should be visible.
window.addEventListener('load', () => {
    if (!('BeforeInstallPromptEvent' in window)) {
        // If BeforeInstallPromptEvent is not supported, show fallback message
        installAppFallback.classList.remove('hidden');
        installAppButton.classList.add('hidden');
    }
});


// --- Initial Load ---
window.addEventListener('load', initializeApp);

// Add event listener for pagehide to pause all media when the user navigates away or closes the tab
window.addEventListener('pagehide', () => {
    radioPlayer.pause();
    if (youtubePlayer && typeof youtubePlayer.pauseVideo === 'function') {
        youtubePlayer.pauseVideo();
    }
    azanFajrAudio.pause();
    azanOtherAudio.pause();
    quranAudioPlayer.pause();
});
