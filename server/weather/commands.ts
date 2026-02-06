import { ChatInputCommandInteraction, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import fetch from "node-fetch";
import { logInfo, logError, logWarn } from "../logger";

const TOMORROW_API_KEY = process.env.TOMORROW_API_KEY;
const TOMORROW_BASE_URL = "https://api.tomorrow.io/v4/weather/realtime";

// IQAir API for Air Quality
const IQAIR_API_KEY = process.env.IQAIR_API_KEY;
const IQAIR_BASE_URL = "https://api.airvisual.com/v2/nearest_city";

// Google Maps Geocoding API (better spell correction)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Weather condition to emoji mapping
const weatherEmojis: Record<string, string> = {
    "Clear": "☀️",
    "Mostly Clear": "🌤️",
    "Partly Cloudy": "⛅",
    "Mostly Cloudy": "🌥️",
    "Cloudy": "☁️",
    "Fog": "🌫️",
    "Light Fog": "🌫️",
    "Drizzle": "🌦️",
    "Light Rain": "🌧️",
    "Rain": "🌧️",
    "Heavy Rain": "🌧️",
    "Snow": "❄️",
    "Flurries": "🌨️",
    "Light Snow": "🌨️",
    "Heavy Snow": "❄️",
    "Freezing Drizzle": "🌨️",
    "Freezing Rain": "🌨️",
    "Ice Pellets": "🧊",
    "Heavy Ice Pellets": "🧊",
    "Thunderstorm": "⛈️",
};

// Weather code to description (Tomorrow.io uses numeric codes)
const weatherCodes: Record<number, string> = {
    0: "Unknown",
    1000: "Clear",
    1100: "Mostly Clear",
    1101: "Partly Cloudy",
    1102: "Mostly Cloudy",
    1001: "Cloudy",
    2000: "Fog",
    2100: "Light Fog",
    4000: "Drizzle",
    4001: "Rain",
    4200: "Light Rain",
    4201: "Heavy Rain",
    5000: "Snow",
    5001: "Flurries",
    5100: "Light Snow",
    5101: "Heavy Snow",
    6000: "Freezing Drizzle",
    6001: "Freezing Rain",
    6200: "Light Freezing Rain",
    6201: "Heavy Freezing Rain",
    7000: "Ice Pellets",
    7101: "Heavy Ice Pellets",
    7102: "Light Ice Pellets",
    8000: "Thunderstorm",
};

// UV Index description
function getUVDescription(uv: number): string {
    if (uv <= 2) return "Low";
    if (uv <= 5) return "Moderate";
    if (uv <= 7) return "High";
    if (uv <= 10) return "Very High";
    return "Extreme";
}

// AQI description
function getAQIDescription(aqi: number): string {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
}

// Wind direction from degrees
function getWindDirection(degrees: number): string {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Celsius to Fahrenheit
function toFahrenheit(celsius: number): number {
    return Math.round((celsius * 9 / 5) + 32);
}

// Store weather data temporarily for the "More Details" button
const weatherCache = new Map<string, any>();

interface WeatherData {
    location: string;
    temperature: number;
    temperatureApparent: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    weatherCode: number;
    cloudCover: number;
    visibility: number;
    pressureSurfaceLevel: number;
    dewPoint: number;
    uvIndex: number;
    precipitationProbability: number;
    // AQI data (optional, from IQAir)
    aqi?: number;
    aqiPollutant?: string;
}

// Fetch AQI data from IQAir API using coordinates
async function fetchAQI(lat: number, lon: number): Promise<{ aqi: number; pollutant: string } | null> {
    if (!IQAIR_API_KEY) {
        return null;
    }

    try {
        const url = `${IQAIR_BASE_URL}?lat=${lat}&lon=${lon}&key=${IQAIR_API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            logWarn(`IQAir API error: ${response.status}`);
            return null;
        }

        const data: any = await response.json();

        if (data.status !== "success" || !data.data?.current?.pollution) {
            return null;
        }

        const pollution = data.data.current.pollution;
        return {
            aqi: pollution.aqius, // US AQI standard
            pollutant: pollution.mainus || "pm25",
        };
    } catch (error) {
        logWarn("Failed to fetch AQI data");
        return null;
    }
}

// Geocode using Google Maps API (best spelling correction)
async function geocodeWithGoogle(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    if (!GOOGLE_MAPS_API_KEY) {
        return null;
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_MAPS_API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            logWarn(`Google Geocoding API error: ${response.status}`);
            return null;
        }

        const data: any = await response.json();

        if (data.status !== "OK" || !data.results || data.results.length === 0) {
            logWarn(`Google Geocoding failed for "${location}": ${data.status}`);
            return null;
        }

        // Filter results to ensure they are actual places (cities, regions, countries)
        // and not just random businesses, streets, or buildings that might match a name/word.
        const validTypes = [
            "locality",
            "sublocality",
            "administrative_area_level_1",
            "administrative_area_level_2",
            "country",
            "postal_code",
            "neighborhood",
            "natural_feature",
            "colloquial_area"
        ];

        const blockedTypes = [
            "route",
            "street_address",
            "premise",
            "subpremise",
            "point_of_interest",
            "establishment"
        ];

        // Find the first result that matches a valid type and isn't blocked
        const result = data.results.find((res: any) => {
            const types = res.types;
            const hasValidType = types.some((t: string) => validTypes.includes(t));
            const hasBlockedTypeOnly = types.every((t: string) => blockedTypes.includes(t));

            // Special case: if it has BOTH valid and blocked (rare), prefer valid. 
            // But if it ONLY has blocked types (like just "point_of_interest"), skip it.
            return hasValidType && !hasBlockedTypeOnly;
        });

        if (!result) {
            logWarn(`Google Geocoding found results for "${location}" but none were valid regions/cities.`);
            return null;
        }

        const loc = result.geometry.location;

        // Get a clean location name
        let name = location;
        const addressComponents = result.address_components;
        if (addressComponents && addressComponents.length > 0) {
            // Try to get city or locality name
            const city = addressComponents.find((c: any) => c.types.includes("locality"));
            const state = addressComponents.find((c: any) => c.types.includes("administrative_area_level_1"));
            const country = addressComponents.find((c: any) => c.types.includes("country"));

            if (city) {
                name = state ? `${city.long_name}, ${state.short_name}` : city.long_name;
            } else if (state) {
                name = country ? `${state.long_name}, ${country.short_name}` : state.long_name;
            } else if (country) {
                name = country.long_name;
            }
        }

        logInfo(`Google Geocoded "${location}" → ${name} (${loc.lat}, ${loc.lng})`);

        return {
            lat: loc.lat,
            lon: loc.lng,
            name: name,
        };
    } catch (error) {
        logWarn("Failed to geocode with Google Maps");
        return null;
    }
}

// Fallback: Geocode using OpenStreetMap Nominatim (free, no API key)
async function geocodeWithNominatim(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=5`; // Limit 5 to find a valid one
        const response = await fetch(url, {
            headers: {
                "User-Agent": "NxtGenCore-DiscordBot/1.0",
            },
        });

        if (!response.ok) {
            logWarn(`Nominatim API error: ${response.status}`);
            return null;
        }

        const data: any = await response.json();

        if (!data || data.length === 0) {
            return null;
        }

        // Filter validation for Nominatim
        const validClasses = ["place", "boundary", "landuse"];
        const blockedClasses = ["amenity", "shop", "highway", "building", "tourism"];

        const result = data.find((res: any) => {
            if (blockedClasses.includes(res.class)) return false;
            // If class is acceptable or just generic, we might accept it, but preferably it matches validClasses.
            // Some valid cities come as class="place" type="city".
            return validClasses.includes(res.class) || (res.class === "natural" && res.type !== "tree");
        });

        if (!result) {
            logWarn(`Nominatim found results for "${location}" but none were valid places.`);
            return null;
        }

        return {
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            name: result.display_name?.split(",")[0] || location,
        };
    } catch (error) {
        logWarn("Failed to geocode with Nominatim");
        return null;
    }
}

// Main geocoder: Try Google first, fall back to Nominatim
async function geocodeLocation(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    // Try Google Maps first (better spell correction)
    // User requested to REMOVE Nominatim fallback to prevent matching random words to obscure hamlets.
    // If Google (strict filter) says no, we say no.
    const googleResult = await geocodeWithGoogle(location);
    if (googleResult) {
        return googleResult;
    }

    logInfo(`Google Geocoding failed for "${location}" - Returning null (Nominatim fallback disabled).`);
    return null;
}

async function fetchWeatherData(location: string): Promise<WeatherData | null> {
    if (!TOMORROW_API_KEY) {
        logWarn("TOMORROW_API_KEY not set");
        return null;
    }

    try {
        // First, geocode the location using Nominatim for better reliability
        const geo = await geocodeLocation(location);

        let url: string;
        let locationName = location;

        if (geo) {
            // Use coordinates for more reliable results
            url = `${TOMORROW_BASE_URL}?location=${geo.lat},${geo.lon}&apikey=${TOMORROW_API_KEY}&units=metric`;
            locationName = geo.name;
            logInfo(`Geocoded "${location}" to ${geo.name} (${geo.lat}, ${geo.lon})`);
        } else {
            // If geocoding fails (filtered out or not found), DO NOT fallback to loose API search.
            // This prevents "random words" from returning data.
            logWarn(`No valid geocoding result for "${location}" - Aborting weather fetch.`);
            return null;
        }

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            logError(`Tomorrow.io API error: ${response.status}`, errorText);
            return null;
        }

        const data: any = await response.json();

        if (!data.data || !data.data.values) {
            logWarn("Invalid weather data response");
            return null;
        }

        const values = data.data.values;
        // Use geocoded name if available, otherwise use API response or original input
        const finalLocationName = geo?.name || data.location?.name || location;

        // Get coordinates for AQI lookup
        const lat = data.location?.lat;
        const lon = data.location?.lon;

        // Debug: Log raw temperature values from API
        logInfo(`Weather API Response - Temp: ${values.temperature}, FeelsLike: ${values.temperatureApparent}, Humidity: ${values.humidity}, Wind: ${values.windSpeed}`);

        // Fetch AQI data if we have coordinates
        let aqiData: { aqi: number; pollutant: string } | null = null;
        if (lat && lon) {
            aqiData = await fetchAQI(lat, lon);
            if (aqiData) {
                logInfo(`AQI Data - AQI: ${aqiData.aqi}, Pollutant: ${aqiData.pollutant}`);
            }
        }

        return {
            location: finalLocationName,
            temperature: values.temperature,
            temperatureApparent: values.temperatureApparent,
            humidity: Math.round(values.humidity),
            windSpeed: Math.round(values.windSpeed),
            windDirection: values.windDirection || 0,
            weatherCode: values.weatherCode || 0,
            cloudCover: Math.round(values.cloudCover || 0),
            visibility: Math.round(values.visibility || 10),
            pressureSurfaceLevel: Math.round(values.pressureSurfaceLevel || 1013),
            dewPoint: Math.round(values.dewPoint || 0),
            uvIndex: Math.round(values.uvIndex || 0),
            precipitationProbability: Math.round(values.precipitationProbability || 0),
            aqi: aqiData?.aqi,
            aqiPollutant: aqiData?.pollutant,
        };
    } catch (error) {
        logError("Failed to fetch weather data", error);
        return null;
    }
}

export async function handleWeather(interaction: ChatInputCommandInteraction): Promise<void> {
    const location = interaction.options.getString("location", true);

    await interaction.deferReply();

    const weather = await fetchWeatherData(location);

    if (!weather) {
        await interaction.editReply({
            content: "Could not find weather data for that location. Its either not a valid location or small village.",
        });
        return;
    }

    // Cache weather data for the "More Details" button
    const cacheKey = `weather_${interaction.id}`;
    weatherCache.set(cacheKey, weather);

    // Auto-cleanup cache after 10 minutes
    setTimeout(() => weatherCache.delete(cacheKey), 10 * 60 * 1000);

    const condition = weatherCodes[weather.weatherCode] || "Unknown";
    const emoji = weatherEmojis[condition] || "🌡️";
    const tempC = Math.round(weather.temperature);
    const tempF = toFahrenheit(weather.temperature);
    const feelsLikeC = Math.round(weather.temperatureApparent);
    const feelsLikeF = toFahrenheit(weather.temperatureApparent);

    // Only show "Feels Like" if it differs by more than 1°C
    const tempDiff = Math.abs(weather.temperature - weather.temperatureApparent);
    const feelsLikeText = tempDiff > 1 ? ` (Feels like ${feelsLikeC}°C / ${feelsLikeF}°F)` : "";

    // AQI text if available
    const aqiText = weather.aqi !== undefined
        ? `\n🌬️ **Air Quality:** ${weather.aqi} (${getAQIDescription(weather.aqi)})`
        : "";

    // Build compact V2 component
    const moreDetailsButton = new ButtonBuilder()
        .setCustomId(`weather_details_${interaction.id}`)
        .setLabel("🔍 More Details")
        .setStyle(ButtonStyle.Primary)
        .toJSON();

    const compactPayload: any = {
        content: "",
        flags: 32768, // IS_COMPONENTS_V2
        components: [
            {
                type: 17, // CONTAINER
                components: [
                    {
                        type: 10, // TEXT_DISPLAY
                        content: `### ${emoji} Weather in ${weather.location}\n\n🌡️ **Temperature:** ${tempC}°C / ${tempF}°F${feelsLikeText}\n☁️ **Condition:** ${condition}\n💧 **Humidity:** ${weather.humidity}%\n💨 **Wind:** ${weather.windSpeed} km/h${aqiText}`,
                    },
                    { type: 14, spacing: 1 }, // SEPARATOR
                    {
                        type: 1, // ACTION_ROW
                        components: [moreDetailsButton],
                    },
                ],
            },
        ],
    };

    await interaction.editReply(compactPayload);

    // Auto-delete after 20 seconds
    setTimeout(async () => {
        try {
            await interaction.deleteReply();
            weatherCache.delete(cacheKey); // Clean up cache early
        } catch {
            // Message may already be deleted
        }
    }, 20_000);
}

export async function handleWeatherDetailsButton(interaction: any): Promise<void> {
    // Extract interaction ID from button customId
    const originalInteractionId = interaction.customId.replace("weather_details_", "");
    const cacheKey = `weather_${originalInteractionId}`;
    const weather = weatherCache.get(cacheKey);

    if (!weather) {
        await interaction.reply({
            content: "⏳ Weather data expired. Please use `/weather` again.",
            ephemeral: true,
        });
        return;
    }

    const condition = weatherCodes[weather.weatherCode] || "Unknown";
    const emoji = weatherEmojis[condition] || "🌡️";
    const tempC = Math.round(weather.temperature);
    const tempF = toFahrenheit(weather.temperature);
    const feelsLikeC = Math.round(weather.temperatureApparent);
    const feelsLikeF = toFahrenheit(weather.temperatureApparent);
    const dewPointC = Math.round(weather.dewPoint);
    const dewPointF = toFahrenheit(weather.dewPoint);
    const windDir = getWindDirection(weather.windDirection);
    const uvDesc = getUVDescription(weather.uvIndex);

    // Only show "Feels Like" if it differs by more than 1°C
    const tempDiff = Math.abs(weather.temperature - weather.temperatureApparent);
    const feelsLikeText = tempDiff > 1 ? `\n> Feels Like: ${feelsLikeC}°C / ${feelsLikeF}°F` : "";

    // Build detailed V2 component
    const detailedComponents: any[] = [
        {
            type: 10, // TEXT_DISPLAY
            content: `### Detailed Weather - ${weather.location}`,
        },
        { type: 14, spacing: 1 }, // SEPARATOR
        {
            type: 10, // TEXT_DISPLAY
            content: `**TEMPERATURE**\n> Current: **${tempC}°C / ${tempF}°F**${feelsLikeText}`,
        },
        { type: 14, spacing: 1 }, // SEPARATOR
        {
            type: 10, // TEXT_DISPLAY
            content: `**${emoji} CONDITION**\n> ${condition}\n> Cloud Cover: ${weather.cloudCover}%`,
        },
        { type: 14, spacing: 1 }, // SEPARATOR
        {
            type: 10, // TEXT_DISPLAY
            content: `**WIND & ATMOSPHERE**\n> Wind Speed: ${weather.windSpeed} km/h\n> Wind Direction: ${windDir} (${weather.windDirection}°)\n> Pressure: ${weather.pressureSurfaceLevel} hPa\n> Visibility: ${weather.visibility} km`,
        },
        { type: 14, spacing: 1 }, // SEPARATOR
        {
            type: 10, // TEXT_DISPLAY
            content: `**HUMIDITY & PRECIPITATION**\n> Humidity: ${weather.humidity}%\n> Dew Point: ${dewPointC}°C / ${dewPointF}°F\n> Precipitation Chance: ${weather.precipitationProbability}%`,
        },
        { type: 14, spacing: 1 }, // SEPARATOR
        {
            type: 10, // TEXT_DISPLAY
            content: `**UV INDEX**\n> UV: ${weather.uvIndex} (${uvDesc})`,
        },
    ];

    // Add AQI section if available
    if (weather.aqi !== undefined) {
        detailedComponents.push({ type: 14, spacing: 1 }); // SEPARATOR
        detailedComponents.push({
            type: 10, // TEXT_DISPLAY
            content: `**AIR QUALITY**\n> AQI: ${weather.aqi} (${getAQIDescription(weather.aqi)})\n> Main Pollutant: ${weather.aqiPollutant?.toUpperCase() || "PM2.5"}`,
        });
    }

    // Add footer
    detailedComponents.push({ type: 14, spacing: 1 }); // SEPARATOR
    detailedComponents.push({
        type: 10, // TEXT_DISPLAY
        content: `*Data from Nxt Gen Weather System • Updated just now*`,
    });

    const detailedPayload: any = {
        content: "",
        flags: 32768, // IS_COMPONENTS_V2
        components: [
            {
                type: 17, // CONTAINER
                components: detailedComponents,
            },
        ],
    };

    await interaction.update(detailedPayload);
}
