import {
  getClothingPreferencesCompletionStatus,
  getSavedClothingPreferences,
  normalizeClothingPreferences,
  validateClothingPreferences
} from "./clothingPreferences.js";

const CATEGORY_ORDER = ["shirts", "pants", "outerwear", "footwear", "accessories"];
const CATEGORY_LABELS = {
  footwear: "Footwear",
  pants: "Pants",
  shirts: "Shirts",
  outerwear: "Outerwear",
  accessories: "Accessories"
};
const MAX_ITEMS_PER_CATEGORY = 3;

const WARM_SHIRTS = [
  "T-shirt",
  "Tank top",
  "Sleeveless top",
  "Crop top",
  "Tube top",
  "Halter top",
  "Camisole",
  "Bodysuit",
  "Linen shirt",
  "Polo shirt",
  "Blouse",
  "Knit top"
];
const MILD_SHIRTS = [
  "Long-sleeve shirt",
  "Button-down shirt",
  "Henley",
  "Flannel shirt",
  "Mock-neck top",
  "T-shirt",
  "Polo shirt"
];
const COLD_SHIRTS = [
  "Turtleneck",
  "Thermal top/base layer",
  "Flannel shirt",
  "Long-sleeve shirt"
];
const SUN_SHIRTS = [
  "Linen shirt",
  "T-shirt",
  "Tank top",
  "Sleeveless top",
  "Crop top",
  "Tube top",
  "Halter top",
  "Camisole"
];

const WARM_PANTS = [
  "Shorts",
  "Linen pants",
  "Skirt",
  "Dress",
  "Jumpsuit",
  "Romper"
];
const MILD_PANTS = [
  "Jeans",
  "Chinos",
  "Trousers",
  "Joggers",
  "Leggings",
  "Dress",
  "Jumpsuit"
];
const COLD_PANTS = [
  "Jeans",
  "Trousers",
  "Sweatpants",
  "Leggings",
  "Tights",
  "Thermal leggings/base layer"
];
const SUN_PANTS = [
  "Shorts",
  "Linen pants",
  "Skirt",
  "Dress",
  "Romper"
];
const SNOW_PANTS = [
  "Thermal leggings/base layer",
  "Sweatpants",
  "Tights"
];

const MILD_OUTERWEAR = [
  "Cardigan",
  "Sweater",
  "Sweater vest",
  "Crewneck sweatshirt",
  "Hoodie",
  "Quarter-zip",
  "Denim jacket",
  "Bomber jacket",
  "Blazer",
  "Vest",
  "Shawl/wrap"
];
const COLD_OUTERWEAR = [
  "Fleece jacket",
  "Puffer vest",
  "Puffer jacket",
  "Heavy coat",
  "Parka",
  "Wool coat",
  "Hoodie",
  "Sweater"
];
const RAIN_OUTERWEAR = [
  "Rain jacket",
  "Waterproof shell",
  "Trench coat",
  "Windbreaker"
];
const SNOW_OUTERWEAR = [
  "Parka",
  "Heavy coat",
  "Puffer jacket",
  "Wool coat",
  "Waterproof shell"
];
const WIND_OUTERWEAR = [
  "Windbreaker",
  "Waterproof shell",
  "Rain jacket",
  "Bomber jacket",
  "Trench coat"
];

const LIGHT_FOOTWEAR = [
  "Sandals",
  "Slides",
  "Flip-flops",
  "Sneakers",
  "Flats",
  "Loafers",
  "Clogs",
  "Mules"
];
const DRY_MILD_FOOTWEAR = [
  "Sneakers",
  "Loafers",
  "Flats",
  "Sandals",
  "Slides",
  "Clogs",
  "Mules",
  "Dress shoes",
  "Heels"
];
const COLD_FOOTWEAR = [
  "Ankle boots",
  "Snow boots",
  "Sneakers",
  "Clogs"
];
const RAIN_FOOTWEAR = ["Rain boots"];
const SNOW_FOOTWEAR = ["Snow boots"];

const RAIN_ACCESSORIES = ["Umbrella", "Rain poncho"];
const SUN_ACCESSORIES = ["Sunglasses", "Baseball cap", "Sun hat"];
const COLD_ACCESSORIES = [
  "Beanie",
  "Scarf",
  "Gloves",
  "Earmuffs",
  "Neck gaiter",
  "Face covering/neck warmer"
];
const WIND_ACCESSORIES = [
  "Scarf",
  "Neck gaiter",
  "Face covering/neck warmer"
];

