// Clothing preferences are local-only pilot personalization inputs. They are
// saved on this device and are not sent to Supabase, analytics, or the backend.
export const CLOTHING_PREFERENCES_STORAGE_KEY = "readyClothingPreferences";
export const CLOTHING_PREFERENCES_COMPLETED_STORAGE_KEY = "readyClothingPreferencesCompleted";

export const CLOTHING_PREFERENCE_CATEGORIES = [
  {
    id: "footwear",
    label: "Footwear",
    options: [
      "Sneakers",
      "Loafers",
      "Flats",
      "Sandals",
      "Slides",
      "Flip-flops",
      "Ankle boots",
      "Rain boots",
      "Snow boots",
      "Dress shoes",
      "Clogs",
      "Mules",
      "Heels"
    ]
  },
  {
    id: "pants",
    label: "Pants",
    options: [
      "Jeans",
      "Chinos",
      "Trousers",
      "Joggers",
      "Sweatpants",
      "Leggings",
      "Shorts",
      "Linen pants",
      "Skirt",
      "Dress",
      "Jumpsuit",
      "Romper",
      "Tights",
      "Thermal leggings/base layer"
    ]
  },
  {
    id: "shirts",
    label: "Shirts",
    options: [
      "T-shirt",
      "Long-sleeve shirt",
      "Tank top",
      "Sleeveless top",
      "Crop top",
      "Tube top",
      "Halter top",
      "Camisole",
      "Bodysuit",
      "Button-down shirt",
      "Linen shirt",
      "Polo shirt",
      "Blouse",
      "Knit top",
      "Henley",
      "Flannel shirt",
      "Turtleneck",
      "Mock-neck top",
      "Thermal top/base layer"
    ]
  },
  {
    id: "outerwear",
    label: "Outerwear",
    options: [
      "Hoodie",
      "Crewneck sweatshirt",
      "Quarter-zip",
      "Cardigan",
      "Sweater",
      "Sweater vest",
      "Fleece jacket",
      "Denim jacket",
      "Bomber jacket",
      "Windbreaker",
      "Rain jacket",
      "Waterproof shell",
      "Trench coat",
      "Blazer",
      "Vest",
      "Puffer vest",
      "Puffer jacket",
      "Heavy coat",
      "Parka",
      "Wool coat",
      "Shawl/wrap"
    ]
  },
  {
    id: "accessories",
    label: "Accessories",
    options: [
      "Umbrella",
      "Sunglasses",
      "Baseball cap",
      "Sun hat",
      "Beanie",
      "Scarf",
      "Gloves",
      "Earmuffs",
      "Neck gaiter",
      "Rain poncho",
      "Face covering/neck warmer"
    ]
  }
];

const VALID_OPTIONS_BY_CATEGORY = new Map(
  CLOTHING_PREFERENCE_CATEGORIES.map((category) => [category.id, new Set(category.options)])
);

export function hasCompletedClothingPreferences() {
  const status = getClothingPreferencesCompletionStatus();

  if (status === "unavailable") {
    return true;
  }

  return status !== null;
}

export function getClothingPreferencesCompletionStatus() {
  try {
    return window.localStorage.getItem(CLOTHING_PREFERENCES_COMPLETED_STORAGE_KEY);
  } catch (error) {
    return "unavailable";
  }
}

export function getSavedClothingPreferences() {
  try {
    const rawValue = window.localStorage.getItem(CLOTHING_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return getEmptyClothingPreferences();
    }

    return normalizeClothingPreferences(JSON.parse(rawValue));
  } catch (error) {
    return getEmptyClothingPreferences();
  }
}

export function saveClothingPreferences(preferences) {
  const normalizedPreferences = normalizeClothingPreferences(preferences);

  window.localStorage.setItem(CLOTHING_PREFERENCES_STORAGE_KEY, JSON.stringify({
    ...normalizedPreferences,
    updatedAt: new Date().toISOString()
  }));
  window.localStorage.setItem(CLOTHING_PREFERENCES_COMPLETED_STORAGE_KEY, "saved");
}

export function markClothingPreferencesSkipped() {
  try {
    window.localStorage.setItem(CLOTHING_PREFERENCES_COMPLETED_STORAGE_KEY, "skipped");
  } catch (error) {
    return false;
  }

  return true;
}

export function validateClothingPreferences(preferences) {
  const normalizedPreferences = normalizeClothingPreferences(preferences);
  const missingCategories = CLOTHING_PREFERENCE_CATEGORIES
    .filter((category) => normalizedPreferences[category.id].length === 0)
    .map((category) => category.label);

  return {
    valid: missingCategories.length === 0,
    missingCategories
  };
}

export function normalizeClothingPreferences(preferences) {
  return CLOTHING_PREFERENCE_CATEGORIES.reduce((normalized, category) => {
    const validOptions = VALID_OPTIONS_BY_CATEGORY.get(category.id);
    const selectedOptions = Array.isArray(preferences?.[category.id])
      ? preferences[category.id]
      : [];

    normalized[category.id] = [...new Set(selectedOptions)]
      .filter((option) => validOptions.has(option));

    return normalized;
  }, {});
}

function getEmptyClothingPreferences() {
  return CLOTHING_PREFERENCE_CATEGORIES.reduce((preferences, category) => {
    preferences[category.id] = [];
    return preferences;
  }, {});
}