const WEIGHT_CANDIDATES = {
  shirts: {
    Light: [WARM_SHIRTS],
    "Light-Medium": [MILD_SHIRTS, WARM_SHIRTS],
    Medium: [MILD_SHIRTS, COLD_SHIRTS],
    "Medium-Heavy": [COLD_SHIRTS, MILD_SHIRTS],
    Heavy: [COLD_SHIRTS]
  },
  pants: {
    Light: [WARM_PANTS],
    "Light-Medium": [WARM_PANTS, MILD_PANTS],
    Medium: [MILD_PANTS],
    "Medium-Heavy": [COLD_PANTS, MILD_PANTS],
    Heavy: [SNOW_PANTS, COLD_PANTS]
  },
  outerwear: {
    Light: [MILD_OUTERWEAR],
    "Light-Medium": [MILD_OUTERWEAR],
    Medium: [MILD_OUTERWEAR],
    "Medium-Heavy": [COLD_OUTERWEAR, MILD_OUTERWEAR],
    Heavy: [COLD_OUTERWEAR]
  }
};

const FALLBACKS = {
  shirts: {
    Light: "T-shirt",
    "Light-Medium": "Long-sleeve shirt",
    Medium: "Long-sleeve shirt",
    "Medium-Heavy": "Turtleneck",
    Heavy: "Thermal top/base layer"
  },
  pants: {
    Light: "Shorts",
    "Light-Medium": "Jeans",
    Medium: "Jeans",
    "Medium-Heavy": "Trousers",
    Heavy: "Thermal leggings/base layer"
  },
  footwear: {
    Light: "Sneakers",
    "Light-Medium": "Sneakers",
    Medium: "Sneakers",
    "Medium-Heavy": "Ankle boots",
    Heavy: "Snow boots"
  },
  outerwear: {
    Light: "Cardigan",
    "Light-Medium": "Rain jacket",
    Medium: "Sweater",
    "Medium-Heavy": "Fleece jacket",
    Heavy: "Heavy coat"
  },
  accessories: {
    Rain: "Umbrella",
    Snow: "Gloves",
    Sun: "Sunglasses",
    Wind: "Scarf",
    Cold: "Beanie",
    "Rain/Sun": "Umbrella",
    "Cold/Wind": "Scarf",
    "Rain/Wind": "Umbrella"
  }
};

export function getSavedPersonalizedChecklist(recommendation) {
  const completionStatus = getClothingPreferencesCompletionStatus();

  if (completionStatus !== "saved") {
    return null;
  }

  return createPersonalizedChecklist(recommendation, getSavedClothingPreferences(), {
    completionStatus
  });
}

export function createPersonalizedChecklist(recommendation, preferences, options = {}) {
  const completionStatus = options.completionStatus ?? "saved";

  if (completionStatus !== "saved" || !recommendation?.weatherNeeds) {
    return null;
  }

  const normalizedPreferences = normalizeClothingPreferences(preferences);

  if (!validateClothingPreferences(normalizedPreferences).valid) {
    return null;
  }

  const sections = CATEGORY_ORDER
    .map((categoryId) => createCategorySection(categoryId, normalizedPreferences, recommendation.weatherNeeds))
    .filter(Boolean);

  if (sections.length === 0) {
    return null;
  }

  return {
    personalized: true,
    sections,
    items: sections.flatMap((section) => section.items)
  };
}

function createCategorySection(categoryId, preferences, weatherNeeds) {
  if (categoryId === "accessories") {
    return createAccessorySection(preferences, weatherNeeds);
  }

  if (categoryId === "outerwear" && !weatherNeeds.categoryNeeds.outerwear) {
    return null;
  }

  const weight = weatherNeeds.weights[categoryId];
  const candidateLists = getCandidateLists(categoryId, weight, weatherNeeds);
  const items = selectPersonalizedItems(
    preferences[categoryId],
    candidateLists,
    getCategoryFallback(categoryId, weight, weatherNeeds)
  );

  return createSection(categoryId, weight, items);
}

function createAccessorySection(preferences, weatherNeeds) {
  const purposeLabel = getAccessoryPurposeLabel(weatherNeeds.conditions);

  if (!purposeLabel) {
    return null;
  }

  const candidateLists = getAccessoryCandidateLists(weatherNeeds.conditions);
  const items = selectPersonalizedItems(
    preferences.accessories,
    candidateLists,
    FALLBACKS.accessories[purposeLabel]
  );

  return createSection("accessories", purposeLabel, items);
}

function createSection(categoryId, label, items) {
  if (items.length === 0) {
    return null;
  }

  const category = CATEGORY_LABELS[categoryId];

  return {
    category,
    label,
    title: `${category} (${label})`,
    items
  };
}

function getCandidateLists(categoryId, weight, weatherNeeds) {
  const conditions = weatherNeeds.conditions;

  if (categoryId === "shirts") {
    return [
      ...(conditions.snow || conditions.cold ? [COLD_SHIRTS] : []),
      ...(conditions.sun && (weight === "Light" || weight === "Light-Medium") ? [SUN_SHIRTS] : []),
      ...getWeightCandidates(categoryId, weight)
    ];
  }

  if (categoryId === "pants") {
    if (conditions.snow) {
      return [SNOW_PANTS, COLD_PANTS];
    }

    return [
      ...(conditions.cold ? [COLD_PANTS] : []),
      ...(conditions.sun && (weight === "Light" || weight === "Light-Medium") ? [SUN_PANTS] : []),
      ...getWeightCandidates(categoryId, weight)
    ];
  }

  if (categoryId === "outerwear") {
    if (conditions.snow) {
      return [SNOW_OUTERWEAR, COLD_OUTERWEAR];
    }

    if (conditions.rain) {
      return [
        RAIN_OUTERWEAR,
        ...(conditions.wind ? [WIND_OUTERWEAR] : [])
      ];
    }

    return [
      ...(conditions.wind ? [WIND_OUTERWEAR] : []),
      ...(conditions.cold ? [COLD_OUTERWEAR] : []),
      ...getWeightCandidates(categoryId, weight)
    ];
  }

  if (categoryId === "footwear") {
    if (conditions.snow) {
      return [SNOW_FOOTWEAR, COLD_FOOTWEAR];
    }

    if (conditions.rain) {
      return [RAIN_FOOTWEAR];
    }

    return [
      ...(conditions.cold ? [COLD_FOOTWEAR] : []),
      ...(conditions.sun || weight === "Light" ? [LIGHT_FOOTWEAR] : []),
      DRY_MILD_FOOTWEAR
    ];
  }

  return [];
}

function getAccessoryCandidateLists(conditions) {
  return [
    ...(conditions.rain ? [RAIN_ACCESSORIES] : []),
    ...(conditions.sun ? [SUN_ACCESSORIES] : []),
    ...(conditions.snow ? [COLD_ACCESSORIES] : []),
    ...(conditions.cold ? [COLD_ACCESSORIES] : []),
    ...(conditions.wind ? [WIND_ACCESSORIES] : [])
  ];
}

function getCategoryFallback(categoryId, weight, weatherNeeds) {
  const conditions = weatherNeeds.conditions;

  if (categoryId === "footwear") {
    if (conditions.snow) {
      return "Snow boots";
    }

    if (conditions.rain) {
      return "Rain boots";
    }
  }

  if (categoryId === "outerwear") {
    if (conditions.snow) {
      return "Heavy coat";
    }

    if (conditions.rain) {
      return "Rain jacket";
    }
  }

  return FALLBACKS[categoryId][weight];
}

function getWeightCandidates(categoryId, weight) {
  return WEIGHT_CANDIDATES[categoryId]?.[weight] ?? [];
}

function selectPersonalizedItems(selectedItems, candidateLists, fallback) {
  const selectedSet = new Set(selectedItems);
  const candidates = candidateLists.flat();
  const matches = [];

  candidates.forEach((candidate) => {
    if (selectedSet.has(candidate) && !matches.includes(candidate)) {
      matches.push(candidate);
    }
  });

  if (matches.length > 0) {
    return matches.slice(0, MAX_ITEMS_PER_CATEGORY);
  }

  return fallback ? [fallback] : [];
}

function getAccessoryPurposeLabel(conditions) {
  if (conditions.rain && conditions.sun) {
    return "Rain/Sun";
  }

  if (conditions.rain && conditions.wind) {
    return "Rain/Wind";
  }

  if (conditions.cold && conditions.wind) {
    return "Cold/Wind";
  }

  if (conditions.snow) {
    return "Snow";
  }

  if (conditions.rain) {
    return "Rain";
  }

  if (conditions.sun) {
    return "Sun";
  }

  if (conditions.wind) {
    return "Wind";
  }

  if (conditions.cold) {
    return "Cold";
  }

  return null;
}
